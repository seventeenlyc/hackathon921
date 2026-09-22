/**
 * Tower type vocabulary. Kept dependency-free so it can be shared by the
 * engine entities, the agent action layer, and DOM-free tests alike.
 */

export const TOWER_TYPES = ['canon', 'gatling', 'slow', 'sniper', 'laser'] as const;

export type TowerType = typeof TOWER_TYPES[number];

export function isTowerType(value: string): value is TowerType {
    return (TOWER_TYPES as readonly string[]).indexOf(value) !== -1;
}
