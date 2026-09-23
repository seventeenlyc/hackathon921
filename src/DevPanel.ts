// 开发模式面板（人工 QA）：由头部扳手按钮唤起。
//
// 面板只负责收集密码与开局参数；密码只发往服务端 /api/dev/unlock，
// 引擎改写发生在 StrategyQueue 的 devController.onChange 订阅里。
// 开发模式仅在 AI 指挥模式下可用：人类模式确认档案后会立即自动开始
// 计榜对局（见 main.ts 的 startHumanRun），无法在开局前安全地应用开发参数——
// 这里明确提示而不是静默跳过。
//
// 所有文案走 i18n；用户输入只经 value/textContent，不进 innerHTML。

import {devController} from './dev';
import type {DevUnlockReason} from './dev';
import {gameLoop} from './agent/GameLoop';
import {playMode} from './PlayMode';
import {onLangChange, t} from './i18n';

export class DevPanel {
    private overlay: HTMLElement | null = null;
    private wrench: HTMLButtonElement | null = null;
    private errorEl: HTMLElement | null = null;
    private lastError: DevUnlockReason | null = null;
    private busy = false;
    private waveInput: HTMLInputElement | null = null;
    private cashInput: HTMLInputElement | null = null;

    constructor(wrench: HTMLButtonElement | null) {
        this.wrench = wrench;
        this.wrench?.addEventListener('click', () => this.open());
        devController.onChange(() => {
            if (this.overlay) this.render();
            this.updateWrenchState();
        });
        gameLoop.onChange(() => {
            if (this.overlay) this.render();
        });
        onLangChange(() => {
            if (this.overlay) this.render();
        });
        this.updateWrenchState();
    }

    /** The wrench lights up once unlocked so the QA operator sees the state at a glance. */
    private updateWrenchState() {
        if (!this.wrench) return;
        this.wrench.classList.toggle('unlocked', devController.isUnlocked);
        this.wrench.setAttribute('aria-expanded', String(this.overlay !== null));
    }

