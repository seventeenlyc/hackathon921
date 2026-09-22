/**
 * The slice of the game a simulation entity is allowed to touch.
 *
 * This replaces the module-level singletons the browser build imported directly
 * (`map`, `cashManager`, `enemyManager`, `munitionManager`). Injecting one world
 * per game is what makes two runs independent: an enemy in game A can only ever
 * see game A's map, enemies and cash.
 *
 * Everything referenced here is pure simulation — no Canvas, no DOM, no browser
 * globals — so an engine can run in a plain Node process.
 */
import type { Enemies } from './Enemies';
import type { Munitions } from './Munitions';
import type { Cash } from './Cash';
import type { GameMap } from './GameMap';

export interface EngineWorld {
    readonly map: GameMap;
    readonly enemies: Enemies;
    readonly munitions: Munitions;
    readonly cash: Cash;

    /**
     * An enemy reached the base. Centralised on the world so the entity does not
     * need to know how "game over" is surfaced to the host.
     */
    damageBase(): void;
}
