import {
    BuildCandidate,
    EnemyGroup,
    EnemyType,
    GameSnapshot,
    LaneInfo,
    PathInfo,
    ThreatInfo,
    TowerInfo,
    TowerOption,
} from './types';

/**
 * Turns raw battlefield data into the compact, semantic snapshot the LLM reasons
 * over (issue #4).
 *
 * The whole point is to give the model *understanding* rather than a grid dump:
 * enemy composition and urgency, which towers are actually engaging something,
 * the shape of the enemy route, and the few cells worth building on. Everything
 * here is pure and injected, so it is unit-tested without a DOM; the adapter is
 * the only part that touches the live engine.
 */

export interface EnemySample {
    type: EnemyType;
    life: number;
    damageTaken: number;
    i: number;
    j: number;
    /** Computed by the adapter from the enemy's remaining path and speed. */
    etaSeconds: number;
}

/** One spawn lane as the adapter sees it: its spawn point and traversed cells. */
export interface LaneRoute {
    spawn: { i: number; j: number };
    cells: Array<{ i: number; j: number }>;
}

export interface SnapshotInput {
    wave: number;
    cash: number;
    baseLife: number;
    baseMaxLife: number;
    gridWidth: number;
    gridHeight: number;
    base: { i: number; j: number };
    spawns: Array<{ i: number; j: number }>;
    enemies: EnemySample[];
    towers: TowerInfo[];
    towerOptions: TowerOption[];
    /**
     * Every spawn lane, in spawn order (spawn -> base). The index is the `lane`
     * reported on `buildCandidates`; a map can gain lanes mid-run (issue #40).
     */
    routes: LaneRoute[];
    /** Cheap check: is this cell empty? */
    isFree: (i: number, j: number) => boolean;
    /** Authoritative check (runs A*): may a tower legally stand here? */
    isBuildable: (i: number, j: number) => boolean;
}

/** Snapshot size ceiling, in serialized JSON characters. Enforced by tests. */
export const MAX_SNAPSHOT_CHARS = 6000;
export const MAX_TOWERS_IN_SNAPSHOT = 30;
export const MAX_BUILD_CANDIDATES = 8;
/** Reference tower reach used only to rank candidates; the engine stays authoritative. */
export const REFERENCE_AIM_RADIUS_TILES = 2;
/** Cap on A* calls per snapshot: probing legality is the expensive part. */
const MAX_BUILDABILITY_PROBES = 16;

function round(value: number, digits = 1): number {
    const factor = Math.pow(10, digits);
    return Math.round(value * factor) / factor;
}

function groupEnemies(enemies: EnemySample[]): EnemyGroup[] {
    const byType = new Map<EnemyType, { count: number; life: number; remaining: number }>();

    for (const enemy of enemies) {
        const group = byType.get(enemy.type) || { count: 0, life: 0, remaining: 0 };
        group.count += 1;
        group.life += enemy.life;
        group.remaining += Math.max(enemy.life - enemy.damageTaken, 0);
        byType.set(enemy.type, group);
    }

    const groups: EnemyGroup[] = [];
    byType.forEach((group, type) => {
        groups.push({
            type,
            count: group.count,
            avgLife: Math.round(group.life / group.count),
            avgRemainingLife: Math.round(group.remaining / group.count),
        });
    });

    return groups.sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
}

function nearestThreat(enemies: EnemySample[]): ThreatInfo | null {
    let nearest: ThreatInfo | null = null;

    for (const enemy of enemies) {
        if (nearest && enemy.etaSeconds >= nearest.etaSeconds) continue;
        nearest = {
            type: enemy.type,
            i: enemy.i,
            j: enemy.j,
            remainingLife: Math.round(Math.max(enemy.life - enemy.damageTaken, 0)),
            etaSeconds: round(enemy.etaSeconds),
        };
    }

    return nearest;
}

/** Keep only the cells where the route changes direction, plus both ends. */
function compressRoute(route: Array<{ i: number; j: number }> | null): PathInfo | null {
    if (!route || route.length === 0) return null;

    const waypoints = [route[0]];
    for (let index = 1; index < route.length - 1; ++index) {
        const previous = route[index - 1];
        const current = route[index];
        const next = route[index + 1];
        const incoming = { x: current.i - previous.i, y: current.j - previous.j };
        const outgoing = { x: next.i - current.i, y: next.j - current.j };

        if (incoming.x !== outgoing.x || incoming.y !== outgoing.y) {
            waypoints.push(current);
        }
    }
    if (route.length > 1) waypoints.push(route[route.length - 1]);

    return { waypoints, length: route.length - 1 };
}

/**
 * Score candidate cells adjacent to ONE lane's route. Coverage counts that
 * lane's own cells, so a cell is attributed to the lane it actually guards.
 */
