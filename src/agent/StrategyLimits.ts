/**
 * Client-side mirror of the player-strategy cap enforced by the LLM proxy
 * (`server/src/agent.ts` `MAX_STRATEGY_LENGTH`).
 *
 * The server stays authoritative: it still rejects anything longer with
 * `STRATEGY_TOO_LONG` (fail closed). This mirror exists only so the panel can
 * show the limit and stop the player from sending a request that is guaranteed
 * to fail — it never truncates the prompt behind the player's back.
 */

export const STRATEGY_MAX_LENGTH = 5000;

/** Length the server will actually see: the panel submits a trimmed prompt. */
export function strategyLength(text: string): number {
    return text.trim().length;
}

export function isStrategyTooLong(text: string): boolean {
    return strategyLength(text) > STRATEGY_MAX_LENGTH;
}
