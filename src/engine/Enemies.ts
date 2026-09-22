import type {Enemy} from './entities/Enemy';

function euclideanDistanceSquared(x1: number, y1: number, x2: number, y2: number): number {
    const deltaX = x1 - x2;
    const deltaY = y1 - y2;
    return deltaX * deltaX + deltaY * deltaY;
}

/**
 * Per-game enemy list and targeting queries.
 *
 * Instance, not singleton: two engines each own their own list, which is the
 * core isolation requirement of the headless engine. Ported from `EnemyManager`.
 */
export class Enemies {
    private readonly entities: Enemy[] = [];
    private nextId = 0;

    /** Read-only view for systems that observe without mutating the list. */
    all(): ReadonlyArray<Enemy> {
        return this.entities;
    }

    add(enemy: Enemy) {
        enemy.id = ++this.nextId;
        this.entities.push(enemy);
    }

    count(): number {
        return this.entities.length;
    }

    getClosestPointInRadius(x: number, y: number, radius: number): Enemy | undefined {
        let closestEnemy;
        let shortestDistanceSquared = radius * radius;

        for (let i = 0; i < this.entities.length; ++i) {
            const enemy = this.entities[i];
            const distanceSquared = euclideanDistanceSquared(enemy.x, enemy.y, x, y);

            if (distanceSquared <= shortestDistanceSquared) {
                shortestDistanceSquared = distanceSquared;
                closestEnemy = enemy;
            }
        }

        return closestEnemy;
    }

    getAllInRadius(x: number, y: number, radius: number): Enemy[] {
        const distanceSquared = radius * radius;
        return this.entities.filter(e => euclideanDistanceSquared(e.x, e.y, x, y) <= distanceSquared);
    }

    update() {
        for (let i = this.entities.length - 1; i >= 0; --i) {
            const enemy = this.entities[i];

            if (enemy.alive) {
                enemy.update();
            } else {
                this.entities.splice(i, 1);
            }
        }
    }

    canAllReachBase() {
        return this.entities.every(enemy => enemy.getPath());
    }

    updatePaths() {
        this.entities.forEach(enemy => enemy.updatePath());
    }
}
