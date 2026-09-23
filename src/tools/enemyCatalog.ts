/**
 * UI-side, read-only enemy catalogue: type ids, instanceof mapping and counts.
 *
 * Deliberately display-only — the game loop and the agent boundary (AGENTS.md)
 * are untouched; InterfaceManager polls this on a slow timer to render the
 * THREAT INFORMATION panel. Same type mapping as the agent snapshot uses.
 */
import {BossEnemy} from '../entities/enemies/BossEnemy';
import {HealerEnemy} from '../entities/enemies/HealerEnemy';
import {ArmoredEnemy} from '../entities/enemies/ArmoredEnemy';
import {FastEnemy} from '../entities/enemies/FastEnemy';
import {SimpleEnemy} from '../entities/enemies/SimpleEnemy';

export type EnemyTypeId = 'simple' | 'fast' | 'armored' | 'healer' | 'boss';

/** Display order for the threat panel and the hostile database tab. */
export const ENEMY_TYPE_IDS: readonly EnemyTypeId[] = ['simple', 'fast', 'armored', 'healer', 'boss'];

export function enemyType(entity: unknown): EnemyTypeId {
    if (entity instanceof BossEnemy) return 'boss';
    if (entity instanceof HealerEnemy) return 'healer';
    if (entity instanceof ArmoredEnemy) return 'armored';
    if (entity instanceof FastEnemy) return 'fast';
    return 'simple';
}

export function isEnemyTypeId(value: string): value is EnemyTypeId {
    return ENEMY_TYPE_IDS.some((id) => id === value);
}

export function countEnemiesByType(entities: readonly unknown[]): Record<EnemyTypeId, number> {
    const counts: Record<EnemyTypeId, number> = {simple: 0, fast: 0, armored: 0, healer: 0, boss: 0};
    for (const entity of entities) {
        counts[enemyType(entity)] += 1;
    }
    return counts;
}
