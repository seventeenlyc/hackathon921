/**
 * Impassable terrain. Data only: the engine never draws, so a rock is just a
 * cell that blocks pathfinding.
 */
export class Rock {
    public readonly traversable = false;

    constructor(public readonly i: number, public readonly j: number, public readonly width: number) {
    }
}
