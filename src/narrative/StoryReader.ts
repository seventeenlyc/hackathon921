/**
 * Background-story reader (issue #99).
 *
 * A modal, keyboard-operable reading view over the battlefield. It renders the
 * player-facing blocks extracted from the single source document (see
 * `PlayerStory.ts`) as **text nodes** — no Markdown or user text is ever
 * injected as HTML — and it is a pure view: it does not touch the simulation,
 * waves, Prompt state or the leaderboard, and it does not freeze the game.
 *
 * Deliberately below the story-scene overlay in the stacking order: if a wave
 * beat fires while the reader is open, the scene still comes to the front and
 * keeps its own keyboard handling.
 */

import {getLang, onLangChange, t} from '../i18n';
import {PLAYER_STORY_BLOCKS, type StoryBlock, type StoryRun} from './PlayerStory';

interface ReaderElements {
    root: HTMLElement;
    body: HTMLElement;
    close: HTMLButtonElement;
    eyebrow: HTMLElement;
    title: HTMLElement;
    langNote: HTMLElement;
    spoilerNote: HTMLElement;
}

export class StoryReader {
    private elements: ReaderElements | null = null;
    private bound = false;
    private rendered = false;
    private previousFocus: HTMLElement | null = null;

    get isOpen(): boolean {
        return Boolean(this.elements && !this.elements.root.hidden);
    }

    open(trigger?: HTMLElement | null): void {
        const elements = this.ensureElements();
        if (!elements) return;

        this.previousFocus = trigger
            ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);

        if (!this.rendered) {
            this.renderStory(elements);
            this.rendered = true;
        }
        this.renderShellText(elements);

        elements.root.hidden = false;
        elements.body.scrollTop = 0;
        elements.close.focus();
        document.addEventListener('keydown', this.handleKeyDown, true);
    }

    close(): void {
        const elements = this.elements;
        if (!elements || elements.root.hidden) return;

        elements.root.hidden = true;
        document.removeEventListener('keydown', this.handleKeyDown, true);

        const previous = this.previousFocus;
        this.previousFocus = null;
        if (previous && document.contains(previous)) previous.focus();
    }

    private ensureElements(): ReaderElements | null {
        if (this.elements) return this.elements;
        if (typeof document === 'undefined') return null;

        const byId = (id: string) => document.getElementById(id);
        const root = byId('story-overlay');
        const body = byId('story-body');
        const close = byId('story-close') as HTMLButtonElement | null;
        const eyebrow = byId('story-eyebrow');
        const title = byId('story-title');
        const langNote = byId('story-lang-note');
        const spoilerNote = byId('story-spoiler-note');
        if (!root || !body || !close || !eyebrow || !title || !langNote || !spoilerNote) return null;

        this.elements = {root, body, close, eyebrow, title, langNote, spoilerNote};
        this.bind();
        return this.elements;
    }

    private bind(): void {
        if (this.bound || !this.elements) return;
        this.bound = true;
        const elements = this.elements;

        elements.close.addEventListener('click', () => this.close());
        // Clicking the dimmed backdrop (but not the card) returns to the game.
        elements.root.addEventListener('click', event => {
            if (event.target === elements.root) this.close();
        });
        onLangChange(() => this.renderShellText(elements));
    }

    private handleKeyDown = (event: KeyboardEvent): void => {
        if (!this.isOpen) return;
        // A story scene that fired on top owns the keyboard; do not fight it.
        if (document.body.classList.contains('narrative-open')) return;

        if (event.key === 'Escape') {
            event.preventDefault();
            this.close();
            return;
        }

        if (event.key === 'Tab' && this.elements) {
            const focusables = Array.from(
                this.elements.root.querySelectorAll<HTMLElement>('button, [tabindex="0"], a[href]'),
            ).filter(element => !element.hasAttribute('disabled'));
            if (focusables.length === 0) return;

            const first = focusables[0];
            const last = focusables[focusables.length - 1];
            const active = document.activeElement;
            if (event.shiftKey && active === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && active === last) {
                event.preventDefault();
                first.focus();
            }
        }
    };

    private renderShellText(elements: ReaderElements): void {
        // The setting text is Chinese-only by design: the English edition is an
        // open product decision (see PRODUCT_CONCEPT), and inventing a
        // translation here would create a second, drifting copy of the story.
        const english = getLang() === 'en';
        elements.eyebrow.textContent = t('story.eyebrow');
        elements.title.textContent = t('story.title');
        elements.close.textContent = t('story.close');
        elements.close.setAttribute('aria-label', t('story.closeAria'));
        elements.langNote.textContent = t('story.langNote');
        elements.langNote.hidden = !english;
        elements.spoilerNote.textContent = t('story.spoilerNote');
    }

    private renderStory(elements: ReaderElements): void {
        // `textContent = ''` drops prior children without parsing anything.
        elements.body.textContent = '';
        for (const block of PLAYER_STORY_BLOCKS) {
            elements.body.appendChild(this.renderBlock(block));
        }
    }

    private renderBlock(block: StoryBlock): HTMLElement {
        switch (block.type) {
            case 'heading': {
                const element = document.createElement(`h${Math.min(block.level + 2, 6)}`);
                element.className = `story-heading story-heading-${block.level}`;
                this.appendRuns(element, block.runs);
                return element;
            }
            case 'quote': {
                const element = document.createElement('blockquote');
                element.className = 'story-quote';
                this.appendRuns(element, block.runs);
                return element;
            }
            case 'list': {
                const element = document.createElement(block.ordered ? 'ol' : 'ul');
                element.className = 'story-list';
                for (const item of block.items) {
                    const li = document.createElement('li');
                    this.appendRuns(li, item);
                    element.appendChild(li);
                }
                return element;
            }
            case 'code': {
                const pre = document.createElement('pre');
                pre.className = 'story-code';
                const code = document.createElement('code');
                code.textContent = block.text;
                pre.appendChild(code);
                return pre;
            }
            case 'rule': {
                const element = document.createElement('hr');
                element.className = 'story-rule';
                return element;
            }
            case 'paragraph':
            default: {
                const element = document.createElement('p');
                element.className = 'story-paragraph';
                this.appendRuns(element, block.runs);
                return element;
            }
        }
    }

    private appendRuns(parent: HTMLElement, runs: readonly StoryRun[]): void {
        for (const run of runs) {
            if (run.code) {
                const code = document.createElement('code');
                code.textContent = run.text;
                parent.appendChild(code);
            } else if (run.bold) {
                const strong = document.createElement('strong');
                strong.textContent = run.text;
                parent.appendChild(strong);
            } else {
                parent.appendChild(document.createTextNode(run.text));
            }
        }
    }
}

export const storyReader = new StoryReader();
