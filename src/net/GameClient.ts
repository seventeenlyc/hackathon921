import type {RenderSnapshot} from '../engine/RenderSnapshot';

/**
 * The browser's entire game API (docs/PRODUCT_CONCEPT.md §5).
 *
 * Phase C makes the browser an intent-only client: it never simulates. It asks
 * the server to create/control a game, sends tower intents in human mode, and
 * draws the render snapshots that arrive over SSE. fetch and EventSource are
 * injectable so the command layer can be unit-tested without a DOM or network.
 */

export interface EventSourceLike {
    addEventListener(type: string, listener: (event: { data: string }) => void): void;
    close(): void;
}

export interface GameClientOptions {
    /** Same origin by default; nginx serves /api/ (see deploy/README.md). */
    baseUrl?: string;
    /** Supplies the signed session token; every route except /api/session needs it. */
    getToken: () => string | null;
    fetchImpl?: typeof fetch;
    eventSourceFactory?: (url: string) => EventSourceLike;
}

export interface CreateGameOptions {
    mode: 'ai' | 'human';
    difficulty?: number;
}

export interface GameSummary {
    id: string;
    username: string;
    mode: 'ai' | 'human';
    state: string;
    wave: number;
    speed: number;
    cash: number;
    baseLife: number;
    tick: number;
    /** AI decisions so far; 0 in human mode. */
    decisions: number;
}

export interface StreamHandlers {
    onSnapshot: (frame: RenderSnapshot) => void;
    onOver?: (summary: GameSummary) => void;
    onError?: (message: string) => void;
}

export class GameClientError extends Error {
    constructor(public readonly status: number, public readonly code: string, message: string) {
        super(message);
        this.name = 'GameClientError';
    }
}

export class GameClient {
    private readonly baseUrl: string;
    private readonly getToken: () => string | null;
    private readonly fetchImpl: typeof fetch;
    private readonly eventSourceFactory: (url: string) => EventSourceLike;

    /** Latest frame seen, for a renderer that also polls outside the stream. */
    lastSnapshot: RenderSnapshot | null = null;

    constructor(options: GameClientOptions) {
        this.baseUrl = options.baseUrl === undefined ? '' : options.baseUrl;
        this.getToken = options.getToken;
        this.fetchImpl = options.fetchImpl || ((input, init) => fetch(input as any, init as any));
        this.eventSourceFactory = options.eventSourceFactory
            || (url => new EventSource(url) as unknown as EventSourceLike);
    }

    private headers(json = false): Record<string, string> {
        const headers: Record<string, string> = {};
        if (json) headers['content-type'] = 'application/json';
        const token = this.getToken();
        if (token) headers.authorization = `Bearer ${token}`;
        return headers;
    }

    private async request(method: string, path: string, body?: unknown): Promise<any> {
        const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
            method,
            headers: this.headers(body !== undefined),
            body: body === undefined ? undefined : JSON.stringify(body),
        } as any);

        let payload: any = null;
        try {
            payload = await response.json();
        } catch (e) {
            payload = null;
        }

        if (!response.ok) {
            const code = payload && payload.error ? String(payload.error) : 'HTTP_' + response.status;
            const message = payload && typeof payload.message === 'string' && payload.message.trim()
                ? payload.message : `${path} failed: ${code}`;
            throw new GameClientError(response.status, code, message);
        }
        return payload;
    }

    createGame(options: CreateGameOptions): Promise<GameSummary> {
        return this.request('POST', '/api/games', options);
    }

    state(gameId: string): Promise<GameSummary & { snapshot: RenderSnapshot }> {
        return this.request('GET', `/api/games/${encodeURIComponent(gameId)}`);
    }

    start(gameId: string): Promise<GameSummary> {
        return this.request('POST', `/api/games/${encodeURIComponent(gameId)}/start`);
    }

    pause(gameId: string): Promise<GameSummary> {
        return this.request('POST', `/api/games/${encodeURIComponent(gameId)}/pause`);
    }

    resume(gameId: string): Promise<GameSummary> {
        return this.request('POST', `/api/games/${encodeURIComponent(gameId)}/resume`);
    }

    setSpeed(gameId: string, speed: number): Promise<GameSummary> {
        return this.request('POST', `/api/games/${encodeURIComponent(gameId)}/speed`, { speed });
    }

    /** Returns the version and the wave it becomes effective at. */
    submitStrategy(gameId: string, text: string): Promise<{ accepted: boolean; version: number; effectiveWave: number }> {
        return this.request('POST', `/api/games/${encodeURIComponent(gameId)}/strategy`, { text });
    }

    requestLanes(gameId: string, count: number): Promise<{ accepted: boolean; requested: number; appliedLanes: number }> {
        return this.request('POST', `/api/games/${encodeURIComponent(gameId)}/lanes`, { count });
    }

    /** Human-mode only; the server rejects this in AI mode. */
    humanBuild(gameId: string, type: string, i: number, j: number): Promise<any> {
        return this.request('POST', `/api/games/${encodeURIComponent(gameId)}/actions`, { action: 'build_tower', type, i, j });
    }

    humanUpgrade(gameId: string, id: string): Promise<any> {
        return this.request('POST', `/api/games/${encodeURIComponent(gameId)}/actions`, { action: 'upgrade_tower', id });
    }

    /**
     * Subscribe to the render stream. Returns a disconnect function.
     *
     * The token rides in the query string because EventSource cannot set headers;
     * it is a short-lived signed session token, not a secret.
     */
    connect(gameId: string, handlers: StreamHandlers): () => void {
        const token = this.getToken();
        const url = `${this.baseUrl}/api/games/${encodeURIComponent(gameId)}/stream`
            + (token ? `?token=${encodeURIComponent(token)}` : '');

        const source = this.eventSourceFactory(url);

        source.addEventListener('snapshot', event => {
            try {
                const frame = JSON.parse(event.data) as RenderSnapshot;
                this.lastSnapshot = frame;
                handlers.onSnapshot(frame);
            } catch (e) {
                if (handlers.onError) handlers.onError('BAD_FRAME');
            }
        });

        source.addEventListener('over', event => {
            if (!handlers.onOver) return;
            try {
                handlers.onOver(JSON.parse(event.data) as GameSummary);
            } catch (e) {
                if (handlers.onError) handlers.onError('BAD_OVER');
            }
        });

        return () => source.close();
    }
}
