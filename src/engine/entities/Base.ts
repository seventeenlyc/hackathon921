import {BASE_MAX_LIFE, TILE_SIZE} from '../constants';

/**
 * A spawn base or the home base.
 *
 * The browser build called `game.gameOver()` directly from here, which is what
 * tied the simulation to the rendering singleton. The engine instead exposes an
 * `onDestroyed` callback the host wires up, so the same base logic works in a
 * headless process.
 */
export class Base {
    public readonly width: number;
    public readonly isHome: boolean;
    /** Bases sit on the path: enemies walk onto them. Preserved from the browser `Base`. */
    public readonly traversable = true;
    public readonly center: { x: number; y: number };
    /** Set by the engine; fired once when the home base's life reaches zero. */
    public onDestroyed: (() => void) | null = null;

    private readonly maxLife = BASE_MAX_LIFE;
    private life = BASE_MAX_LIFE;

    constructor(public readonly i: number, public readonly j: number, width = TILE_SIZE, isHome = false) {
        this.width = width;
        this.isHome = isHome;
        this.center = {
            x: i * width + width / 2,
            y: j * width + width / 2,
        };
    }

    /** One enemy reached this base: lose one life, and end the run at zero. */
    handleDamage() {
        this.life -= 1;
        if (this.life <= 0 && this.onDestroyed) {
            this.onDestroyed();
        }
    }

    getLife() {
        return this.life;
    }

    getMaxLife() {
        return this.maxLife;
    }
}
