export type ItemKey = 'natural_oil' | 'tripo' | 'seeed_studio' | 'evomap' | 'hypershell';

export const ITEM_KEYS: ItemKey[] = ['natural_oil', 'tripo', 'seeed_studio', 'evomap', 'hypershell'];

export const ITEM_BASE_COST = 1000;
export const ITEM_BUFF_DURATION_MS = 5000;
export const ITEM_COOLDOWN_MS = 10000;

export interface CashPort {
    canWithdraw(amount: number): boolean;
    withdraw(amount: number): boolean;
}

export interface EnemyTarget {
    alive: boolean;
    life: number;
    takeDamage(damage: number): void;
}

export interface EnemyManagerPort {
    all(): readonly EnemyTarget[];
}

export interface HomeBasePort {
    getLife(): number;
    getMaxLife(): number;
    heal(amount: number): void;
}

export interface ItemActivationContext {
    enemyManager?: EnemyManagerPort;
    homeBase?: HomeBasePort;
}

export type ItemState =
    | { kind: 'ready' }
    | { kind: 'active'; remainingMs: number }
    | { kind: 'cooldown'; remainingMs: number };

export type ItemActivationResult =
    | { ok: true }
    | { ok: false; reason: 'NOT_RUNNING' | 'ALREADY_ACTIVE' | 'COOLDOWN' | 'INSUFFICIENT_FUNDS' | 'UNKNOWN_ITEM' };

export class TacticalItemsController {
    private itemStates = new Map<ItemKey, ItemState>();
    private evomapUses = 0;
    private context?: ItemActivationContext;

    constructor() {
        for (const key of ITEM_KEYS) {
            this.itemStates.set(key, { kind: 'ready' });
        }
    }

    setContext(context: ItemActivationContext) {
        this.context = context;
    }

    get attackSpeedMultiplier(): number {
        const oil = this.getState('natural_oil');
        const seeed = this.getState('seeed_studio');
        if (oil.kind === 'active' || seeed.kind === 'active') {
            return 1.5;
        }
        return 1.0;
    }

    get damageMultiplier(): number {
        const tripo = this.getState('tripo');
        if (tripo.kind === 'active') {
            return 3.0;
        }
        return 1.0;
    }

    cost(key: ItemKey): number {
        if (key === 'evomap') {
            return this.evomapUses < 2 ? 0 : ITEM_BASE_COST;
        }
        return ITEM_BASE_COST;
    }

    getState(key: ItemKey): ItemState {
        return this.itemStates.get(key) || { kind: 'ready' };
    }

    activate(
        key: ItemKey,
        isRunning: boolean,
        cash: CashPort,
        context?: ItemActivationContext
    ): ItemActivationResult {
        if (!isRunning) return { ok: false, reason: 'NOT_RUNNING' };
        if (!ITEM_KEYS.includes(key)) return { ok: false, reason: 'UNKNOWN_ITEM' };

        const state = this.getState(key);
        if (state.kind === 'active') return { ok: false, reason: 'ALREADY_ACTIVE' };
        if (state.kind === 'cooldown') return { ok: false, reason: 'COOLDOWN' };

        const itemCost = this.cost(key);
        if (itemCost > 0) {
            if (!cash.canWithdraw(itemCost) || !cash.withdraw(itemCost)) {
                return { ok: false, reason: 'INSUFFICIENT_FUNDS' };
            }
        }

        const effectiveContext = context || this.context;

        switch (key) {
            case 'natural_oil':
            case 'seeed_studio':
            case 'tripo':
                this.itemStates.set(key, { kind: 'active', remainingMs: ITEM_BUFF_DURATION_MS });
                break;
            case 'evomap':
                this.evomapUses += 1;
                if (effectiveContext?.enemyManager) {
                    const enemies = effectiveContext.enemyManager.all();
                    for (const enemy of enemies) {
                        if (enemy.alive) {
                            const damage = Math.max(1, Math.round(enemy.life * 0.02));
                            enemy.takeDamage(damage);
                        }
                    }
                }
                this.itemStates.set(key, { kind: 'cooldown', remainingMs: ITEM_COOLDOWN_MS });
                break;
            case 'hypershell':
                if (effectiveContext?.homeBase) {
                    const healAmount = Math.max(1, Math.round(effectiveContext.homeBase.getMaxLife() * 0.25));
                    effectiveContext.homeBase.heal(healAmount);
                }
                this.itemStates.set(key, { kind: 'cooldown', remainingMs: ITEM_COOLDOWN_MS });
                break;
        }

        return { ok: true };
    }

    update(deltaMs: number, isRunning: boolean): void {
        if (!isRunning || deltaMs <= 0) return;

        for (const key of ITEM_KEYS) {
            let state = this.getState(key);

            if (state.kind === 'active') {
                const remaining = state.remainingMs;
                if (deltaMs < remaining) {
                    this.itemStates.set(key, { kind: 'active', remainingMs: remaining - deltaMs });
                    continue;
                }
                const leftover = deltaMs - remaining;
                this.itemStates.set(key, { kind: 'cooldown', remainingMs: ITEM_COOLDOWN_MS });
                state = this.getState(key);
                if (leftover > 0 && state.kind === 'cooldown') {
                    if (leftover >= state.remainingMs) {
                        this.itemStates.set(key, { kind: 'ready' });
                    } else {
                        this.itemStates.set(key, { kind: 'cooldown', remainingMs: state.remainingMs - leftover });
                    }
                }
                continue;
            }

            if (state.kind === 'cooldown') {
                const remaining = state.remainingMs;
                if (deltaMs >= remaining) {
                    this.itemStates.set(key, { kind: 'ready' });
                } else {
                    this.itemStates.set(key, { kind: 'cooldown', remainingMs: remaining - deltaMs });
                }
            }
        }
    }

    getAllItemSnapshots(): Array<{
        name: string;
        cost: number;
        ready: boolean;
        active: boolean;
        cooldownRemainingMs?: number;
        activeRemainingMs?: number;
    }> {
        return ITEM_KEYS.map(key => {
            const state = this.getState(key);
            return {
                name: key,
                cost: this.cost(key),
                ready: state.kind === 'ready',
                active: state.kind === 'active',
                cooldownRemainingMs: state.kind === 'cooldown' ? state.remainingMs : undefined,
                activeRemainingMs: state.kind === 'active' ? state.remainingMs : undefined,
            };
        });
    }
}

export const tacticalItemsController = new TacticalItemsController();
