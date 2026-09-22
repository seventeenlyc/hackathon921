import {Renderable} from "./Renderable";

export class EntityRenderer<T extends Renderable> {
    protected entities: T[] = [];

    /** Read-only view for systems that observe entities without mutating the list. */
    public all(): ReadonlyArray<T> {
        return this.entities;
    }

    public add(entity: T) {
        this.entities.push(entity);
    }

    update() {
        this.entities.forEach(entity => entity.update());
    }

    draw(ctx: CanvasRenderingContext2D) {
        this.entities.forEach(entity => entity.draw(ctx));
    }
}
