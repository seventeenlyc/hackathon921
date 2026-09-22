import type {Munition} from './entities/Munition';

/**
 * Per-game projectile list.
 *
 * Preserves a subtlety of the browser build on purpose: `MunitionManager.update`
 * called `super.update()` (which updates every entity once) and then ran the
 * removal loop, which updates every still-alive entity a SECOND time. That
 * double step is what the registered bullets actually travel and damage by, so
 * the engine keeps it rather than "fixing" it into a behaviour change.
 */
export class Munitions {
    private readonly entities: Munition[] = [];

    all(): ReadonlyArray<Munition> {
        return this.entities;
    }

    add(munition: Munition) {
        this.entities.push(munition);
    }

    update() {
        this.entities.forEach(munition => munition.update());

        for (let i = this.entities.length - 1; i >= 0; --i) {
            const munition = this.entities[i];

            if (munition.alive) {
                munition.update();
            } else {
                this.entities.splice(i, 1);
            }
        }
    }
}