    open(): void {
        if (this.overlay) return;
        this.lastError = null;
        this.overlay = document.createElement('div');
        this.overlay.className = 'dev-overlay';
        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay) this.close();
        });
        document.getElementById('inert')!.appendChild(this.overlay);
        document.addEventListener('keydown', this.escapeHandler);
        this.render();
        this.updateWrenchState();
    }

    close(): void {
        if (!this.overlay) return;
        this.overlay.remove();
        this.overlay = null;
        this.lastError = null;
        document.removeEventListener('keydown', this.escapeHandler);
        this.wrench?.focus();
        this.updateWrenchState();
    }

    private escapeHandler = (e: KeyboardEvent): void => {
        if (e.key === 'Escape') this.close();
    };

    private render(): void {
        const overlay = this.overlay;
        if (!overlay) return;
        const card = document.createElement('div');
        card.className = 'dev-card';
        card.setAttribute('role', 'dialog');
        card.setAttribute('aria-modal', 'true');
        card.setAttribute('aria-label', t('dev.title'));

        const heading = document.createElement('div');
        heading.className = 'dev-heading';
        const title = document.createElement('h2');
        title.textContent = t('dev.title');
        const unranked = document.createElement('span');
        unranked.className = 'dev-unranked-tag';
        unranked.textContent = t('dev.unranked');
        heading.append(title, unranked);
        card.appendChild(heading);

        if (playMode !== 'ai') {
            // 明确说明而不是静默跳过：人类模式无法安全支持开发参数。
            const note = document.createElement('p');
            note.className = 'dev-note';
            note.textContent = t('dev.humanOnly');
            card.appendChild(note);
        } else if (!devController.isUnlocked) {
            card.appendChild(this.buildLockedForm());
        } else {
            card.appendChild(this.buildUnlockedForm());
        }

        const actions = document.createElement('div');
        actions.className = 'dev-actions';
        if (devController.isUnlocked) {
            const confirm = document.createElement('button');
            confirm.type = 'button';
            confirm.className = 'dev-confirm-btn';
            confirm.textContent = t('dev.confirm');
            confirm.disabled = !gameLoop.isIdle();
            confirm.addEventListener('click', () => this.handleConfirm());
            actions.appendChild(confirm);
        }
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'dev-close';
        close.textContent = t('dev.cancel');
        close.addEventListener('click', () => this.close());
        actions.appendChild(close);
        card.appendChild(actions);

        overlay.textContent = '';
        overlay.appendChild(card);
    }

    /** Password form. No attempt limit is imposed (per QA requirement). */
    private buildLockedForm(): HTMLElement {
        const wrap = document.createElement('div');
        wrap.className = 'dev-body';

        const intro = document.createElement('p');
        intro.className = 'dev-note';
        intro.textContent = t('dev.lockedIntro');
        wrap.appendChild(intro);

        const form = document.createElement('form');
        const label = document.createElement('label');
        label.className = 'dev-field';
        const labelText = document.createElement('span');
        labelText.textContent = t('dev.passwordLabel');
        const input = document.createElement('input');
        input.type = 'password';
        input.autocomplete = 'off';
        input.placeholder = t('dev.passwordPlaceholder');
        input.maxLength = 128;
        input.required = true;
        label.append(labelText, input);
        form.appendChild(label);

        const error = document.createElement('p');
        error.className = 'dev-error';
        error.setAttribute('role', 'alert');
        if (this.lastError) error.textContent = t(`dev.error.${this.lastError}`);
        this.errorEl = error;
        form.appendChild(error);

        const submit = document.createElement('button');
        submit.type = 'submit';
        submit.className = 'dev-unlock-btn';
        submit.textContent = t('dev.unlock');
        submit.disabled = this.busy;
        form.appendChild(submit);

        form.addEventListener('submit', (e) => {
            e.preventDefault();
            void this.handleUnlock(input.value, submit, error);
        });
        wrap.appendChild(form);
        return wrap;
    }

    private async handleUnlock(password: string, submit: HTMLButtonElement, error: HTMLElement): Promise<void> {
        if (this.busy) return;
        this.busy = true;
        submit.disabled = true;
        error.textContent = '';
        const result = await devController.unlock(password);
        this.busy = false;
        if (result.ok) {
            // render() switches to the unlocked form; devController.onChange fires it.
            return;
        }
        submit.disabled = false;
        error.textContent = t(`dev.error.${result.reason}`);
    }

    /** Unlocked view: starting wave/cash inputs, editable only while IDLE. */
    private buildUnlockedForm(): HTMLElement {
        const wrap = document.createElement('div');
        wrap.className = 'dev-body';

        const intro = document.createElement('p');
        intro.className = 'dev-note';
        intro.textContent = t('dev.unlockedIntro');
        wrap.appendChild(intro);

        const cfg = devController.getConfig();
        const idle = gameLoop.isIdle();
        const grid = document.createElement('div');
        grid.className = 'dev-config-grid';

        const waveField = document.createElement('label');
        waveField.className = 'dev-field';
        const waveLabel = document.createElement('span');
        waveLabel.textContent = t('dev.startWaveLabel');
        const waveInput = document.createElement('input');
        waveInput.type = 'number';
        waveInput.min = '1';
        waveInput.max = '9999';
        waveInput.step = '1';
        waveInput.value = String(cfg.startWave);
        waveInput.disabled = !idle;
        waveInput.addEventListener('change', () => {
            const parsed = Number(waveInput.value);
            const result = devController.setStartWave(parsed);
            if (!result.ok) {
                waveInput.value = String(devController.getConfig().startWave);
                this.toastConfigError('dev.invalidWave');
            }
        });
        this.waveInput = waveInput;
        waveField.append(waveLabel, waveInput);

        const cashField = document.createElement('label');
        cashField.className = 'dev-field';
        const cashLabel = document.createElement('span');
        cashLabel.textContent = t('dev.startCashLabel');
        const cashInput = document.createElement('input');
        cashInput.type = 'number';
        cashInput.min = '0';
        cashInput.max = '1000000000';
        cashInput.step = '1';
        cashInput.value = String(cfg.startCash);
        cashInput.disabled = !idle;
        cashInput.addEventListener('change', () => {
            const parsed = Number(cashInput.value);
            const result = devController.setStartCash(parsed);
            if (!result.ok) {
                cashInput.value = String(devController.getConfig().startCash);
                this.toastConfigError('dev.invalidCash');
            }
        });
        this.cashInput = cashInput;
        cashField.append(cashLabel, cashInput);

        grid.append(waveField, cashField);
        wrap.appendChild(grid);

        if (!idle) {
            const locked = document.createElement('p');
            locked.className = 'dev-note dev-locked-note';
            locked.textContent = t('dev.lockedAfterStart');
            wrap.appendChild(locked);
        }

        return wrap;
    }

    /** Confirm button: re-read the inputs, validate on the engine side, close on success. */
    private handleConfirm(): void {
        let ok = true;
        if (this.waveInput) {
            const result = devController.setStartWave(Number(this.waveInput.value));
            if (!result.ok) {
                this.waveInput.value = String(devController.getConfig().startWave);
                this.toastConfigError('dev.invalidWave');
                ok = false;
            }
        }
        if (this.cashInput) {
            const result = devController.setStartCash(Number(this.cashInput.value));
            if (!result.ok) {
                this.cashInput.value = String(devController.getConfig().startCash);
                this.toastConfigError('dev.invalidCash');
                ok = false;
            }
        }
        if (ok) this.close();
    }

    /** Inline, aria-live error text (the panel has no Snackbar of its own). */
    private toastConfigError(key: string): void {
        const overlay = this.overlay;
        if (!overlay) return;
        let live = overlay.querySelector('.dev-config-error');
        if (!live) {
            live = document.createElement('p');
            live.className = 'dev-config-error';
            live.setAttribute('role', 'alert');
            const body = overlay.querySelector('.dev-body');
            body?.appendChild(live);
        }
        live.textContent = t(key);
        window.setTimeout(() => {
            if (live.textContent === t(key)) live.textContent = '';
        }, 3000);
    }
}
