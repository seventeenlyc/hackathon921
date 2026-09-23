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
        private readonly panelToggle: HTMLButtonElement,
        eventSource: ControlEvents,
        private readonly hint: HTMLElement | null = null,
        private readonly mapFrame: HTMLElement | null = null,
        private readonly databasePanel: HTMLElement | null = null,
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
        panelToggle.addEventListener('click', () => this.toggle());
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
        this.mapFrame?.classList.toggle('is-hidden', !visible);
        // 头部「控制面板」开关与战术数据库面板跟随整层显隐。
        this.panelToggle.classList.toggle('is-off', !visible);
        this.panelToggle.setAttribute('aria-pressed', String(visible));
        this.databasePanel?.classList.toggle('is-hidden', !visible);
    }
}

let singleton: ControlLayer | null = null;

export function getControlLayer(): ControlLayer {
    if (singleton) return singleton;

    const root = document.getElementById('control-layer');
    const battlefield = document.getElementById('canvas');
    const panelToggle = document.getElementById('controls-panel-toggle');
    const hint = document.getElementById('controls-hint');
    const mapFrame = document.getElementById('map-frame');
    const databasePanel = document.getElementById('database-panel');
    if (!(root instanceof HTMLElement) || !(battlefield instanceof HTMLCanvasElement) || !(panelToggle instanceof HTMLButtonElement)) {
        throw new Error('Control layer markup is incomplete');
    }

    singleton = new ControlLayer(root, battlefield, panelToggle, controls, hint, mapFrame, databasePanel);
    return singleton;
}
