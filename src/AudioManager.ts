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

interface AudioEnvironment {
    visibility?: Pick<Document, 'hidden' | 'addEventListener'>;
    random?: () => number;
}

const AUDIO_PATHS = {
    wave: '/audio/wave.wav',
    gameOver: '/audio/game-over.wav',
} as const;

const FIGHT_TRACKS = ['fight1', 'fight2', 'fight3'] as const;
/** Optional, non-blocking audio state; the game engine owns every wave and tick. */
export class AudioManager {
    private readonly visibility?: AudioEnvironment['visibility'];
    private wave: AudioLike | null = null;
    private gameOver: AudioLike | null = null;
    private muted = false;
    private paused = false;
    private runActive = false;
    private gameOverPlayed = false;
    private waveActive = false;
    private masterVolume = 1;
    private music: AudioLike | null = null;
    private musicPlaying = false;
    private musicPhase: 'selection' | 'fight' | 'boss' | 'ended' = 'selection';
    private lastFight = '';
    private readonly random: () => number;

    constructor(
        private readonly factory: AudioFactory = defaultAudioFactory,
        environment: AudioEnvironment = {},
    ) {
        this.random = environment.random ?? Math.random;
        this.visibility = environment.visibility ?? (typeof document === 'undefined' ? undefined : document);
        this.visibility?.addEventListener('visibilitychange', () => this.onVisibilityChange());
    }

    /** Called synchronously from the player's run-start gesture, once per run. */
    beginRun(wave: number): void {
        if (this.runActive || !Number.isInteger(wave) || wave < 1) return;
        this.pauseCues();
        this.gameOverPlayed = false;
        this.paused = false;
        this.runActive = true;
        this.changeMusic('fight');
    }

    /** PAUSED freezes audio, but PLANNING is still part of the live run. */
    setPaused(paused: boolean): void {
        if (this.paused === paused) return;
        this.paused = paused;
        if (paused) this.pauseCues();
        this.syncMusic();
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
        this.changeMusic('ended');
        this.gameOverPlayed = true;
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
        if (muted) this.pauseCues();
        this.syncMusic();
    }

    isMuted(): boolean { return this.muted; }

    setVolume(volume: number): void {
        if (!Number.isFinite(volume)) return;
        this.masterVolume = Math.max(0, Math.min(1, volume));
        if (this.music) this.music.volume = 0.24 * this.masterVolume;
        if (this.wave) this.wave.volume = 0.18 * this.masterVolume;
        if (this.gameOver) this.gameOver.volume = 0.2 * this.masterVolume;
    }

    /** Retry blocked autoplay only on a player gesture; never restart a playing track. */
    unlock(): void {
        if (!this.music && this.musicPhase === 'selection') this.changeMusic('selection');
        else this.syncMusic();
    }

    /** The engine reports whether this wave actually added attack routes. */
    setRouteExpansion(expanded: boolean): void {
        if (!this.runActive) return;
        const phase = expanded ? 'boss' : 'fight';
        if (phase !== this.musicPhase) this.changeMusic(phase);
    }

    private changeMusic(phase: typeof this.musicPhase): void {
        const previous = this.music;
        this.music = null;
        this.musicPlaying = false;
        if (previous) {
            previous.onended = null;
            previous.onerror = null;
            try { previous.pause(); } catch { /* audio cannot block simulation */ }
        }
        this.musicPhase = phase;
        if (phase === 'ended') return;
        let name: string = phase === 'selection' ? 'selected' : 'boss';
        if (phase === 'fight') {
            const choices = FIGHT_TRACKS.filter(track => track !== this.lastFight);
            const sample = this.random();
            const index = Number.isFinite(sample) ? Math.min(choices.length - 1, Math.max(0, Math.floor(sample * choices.length))) : 0;
            name = choices[index];
            this.lastFight = name;
        }
        try {
            const audio = this.factory(`/audio/background/${name}.mp3`);
            this.music = audio;
            audio.loop = phase !== 'fight';
            audio.volume = 0.24 * this.masterVolume;
            audio.onended = () => {
                if (this.music === audio && this.musicPhase === 'fight') this.changeMusic('fight');
            };
            audio.onerror = () => { if (this.music === audio) this.musicPlaying = false; };
            this.syncMusic();
        } catch { /* missing media is non-fatal */ }
    }

    private syncMusic(): void {
        const audio = this.music;
        if (!audio) return;
        if (this.paused || this.muted || this.visibility?.hidden) {
            if (this.musicPlaying) {
                this.musicPlaying = false;
                try { audio.pause(); } catch { /* non-fatal */ }
            }
            return;
        }
        if (this.musicPlaying) return;
        this.musicPlaying = true;
        try {
            const result = audio.play();
            if (result && typeof result.catch === 'function') {
                void result.catch(() => { if (this.music === audio) this.musicPlaying = false; });
            }
        } catch { this.musicPlaying = false; }
    }

    private canPlay(): boolean {
        return this.runActive && !this.paused && !this.muted && !this.visibility?.hidden;
    }

    private onVisibilityChange(): void {
        if (this.visibility?.hidden) this.pauseCues();
        this.syncMusic();
    }

    private pauseCues(): void {
        this.waveActive = false;
        for (const audio of [this.wave, this.gameOver]) {
            if (audio) {
                try { audio.pause(); } catch (error) { /* media failure is non-fatal */ }
            }
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

function defaultAudioFactory(src: string): AudioLike {
    return new Audio(src);
}

export const audioManager = new AudioManager();
