// Manual real-DeepSeek A/B probe for issue #6 (NOT part of `npm test` — needs the
// live provider and a session). Run: node tests/manual/deepseek-ab.mjs [URL]
//
// This is a *single-decision* A/B, not a full multi-wave game: it sends the SAME
// deterministic, zone-tagged snapshot to /api/agent/decide under two different
// strategy prompts, repeats each prompt N times, and tallies the engine actions
// the model returns. It demonstrates the two prompts produce visibly different
// AI behaviour on the same battlefield — the axis #6 validates. A full game A/B
// (multiple waves, tower distribution, coin curve) still needs the browser loop
// and is recorded as a limitation in the PR / issue #6.
//
// No API key is read or committed here: the deployed server holds the key.

const BASE = process.argv[2] || 'https://prompt-defense.crowntime.cn';
const N = Number(process.env.AB_REPEATS || 4);

function state() {
    // A plausible early-game snapshot. Crucially the pathShapingCandidates span
    // all three zones, so a "coil near spawn" prompt and a "defend near base"
    // prompt have genuine, engine-measured detour choices to split on.
    return {
        wave: 1,
        cash: 800,
        baseLife: 15,
        baseMaxLife: 15,
        grid: { width: 61, height: 31 },
        base: { i: 30, j: 15 },
        spawns: [{ i: 4, j: 26 }],
        lanes: [{ spawn: { i: 4, j: 26 }, path: { waypoints: [{ i: 4, j: 26 }, { i: 4, j: 15 }, { i: 30, j: 15 }], length: 37 } }],
        enemies: {
            total: 6,
            groups: [{ type: 'fast', count: 4, avgLife: 60, avgRemainingLife: 60 }, { type: 'simple', count: 2, avgLife: 100, avgRemainingLife: 100 }],
            nearestThreat: { type: 'fast', i: 8, j: 26, remainingLife: 60, etaSeconds: 12 },
        },
        towers: [],
        towerOptions: [
            { type: 'canon', name: 'Canon', description: '', cost: 50, aimRadius: 100, dps: 62.5 },
            { type: 'gatling', name: 'Gatling', description: '', cost: 120, aimRadius: 90, dps: 120 },
            { type: 'slow', name: 'Slow', description: '', cost: 100, aimRadius: 110, dps: 0 },
            { type: 'sniper', name: 'Sniper', description: '', cost: 200, aimRadius: 260, dps: 70 },
            { type: 'laser', name: 'Laser', description: '', cost: 400, aimRadius: 100, dps: 116.7 },
        ],
        buildCandidates: [
            { i: 6, j: 25, lane: 0, coverage: 3, distanceToBase: 34, zone: 'frontline' },
            { i: 17, j: 16, lane: 0, coverage: 4, distanceToBase: 17, zone: 'midfield' },
            { i: 28, j: 14, lane: 0, coverage: 5, distanceToBase: 4, zone: 'base' },
        ],
        pathShapingCandidates: [
            { i: 6, j: 26, lane: 0, addedTiles: 4, zone: 'frontline' },
            { i: 17, j: 15, lane: 0, addedTiles: 3, zone: 'midfield' },
            { i: 28, j: 15, lane: 0, addedTiles: 4, zone: 'base' },
        ],
        items: [],
    };
}

const PROMPT_A = '激进消费。立刻最大化伤害输出，在基地附近（base zone）布防，优先用 pathShapingCandidates 里 zone 为 base 的格子盘绕加长路径。';
const PROMPT_B = '保留 30% 金币作为储备。在出生点附近（frontline zone）布防并盘绕，优先用 pathShapingCandidates 里 zone 为 frontline 的格子加长路径，优先减速快速敌人（slow 塔）。';

function zoneOf(i, j) {
    // The snapshot above places frontline cells at i<=8, base cells at i>=24.
    if (i <= 8) return 'frontline';
    if (i >= 24) return 'base';
    return 'midfield';
}

async function session() {
    const res = await fetch(`${BASE}/api/session`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'ab-probe', avatarId: 'aramaki' }),
    });
    if (!res.ok) throw new Error(`session ${res.status}: ${await res.text()}`);
    const body = await res.json();
    if (!body.token) throw new Error('no token');
    return body.token;
}

async function decide(token, strategy) {
    const res = await fetch(`${BASE}/api/agent/decide`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ strategy, state: state(), lang: 'zh' }),
    });
    const text = await res.text();
    let body;
    try { body = JSON.parse(text); } catch (e) { return { ok: false, status: res.status, raw: text }; }
    if (!res.ok || body.ok !== true) return { ok: false, status: res.status, body };
    return { ok: true, actions: body.actions || [], summary: body.summary || '' };
}

function tally(actions) {
    const zones = { frontline: 0, midfield: 0, base: 0, other: 0 };
    const types = {};
    for (const a of actions) {
        if (a.name === 'build_tower' && a.arguments) {
            const z = zoneOf(Number(a.arguments.i), Number(a.arguments.j));
            zones[z] = (zones[z] || 0) + 1;
            const t = String(a.arguments.type);
            types[t] = (types[t] || 0) + 1;
        }
    }
    return { zones, types };
}

(async () => {
    console.log(`DeepSeek A/B single-decision probe (base=${BASE}, repeats=${N})`);
    let token;
    try { token = await session(); }
    catch (e) { console.error('SESSION FAILED:', e.message); process.exit(2); }

    const results = {};
    for (const [label, prompt] of [['A_base', PROMPT_A], ['B_frontline', PROMPT_B]]) {
        results[label] = { trials: [], zoneCounts: { frontline: 0, midfield: 0, base: 0, other: 0 }, typeCounts: {}, failures: 0 };
        for (let i = 0; i < N; ++i) {
            const r = await decide(token, prompt);
            if (!r.ok) { results[label].failures += 1; results[label].trials.push({ ok: false, status: r.status }); continue; }
            const t = tally(r.actions);
            results[label].trials.push({ ok: true, actions: r.actions.map(a => ({ name: a.name, args: a.arguments })), summary: r.summary });
            for (const z of Object.keys(t.zones)) results[label].zoneCounts[z] += t.zones[z];
            for (const ty of Object.keys(t.types)) results[label].typeCounts[ty] = (results[label].typeCounts[ty] || 0) + t.types[ty];
        }
    }

    console.log('\n=== A (base-near, aggressive) ===');
    console.log('zone tallies:', results.A_base.zoneCounts);
    console.log('tower types:', results.A_base.typeCounts);
    console.log('failures:', results.A_base.failures);
    console.log('\n=== B (frontline coil, reserve) ===');
    console.log('zone tallies:', results.B_frontline.zoneCounts);
    console.log('tower types:', results.B_frontline.typeCounts);
    console.log('failures:', results.B_frontline.failures);

    // Per-trial detail so a human can eyeball "the two AIs play differently".
    for (const label of ['A_base', 'B_frontline']) {
        console.log(`\n--- ${label} trials ---`);
        results[label].trials.forEach((t, i) => {
            console.log(`  trial ${i}: ${t.ok ? JSON.stringify(t.actions) : ('FAIL ' + t.status)}`);
        });
    }

    const a = results.A_base.zoneCounts, b = results.B_frontline.zoneCounts;
    const diverged = a.frontline !== b.frontline || a.base !== b.base;
    console.log(`\nZone divergence between prompts: ${diverged ? 'YES' : 'NO'}`);
    if (!diverged) {
        console.log('NOTE: prompts did not diverge on zone choice in this single-decision sample.');
        console.log('This does NOT pass #6; a full multi-wave game A/B is still required.');
    }
})().catch(e => { console.error('FATAL', e); process.exit(1); });
