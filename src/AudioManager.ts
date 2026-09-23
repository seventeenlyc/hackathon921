export interface AudioLike {
    loop: boolean;
    currentTime: number;
    volume: number;
    onended: HTMLAudioElement['onended'];
    onerror: HTMLAudioElement['onerror'];
    play(): void | Promise<void>;
    pause(): void;
}

export type AudioFactory = (src: string) => AudioLike;
export type MusicPhase = 'tactical' | 'siege' | 'lastStand';

/** The phase is presentation state, never a source of simulation or wave truth. */
export function phaseForWave(wave: number): MusicPhase {
    return wave >= 201 ? 'lastStand' : wave >= 151 ? 'siege' : 'tactical';
}

interface AudioEnvironment {
    visibility?: Pick<Document, 'hidden' | 'addEventListener'>;
    now?: () => number;
    schedule?: (callback: () => void, delayMs: number) => () => void;
}

declare const __BACKGROUND_TRACKS__: readonly string[];
declare const __SPECIAL_MUSIC_PATHS__: Readonly<Record<number, string>>;
declare const __PHASE_MUSIC_PATHS__: Readonly<Record<MusicPhase, readonly string[]>>;

const AUDIO_PATHS = {
    wave: '/audio/wave.wav',
    gameOver: '/audio/game-over.wav',
} as const;
const SPECIAL_MUSIC_PATHS = __SPECIAL_MUSIC_PATHS__;
const SPECIAL_MUSIC_TRACKS = new Set(Object.values(SPECIAL_MUSIC_PATHS));
const MUSIC_VOLUME = 0.24;
const FADE_MS = 450;
const DUCK_MS = 180;
const FADE_STEP_MS = 30;
// The wave-200 boundary has room for a brief mission-complete beat without
// delaying the deterministic game or depending on a particular text animation.
const LAST_STAND_HOLD_MS = 600;

function defaultAudioFactory(src: string): AudioLike {
    return new Audio(src);
}

function defaultSchedule(callback: () => void, delayMs: number): () => void {
    const timer = setTimeout(callback, delayMs);
    return () => clearTimeout(timer);
}

/** Optional, non-blocking audio state; the game engine owns every wave and tick. */
export class AudioManager {
    private readonly phaseTracks: Readonly<Record<MusicPhase, readonly string[]>>;
    private readonly specialTracks: Readonly<Record<number, string>>;
    private readonly now: () => number;
    private readonly schedule: NonNullable<AudioEnvironment['schedule']>;
    private readonly visibility?: AudioEnvironment['visibility'];
    private music: AudioLike | null = null;
    private musicPath: string | null = null;
    private lastMusicPath: string | null = null;
    private failedTracks = new Set<string>();
    private currentWave = 0;
    private phase: MusicPhase = 'tactical';
    private pendingSpecialWave: number | null = null;
    private wave: AudioLike | null = null;
    private gameOver: AudioLike | null = null;
    private muted = false;
    private paused = false;
    private runActive = false;
    private gameOverPlayed = false;
    private musicStarted = false;
    private musicReady = false;
    private playAttempt = 0;
    private waveActive = false;
    private masterVolume = 1;
    private musicGain = 1;
    private transitioning = false;
    private cancelScheduled: (() => void) | null = null;

    constructor(
        private readonly factory: AudioFactory = defaultAudioFactory,
        backgroundTracks: readonly string[] = __BACKGROUND_TRACKS__,
        private readonly random: () => number = Math.random,
        environment: AudioEnvironment = {},
        specialTracks: Readonly<Record<number, string>> = SPECIAL_MUSIC_PATHS,
        phaseTracks: Readonly<Record<MusicPhase, readonly string[]>> = __PHASE_MUSIC_PATHS__,
    ) {
        this.specialTracks = specialTracks;
        const specials = new Set(Object.values(specialTracks));
        const regular = new Set(backgroundTracks.filter(track => !specials.has(track) && !SPECIAL_MUSIC_TRACKS.has(track)));
        this.phaseTracks = {
            tactical: phaseTracks.tactical.filter(track => regular.has(track)),
            siege: phaseTracks.siege.filter(track => regular.has(track)),
            lastStand: phaseTracks.lastStand.filter(track => regular.has(track)),
        };
        this.now = environment.now || Date.now;
        this.schedule = environment.schedule || defaultSchedule;
        this.visibility = environment.visibility ?? (typeof document === 'undefined' ? undefined : document);
        this.visibility?.addEventListener('visibilitychange', () => this.onVisibilityChange());
        // A programmatic start or a return from a background tab may be blocked
        // by autoplay policy. A subsequent real gesture can retry, without ever
        // playing music during IDLE just because the nickname was confirmed.
        this.visibility?.addEventListener('pointerdown', () => this.onUserGesture());
        this.visibility?.addEventListener('keydown', () => this.onUserGesture());
    }

    get musicPhase(): MusicPhase { return this.phase; }

