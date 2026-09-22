import {GameSession} from './session';
import type {GameSummary} from './GameClient';
import type {RenderSnapshot} from '../engine/RenderSnapshot';
import {gameLoop} from '../agent/GameLoop';
import type {GameSpeed, GameState} from '../agent/GameLoop';
import {strategyStore} from '../agent/StrategyStore';
import {playMode} from '../PlayMode';
import {queryParamsManager} from '../QueryParamsManager';
import {ensureSessionToken, getSessionToken} from '../leaderboard/LeaderboardClient';
import {readUsernameCookie} from '../leaderboard/LeaderboardStore';

/**
 * The browser's connection to the hosted game (phase C).
 *
 * It owns the single `GameSession`, resolves the session token for both modes
 * (AI: the nickname's session; human: an anonymous one) and mirrors the server's
 * state into the existing `gameLoop` so UI code keeps reading one source. It
 * deliberately imports no UI, so the modules that need it stay acyclic.
 */

let anonymousToken: string | null = null;

async function ensureToken(): Promise<string | null> {
    if (playMode === 'ai') {
        const username = readUsernameCookie();
        return username ? ensureSessionToken(username) : null;
    }

    if (anonymousToken) return anonymousToken;
    try {
        const response = await fetch('/api/sessions/anonymous', {method: 'POST'});
        if (!response.ok) return null;
        const data = await response.json();
        anonymousToken = typeof data.token === 'string' ? data.token : null;
        return anonymousToken;
    } catch (e) {
        return null;
    }
}

function currentToken(): string | null {
    return playMode === 'ai' ? getSessionToken() : anonymousToken;
}

export class GameControl {
    onSummary: ((summary: GameSummary) => void) | null = null;
    onSnapshot: ((frame: RenderSnapshot) => void) | null = null;
    onOver: ((summary: GameSummary) => void) | null = null;
    onError: ((message: string) => void) | null = null;

    readonly session: GameSession;
    private opening: Promise<GameSummary> | null = null;

    constructor() {
        this.session = new GameSession({
            mode: playMode,
            difficulty: queryParamsManager.getDifficulty(),
            ensureToken,
            getToken: currentToken,
            onSummary: summary => this.handleSummary(summary),
            onSnapshot: frame => {
                if (this.onSnapshot) this.onSnapshot(frame);
            },
            onGameOver: summary => {
                if (this.onOver) this.onOver(summary);
            },
            onError: message => {
                if (this.onError) this.onError(message);
            },
        });
    }

    /** Idempotent: several callers may ask for the game to be opened. */
    open(): Promise<GameSummary> {
        if (!this.opening) this.opening = this.session.open();
        return this.opening;
    }

    private handleSummary(summary: GameSummary) {
        gameLoop.syncState(summary.state as GameState);
        gameLoop.setSpeed(summary.speed as GameSpeed);

        // Lock the local prompt mirror exactly when the server opens PLANNING, so
        // the status line matches what the AI is actually planning with.
        if (summary.state === 'planning') strategyStore.lock();

        if (this.onSummary) this.onSummary(summary);
    }
}

export const gameControl = new GameControl();
