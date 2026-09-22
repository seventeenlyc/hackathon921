/**
 * UI language (zh / en) with a toggle.
 *
 * Every user-visible string goes through `t(key)`. Static markup carries
 * `data-i18n` attributes and is filled by `applyStaticTranslations`; dynamic
 * text is re-rendered by components that subscribe to `onLangChange`.
 *
 * Deliberately free of top-level DOM access so it can be exercised from tests.
 */

export type Lang = 'zh' | 'en';

const STORAGE_KEY = 'promptDefense.lang';

interface Entry {
    zh: string;
    en: string;
}

const STRINGS: { [key: string]: Entry } = {
    'app.title': {zh: 'Inert — 极简塔防', en: 'Inert - Minimalistic tower defense in the browser'},
    'header.subtitle': {zh: '极简塔防', en: 'Minimalistic Tower Defense'},

    'label.wave': {zh: '波次：', en: 'Wave:'},
    'label.state': {zh: '状态：', en: 'State:'},
    'label.cash': {zh: '金币：', en: 'Cash:'},
    'label.spawners': {zh: '出生点：', en: 'Spawners:'},

    'strategy.label': {zh: '你的策略', en: 'Your strategy'},
    'strategy.placeholder': {zh: '告诉 AI 该怎么打…', en: 'Tell your AI how to play…'},
    'strategy.apply': {zh: '应用策略', en: 'Apply strategy'},
    'strategy.random': {zh: '随机示例', en: 'Random strategy'},
    'strategy.start': {zh: '开始', en: 'Start run'},
    'strategy.writeBeforeStart': {zh: '开始前请先写下策略。', en: 'Write a strategy before starting the run.'},
    'strategy.writeBeforeApply': {zh: '应用前请先写下策略。', en: 'Write a strategy before applying it.'},
    'strategy.hintEmpty': {zh: '写下策略，或点「随机示例」拿一个例子。', en: 'Write a strategy, or press Random strategy for an example.'},
    'strategy.notStarted': {zh: '未开始 — AI 将从第 1 波起按你的策略行动。', en: 'Not started — the AI plays from wave 1.'},
    'strategy.queued': {zh: '已排队 · 第 {wave} 波生效', en: 'Queued · effective wave {wave}'},
    'strategy.active': {zh: '生效中 · 第 {wave} 波起', en: 'Active from wave {wave}'},
    'strategy.tooLong': {zh: '策略 {length} 个字符，上限是 {max}。', en: 'Strategy is {length} characters; the limit is {max}.'},

    'decisions.label': {zh: 'AI 决策', en: 'AI decisions'},
    'decisions.empty': {zh: '暂无决策。', en: 'No decisions yet.'},
    'decision.entry': {zh: '第 {wave} 波 · {action}：{detail}{message}', en: 'Wave {wave} · {action}: {detail}{message}'},

    'mode.button': {zh: '切换模式', en: 'Switch play mode'},
    'mode.toHuman': {zh: '切换到人类模式', en: 'Switch to human play'},
    'mode.toAi': {zh: '切换到 AI 模式', en: 'Switch to AI play'},
    'mode.toHumanTitle': {zh: '重新开始并进入人类模式', en: 'Restart the game in human mode'},
    'mode.toAiTitle': {zh: '重新开始并进入 AI 模式', en: 'Restart the game in AI mode'},

    'control.pause': {zh: '暂停', en: 'Pause'},
    'control.resume': {zh: '继续', en: 'Resume'},
    'control.restart': {zh: '重新开始', en: 'Restart'},
    'control.lang': {zh: 'EN', en: '中文'},
    'control.langTitle': {zh: '切换语言（中 / EN）', en: 'Switch language (EN / 中文)'},

    'state.idle': {zh: '未开始', en: 'Not started'},
    'state.running': {zh: '运行中', en: 'Running'},
    'state.paused': {zh: '已暂停', en: 'Paused'},
    'state.planning': {zh: '思考中', en: 'Thinking'},
    'state.over': {zh: '已结束', en: 'Finished'},

    'speed.label': {zh: '速度 x{speed}', en: 'Speed x{speed}'},
    'spawner.pending': {zh: '{applied} → {requested}（下一波生效）', en: '{applied} → {requested} at next wave'},

    'result.gameOver': {zh: '游戏结束', en: 'Game Over'},
    'result.wave': {zh: '到达波次', en: 'Wave reached'},
    'result.rank': {zh: '名次', en: 'Rank'},
    'result.towers': {zh: '部署塔数', en: 'Towers deployed'},
    'result.decisions': {zh: 'AI 决策次数', en: 'AI decisions'},
    'result.cash': {zh: '剩余金币', en: 'Cash left'},
    'result.duration': {zh: '用时', en: 'Duration'},

    'footer.source': {zh: '源代码：', en: 'Source code:'},
    'footer.madeBy': {zh: '用 ♥ 制作，作者：', en: 'Made with ♥ by'},

    'tower.cost': {zh: '造价：', en: 'Cost:'},
    'tower.aimRadius': {zh: '射程：', en: 'Aim radius:'},
    'tower.damage': {zh: '伤害：', en: 'Damage:'},
    'tower.reload': {zh: '装填：', en: 'Reload:'},
    'tower.dps': {zh: 'DPS：', en: 'DPS:'},

    'snackbar.noMoney': {zh: '金币不足，买不起这座塔', en: 'You don\'t have enough money to buy this tower'},

    'lb.title': {zh: '排行榜', en: 'Leaderboard'},
    'lb.empty': {zh: '还没有成绩，先跑一局吧！', en: 'No scores yet - play a run!'},
    'lb.wave': {zh: '{wave} 波', en: 'Wave {wave}'},
    'lb.shared': {zh: '共享', en: 'Shared'},
    'lb.offline': {zh: '离线 · 仅本机', en: 'Offline - local only'},
    'lb.you': {zh: '你：{name}', en: 'You: {name}'},
    'lb.rank': {zh: ' · 第 {rank} 名', en: ' - #{rank}'},
    'lb.noRun': {zh: '（还没有成绩）', en: ' (no run yet)'},

    'gate.welcome': {zh: '欢迎！', en: 'Welcome!'},
    'gate.prompt': {zh: '输入一个昵称，用于排行榜。', en: 'Pick a username for the leaderboard.'},
    'gate.placeholder': {zh: '你的昵称', en: 'Your name'},
    'gate.continue': {zh: '继续', en: 'Continue'},
    'gate.invalid': {zh: '昵称不合法（1–16 个字符：中英文、数字、下划线或短横线）。', en: 'Invalid name (1-16 chars, letters/digits/_/-).'},

    'agent.stateReadFailed': {zh: '读取战场状态失败，本轮不决策。', en: 'Could not read the game state; skipping this decision round.'},
    'agent.noStrategy': {zh: '还没有策略，AI 本波不行动。', en: 'No strategy set; the AI will not act this wave.'},
    'agent.timeout': {zh: '代理在 {ms}ms 内没有响应，本波不追加指令。', en: 'The agent proxy did not answer within {ms}ms; continuing without new orders.'},
    'agent.unreachable': {zh: '连不上代理服务，本波不追加指令。', en: 'Could not reach the agent proxy; continuing without new orders.'},
    'agent.httpError': {zh: '代理返回 HTTP {status}，本波不追加指令。', en: 'The agent proxy returned HTTP {status}; continuing without new orders.'},
    'agent.unreadable': {zh: '代理返回的内容无法解析。', en: 'The agent proxy returned an unreadable response.'},
    'agent.rejected': {zh: '代理拒绝了本次决策请求。', en: 'The agent proxy rejected the decision request.'},
    'agent.unknownAction': {zh: '忽略了未知动作「{name}」。', en: 'Ignored unknown action "{name}".'},

    'action.unknownType': {zh: '未知塔类型「{type}」。可用类型：{types}。', en: 'Unknown tower type "{type}". Valid types: {types}.'},
    'action.invalidCoords': {zh: '坐标必须是整数，收到 ({i}, {j})。', en: 'Coordinates must be integers, got ({i}, {j}).'},
    'action.outOfBounds': {zh: '格子 ({i}, {j}) 超出 {w}×{h} 的地图范围。', en: 'Cell ({i}, {j}) is outside the {w}x{h} grid.'},
    'action.typeUnavailable': {zh: '本局没有「{type}」这种塔。', en: 'Tower type "{type}" is not available in this game.'},
    'action.cellOccupied': {zh: '格子 ({i}, {j}) 上已经有塔了。', en: 'Cell ({i}, {j}) already holds a tower.'},
    'action.blocksPath': {zh: '在 ({i}, {j}) 建塔会堵死出生点到基地的路线。', en: 'Placing a tower at ({i}, {j}) would block the path from a spawn to the base.'},
    'action.cellUnbuildable': {zh: '格子 ({i}, {j}) 不能建塔（{error}）。', en: 'Cell ({i}, {j}) cannot be built on ({error}).'},
    'action.insufficientBuild': {zh: '{type} 需要 {cost} 金币，但当前只有 {cash}。', en: 'A {type} costs {cost} but only {cash} cash is available.'},
    'action.built': {zh: '在 ({i}, {j}) 建了 {type}，花费 {cost} 金币。', en: 'Built a {type} at ({i}, {j}) for {cost} cash.'},
    'action.badTowerId': {zh: '「{id}」不是合法的塔 id，格式应为 "i:j"。', en: '"{id}" is not a valid tower id. Expected "i:j".'},
    'action.noTower': {zh: '({i}, {j}) 上没有塔。', en: 'No tower exists at ({i}, {j}).'},
    'action.maxLevel': {zh: '塔 {id} 已经是满级 {level}。', en: 'Tower {id} is already at max level {level}.'},
    'action.insufficientUpgrade': {zh: '升级塔 {id} 需要 {cost} 金币，但当前只有 {cash}。', en: 'Upgrading tower {id} costs {cost} but only {cash} cash is available.'},
    'action.upgradeFailed': {zh: '引擎拒绝了塔 {id} 的升级。', en: 'The engine rejected the upgrade of tower {id}.'},
    'action.upgraded': {zh: '塔 {id} 升到 {level} 级，花费 {cost} 金币。', en: 'Upgraded tower {id} to level {level} for {cost} cash.'},

    'strategy.example1': {zh: '在基地周围密集建造 Canon 炮塔，优先升级离基地最近的那些。', en: 'Build a tight ring of Canon towers around the base. Upgrade the ones closest to the base first.'},
    'strategy.example2': {zh: '沿敌人整条行进路线均匀铺开炮塔，让敌人暴露在火力下更久。优先 Gatling。', en: 'Spread towers evenly along the whole enemy path so enemies stay under fire for longer. Prefer Gatling towers.'},
    'strategy.example3': {zh: '先减速：在长的直道上放 Slower 塔，在拐弯处补伤害塔。', en: 'Slow the enemies down: put Slower towers on the long straight sections, and add damage towers where the path turns.'},
    'strategy.example4': {zh: '前期攒钱，之后沿路建 Sniper，在敌人接近基地前点掉它们。', en: 'Save cash early, then build Snipers along the path to pick off enemies before they reach the base.'},
    'strategy.example5': {zh: '在敌人容易堆积的拐角建 Gatling，优先升级已有炮塔而不是新建。', en: 'Build Gatling towers at the corners where enemies bunch up. Upgrade existing towers before building new ones.'},
    'strategy.example6': {zh: '始终保留至少 50 金币；其余花在基地附近最便宜的伤害塔上。', en: 'Always keep at least 50 cash in reserve. Spend the rest on the cheapest damaging tower near the base.'},
    'strategy.example7': {zh: '每条出生路线都要覆盖，绝不能让任何一路无人防守。', en: 'Cover every spawn point equally — never let one lane go undefended.'},
    'strategy.example8': {zh: '把资源集中在地图中部：先在那里建塔并持续升级，暂时放弃外围路线。', en: 'Focus everything on the middle of the map: build there first and keep upgrading, ignoring the outer lanes.'},
};

