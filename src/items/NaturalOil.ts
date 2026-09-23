export const NATURAL_OIL_COST = 1000;
export const NATURAL_OIL_ACTIVE_MS = 5000;
export const NATURAL_OIL_COOLDOWN_MS = 10000;

export function attackClockDelta(frameDurationMs: number, reloadDurationMs: number, multiplier: number): number {
    return reloadDurationMs > 0 ? frameDurationMs * multiplier : frameDurationMs;
}

export interface CashPort {
    canWithdraw(amount: number): boolean;
    withdraw(amount: number): boolean;
}

export type NaturalOilState =
    | {kind: 'ready'}
    | {kind: 'active'; remainingMs: number}
    | {kind: 'cooldown'; remainingMs: number};

export type OilActivationResult =
    | {ok: true}
    | {ok: false; reason: 'NOT_RUNNING' | 'ALREADY_ACTIVE' | 'COOLDOWN' | 'INSUFFICIENT_FUNDS'};

export class NaturalOilController {
    private currentState: NaturalOilState = {kind: 'ready'};

    get state(): NaturalOilState {
        return {...this.currentState};
    }

    get attackSpeedMultiplier(): number {
        return this.currentState.kind === 'active' ? 1.5 : 1;
    }

    activate(isRunning: boolean, cash: CashPort): OilActivationResult {
        if (!isRunning) return {ok: false, reason: 'NOT_RUNNING'};
        if (this.currentState.kind === 'active') return {ok: false, reason: 'ALREADY_ACTIVE'};
        if (this.currentState.kind === 'cooldown') return {ok: false, reason: 'COOLDOWN'};
        if (!cash.canWithdraw(NATURAL_OIL_COST) || !cash.withdraw(NATURAL_OIL_COST)) {
            return {ok: false, reason: 'INSUFFICIENT_FUNDS'};
        }
        this.currentState = {kind: 'active', remainingMs: NATURAL_OIL_ACTIVE_MS};
        return {ok: true};
    }

    update(deltaMs: number, isRunning: boolean): void {
        if (!isRunning || deltaMs <= 0) return;

        if (this.currentState.kind === 'active') {
            const remaining = this.currentState.remainingMs;
            if (deltaMs < remaining) {
                this.currentState = {kind: 'active', remainingMs: remaining - deltaMs};
                return;
            }
            deltaMs -= remaining;
            this.currentState = {kind: 'cooldown', remainingMs: NATURAL_OIL_COOLDOWN_MS};
        }

        if (this.currentState.kind === 'cooldown') {
            const remaining = this.currentState.remainingMs;
            this.currentState = deltaMs >= remaining
                ? {kind: 'ready'}
                : {kind: 'cooldown', remainingMs: remaining - deltaMs};
        }
    }
}

export const naturalOilController = new NaturalOilController();
