import {controls} from './Controls';
import {isEditableTarget} from './tools/input';

export {isEditableTarget};

export type ControlLayerVisibility = 'hidden' | 'visible';

interface ControlEvents {
    on(event: string, callback: (...args: any[]) => void): void;
}

export function toggleVisibility(visibility: ControlLayerVisibility): ControlLayerVisibility {
    return visibility === 'visible' ? 'hidden' : 'visible';
}

export class ControlLayer {
    private visibility: ControlLayerVisibility;
    private hintTimer: number | null = null;

    constructor(
        private readonly root: HTMLElement,
        private readonly battlefield: HTMLCanvasElement,
        collapseButton: HTMLButtonElement,
        eventSource: ControlEvents,
        private readonly hint: HTMLElement | null = null,
    ) {
        this.visibility = root.classList.contains('is-visible') ? 'visible' : 'hidden';
        this.syncDom();

        eventSource.on('doubleclick', () => this.toggle());
        eventSource.on('keydown:ENTER', () => {
            if (document.activeElement === this.battlefield || document.activeElement === document.body) {
                this.toggle();
            }
        });
        eventSource.on('keydown:ESCAPE', () => {
            if (this.isVisible()) this.hide();
        });
        collapseButton.addEventListener('click', () => this.hide());
    }

    show() {
        this.visibility = 'visible';
        this.syncDom();
    }

    hide() {
        this.visibility = 'hidden';
        this.syncDom();
        this.battlefield.focus();
    }

    toggle() {
        if (this.isVisible()) {
            this.hide();
        } else {
            this.show();
        }
    }

    isVisible(): boolean {
        return this.visibility === 'visible';
    }

    showHint() {
        if (!this.hint) return;

        if (this.hintTimer !== null) window.clearTimeout(this.hintTimer);
        this.hint.classList.add('is-visible');
        this.hintTimer = window.setTimeout(() => {
            this.hint!.classList.remove('is-visible');
            this.hintTimer = null;
        }, 3200);
    }

    private syncDom() {
        const visible = this.isVisible();
        this.root.classList.toggle('is-visible', visible);
        this.root.classList.toggle('is-hidden', !visible);
        this.root.setAttribute('aria-hidden', String(!visible));
        (this.root as HTMLElement & {inert: boolean}).inert = !visible;
    }
}

let singleton: ControlLayer | null = null;

export function getControlLayer(): ControlLayer {
    if (singleton) return singleton;

    const root = document.getElementById('control-layer');
    const battlefield = document.getElementById('canvas');
    const collapseButton = document.getElementById('controls-collapse');
    const hint = document.getElementById('controls-hint');
    if (!(root instanceof HTMLElement) || !(battlefield instanceof HTMLCanvasElement) || !(collapseButton instanceof HTMLButtonElement)) {
        throw new Error('Control layer markup is incomplete');
    }

    singleton = new ControlLayer(root, battlefield, collapseButton, controls, hint);
    return singleton;
}
