import {strategyStore} from './agent/StrategyStore';
import {gameLoop} from './agent/GameLoop';
import {randomStrategy} from './agent/StrategyLibrary';
import {isStrategyTooLong, strategyLength, STRATEGY_MAX_LENGTH} from './agent/StrategyLimits';
import {queueStrategy, startRun} from './StrategyQueue';
import {getControlLayer} from './ControlLayer';
import {onLangChange, t} from './i18n';

/**
 * The player's strategy prompt input (docs/USER_STORY.md MVP 用户故事 2 & 4).
 *
 * This module is only the view: it collects text and reports when the edit will
 * take effect. The versioning rules live in `StrategyStore` and the AI runtime
 * reads the active version while the loop is in PLANNING.
 *
 * A run cannot start without a prompt, so before the run exists the button is
 * disabled until the box has text. Human tower placement lives in the tower
 * catalogue, not in this strategy console.
 */
export class StrategyPanel {
    private readonly input: HTMLTextAreaElement;
    private readonly applyButton: HTMLButtonElement;
    private readonly randomButton: HTMLButtonElement;
    private readonly status: HTMLElement;
    private readonly count: HTMLElement;

    constructor() {
        this.input = document.getElementById('strategy-input') as HTMLTextAreaElement;
        this.applyButton = document.getElementById('strategy-apply') as HTMLButtonElement;
        this.randomButton = document.getElementById('strategy-random') as HTMLButtonElement;
        this.status = document.getElementById('strategy-status') as HTMLElement;
        this.count = document.getElementById('strategy-count') as HTMLElement;

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

        if (strategyStore.active().text.trim()) {
            getControlLayer().hide();
        } else {
            getControlLayer().show();
        }

        // PLANNING locks the queue (wired in Game), which clears the "queued"
        // indicator; re-render on every transition so the status stays truthful.
        strategyStore.onChange(() => this.render());
        // The primary action changes meaning once the run has started.
        gameLoop.onChange(() => this.render());
        onLangChange(() => this.render());
        this.render();
    }

    private submit() {
        const text = this.input.value.trim();
        const idle = gameLoop.isIdle();

        if (isStrategyTooLong(text)) {
            this.warnOverLimit(strategyLength(text));
            return;
        }

        if (text.length === 0) {
            this.status.textContent = idle
                ? t('strategy.writeBeforeStart')
                : t('strategy.writeBeforeApply');
            this.status.classList.add('warn');
            return;
        }

        this.status.classList.remove('warn');
        queueStrategy(text);
        if (idle) startRun();
        this.render();
        const controlLayer = getControlLayer();
        controlLayer.hide();
        controlLayer.showHint();
    }

    private warnOverLimit(length: number) {
        this.status.textContent = t('strategy.tooLong', {length, max: STRATEGY_MAX_LENGTH});
        this.status.classList.add('warn');
    }

    private render() {
        const idle = gameLoop.isIdle();
        const length = strategyLength(this.input.value);
        const empty = length === 0;
        const over = isStrategyTooLong(this.input.value);

        this.count.textContent = `${length} / ${STRATEGY_MAX_LENGTH}`;
        this.count.classList.toggle('over', over);
        // 主文案写入 .btn-main，保留按钮里的装饰性副行（.btn-sub）不被 textContent 覆盖；
        // 元素缺失时回退到整体 textContent，兼容无 DOM 的测试桩。
        const applyMain = this.applyButton.querySelector('.btn-main');
        const applyText = idle ? t('strategy.start') : t('strategy.apply');
        if (applyMain) applyMain.textContent = applyText;
        else this.applyButton.textContent = applyText;
        const randomMain = this.randomButton.querySelector('.btn-main');
        if (randomMain) randomMain.textContent = t('strategy.random');
        else this.randomButton.textContent = t('strategy.random');
        this.applyButton.disabled = over || (idle && empty);

        if (over) {
            this.status.classList.remove('queued');
            this.warnOverLimit(length);
            return;
        }

        if (idle) {
            this.status.classList.remove('queued');
            this.status.textContent = empty
                ? t('strategy.hintEmpty')
                : t('strategy.notStarted');
            return;
        }

        const queued = strategyStore.queued();

        if (queued) {
            this.status.textContent = t('strategy.queued', {wave: queued.fromWave});
            this.status.classList.add('queued');
            return;
        }

        this.status.classList.remove('queued');
        this.status.textContent = t('strategy.active', {wave: strategyStore.active().fromWave});
    }
}

export const strategyPanel = new StrategyPanel();