export const STRATEGY_KEYS = [
    'strategy.example1',
    'strategy.example2',
    'strategy.example3',
    'strategy.example4',
    'strategy.example5',
    'strategy.example6',
    'strategy.example7',
    'strategy.example8',
];

export type LangListener = (lang: Lang) => void;

const listeners: LangListener[] = [];

function safeStorage(): Storage | null {
    try {
        return typeof localStorage !== 'undefined' ? localStorage : null;
    } catch (e) {
        return null;
    }
}

function readInitialLang(): Lang {
    const search = typeof location !== 'undefined' ? location.search : '';
    const match = /[?&]lang=(zh|en)(?:&|$)/.exec(search || '');
    if (match) return match[1] as Lang;

    const stored = safeStorage()?.getItem(STORAGE_KEY);
    if (stored === 'zh' || stored === 'en') return stored;

    return 'zh';
}

let current: Lang = readInitialLang();

/** Translate a key, substituting `{name}` placeholders. */
export function t(key: string, params?: { [name: string]: string | number }): string {
    const entry = STRINGS[key];
    let text = entry ? entry[current] : key;

    if (params) {
        for (const name of Object.keys(params)) {
            text = text.split(`{${name}}`).join(String(params[name]));
        }
    }

    return text;
}

export function getLang(): Lang {
    return current;
}

export function setLang(lang: Lang): void {
    if (lang !== 'zh' && lang !== 'en') return;
    if (lang === current) return;
    current = lang;
    try {
        safeStorage()?.setItem(STORAGE_KEY, lang);
    } catch (e) {
        // Persistence is best-effort; the toggle still works for this session.
    }
    listeners.forEach(listener => listener(lang));
}

export function toggleLang(): void {
    setLang(current === 'zh' ? 'en' : 'zh');
}

export function onLangChange(listener: LangListener): void {
    listeners.push(listener);
}

/** Fill every `data-i18n*` element. Safe to call on load and on every toggle. */
export function applyStaticTranslations(root: ParentNode = document): void {
    root.querySelectorAll<HTMLElement>('[data-i18n]').forEach(element => {
        element.textContent = t(element.dataset.i18n!);
    });
    root.querySelectorAll<HTMLElement>('[data-i18n-placeholder]').forEach(element => {
        (element as HTMLInputElement).placeholder = t(element.dataset.i18nPlaceholder!);
    });
    root.querySelectorAll<HTMLElement>('[data-i18n-title]').forEach(element => {
        element.title = t(element.dataset.i18nTitle!);
    });
    document.title = t('app.title');
}
