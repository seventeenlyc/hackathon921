import type {Enemy} from './Enemy';
import type {Tower} from './Tower';

/** Discriminator so a renderer can pick the right visual without instanceof checks. */
export type MunitionKind = 'bullet' | 'sniper' | 'laser';

/** Base class for anything a tower fires. Pure simulation: no drawing, no textures. */
export abstract class Munition {
    abstract readonly kind: MunitionKind;
    public target: Enemy;
    public alive = true;
    /** Stable id assigned by the munition manager for cross-frame interpolation. */
    public id = 0;
    public x: number;
    public y: number;
    public readonly emitter: Tower;

    protected constructor(target: Enemy, emitter: Tower) {
        this.target = target;
        this.emitter = emitter;
        this.x = emitter.center.x;
        this.y = emitter.center.y;
    }

    /** Origin of the shot, so a renderer can draw beams/lines from the tower. */
    get emitterCenter(): { x: number; y: number } {
        return this.emitter.center;
    }

    /**
     * Visual-only state the renderer needs, kept explicit so the simulation
     * fields can stay hidden. Subclasses override the parts they actually have.
     */
    visual(): { angle: number; charge: number } {
        return {angle: 0, charge: 0};
    }

    abstract update(): void;
}
