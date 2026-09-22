import type {Enemy} from './Enemy';
import type {Tower} from './Tower';

/** Base class for anything a tower fires. Pure simulation: no drawing, no textures. */
export abstract class Munition {
    public target: Enemy;
    public alive = true;
    public x: number;
    public y: number;
    protected emitter: Tower;

    protected constructor(target: Enemy, emitter: Tower) {
        this.target = target;
        this.emitter = emitter;
        this.x = emitter.center.x;
        this.y = emitter.center.y;
    }

    abstract update(): void;
}
