import {strategyStore} from './agent/StrategyStore';
import {gameLoop} from './agent/GameLoop';
import {queueStrategy, startRun} from './StrategyQueue';

/**
 * The player's strategy prompt input (docs/USER_STORY.md MVP 用户故事 2 & 4).
 *
 * This module is only the view: it collects text and reports when the edit will
 * take effect. The versioning rules live in `StrategyStore` and the AI runtime
 * reads the active version while the loop is in PLANNING.
 *
 * Before the run exists the button starts the game instead of queueing an edit:
 * the game opens in IDLE so the player can write the opening prompt first.
 */
export class StrategyPanel {
    private readonly input: HTMLTextAreaElement;
    private readonly applyButton: HTMLButtonElement;
    private readonly status: HTMLElement;

    constructor() {
        this.input = document.getElementById('strategy-input') as HTMLTextAreaElement;
        this.applyButton = document.getElementById('strategy-apply') as HTMLButtonElement;
        this.status = document.getElementById('strategy-status') as HTMLElement;

        this.input.value = strategyStore.active().text;
        this.applyButton.addEventListener('click', () => this.submit());

        // PLANNING locks the queue (wired in Game), which clears the "queued"
        // indicator; re-render on every transition so the status stays truthful.
        strategyStore.onChange(() => this.render());
        // The primary action changes meaning once the run has started.
        gameLoop.onChange(() => this.render());
        this.render();
    }

    private submit() {
        const text = this.input.value.trim();
        const idle = gameLoop.isIdle();

        if (text.length === 0) {
            this.status.textContent = idle
                ? 'Write a strategy before starting the run.'
                : 'Write a strategy before applying it.';
            this.status.classList.add('warn');
            return;
        }

        this.status.classList.remove('warn');
        queueStrategy(text);
        if (idle) startRun();
        this.render();
    }

    private render() {
        const idle = gameLoop.isIdle();
        this.applyButton.textContent = idle ? 'Start run' : 'Apply strategy';

        if (idle) {
            this.status.classList.remove('queued');
            this.status.textContent = 'Not started — the AI plays from wave 1.';
            return;
        }

        const queued = strategyStore.queued();

        if (queued) {
            this.status.textContent = `Queued · effective wave ${queued.fromWave}`;
            this.status.classList.add('queued');
            return;
        }

        this.status.classList.remove('queued');
        this.status.textContent = `Active from wave ${strategyStore.active().fromWave}`;
    }
}

export const strategyPanel = new StrategyPanel();
