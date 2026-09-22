import {Tower} from "./Tower";
import {CanonTower} from "./CanonTower";
import {GatlingTower} from "./GatlingTower";
import {SlowTower} from "./SlowTower";
import {SniperTower} from "./SniperTower";
import {LaserTower} from "./LaserTower";
import {TowerType} from "./towerTypes";

export type TowerConstructor = new (i: number, j: number, width: number) => Tower;

/**
 * Single source of truth mapping the AI-facing tower type names to the concrete
 * engine classes. The agent layer may only name towers through this catalog.
 */
export const TOWER_CATALOG: { [K in TowerType]: TowerConstructor } = {
    canon: CanonTower,
    gatling: GatlingTower,
    slow: SlowTower,
    sniper: SniperTower,
    laser: LaserTower,
};

export const TOWER_ORDER: TowerType[] = ['canon', 'gatling', 'slow', 'sniper', 'laser'];