    /** Called synchronously from the player's run-start gesture, once per run. */
    beginRun(wave: number): void {
        if (this.runActive || !Number.isInteger(wave) || wave < 1) return;
        this.stopMusic();
        this.pauseCues();
        this.music = null;
        this.musicPath = null;
        this.lastMusicPath = null;
        this.failedTracks.clear();
        this.currentWave = wave;
        this.phase = phaseForWave(wave);
        this.pendingSpecialWave = this.specialTracks[wave] ? wave : null;
        this.gameOverPlayed = false;
        this.paused = false;
        this.runActive = true;
        this.startMusic();
    }

    /** Retry/resume only when a run exists; never start random music in IDLE. */
    startMusic(): void {
        if (!this.canPlay() || this.musicStarted || this.transitioning) return;
        if (this.pendingSpecialWave !== null && this.musicPath !== this.specialTracks[this.pendingSpecialWave]) {
            this.music = null;
            this.musicPath = null;
        }
        const audio = this.music || this.createMusic();
        if (!audio) return;
        audio.loop = false;
        this.musicGain = 0;
        this.applyMusicVolume();
        this.musicStarted = true;
        this.musicReady = false;
        const attempt = ++this.playAttempt;
        try {
            const result = audio.play();
            if (result && typeof (result as Promise<void>).then === 'function') {
                void (result as Promise<void>).then(() => {
                    if (this.music === audio && this.playAttempt === attempt && this.canPlay()) {
                        this.musicReady = true;
                        this.ramp(audio, 0, 1, FADE_MS);
                    }
                }, () => {
                    if (this.music === audio && this.playAttempt === attempt) {
                        this.musicStarted = false;
                        this.musicReady = false;
                        this.cancelTransition();
                    }
                });
            } else {
                this.musicReady = true;
                this.ramp(audio, 0, 1, FADE_MS);
            }
        } catch (error) {
            this.musicStarted = false;
            this.musicReady = false;
            this.cancelTransition();
        }
    }

    /** Wave boundaries only change audio presentation; no game state is touched. */
    setWave(wave: number): void {
        if (!this.runActive || !Number.isInteger(wave) || wave <= this.currentWave) return;
        this.currentWave = wave;
        this.phase = phaseForWave(wave);
        if (!this.specialTracks[wave]) return;
        this.pendingSpecialWave = wave;
        this.cancelTransition();
        if (!this.canPlay()) {
            this.stopMusic();
            return;
        }
        const outgoing = this.music;
        if (!outgoing || !this.musicStarted || !this.musicReady) {
            this.stopMusic();
            this.music = null;
            this.musicPath = null;
            this.startMusic();
            return;
        }
        this.transitioning = true;
        this.ramp(outgoing, this.musicGain, 0, FADE_MS, () => {
            try { outgoing.pause(); } catch (error) { /* media failure is non-fatal */ }
            if (this.music === outgoing) {
                this.music = null;
                this.musicPath = null;
            }
            this.musicStarted = false;
            const startNext = () => {
                this.cancelScheduled = null;
                this.transitioning = false;
                this.startMusic();
            };
            if (wave === 201) this.cancelScheduled = this.schedule(startNext, LAST_STAND_HOLD_MS);
            else startNext();
        });
    }

    /** Short, cancellable duck at wave 200; never pauses or delays the run. */
    duckForMissionComplete(): void {
        const audio = this.music;
        if (!this.canPlay() || !this.musicStarted || !this.musicReady || !audio || this.transitioning) return;
        this.cancelTransition();
        this.ramp(audio, this.musicGain, 0.35, DUCK_MS, () => {
            this.cancelScheduled = this.schedule(() => {
                this.cancelScheduled = null;
                this.ramp(audio, this.musicGain, 1, DUCK_MS);
            }, LAST_STAND_HOLD_MS);
        });
    }

    stopMusic(): void {
        ++this.playAttempt;
        this.cancelTransition();
        this.musicStarted = false;
        this.musicReady = false;
        if (this.music) {
            try { this.music.pause(); } catch (error) { /* media failure is non-fatal */ }
        }
    }

    /** PAUSED freezes audio, but PLANNING is still part of the live run. */
    setPaused(paused: boolean): void {
        if (this.paused === paused) return;
        this.paused = paused;
        if (paused) {
            this.stopMusic();
            this.pauseCues();
        } else {
            this.startMusic();
        }
    }

    playWaveReached(): void {
        if (!this.canPlay() || this.waveActive) return;
        const audio = this.getAudio('wave');
        if (!audio) return;
        this.waveActive = true;
        audio.onended = () => { this.waveActive = false; };
        audio.onerror = () => { this.waveActive = false; };
        try {
            audio.currentTime = 0;
            audio.volume = 0.18 * this.masterVolume;
            const result = audio.play();
            if (result && typeof (result as Promise<void>).catch === 'function') {
                void (result as Promise<void>).catch(() => { this.waveActive = false; });
            }
        } catch (error) {
            this.waveActive = false;
        }
    }

