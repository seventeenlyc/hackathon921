import type {RenderSnapshot} from '../engine/RenderSnapshot';
import {interpolateSnapshot} from './interpolate';

export interface TimedFrame {
    frame: RenderSnapshot;
    at: number;
}

/**
 * A short history of server frames sampled against a deliberately delayed
 * timeline (docs/PRODUCT_CONCEPT.md §5).
 *
 * The first interpolation attempt blended "previous → latest" by the *last*
 * measured interval, which stalls and then jumps whenever a frame is late:
 * production measurement showed inter-frame gaps up to 292 ms against a 50 ms
 * nominal rate. Rendering a little behind real time instead lets ordinary
 * jitter be absorbed — the sample point walks through the buffered history, so
 * a late frame only shortens the buffer instead of freezing the picture.
 *
 * Pure and dependency-free, so the sampling is unit-tested without a browser.
 */
export class FrameBuffer {
    private items: TimedFrame[] = [];

    constructor(
        /** How far behind wall time to render; absorbs jitter up to this. */
        private readonly bufferMs: number = 150,
        private readonly maxFrames: number = 16
    ) {
    }

    push(frame: RenderSnapshot, at: number) {
        this.items.push({frame, at});
        while (this.items.length > this.maxFrames) {
            this.items.shift();
        }
    }

    /** Drop history (on pause/planning/over or a new run) so it never blends across a gap. */
    reset() {
        this.items = [];
    }

    get size(): number {
        return this.items.length;
    }

    /** The frame to draw for wall time `now`, or null before the first frame. */
    sample(now: number): RenderSnapshot | null {
        const items = this.items;
        if (items.length === 0) return null;
        if (items.length === 1) return items[0].frame;

        const target = now - this.bufferMs;
        if (target <= items[0].at) return items[0].frame;

        for (let i = 1; i < items.length; i += 1) {
            const a = items[i - 1];
            const b = items[i];
            if (target <= b.at) {
                const span = b.at - a.at;
                const alpha = span > 0 ? (target - a.at) / span : 1;
                return interpolateSnapshot(a.frame, b.frame, alpha);
            }
        }

        // Target is past the newest frame (a gap longer than the buffer): hold it
        // rather than extrapolating into a guess.
        return items[items.length - 1].frame;
    }
}
