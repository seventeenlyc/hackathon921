import {strategyStore} from './agent/StrategyStore';
import {gameLoop} from './agent/GameLoop';
import {randomStrategy} from './agent/StrategyLibrary';
import {queueStrategy, startRun} from './StrategyQueue';

/**
 * The player's strategy prompt input (docs/USER_STORY.md MVP 用户故事 2 & 4).
 *
 * This module is only the view: it collects text and reports when the edit will
 * take effect. The versioning rules live in `StrategyStore` and the AI runtime
 * reads the active version while the loop is in PLANNING.
 *
 * Tower placement is not part of this UI: the human only writes the strategy and
 * the AI builds (docs/PRODUCT_CONCEPT.md §5). A run cannot start without a
 * prompt, so before the run exists the button is disabled until the box has text.
 */
export class StrategyPanel {
    private readonly input: HTMLTextAreaElement;
    private readonly applyButton: HTMLButtonElement;
    private readonly randomButton: HTMLButtonElement;
    private readonly status: HTMLElement;

    constructor() {
        this.input = document.getElementById('strategy-input') as HTMLTextAreaElement;
        this.applyButton = document.getElementById('strategy-apply') as HTMLButtonElement;
        this.randomButton = document.getElementById('strategy-random') as HTMLButtonElement;
        this.status = document.getElementById('strategy-status') as HTMLElement;

        this.input.value = strategyStore.active().text;
        this.applyButton.addEventListener('click', () => this.submit());
        // An example only fills the box: the player reads it, optionally edits it,
        // then starts or applies it like any other prompt (docs/PRODUCT_CONCEPT.md §6).
        this.randomButton.addEventListener('click', () => {
            this.input.value = randomStrategy();
            this.status.classList.remove('warn');
            this.render();
        });
        this.input.addEventListener('input', () => this.render());

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
        const empty = this.input.value.trim().length === 0;
        this.applyButton.textContent = idle ? 'Start run' : 'Apply strategy';
        // No prompt, no run (docs/PRODUCT_CONCEPT.md §5/§6).
        this.applyButton.disabled = idle && empty;

        if (idle) {
            this.status.classList.remove('queued');
            this.status.textContent = empty
                ? 'Write a strategy, or press Random strategy for an example.'
                : 'Not started — the AI plays from wave 1.';
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
