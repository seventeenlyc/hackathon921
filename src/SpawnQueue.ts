import {map} from './Map';
import {SpawnSettings} from './agent/SpawnSettings';

/**
 * Glue between the live map and the queued spawn-route settings (issue #40).
 *
 * The UI and the console both go through here, so "when does a lane change take
 * effect" has exactly one answer: at the next wave boundary.
 */

export const spawnSettings = new SpawnSettings(
    count => map.setSpawnCount(count),
    () => map.enemyBases.length
);

/** Queue a lane count for the next wave boundary. */
export function requestSpawnCount(count: number): number {
    return spawnSettings.request(count);
}

/** Wave-boundary hook; call before the planner so the new lane is in the snapshot. */
export function applyPendingSpawnCount(): boolean {
    return spawnSettings.applyPending();
}
