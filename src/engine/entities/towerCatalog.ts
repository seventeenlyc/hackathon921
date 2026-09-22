import type {TowerType} from '../../entities/towers/towerTypes';
import type {EngineWorld} from '../world';
import {Tower} from './Tower';
import {CanonTower, GatlingTower, LaserTower, SlowTower, SniperTower} from './towers';

export type TowerConstructor = new (i: number, j: number, width: number, world: EngineWorld) => Tower;

/**
 * Single source of truth mapping the AI-facing tower type names to the engine
 * classes. Mirrors the browser catalog; the engine version takes its world by
 * construction instead of importing singletons.
 */
export const TOWER_CATALOG: { [K in TowerType]: TowerConstructor } = {
    canon: CanonTower,
    gatling: GatlingTower,
    slow: SlowTower,
    sniper: SniperTower,
    laser: LaserTower,
};

export const TOWER_ORDER: TowerType[] = ['canon', 'gatling', 'slow', 'sniper', 'laser'];
