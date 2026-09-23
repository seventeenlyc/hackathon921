/**
 * Story-scene overlay (issue #100).
 *
 * Renders one line at a time (speaker + avatar + text), like a visual-novel
 * subtitle track, over the frozen battlefield. All text goes through
 * `textContent`; no user or script content is ever injected as HTML.
 *
 * The overlay is a dumb view: the trigger rules live in `NarrativeDirector`.
 * `play(scene)` resolves when the player has read past / skipped the scene, so
 * the caller (`GameLoop.holdForNarrative`) can resume the simulation.
 */

import {AVATAR_SRC} from '../leaderboard/avatarAssets';
import {getLang, onLangChange, t} from '../i18n';
import {NARRATIVE_SPEAKERS, type NarrativeScene} from './NarrativeScript';

interface OverlayElements {
    root: HTMLElement;
    view: HTMLElement;
    archiveView: HTMLElement;
    code: HTMLElement;
    title: HTMLElement;
    counter: HTMLElement;
    speaker: HTMLElement;
    line: HTMLElement;
    avatar: HTMLImageElement;
    portraitTerminal: HTMLElement;
    portraitTachikoma: HTMLElement;
    skip: HTMLButtonElement;
    close: HTMLButtonElement;
    back: HTMLButtonElement;
    next: HTMLButtonElement;
    archiveContinue: HTMLButtonElement;
}

export class NarrativeOverlay {
    private elements: OverlayElements | null = null;
    private bound = false;
    private scene: NarrativeScene | null = null;
    private index = 0;
    private archiveVisible = false;
    private resolver: (() => void) | null = null;
    private previousFocus: HTMLElement | null = null;

    /** True while a scene is on screen (the simulation should be frozen). */
    get isOpen(): boolean {
        return this.scene !== null;
    }

    play(scene: NarrativeScene): Promise<void> {
        const elements = this.ensureElements();
        if (!elements) return Promise.resolve();

        return new Promise<void>(resolve => {
            this.scene = scene;
            this.index = 0;
            this.archiveVisible = false;
            this.resolver = resolve;
            this.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;

            elements.archiveView.hidden = true;
            elements.view.hidden = false;
            elements.root.hidden = false;
            elements.root.setAttribute('aria-label', `${t('narrative.dialogLabel')} — ${scene.codeName}`);
            elements.close.setAttribute('aria-label', t('narrative.close'));
            document.body.classList.add('narrative-open');
            // Key handling is attached per scene: `finish()` removes it so a
            // closed overlay never swallows the game's own keyboard input.
            document.addEventListener('keydown', this.handleKeyDown, true);

            this.renderLine();
            this.renderArchive();
            elements.next.focus();
        });
    }

    private ensureElements(): OverlayElements | null {
        if (this.elements) return this.elements;
        if (typeof document === 'undefined') return null;

        const byId = (id: string) => document.getElementById(id);
        const root = byId('narrative-overlay');
        const view = byId('narrative-view');
        const archiveView = byId('narrative-archive-view');
        const code = byId('narrative-code');
        const title = byId('narrative-title');
        const counter = byId('narrative-counter');
        const speaker = byId('narrative-speaker');
        const line = byId('narrative-line');
        const avatar = byId('narrative-avatar') as HTMLImageElement | null;
        const portraitTerminal = byId('narrative-portrait-terminal');
        const portraitTachikoma = byId('narrative-portrait-tachikoma');
        const skip = byId('narrative-skip') as HTMLButtonElement | null;
        const close = byId('narrative-close') as HTMLButtonElement | null;
        const back = byId('narrative-back') as HTMLButtonElement | null;
        const next = byId('narrative-next') as HTMLButtonElement | null;
        const archiveContinue = byId('narrative-continue') as HTMLButtonElement | null;

        if (!root || !view || !archiveView || !code || !title || !counter || !speaker || !line
            || !avatar || !portraitTerminal || !portraitTachikoma || !skip || !close || !back
            || !next || !archiveContinue) {
            return null;
        }

        this.elements = {
            root, view, archiveView, code, title, counter, speaker, line,
            avatar, portraitTerminal, portraitTachikoma,
            skip, close, back, next, archiveContinue,
        };
        this.bind();
        return this.elements;
    }

