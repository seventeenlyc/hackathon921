export interface SpawnPoint {
    i: number;
    j: number;
}

export function spawnCountForWave(wave: number): number {
    if (!Number.isInteger(wave) || wave < 1) {
        throw new RangeError('INVALID_WAVE');
    }

    if (wave <= 50) return 1;
    if (wave <= 100) return 2;
    if (wave <= 150) return 3;
    return 4;
}

export function allSpawnPointsReachable(
    points: SpawnPoint[],
    pathExists: (i: number, j: number) => boolean,
): boolean {
    return points.every(point => pathExists(point.i, point.j));
}

export function canPlaceTowerAt(i: number, j: number, points: SpawnPoint[]): boolean {
    return !points.some(point => point.i === i && point.j === j);
}
