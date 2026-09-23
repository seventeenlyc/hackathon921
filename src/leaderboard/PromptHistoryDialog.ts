import {fetchBestRunPrompts} from './LeaderboardClient';
import type {BestRunPrompts, PromptNode} from './LeaderboardClient';
import {t} from '../i18n';

export type FetchBestRunPrompts = (uid: number) => Promise<BestRunPrompts | null>;

/** Public, plain-text detail view for the selected user's best-scoring run. */
export class PromptHistoryDialog {
    readonly dialog: HTMLDialogElement;
    private readonly title: HTMLHeadingElement;
    private readonly content: HTMLElement;
    private readonly closeButton: HTMLButtonElement;
    private readonly fetchHistory: FetchBestRunPrompts;
    private requestNumber = 0;
    private lastFocus: HTMLElement | null = null;

    constructor(fetchHistory: FetchBestRunPrompts = fetchBestRunPrompts) {
        this.fetchHistory = fetchHistory;
        this.dialog = document.createElement('dialog');
        this.dialog.className = 'prompt-history-dialog';
        this.dialog.setAttribute('aria-labelledby', 'prompt-history-title');

        this.title = document.createElement('h2');
        this.title.id = 'prompt-history-title';
        this.content = document.createElement('section');
        this.content.className = 'prompt-history-content';
        this.closeButton = document.createElement('button');
        this.closeButton.type = 'button';
        this.closeButton.className = 'prompt-history-close';
        this.closeButton.addEventListener('click', () => this.close());
        this.dialog.addEventListener('cancel', event => {
            event.preventDefault();
            this.close();
        });
        this.dialog.addEventListener('keydown', event => {
            if (event.key === 'Tab') {
                event.preventDefault();
                this.closeButton.focus();
            }
        });
        this.dialog.append(this.title, this.content, this.closeButton);
        document.getElementById('inert')!.appendChild(this.dialog);
        this.renderLoading('');
    }

    async open(uid: number, username: string): Promise<void> {
        const requestNumber = ++this.requestNumber;
        if (!this.isOpen()) {
            const active = document.activeElement;
            this.lastFocus = active && typeof (active as HTMLElement).focus === 'function'
                ? active as HTMLElement
                : null;
        }
        this.title.textContent = t('history.loadingTitle', {name: username});
        this.closeButton.textContent = t('history.close');
        this.renderLoading(t('history.loading'));
        if (!this.isOpen()) {
            if (typeof this.dialog.showModal === 'function') this.dialog.showModal();
            else this.dialog.setAttribute('open', '');
        }

        let result: BestRunPrompts | null;
        try {
            result = await this.fetchHistory(uid);
        } catch (error) {
            if (requestNumber === this.requestNumber) this.renderError();
            return;
        }
        if (requestNumber !== this.requestNumber || !this.isOpen()) return;
        if (!result) {
            this.renderError();
            return;
        }

        this.title.textContent = t('history.title', {name: result.username, wave: result.wave == null ? 0 : result.wave});
        this.content.textContent = '';
        if (result.runId === null || result.wave === null || result.prompts.length === 0) {
            const empty = document.createElement('p');
            empty.className = 'prompt-history-empty';
            empty.textContent = t('history.empty');
            this.content.appendChild(empty);
        } else {
            await this.renderPrompts(result.prompts, requestNumber);
        }
        if (requestNumber === this.requestNumber && this.isOpen()) this.closeButton.focus();
    }

    close(): void {
        this.requestNumber += 1;
        if (this.isOpen()) {
            if (typeof this.dialog.close === 'function') this.dialog.close();
            else this.dialog.removeAttribute('open');
        }
        const focus = this.lastFocus;
        this.lastFocus = null;
        if (focus && typeof focus.focus === 'function') focus.focus();
    }

    private isOpen(): boolean {
        return this.dialog.open || this.dialog.hasAttribute('open');
    }

    private renderLoading(message: string): void {
        this.content.textContent = message;
    }

    private renderError(): void {
        this.content.textContent = '';
        const error = document.createElement('p');
        error.className = 'prompt-history-error';
        error.textContent = t('history.failed');
        this.content.appendChild(error);
    }

    private async renderPrompts(prompts: PromptNode[], requestNumber: number): Promise<void> {
        const batchSize = 20;
        for (let start = 0; start < prompts.length; start += batchSize) {
            if (requestNumber !== this.requestNumber || !this.isOpen()) return;
            const fragment = document.createDocumentFragment();
            for (const prompt of prompts.slice(start, start + batchSize)) {
                const article = document.createElement('article');
                article.className = 'prompt-history-node';
                const meta = document.createElement('div');
                meta.className = 'prompt-history-meta';
                const version = document.createElement('span');
                version.textContent = t('history.version', {version: prompt.version});
                const wave = document.createElement('span');
                wave.textContent = t('history.fromWave', {wave: prompt.fromWave});
                meta.append(version, wave);
                const text = document.createElement('pre');
                text.className = 'prompt-history-text';
                text.textContent = prompt.prompt;
                article.append(meta, text);
                fragment.appendChild(article);
            }
            this.content.appendChild(fragment);
            if (start + batchSize < prompts.length) await new Promise(resolve => setTimeout(resolve, 0));
        }
    }
}
