export interface AudioLike {
    loop: boolean;
    currentTime: number;
    volume: number;
    onended: HTMLAudioElement['onended'];
    play(): void | Promise<void>;
    pause(): void;
}

export type AudioFactory = (src: string) => AudioLike;

declare const __BACKGROUND_TRACKS__: readonly string[];

const AUDIO_PATHS = {
    wave: '/audio/wave.wav',
    gameOver: '/audio/game-over.wav',
} as const;
const FINAL_MUSIC_PATH = '/audio/final_bgm.mp3';

function defaultAudioFactory(src: string): AudioLike {
    return new Audio(src);
}

/** Optional media hooks that never own or mutate deterministic game state. */
export class AudioManager {
    private readonly factory: AudioFactory;
    private readonly backgroundTracks: readonly string[];
    private readonly random: () => number;
    private music: AudioLike | null = null;
    private lastMusicIndex = -1;
    private currentWave = 1;
    private wave: AudioLike | null = null;
    private gameOver: AudioLike | null = null;
    private muted = false;
    private musicStarted = false;
    private waveActive = false;
    private gameOverPlayed = false;

    constructor(
        factory: AudioFactory = defaultAudioFactory,
        backgroundTracks: readonly string[] = __BACKGROUND_TRACKS__,
        random: () => number = Math.random,
    ) {
        this.factory = factory;
        this.backgroundTracks = backgroundTracks;
        this.random = random;
    }

    startMusic(): void {
        if (this.muted || this.musicStarted || this.gameOverPlayed) return;
        const isFinalWave = this.currentWave > 200;
        const audio = this.music || (isFinalWave ? this.createFinalMusic() : this.createMusic());
        if (!audio) return;
        audio.loop = isFinalWave;
        audio.volume = 0.24;
        this.musicStarted = true;
        try {
            const result = audio.play();
            if (result && typeof (result as Promise<void>).catch === 'function') {
                void (result as Promise<void>).catch(() => {
                    if (this.music === audio) this.musicStarted = false;
                });
            }
        } catch (error) {
            this.musicStarted = false;
        }
    }

    /** Advance the non-simulation playlist boundary after a completed wave. */
    setWave(wave: number): void {
        if (!Number.isInteger(wave) || wave <= this.currentWave) return;
        const wasPlaylistWave = this.currentWave <= 200;
        this.currentWave = wave;
        if (wasPlaylistWave && wave > 200) {
            this.stopMusic();
            this.music = null;
            this.startMusic();
        }
    }

    stopMusic(): void {
        this.musicStarted = false;
        if (!this.music) return;
        try { this.music.pause(); } catch (error) { /* media failure is non-fatal */ }
    }

    playWaveReached(): void {
        if (this.muted || this.waveActive) return;
        const audio = this.getAudio('wave');
        if (!audio) return;
        this.waveActive = true;
        try {
            audio.currentTime = 0;
            audio.volume = 0.18;
            const result = audio.play();
            if (result && typeof (result as Promise<void>).finally === 'function') {
                void (result as Promise<void>).finally(() => { this.waveActive = false; }).catch(() => {});
            }
        } catch (error) {
            this.waveActive = false;
        }
    }

    playGameOver(): void {
        if (this.gameOverPlayed) return;
        this.gameOverPlayed = true;
        this.stopMusic();
        if (this.muted) return;
        const audio = this.getAudio('gameOver');
        if (!audio) return;
        try {
            audio.currentTime = 0;
            audio.volume = 0.2;
            const result = audio.play();
            if (result && typeof (result as Promise<void>).catch === 'function') {
                void (result as Promise<void>).catch(() => {});
            }
        } catch (error) {
            // Missing/invalid media must never block the result screen.
        }
    }

    setMuted(muted: boolean): void {
        this.muted = muted;
        if (muted) this.stopMusic();
    }

    isMuted(): boolean {
        return this.muted;
    }

    private createMusic(): AudioLike | null {
        const count = this.backgroundTracks.length;
        if (!count) return null;
        const value = this.random();
        const sample = Number.isFinite(value) ? Math.max(0, Math.min(value, 1 - Number.EPSILON)) : 0;
        const index = this.lastMusicIndex < 0 || count === 1
            ? Math.floor(sample * count)
            : (this.lastMusicIndex + 1 + Math.floor(sample * (count - 1))) % count;
        try {
            const audio = this.factory(this.backgroundTracks[index]);
            this.lastMusicIndex = index;
            this.music = audio;
            audio.onended = () => {
                if (this.music !== audio || !this.musicStarted) return;
                this.music = null;
                this.musicStarted = false;
                this.startMusic();
            };
            return audio;
        } catch (error) {
            return null;
        }
    }

    private createFinalMusic(): AudioLike | null {
        try {
            this.music = this.factory(FINAL_MUSIC_PATH);
            return this.music;
        } catch (error) {
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