    private bind(): void {
        if (this.bound || !this.elements) return;
        this.bound = true;
        const elements = this.elements;

        // Click anywhere on the card (not on a control) advances the line.
        elements.root.addEventListener('click', event => {
            if (!this.scene) return;
            const target = event.target as HTMLElement | null;
            if (target && target.closest('button')) return;
            if (!this.archiveVisible) this.advance();
        });
        elements.next.addEventListener('click', () => {
            if (!this.archiveVisible) this.advance();
        });
        elements.back.addEventListener('click', () => {
            if (!this.archiveVisible) this.stepBack();
        });
        elements.skip.addEventListener('click', () => this.skip());
        elements.close.addEventListener('click', () => this.skip());
        elements.archiveContinue.addEventListener('click', () => this.finish());

        onLangChange(() => {
            if (!this.scene) return;
            this.renderLine();
            this.renderArchive();
        });
    }

    private handleKeyDown = (event: KeyboardEvent): void => {
        if (!this.scene) return;

        if (this.archiveVisible) {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                this.finish();
            }
            return;
        }

        switch (event.key) {
            case 'ArrowRight':
            case 'ArrowDown':
            case 'PageDown':
                event.preventDefault();
                this.advance();
                break;
            case 'Enter':
            case ' ': {
                // Let a focused button activate itself instead of double-firing.
                const target = event.target as HTMLElement | null;
                if (target && target.closest('button')) return;
                event.preventDefault();
                this.advance();
                break;
            }
            case 'ArrowLeft':
            case 'ArrowUp':
            case 'PageUp':
                event.preventDefault();
                this.stepBack();
                break;
            case 'Escape':
                event.preventDefault();
                this.skip();
                break;
        }
    };

    private advance(): void {
        if (!this.scene || !this.elements) return;

        if (this.index < this.scene.lines.length - 1) {
            this.index += 1;
            this.renderLine();
            return;
        }

        if (this.scene.leadsToArchive) {
            this.showArchive();
            return;
        }

        this.finish();
    }

    private stepBack(): void {
        if (!this.scene || this.index === 0) return;
        this.index -= 1;
        this.renderLine();
    }

    private skip(): void {
        if (!this.scene) return;
        if (this.scene.leadsToArchive) {
            this.showArchive();
            return;
        }
        this.finish();
    }

    private showArchive(): void {
        if (!this.scene || !this.elements) return;
        this.archiveVisible = true;
        this.elements.view.hidden = true;
        this.elements.archiveView.hidden = false;
        this.renderArchive();
        this.elements.archiveContinue.focus();
    }

    private renderLine(): void {
        if (!this.scene || !this.elements) return;
        const elements = this.elements;
        const lang = getLang();
        const line = this.scene.lines[this.index];
        const speaker = NARRATIVE_SPEAKERS[line.speaker];
        const recording = line.recording ? t('narrative.recording') : '';
        const name = `${speaker.name[lang]}${recording}`;

        elements.code.textContent = this.scene.codeName;
        elements.title.textContent = this.scene.title[lang];
        elements.counter.textContent = t('narrative.progress', {
            index: this.index + 1,
            total: this.scene.lines.length,
        });
        elements.speaker.textContent = name;
        elements.line.textContent = line.text[lang];
        elements.back.disabled = this.index === 0;
        elements.next.textContent = this.index === this.scene.lines.length - 1 && !this.scene.leadsToArchive
            ? t('narrative.finish')
            : t('narrative.next');

        // Portraits: character avatars reuse the original gate silhouettes; the
        // system and the Tachikoma use the project's inline original art.
        const terminal = speaker.portrait.kind === 'terminal';
        const tachikoma = speaker.portrait.kind === 'tachikoma';
        elements.portraitTerminal.hidden = !terminal;
        elements.portraitTachikoma.hidden = !tachikoma;
        if (speaker.portrait.kind === 'avatar') {
            elements.avatar.src = AVATAR_SRC[speaker.portrait.avatarId];
            elements.avatar.alt = name;
            elements.avatar.hidden = false;
        } else {
            elements.avatar.hidden = true;
            elements.avatar.removeAttribute('src');
            elements.avatar.alt = '';
        }
    }

    private renderArchive(): void {
        if (!this.elements) return;
        this.elements.archiveContinue.textContent = t('narrative.continueEndless');
        this.elements.archiveContinue.setAttribute('aria-label', t('narrative.continueEndless'));
    }

    private finish(): void {
        const elements = this.elements;
        const resolve = this.resolver;

        this.scene = null;
        this.archiveVisible = false;
        this.resolver = null;
        document.removeEventListener('keydown', this.handleKeyDown, true);

        if (elements) {
            elements.root.hidden = true;
            elements.view.hidden = false;
            elements.archiveView.hidden = true;
        }
        document.body.classList.remove('narrative-open');

        const previous = this.previousFocus;
        this.previousFocus = null;
        if (previous && document.contains(previous)) previous.focus();

        if (resolve) resolve();
    }
}

export const narrativeOverlay = new NarrativeOverlay();
