import {ActionResult, GameSnapshot} from './types';
import {Planner} from './GameLoop';
import {StrategyStore} from './StrategyStore';

/**
 * The AI player's decision loop (issue #25).
 *
 * It runs once per PLANNING round, while the simulation is frozen: it reads the
 * locked strategy version, asks the server-side proxy what to do with the
 * current battlefield, and executes the returned actions through the same
 * `GameActions` port the human console uses. The model never touches the game
 * directly.
 *
 * Failure is closed: if the proxy is unreachable, slow, or misbehaves, no action
 * is taken, the next wave still starts, and the error is surfaced instead of
 * being swallowed (AGENTS.md).
 */

/** The slice of GameActions the runtime needs; injected so tests stay DOM-free. */
export interface ActionPort {
    getState(): GameSnapshot;

    buildTower(type: string, i: number, j: number): ActionResult<{ towerId: string; cost: number }>;

    upgradeTower(id: string): ActionResult<{ level: number; upgradeCost: number }>;
}

export interface DecisionEntry {
    /** Wave the decision governs (the one about to spawn). */
    wave: number;
    action: string;
    detail: string;
    ok: boolean;
    message: string;
}

export interface AgentRuntimeOptions {
    actions: ActionPort;
    store: StrategyStore;
    fetchImpl: typeof fetch;
    endpoint?: string;
    onDecision?: (entry: DecisionEntry) => void;
    onError?: (message: string) => void;
    maxActions?: number;
    /** Supplies the session token; the server requires a valid session (issue #22). */
    getToken?: () => string | null;
    /** Client-side guard so a hung request cannot freeze PLANNING forever. */
    timeoutMs?: number;
}

interface AgentAction {
    name?: string;
    arguments?: { [key: string]: unknown };
}

const DEFAULT_ENDPOINT = '/api/agent/decide';
const DEFAULT_MAX_ACTIONS = 8;
const DEFAULT_TIMEOUT_MS = 12000;

export class AgentRuntime implements Planner {
    private readonly actions: ActionPort;
    private readonly store: StrategyStore;
    private readonly fetchImpl: typeof fetch;
    private readonly endpoint: string;
    private readonly onDecision: (entry: DecisionEntry) => void;
    private readonly onError: (message: string) => void;
    private readonly maxActions: number;
    private readonly getToken: () => string | null;
    private readonly timeoutMs: number;

    constructor(options: AgentRuntimeOptions) {
        this.actions = options.actions;
        this.store = options.store;
        this.fetchImpl = options.fetchImpl;
        this.endpoint = options.endpoint || DEFAULT_ENDPOINT;
        this.onDecision = options.onDecision || (() => undefined);
        this.onError = options.onError || (() => undefined);
        this.maxActions = options.maxActions || DEFAULT_MAX_ACTIONS;
        this.getToken = options.getToken || (() => null);
        this.timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
    }

    async plan(): Promise<void> {
        // The store was locked when the loop entered PLANNING, so `active()` is
        // the version this wave must obey — edits made while we are thinking
        // defer to the next wave without affecting this call.
        const strategy = this.store.active().text;

        let state: GameSnapshot;
        try {
            state = this.actions.getState();
        } catch (error) {
            this.onError('Could not read the game state; skipping this decision round.');
            return;
        }

        // PLANNING now precedes the wave it governs (docs/PRODUCT_CONCEPT.md §7),
        // so the snapshot's wave counter already names the wave about to spawn.
        const wave = state.wave;

        if (!strategy.trim()) {
            this.onError('No strategy set; the AI will not act this wave.');
            return;
        }

        const headers: Record<string, string> = {'content-type': 'application/json'};
        const token = this.getToken();
        if (token) headers.authorization = `Bearer ${token}`;

        // Without this, a provider or proxy that never answers would leave the
        // loop frozen in PLANNING (holdForPlanning awaits the planner).
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

        let response: Response;
        try {
            response = await this.fetchImpl(this.endpoint, {
                method: 'POST',
                headers,
                body: JSON.stringify({strategy, state}),
                signal: controller.signal,
            });
        } catch (error) {
            const aborted = error && (error as {name?: string}).name === 'AbortError';
            this.onError(aborted
                ? `The agent proxy did not answer within ${this.timeoutMs}ms; continuing without new orders.`
                : 'Could not reach the agent proxy; continuing without new orders.');
            return;
        } finally {
            clearTimeout(timeout);
        }

        if (!response.ok) {
            // The proxy returns a readable reason (e.g. PROVIDER_NOT_CONFIGURED);
            // prefer it over a bare status code so the player can act on it.
            const detail = await this.readErrorMessage(response);
            this.onError(detail || `The agent proxy returned HTTP ${response.status}; continuing without new orders.`);
            return;
        }

        let payload: { ok?: boolean; actions?: AgentAction[]; message?: string };
        try {
            payload = await response.json();
        } catch (error) {
            this.onError('The agent proxy returned an unreadable response.');
            return;
        }

        if (!payload || payload.ok !== true || !Array.isArray(payload.actions)) {
            const message = payload && payload.message
                ? payload.message
                : 'The agent proxy rejected the decision request.';
            this.onError(message);
            return;
        }

        payload.actions.slice(0, this.maxActions).forEach(action => this.execute(action, wave));
    }

    private async readErrorMessage(response: Response): Promise<string | null> {
        try {
            const payload = await response.json();
            return payload && typeof payload.message === 'string' ? payload.message : null;
        } catch (error) {
            return null;
        }
    }

    private execute(action: AgentAction, wave: number) {
        const args = action.arguments || {};

        if (action.name === 'build_tower') {
            const result = this.actions.buildTower(String(args.type), Number(args.i), Number(args.j));
            this.onDecision({
                wave,
                action: 'build_tower',
                detail: `${String(args.type)} at (${String(args.i)}, ${String(args.j)})`,
                ok: result.ok,
                message: result.message,
            });
            return;
        }

        if (action.name === 'upgrade_tower') {
            const result = this.actions.upgradeTower(String(args.id));
            this.onDecision({
                wave,
                action: 'upgrade_tower',
                detail: `tower ${String(args.id)}`,
                ok: result.ok,
                message: result.message,
            });
            return;
        }

        this.onDecision({
            wave,
            action: String(action.name),
            detail: '',
            ok: false,
            message: `Ignored unknown action "${String(action.name)}".`,
        });
    }
}
