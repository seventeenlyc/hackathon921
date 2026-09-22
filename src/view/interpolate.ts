import type {RenderSnapshot} from '../engine/RenderSnapshot';

/**
 * Blend two consecutive render frames for the browser to draw at its own
 * refresh rate (docs/PRODUCT_CONCEPT.md §5).
 *
 * The server pushes snapshots at a fixed rate; without this the picture only
 * changes on each push, which at 8x looks like enemies teleporting (24 ticks
 * per frame). Only entity positions/facing are interpolated — every other field
 * (metadata, composition, projectiles' targets) comes from `latest`. Entities
 * that appear only in `latest` are drawn at their first known position.
 *
 * `alpha` is 0 at `previous` and 1 at `latest`, so the caller animates the
 * picture from the last frame towards the newest across the push interval.
 */

function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
}

/** Shortest-arc angle interpolation, so a barrel crossing ±pi does not spin. */
function lerpAngle(a: number, b: number, t: number): number {
    let delta = b - a;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    return a + delta * t;
}

export function interpolateSnapshot(
    previous: RenderSnapshot | null,
    latest: RenderSnapshot,
    alpha: number
): RenderSnapshot {
    if (!previous) return latest;

    const t = Math.max(0, Math.min(1, alpha));
    if (t <= 0) return previous;
    if (t >= 1) return latest;

    const previousTowers = new Map(previous.towers.map(tower => [tower.id, tower]));
    const previousEnemies = new Map(previous.enemies.map(enemy => [enemy.id, enemy]));
    const previousMunitions = new Map(previous.munitions.map(munition => [munition.id, munition]));

    return {
        ...latest,
        towers: latest.towers.map(tower => {
            const before = previousTowers.get(tower.id);
            if (!before) return tower;
            return {
                ...tower,
                x: lerp(before.x, tower.x, t),
                y: lerp(before.y, tower.y, t),
                angle: lerpAngle(before.angle, tower.angle, t),
            };
        }),
        enemies: latest.enemies.map(enemy => {
            const before = previousEnemies.get(enemy.id);
            if (!before) return enemy;
            return {
                ...enemy,
                x: lerp(before.x, enemy.x, t),
                y: lerp(before.y, enemy.y, t),
            };
        }),
        munitions: latest.munitions.map(munition => {
            const before = previousMunitions.get(munition.id);
            if (!before) return munition;
            return {
                ...munition,
                x: lerp(before.x, munition.x, t),
                y: lerp(before.y, munition.y, t),
                angle: lerpAngle(before.angle, munition.angle, t),
                charge: lerp(before.charge, munition.charge, t),
                emitterX: lerp(before.emitterX, munition.emitterX, t),
                emitterY: lerp(before.emitterY, munition.emitterY, t),
                targetX: lerp(before.targetX, munition.targetX, t),
                targetY: lerp(before.targetY, munition.targetY, t),
            };
        }),
    };
}
