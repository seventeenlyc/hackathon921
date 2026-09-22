/**
 * Starter strategies for players who don't know what to write yet
 * (docs/PRODUCT_CONCEPT.md §6, docs/USER_STORY.md MVP 用户故事 2).
 *
 * They are deliberately different in *approach* rather than optimised: the point
 * of an example is to make the causality "my words change the AI's behaviour"
 * visible, so "ring the base" and "line the whole path" must look different on
 * screen. Keep each one short enough to read at a glance.
 */
export const STRATEGY_EXAMPLES: readonly string[] = [
    'Build a tight ring of Canon towers around the base. Upgrade the ones closest to the base first.',
    'Spread towers evenly along the whole enemy path so enemies stay under fire for longer. Prefer Gatling towers.',
    'Slow the enemies down: put Slower towers on the long straight sections, and add damage towers where the path turns.',
    'Save cash early, then build Snipers along the path to pick off enemies before they reach the base.',
    'Build Gatling towers at the corners where enemies bunch up. Upgrade existing towers before building new ones.',
    'Always keep at least 50 cash in reserve. Spend the rest on the cheapest damaging tower near the base.',
    'Cover every spawn point equally — never let one lane go undefended.',
    'Focus everything on the middle of the map: build there first and keep upgrading, ignoring the outer lanes.',
];

/** Pick one example. `rand` is injectable so the choice is deterministic in tests. */
export function randomStrategy(rand: () => number = Math.random): string {
    const index = Math.floor(rand() * STRATEGY_EXAMPLES.length);
    // Survive a `rand()` that returns exactly 1, which a Math.random() contract
    // forbids but an injected test double might not.
    const safe = Math.min(Math.max(index, 0), STRATEGY_EXAMPLES.length - 1);
    return STRATEGY_EXAMPLES[safe];
}