function scoreLaneCandidates(
    lane: number,
    cells: Array<{ i: number; j: number }>,
    input: SnapshotInput,
    onRoute: Set<string>
): BuildCandidate[] {
    const inGrid = (i: number, j: number) =>
        i >= 0 && j >= 0 && i < input.gridWidth && j < input.gridHeight;

    const neighbours = new Map<string, { i: number; j: number }>();
    for (const cell of cells) {
        for (let di = -1; di <= 1; ++di) {
            for (let dj = -1; dj <= 1; ++dj) {
                if (di === 0 && dj === 0) continue;
                const i = cell.i + di;
                const j = cell.j + dj;
                if (!inGrid(i, j)) continue;
                const key = `${i}:${j}`;
                if (onRoute.has(key) || neighbours.has(key)) continue;
                if (!input.isFree(i, j)) continue;
                neighbours.set(key, { i, j });
            }
        }
    }

    const radiusSquared = REFERENCE_AIM_RADIUS_TILES * REFERENCE_AIM_RADIUS_TILES;
    const scored: BuildCandidate[] = [];

    neighbours.forEach(cell => {
        let coverage = 0;
        let deepestIndex = -1;

        for (let index = 0; index < cells.length; ++index) {
            const di = cells[index].i - cell.i;
            const dj = cells[index].j - cell.j;
            if (di * di + dj * dj <= radiusSquared) {
                coverage += 1;
                deepestIndex = index;
            }
        }

        if (coverage === 0) return;
        scored.push({
            i: cell.i,
            j: cell.j,
            lane,
            coverage,
            distanceToBase: cells.length - 1 - deepestIndex,
        });
    });

    scored.sort((a, b) => b.coverage - a.coverage || a.distanceToBase - b.distanceToBase);
    return scored;
}

/**
 * Cells worth building on, across EVERY lane. Candidates are selected
 * round-robin between lanes so one long or high-coverage lane cannot consume the
 * whole budget and leave the others undefended — a map can gain lanes mid-run
 * (issue #40). Legality is still answered by the engine (`isBuildable`), and the
 * A* probe budget is shared across lanes. The result is re-sorted globally so
 * the "best coverage first" contract still holds, and every candidate carries
 * its `lane` so the model can tell which lane it guards.
 */
function buildCandidates(routes: LaneRoute[], input: SnapshotInput): BuildCandidate[] {
    if (routes.length === 0) return [];

    // A cell on ANY lane's route is not a build spot, even if it neighbours another lane.
    const onRoute = new Set<string>();
    routes.forEach(route => route.cells.forEach(cell => onRoute.add(`${cell.i}:${cell.j}`)));

    const perLane = routes.map((route, lane) => scoreLaneCandidates(lane, route.cells, input, onRoute));

    const accepted: BuildCandidate[] = [];
    const seen = new Set<string>();
    let probes = 0;
    let rank = 0;
    let advanced = true;

    while (advanced && accepted.length < MAX_BUILD_CANDIDATES && probes < MAX_BUILDABILITY_PROBES) {
        advanced = false;

        for (const lane of perLane) {
            if (accepted.length >= MAX_BUILD_CANDIDATES || probes >= MAX_BUILDABILITY_PROBES) break;

            const candidate = lane[rank];
            if (!candidate) continue;
            advanced = true;

            const key = `${candidate.i}:${candidate.j}`;
            if (seen.has(key)) continue;

            probes += 1;
            if (input.isBuildable(candidate.i, candidate.j)) {
                seen.add(key);
                accepted.push(candidate);
            }
        }

        rank += 1;
    }

    accepted.sort((a, b) => b.coverage - a.coverage || a.distanceToBase - b.distanceToBase);
    return accepted;
}

export function buildSnapshot(input: SnapshotInput): GameSnapshot {
    const groups = groupEnemies(input.enemies);

    const towers = input.towers
        .slice()
        .sort((a, b) => b.level - a.level || b.dps - a.dps)
        .slice(0, MAX_TOWERS_IN_SNAPSHOT);

    // Both `lanes` and the `lane` index on candidates come from this same
    // filtered list, so they stay aligned.
    const routes = input.routes.filter(route => route.cells.length > 0);
    const lanes: LaneInfo[] = routes.map(route => ({
        spawn: route.spawn,
        path: compressRoute(route.cells)!,
    }));

    return {
        wave: input.wave,
        cash: input.cash,
        baseLife: input.baseLife,
        baseMaxLife: input.baseMaxLife,
        grid: { width: input.gridWidth, height: input.gridHeight },
        base: input.base,
        spawns: input.spawns,
        lanes,
        enemies: {
            total: input.enemies.length,
            groups,
            nearestThreat: nearestThreat(input.enemies),
        },
        towers,
        towerOptions: input.towerOptions,
        buildCandidates: buildCandidates(routes, input),
    };
}

/** Human-readable dump, for comparing what the AI saw against the screen. */
export function formatSnapshot(snapshot: GameSnapshot): string {
    const threat = snapshot.enemies.nearestThreat;
    const groups = snapshot.enemies.groups
        .map(group => `${group.type} x${group.count} (hp~${group.avgRemainingLife}/${group.avgLife})`)
        .join(', ');

    const towers = snapshot.towers
        .map(tower => `${tower.type} L${tower.level}@(${tower.i},${tower.j})${tower.targetInRange ? '*' : ''}`)
        .join(', ');

    const lanes = snapshot.lanes
        .map((lane, index) => `L${index} from (${lane.spawn.i},${lane.spawn.j}) ${lane.path.waypoints.length}wp/${lane.path.length}t`)
        .join('; ');

    const candidates = snapshot.buildCandidates
        .map(candidate => `L${candidate.lane}(${candidate.i},${candidate.j}) cov${candidate.coverage} dBase${candidate.distanceToBase}`)
        .join('; ');

    return [
        `Wave ${snapshot.wave} · cash ${snapshot.cash} · base ${snapshot.baseLife}/${snapshot.baseMaxLife}`,
        `Enemies (${snapshot.enemies.total}): ${groups || 'none'}`,
        `Nearest threat: ${threat ? `${threat.type} at (${threat.i},${threat.j}) ETA ${threat.etaSeconds}s hp ${threat.remainingLife}` : 'none'}`,
        `Towers (${snapshot.towers.length}): ${towers || 'none'}`,
        `Lanes (${snapshot.lanes.length}): ${lanes || 'unknown'}`,
        `Build candidates: ${candidates || 'none'}`,
    ].join('\n');
}
