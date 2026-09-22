import type {EngineWorld} from './world';

/**
 * A world that is never actually reached.
 *
 * Tower classes take their world by construction. The UI needs to instantiate a
 * throwaway tower to read its stats (name, cost, range, damage), exactly like the
 * old `towerOptions` adapter did, but it must not simulate anything. Any attempt
 * to actually use this world throws, so a stats-only instance can never hide a
 * missing wire-up.
 */
function detached(): never {
    throw new Error('this tower instance has no world; it exists only for stats');
}

export const UNUSED_WORLD: EngineWorld = {
    get map(): never {
        return detached();
    },
    get enemies(): never {
        return detached();
    },
    get munitions(): never {
        return detached();
    },
    get cash(): never {
        return detached();
    },
    damageBase() {
        detached();
    },
};
