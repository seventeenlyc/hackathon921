import {gameLoop} from './GameLoop';
import {ActionError, isItemKey} from './types';
import {
    CashPort,
    ItemActivationContext,
    ItemActivationResult,
    ItemKey,
    TacticalItemsController,
} from '../items/TacticalItems';

/** The UI and model entry points consult the same authoritative game-loop state. */
export function activateModelItem(
    item: ItemKey,
    controller: TacticalItemsController,
    cash: CashPort,
    context: ItemActivationContext,
): ItemActivationResult {
    return controller.activate(item, gameLoop.state === 'running', cash, context);
}

export type ModelItemRequestResult =
    | {ok: true; queued?: true}
    | {ok: false; error: ActionError};

/**
 * Engine-owned queue for item requests made during the wave's planning window.
 * Effects are intentionally deferred until the first enemy batch exists.
 */
export class PendingModelItemActivations {
    private pending: ItemKey[] = [];

    enqueue(item: string): {ok: true; queued: true} | {ok: false; error: ActionError} {
        if (!isItemKey(item)) return {ok: false, error: 'UNKNOWN_ITEM'};
        this.pending.push(item);
        return {ok: true, queued: true};
    }

    takeAll(): ItemKey[] {
        return this.pending.splice(0);
    }
}

/** DOM-free seam for the real InertBattlefield.useItem forwarding and error mapping. */
export function useModelItem(
    item: string,
    controller: TacticalItemsController,
    cash: CashPort,
    context: ItemActivationContext,
): {ok: true} | {ok: false; error: ActionError} {
    if (!isItemKey(item)) return {ok: false, error: 'UNKNOWN_ITEM'};

    const result = activateModelItem(item, controller, cash, context);
    if (result.ok) return {ok: true};
    if (result.reason === 'INSUFFICIENT_FUNDS') return {ok: false, error: 'INSUFFICIENT_FUNDS'};
    if (result.reason === 'ALREADY_ACTIVE') return {ok: false, error: 'ALREADY_ACTIVE'};
    if (result.reason === 'COOLDOWN') return {ok: false, error: 'COOLDOWN'};
    // The model action schema remains unchanged; NOT_RUNNING maps to ITEM_NOT_READY.
    return {ok: false, error: 'ITEM_NOT_READY'};
}

/** Queue planning-time requests; all other states use normal activation rules. */
export function requestModelItem(
    item: string,
    controller: TacticalItemsController,
    cash: CashPort,
    context: ItemActivationContext,
    pending: PendingModelItemActivations,
): ModelItemRequestResult {
    if (gameLoop.state === 'planning') return pending.enqueue(item);
    return useModelItem(item, controller, cash, context);
}
