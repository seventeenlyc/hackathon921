import {strategyStore} from './agent/StrategyStore';
import {queueStrategy} from './StrategyQueue';

/**
 * The player's strategy prompt input (docs/USER_STORY.md MVP 用户故事 2 & 4).
 *
 * This module is only the view: it collects text and reports when the edit will
 * take effect. The versioning rules live in `StrategyStore` and the AI runtime
 * reads the active version while the loop is in PLANNING.
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
        this.render();
    }

    private submit() {
        const text = this.input.value.trim();

        if (text.length === 0) {
            this.status.textContent = 'Write a strategy before applying it.';
            this.status.classList.add('warn');
            return;
        }

        this.status.classList.remove('warn');
        queueStrategy(text);
        this.render();
    }

    private render() {
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
