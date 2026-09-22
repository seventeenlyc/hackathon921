import {EventEmitter} from "./tools/EventEmitter";
import {canvas} from "./Canvas";
import {isEditableTarget} from "./tools/input";

class Controls extends EventEmitter {
    private element: HTMLElement;
    private bounds: DOMRect;
    private mapPointerDown = false;
    public mouse = {x: 0, y: 0};
    mouseInCanvas = false;

    constructor() {
        super();
        this.element = canvas.getElement();
        this.bounds = this.element.getBoundingClientRect();
        canvas.on('resize', () => this.bounds = this.element.getBoundingClientRect());

        window.addEventListener('keydown', event => {
            if (isEditableTarget(event.target)) return;
            this.emit(`keydown:${event.key.toUpperCase()}`);
        });
        window.addEventListener('mousemove', event => this.mouse = this.boundMouseCoordinates(event));
        this.element.addEventListener('mousedown', event => {
            this.mapPointerDown = true;
            this.emit('mousedown', this.boundMouseCoordinates(event));
        });
        window.addEventListener('mouseup', event => {
            if (!this.mapPointerDown) return;
            this.mapPointerDown = false;
            this.emit('mouseup', this.boundMouseCoordinates(event));
        });
        window.addEventListener('focus', () => this.emit('focusin'), false)
        window.addEventListener('blur', () => this.emit('focusout'), false)

        canvas.getElement().addEventListener("mouseenter", () => this.mouseInCanvas = true)
        canvas.getElement().addEventListener("mouseleave", () => this.mouseInCanvas = false)
        canvas.getElement().addEventListener("dblclick", () => this.emit('doubleclick'))
        canvas.getElement().addEventListener("wheel", (e) => {
            if (e.deltaY > 0) {
                this.emit('wheel:down')
            } else if (e.deltaY < 0) {
                this.emit('wheel:up')
            }
        }, {passive: true})
    }

    boundMouseCoordinates(e: MouseEvent) {
        return {
            x: e.clientX - this.bounds.left - this.element.clientLeft,
            y: e.clientY - this.bounds.top - this.element.clientTop
        }
    }

    tabHasFocus() {
        return document.hasFocus()
    }
}


export const controls = new Controls();
