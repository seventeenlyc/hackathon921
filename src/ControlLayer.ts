import {controls} from './Controls';

export type ControlLayerVisibility = 'hidden' | 'visible';

interface ControlEvents {
    on(event: string, callback: (...args: any[]) => void): void;
}

export function toggleVisibility(visibility: ControlLayerVisibility): ControlLayerVisibility {
    return visibility === 'visible' ? 'hidden' : 'visible';
}

export function isEditableTarget(target: EventTarget | null): boolean {
    if (!target || typeof target !== 'object') return false;

    const element = target as HTMLElement;
    const tagName = typeof element.tagName === 'string' ? element.tagName.toUpperCase() : '';
    return tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT' || element.isContentEditable === true;
}

export class ControlLayer {
    private visibility: ControlLayerVisibility;

    constructor(
        private readonly root: HTMLElement,
        private readonly battlefield: HTMLCanvasElement,
        collapseButton: HTMLButtonElement,
        eventSource: ControlEvents,
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
    if (!(root instanceof HTMLElement) || !(battlefield instanceof HTMLCanvasElement) || !(collapseButton instanceof HTMLButtonElement)) {
        throw new Error('Control layer markup is incomplete');
    }

    singleton = new ControlLayer(root, battlefield, collapseButton, controls);
    return singleton;
}
