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
}

const AUDIO_PATHS = {
    wave: '/audio/wave.wav',
    gameOver: '/audio/game-over.wav',
} as const;

// BGM was removed with the licensed demo tracks (2026-09-25 de-branding);
// only the two locally generated WAV cues remain.
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

    constructor(
        private readonly factory: AudioFactory = defaultAudioFactory,
        environment: AudioEnvironment = {},
    ) {
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
    }

    /** PAUSED freezes audio, but PLANNING is still part of the live run. */
    setPaused(paused: boolean): void {
        if (this.paused === paused) return;
        this.paused = paused;
        if (paused) this.pauseCues();
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
    }

    isMuted(): boolean { return this.muted; }

    setVolume(volume: number): void {
        if (!Number.isFinite(volume)) return;
        this.masterVolume = Math.max(0, Math.min(1, volume));
        if (this.wave) this.wave.volume = 0.18 * this.masterVolume;
        if (this.gameOver) this.gameOver.volume = 0.2 * this.masterVolume;
    }

    private canPlay(): boolean {
        return this.runActive && !this.paused && !this.muted && !this.visibility?.hidden;
    }

    private onVisibilityChange(): void {
        if (this.visibility?.hidden) this.pauseCues();
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
