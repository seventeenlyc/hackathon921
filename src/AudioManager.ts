export interface AudioLike {
    loop: boolean;
    currentTime: number;
    volume: number;
    play(): void | Promise<void>;
    pause(): void;
}

export type AudioFactory = (src: string) => AudioLike;

const AUDIO_PATHS = {
    music: '/audio/background.mp3',
    wave: '/audio/wave.wav',
    gameOver: '/audio/game-over.wav',
} as const;

function defaultAudioFactory(src: string): AudioLike {
    return new Audio(src);
}

/** Optional media hooks that never own or mutate deterministic game state. */
export class AudioManager {
    private readonly factory: AudioFactory;
    private music: AudioLike | null = null;
    private wave: AudioLike | null = null;
    private gameOver: AudioLike | null = null;
    private muted = false;
    private musicStarted = false;
    private waveActive = false;
    private gameOverPlayed = false;

    constructor(factory: AudioFactory = defaultAudioFactory) {
        this.factory = factory;
    }

    startMusic(): void {
        if (this.muted || this.musicStarted) return;
        const audio = this.getAudio('music');
        if (!audio) return;
        audio.loop = true;
        audio.volume = 0.24;
        this.musicStarted = true;
        try {
            const result = audio.play();
            if (result && typeof (result as Promise<void>).catch === 'function') {
                void (result as Promise<void>).catch(() => { this.musicStarted = false; });
            }
        } catch (error) {
            this.musicStarted = false;
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
