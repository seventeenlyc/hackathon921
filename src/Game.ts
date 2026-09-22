import {canvas, ctx} from './Canvas';
import {fps} from './config.json';
import './Controls';
import {controls} from './Controls';
import {camera} from './Camera';
import {interfaceManager} from './InterfaceManager';
import type {RunStats} from './InterfaceManager';
import {decisionLog} from './DecisionLog';
import {playMode, switchPlayMode} from './PlayMode';
import {gameControl} from './net/gameControl';
import type {GameSummary} from './net/GameClient';
import {towerPlacer} from './TowerPlacer';
import {gameLoop, GameSpeed} from './agent/GameLoop';
import {queueStrategy, startRun} from './StrategyQueue';
import {readUsernameCookie} from './leaderboard/LeaderboardStore';
import {fetchSharedLeaderboard} from './leaderboard/LeaderboardClient';
import {FrameBuffer} from './view/frameBuffer';
import {
    drawBases,
    drawEnemies,
    drawMapGrid,
    drawMunitions,
    drawRocks,
    drawTowers,
    towerIdAt,
} from './view/render';
import type {RenderSnapshot} from './engine/RenderSnapshot';

// Settlement stats gathered across the run.
let runStartedAt: number | null = null;

/**
 * The browser orchestrator (phase C).
 *
 * The browser no longer simulates anything: the server owns the game and pushes
 * render snapshots over SSE. This class only keeps the latest frame, draws it,
 * forwards player intent through `gameControl`, and wires the result screen.
 */
class Game {
    private latest: RenderSnapshot | null = null;
    /** Recent frames on a delayed timeline, so jitter does not freeze the picture. */
    private readonly frames = new FrameBuffer(150);
    private looping: boolean = true;

    constructor() {
        gameControl.onSummary = summary => this.onSummary(summary);
        gameControl.onSnapshot = frame => this.onSnapshot(frame);
        gameControl.onOver = summary => this.onOver(summary);
        gameControl.onError = message => decisionLog.error(message);

        // Human placement forwards intents to the server socket.
        towerPlacer.bind(gameControl.session);

        this.start();
    }

    /** Open the hosted game. Called once a session token is available. */
    async open(): Promise<void> {
        try {
            const summary = await gameControl.open();
            interfaceManager.applySummary(summary);

            // Human mode is the original inert experience: it plays as soon as it
            // loads. AI mode stays in IDLE until the player writes a prompt and
            // presses Start.
            if (playMode === 'human') {
                await gameControl.session.start();
            }
        } catch (error) {
            decisionLog.error(String((error as Error).message || error));
        }
    }

    start() {
        setInterval(this.updateLoop.bind(this), 1000 / fps);
        requestAnimationFrame(this.drawLoop.bind(this));
    }

    private onSummary(summary: GameSummary) {
        interfaceManager.applySummary(summary);
        if (summary.state === 'running' && runStartedAt === null) runStartedAt = Date.now();
    }

    private onSnapshot(frame: RenderSnapshot) {
        // A frozen game or a fresh run must never blend across the gap.
        if (frame.state !== 'running') {
            this.frames.reset();
        }
        this.frames.push(frame, performance.now());
        this.latest = frame;
        interfaceManager.applySnapshot(frame);
    }

    /**
     * The frame to draw: sampled from a short frame history against a slightly
     * delayed timeline, so ordinary network/event-loop jitter is absorbed instead
     * of freezing the picture (production showed gaps up to ~292 ms against a
     * 50 ms nominal rate). A frozen game is drawn as-is.
     */
    private interpolatedFrame(): RenderSnapshot | null {
        if (this.latest && this.latest.state !== 'running') {
            return this.latest;
        }
        return this.frames.sample(performance.now()) ?? this.latest;
    }

    private onOver(summary: GameSummary) {
        this.looping = true;
        interfaceManager.showGameOver(this.collectStats(summary));

        // 名次以服务端为准，异步补齐；拿不到就保持 “—”。
        const username = readUsernameCookie();
        if (username && playMode === 'ai') {
            void fetchSharedLeaderboard(username).then(result => {
                interfaceManager.setResultRank(result && result.me ? result.me.rank : null);
            });
        }
    }

    /**
     * Camera input stays live regardless of the server-driven simulation, so the
     * map can be inspected while idle or paused.
     */
    private updateLoop() {
        camera.update();
    }

    private drawLoop() {
        ctx.save();
        canvas.clear();
        camera.process(ctx);

        const snapshot = this.interpolatedFrame();

        // Compute the placement ghost HERE, not in the 30 Hz update loop: the
        // canvas redraws every animation frame, so a ghost computed a tick behind
        // trails the cursor (visible as "the mouse is above but the marker is still
        // below"). This also runs after camera.process(), so it uses this frame's
        // transform rather than the previous frame's.
        if (playMode === 'human') towerPlacer.update(snapshot);

        if (snapshot) {
            drawMapGrid(ctx, snapshot.grid);
            drawMunitions(ctx, snapshot);
            drawEnemies(ctx, snapshot);
            drawRocks(ctx, snapshot);
            drawTowers(ctx, snapshot, this.hoveredTowerId(snapshot));
            drawBases(ctx, snapshot);
            if (playMode === 'human') towerPlacer.draw(ctx, snapshot);
        }

        ctx.restore();

        if (this.looping) {
            requestAnimationFrame(this.drawLoop.bind(this));
        }
    }

    private hoveredTowerId(snapshot: RenderSnapshot): string | null {
        const matrix = canvas.transformMatrix;
        if (!matrix) return null;
        const point = matrix.inverse().transformPoint({x: controls.mouse.x, y: controls.mouse.y});
        return towerIdAt(snapshot, point);
    }

    private collectStats(summary: GameSummary): RunStats {
        const snapshot = this.latest;
        const byType = new Map<string, number>();
        let total = 0;

        if (snapshot) {
            for (const tower of snapshot.towers) {
                total += 1;
                byType.set(tower.type, (byType.get(tower.type) || 0) + 1);
            }
        }

        return {
            wave: summary.wave,
            towers: {
                total,
                byType: Array.from(byType.entries())
                    .map(([type, count]) => ({type, count}))
                    .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type)),
            },
            cash: snapshot ? snapshot.cash : summary.cash,
            decisions: summary.decisions,
            durationMs: runStartedAt === null ? 0 : Date.now() - runStartedAt,
            rank: null,
        };
    }
}

export const game = new Game();

/** Open (or reuse) the hosted game. Safe to call more than once. */
export function openHostedGame(): Promise<void> {
    return game.open();
}

/**
 * Programmatic control surface (issue #2). Everything the AI is allowed to do is
 * reachable here without touching the mouse.
 */
(window as any).promptDefense = {
    session: gameControl.session,
    loop: gameLoop,
    mode: playMode,
    setMode: (mode: 'ai' | 'human') => switchPlayMode(mode),
    open: () => openHostedGame(),
    start: () => startRun(),
    pause: () => gameControl.session.pause(),
    resume: () => gameControl.session.resume(),
    setSpeed: (speed: GameSpeed) => gameControl.session.setSpeed(speed),
    setStrategy: (text: string) => queueStrategy(text),
    // Debug view (issue #4): the latest frame the server sent.
    state: () => gameControl.session.lastSnapshot,
};