    playGameOver(): void {
        if (this.gameOverPlayed) return;
        this.runActive = false;
        this.gameOverPlayed = true;
        this.stopMusic();
        this.pauseCues();
        if (this.muted || this.visibility?.hidden) return;
        const audio = this.getAudio('gameOver');
        if (!audio) return;
        try {
            audio.currentTime = 0;
            audio.volume = 0.2 * this.masterVolume;
            const result = audio.play();
            if (result && typeof (result as Promise<void>).catch === 'function') {
                void (result as Promise<void>).catch(() => {});
            }
        } catch (error) {
            // Missing/invalid media must never block the result screen.
        }
    }

    setMuted(muted: boolean): void {
        if (this.muted === muted) return;
        this.muted = muted;
        if (muted) {
            this.stopMusic();
            this.pauseCues();
        } else {
            this.startMusic();
        }
    }

    isMuted(): boolean { return this.muted; }

    setVolume(volume: number): void {
        if (!Number.isFinite(volume)) return;
        this.masterVolume = Math.max(0, Math.min(1, volume));
        this.applyMusicVolume();
        if (this.wave) this.wave.volume = 0.18 * this.masterVolume;
        if (this.gameOver) this.gameOver.volume = 0.2 * this.masterVolume;
    }

    /** A gesture retries a blocked play without changing the user's mute choice. */
    onUserGesture(): void { this.startMusic(); }

    private canPlay(): boolean {
        return this.runActive && !this.paused && !this.muted && !this.visibility?.hidden;
    }

    private onVisibilityChange(): void {
        if (this.visibility?.hidden) {
            this.stopMusic();
            this.pauseCues();
        } else {
            this.startMusic();
        }
    }

    private pauseCues(): void {
        this.waveActive = false;
        for (const audio of [this.wave, this.gameOver]) {
            if (audio) {
                try { audio.pause(); } catch (error) { /* media failure is non-fatal */ }
            }
        }
    }

    private applyMusicVolume(): void {
        if (this.music) this.music.volume = MUSIC_VOLUME * this.masterVolume * this.musicGain;
    }

    private cancelTransition(): void {
        this.cancelScheduled?.();
        this.cancelScheduled = null;
        this.transitioning = false;
    }

    private ramp(audio: AudioLike, from: number, to: number, duration: number, done?: () => void): void {
        const started = this.now();
        const step = () => {
            if (this.music !== audio) return;
            const fraction = Math.max(0, Math.min(1, (this.now() - started) / duration));
            this.musicGain = from + (to - from) * fraction;
            this.applyMusicVolume();
            if (fraction === 1) {
                this.cancelScheduled = null;
                done?.();
            } else {
                this.cancelScheduled = this.schedule(step, FADE_STEP_MS);
            }
        };
        this.cancelScheduled = this.schedule(step, FADE_STEP_MS);
    }

    private createMusic(): AudioLike | null {
        const special = this.pendingSpecialWave === null ? null : this.specialTracks[this.pendingSpecialWave];
        if (special && !this.failedTracks.has(special)) {
            const audio = this.createTrack(special);
            if (audio) return audio;
        }
        if (special) this.pendingSpecialWave = null;
        while (true) {
            const tracks = this.phaseTracks[this.phase].filter(track => !this.failedTracks.has(track));
            const count = tracks.length;
            if (!count) return null;
            const value = this.random();
            const sample = Number.isFinite(value) ? Math.max(0, Math.min(value, 1 - Number.EPSILON)) : 0;
            const lastIndex = tracks.indexOf(this.lastMusicPath || '');
            const index = lastIndex < 0 || count === 1
                ? Math.floor(sample * count)
                : (lastIndex + 1 + Math.floor(sample * (count - 1))) % count;
            const path = tracks[index];
            this.lastMusicPath = path;
            const audio = this.createTrack(path);
            if (audio) return audio;
            // A factory failure excludes this track; the finite pool guarantees
            // the loop ends even if every asset is missing.
        }
    }

    private createTrack(path: string): AudioLike | null {
        try {
            const audio = this.factory(path);
            this.music = audio;
            this.musicPath = path;
            audio.onended = () => {
                if (this.music !== audio || !this.musicStarted || this.transitioning) return;
                this.cancelTransition();
                this.music = null;
                this.musicPath = null;
                this.musicStarted = false;
                if (this.pendingSpecialWave !== null && this.specialTracks[this.pendingSpecialWave] === path) {
                    this.pendingSpecialWave = null;
                }
                this.startMusic();
            };
            audio.onerror = () => {
                if (this.music !== audio) return;
                this.failedTracks.add(path);
                this.cancelTransition();
                this.music = null;
                this.musicPath = null;
                this.musicStarted = false;
                if (this.pendingSpecialWave !== null && this.specialTracks[this.pendingSpecialWave] === path) {
                    this.pendingSpecialWave = null;
                }
                this.startMusic();
            };
            return audio;
        } catch (error) {
            this.failedTracks.add(path);
            return null;
        }
    }

    private getAudio(kind: keyof typeof AUDIO_PATHS): AudioLike | null {
        const existing = this[kind];
        if (existing) return existing;
        try {
            const created = this.factory(AUDIO_PATHS[kind]);
            this[kind] = created;
            return created;
        } catch (error) {
            return null;
        }
    }
}

export const audioManager = new AudioManager();
