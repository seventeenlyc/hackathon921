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
    'app.title': {zh: '保护笑脸男 — 塔奇克马防御协议', en: 'PROTECT AOI — Tachikoma Defense Protocol'},
    'header.subtitle': {zh: '公安九课 · 塔奇克马防御协议', en: 'SECTION 9 · TACHIKOMA DEFENSE PROTOCOL'},

    'label.wave': {zh: '防御波次：', en: 'Defense Wave:'},
    'label.state': {zh: '作战状态：', en: 'Operation:'},
    'label.cash': {zh: '战术资源：', en: 'Resources:'},
    'label.spawners': {zh: '攻击路线：', en: 'Attack Routes:'},

    'strategy.label': {zh: '作战命令', en: 'Tactical Order'},
    'strategy.placeholder': {zh: '向塔奇克马下达自然语言作战命令…', en: 'Issue a tactical order to the Tachikomas…'},
    'strategy.apply': {zh: '更新命令', en: 'Update Order'},
    'strategy.random': {zh: '参谋模板', en: 'Tactical Template'},
    'strategy.start': {zh: '下达命令并开始行动', en: 'Issue Order & Deploy'},
    'strategy.writeBeforeStart': {zh: '行动开始前必须下达作战命令。', en: 'Issue a tactical order before deployment.'},
    'strategy.writeBeforeApply': {zh: '请输入新的作战命令。', en: 'Enter a new tactical order.'},
    'strategy.hintEmpty': {zh: '等待作战命令。也可以载入「参谋模板」。', en: 'Awaiting tactical order. You may also load a Tactical Template.'},
    'strategy.notStarted': {zh: 'STANDBY — 塔奇克马等待首次作战命令。', en: 'STANDBY — Tachikomas awaiting initial tactical order.'},
    'strategy.queued': {zh: 'ORDER RECEIVED · 第 {wave} 波执行', en: 'ORDER RECEIVED · Effective wave {wave}'},
    'strategy.active': {zh: 'EXECUTING ORDER · 第 {wave} 波起', en: 'EXECUTING ORDER · Active from wave {wave}'},
    'strategy.tooLong': {zh: '命令 {length} 个字符，超过终端上限 {max}。', en: 'Order is {length} characters; terminal limit is {max}.'},

    'decisions.label': {zh: '塔奇克马判断', en: 'Tachikoma Decisions'},
    'decisions.empty': {zh: '等待塔奇克马自主判断。', en: 'Awaiting Tachikoma decisions.'},
    'decision.entry': {zh: 'WAVE {wave} · {action} // {detail}{message}', en: 'WAVE {wave} · {action} // {detail}{message}'},

    'mode.button': {zh: '切换指挥模式', en: 'Switch Command Mode'},
    'mode.toHuman': {zh: '接管现场部署', en: 'Assume Manual Control'},
    'mode.toAi': {zh: '移交塔奇克马自主指挥', en: 'Transfer to Tachikoma Control'},
    'mode.toHumanTitle': {zh: '重新部署并由参谋直接接管', en: 'Restart and assume direct tactical control'},
    'mode.toAiTitle': {zh: '重新部署并交由塔奇克马自主行动', en: 'Restart under autonomous Tachikoma control'},

    'control.pause': {zh: '暂停演算', en: 'Suspend'},
    'control.resume': {zh: '恢复演算', en: 'Resume'},
    'control.restart': {zh: '重新部署', en: 'Redeploy'},
    'control.lang': {zh: 'EN', en: '中文'},
    'control.langTitle': {zh: '切换语言（中 / EN）', en: 'Switch language (EN / 中文)'},
    'control.audio': {zh: '音效开', en: 'Sound On'},
    'control.audioMuted': {zh: '音效关', en: 'Sound Off'},

    'state.idle': {zh: 'STANDBY', en: 'STANDBY'},
    'state.running': {zh: 'ACTION', en: 'ACTION'},
    'state.paused': {zh: 'SUSPENDED', en: 'SUSPENDED'},
    'state.planning': {zh: '战术分析中', en: 'TACTICAL ANALYSIS'},

    'speed.label': {zh: '演算速度 x{speed}', en: 'Simulation x{speed}'},
    'spawner.pending': {zh: '{applied} → {requested}（下一波生效）', en: '{applied} → {requested} effective next wave'},

    'result.gameOver': {zh: '防御终止', en: 'DEFENSE TERMINATED'},
    'result.wave': {zh: '防御波次', en: 'Wave Reached'},
    'result.rank': {zh: '作战排名', en: 'Operation Rank'},
    'result.towers': {zh: '部署机体', en: 'Units Deployed'},
    'result.decisions': {zh: '自主判断次数', en: 'Autonomous Decisions'},
    'result.cash': {zh: '剩余战术资源', en: 'Resources Remaining'},
    'result.duration': {zh: '行动时长', en: 'Operation Time'},

    'footer.source': {zh: '源代码：', en: 'Source:'},
    'footer.madeBy': {zh: '制作：', en: 'Created by'},

    'tower.cost': {zh: '部署资源：', en: 'Deployment Cost:'},
    'tower.aimRadius': {zh: '有效射程：', en: 'Effective Range:'},
    'tower.damage': {zh: '单次火力：', en: 'Damage:'},
    'tower.reload': {zh: '射击间隔：', en: 'Fire Interval:'},
    'tower.dps': {zh: '持续火力：', en: 'DPS:'},

    'snackbar.noMoney': {zh: '战术资源不足，无法部署该机体。', en: 'Insufficient tactical resources to deploy this unit.'},

    'lb.title': {zh: '作战记录', en: 'OPERATION RECORDS'},
    'lb.empty': {zh: '暂无作战记录。', en: 'No operation records available.'},
    'lb.wave': {zh: 'WAVE {wave}', en: 'WAVE {wave}'},
    'lb.shared': {zh: '九课网络', en: 'SEC-9 NETWORK'},
    'lb.offline': {zh: '离线 · 本地记录', en: 'OFFLINE · LOCAL ARCHIVE'},
    'lb.you': {zh: '参谋：{name}', en: 'OPERATOR: {name}'},
    'lb.rank': {zh: ' · RANK {rank}', en: ' · RANK {rank}'},
    'lb.noRun': {zh: ' · 暂无记录', en: ' · NO RECORD'},
    'lb.syncFailed': {zh: '作战记录同步失败', en: 'Operation record sync failed'},
    'lb.retrySync': {zh: '重试同步', en: 'Retry Sync'},

    'history.loadingTitle': {zh: '正在读取 {name} 的作战命令记录', en: 'Loading {name} tactical order history'},
    'history.title': {zh: '{name} · 最佳记录 WAVE {wave}', en: '{name} · BEST RECORD: WAVE {wave}'},
    'history.loading': {zh: '正在读取…', en: 'Loading…'},
    'history.empty': {zh: '该次行动没有保存作战命令。', en: 'No tactical orders were archived for this operation.'},
    'history.failed': {zh: '作战命令记录暂时不可用。', en: 'Tactical order history is unavailable.'},
    'history.close': {zh: '关闭', en: 'Close'},
    'history.open': {zh: '查看 {name} 最佳行动的作战命令', en: 'View tactical orders from {name}\'s best operation'},
    'history.version': {zh: '命令版本 {version}', en: 'Order Version {version}'},
    'history.fromWave': {zh: 'WAVE {wave} 起执行', en: 'Effective from WAVE {wave}'},

    'gate.welcome': {zh: '公安九课 // RESTRICTED ACCESS', en: 'SECTION 9 // RESTRICTED ACCESS'},
    'gate.prompt': {zh: 'IDENTIFICATION REQUIRED — 输入你的作战代号。', en: 'IDENTIFICATION REQUIRED — Enter your operator codename.'},
    'gate.placeholder': {zh: '作战代号', en: 'CODENAME'},
    'gate.continue': {zh: '接入系统', en: 'ACCESS SYSTEM'},
    'gate.invalid': {zh: 'INVALID CODENAME — 请输入 1–16 个有效字符。', en: 'INVALID CODENAME — Use 1–16 valid characters.'},

    'agent.stateReadFailed': {zh: '战场状态读取失败，本轮无法进行战术判断。', en: 'Battlefield state unavailable; tactical decision skipped.'},
    'agent.noStrategy': {zh: '未收到作战命令，塔奇克马本波保持当前部署。', en: 'No tactical order received; Tachikomas will maintain current deployment.'},
    'agent.timeout': {zh: '战术网络在 {ms}ms 内未响应，本波维持当前命令。', en: 'Tactical network timed out after {ms}ms; maintaining current orders.'},
    'agent.unreachable': {zh: '无法连接战术网络，本波维持当前命令。', en: 'Tactical network unreachable; maintaining current orders.'},
    'agent.httpError': {zh: '战术网络返回 HTTP {status}，本波维持当前命令。', en: 'Tactical network returned HTTP {status}; maintaining current orders.'},
    'agent.unreadable': {zh: '收到无法解析的战术响应。', en: 'Received an unreadable tactical response.'},
    'agent.rejected': {zh: '本次战术请求被系统拒绝。', en: 'Tactical request rejected.'},
    'agent.unknownAction': {zh: '忽略未知战术动作「{name}」。', en: 'Ignored unknown tactical action "{name}".'},

    'action.unknownType': {zh: '未知机体类型「{type}」。可用类型：{types}。', en: 'Unknown unit type "{type}". Available types: {types}.'},
    'action.invalidCoords': {zh: '部署坐标必须为整数，收到 ({i}, {j})。', en: 'Deployment coordinates must be integers, got ({i}, {j}).'},
    'action.outOfBounds': {zh: '坐标 ({i}, {j}) 超出 {w}×{h} 作战区域。', en: 'Coordinates ({i}, {j}) are outside the {w}x{h} operation area.'},
    'action.typeUnavailable': {zh: '当前行动无法部署「{type}」机体。', en: 'Unit type "{type}" is unavailable in this operation.'},
    'action.cellOccupied': {zh: '坐标 ({i}, {j}) 已有机体部署。', en: 'A unit is already deployed at ({i}, {j}).'},
    'action.blocksPath': {zh: '部署至 ({i}, {j}) 将阻断攻击路线。部署驳回。', en: 'Deployment at ({i}, {j}) would obstruct an attack route. Request denied.'},
    'action.cellUnbuildable': {zh: '坐标 ({i}, {j}) 不符合部署条件（{error}）。', en: 'Position ({i}, {j}) is unsuitable for deployment ({error}).'},
    'action.insufficientBuild': {zh: '部署 {type} 需要 {cost} 战术资源，当前仅剩 {cash}。', en: 'Deploying {type} requires {cost} resources; {cash} available.'},
    'action.built': {zh: '{type} 已部署至 ({i}, {j})，消耗 {cost} 战术资源。', en: '{type} deployed at ({i}, {j}); {cost} resources consumed.'},
    'action.badTowerId': {zh: '机体 ID「{id}」无效，应为 "i:j"。', en: 'Invalid unit ID "{id}". Expected "i:j".'},
    'action.noTower': {zh: '坐标 ({i}, {j}) 未检测到己方机体。', en: 'No friendly unit detected at ({i}, {j}).'},
    'action.maxLevel': {zh: '机体 {id} 已达到最高强化等级 {level}。', en: 'Unit {id} has reached maximum enhancement level {level}.'},
    'action.insufficientUpgrade': {zh: '强化机体 {id} 需要 {cost} 战术资源，当前仅剩 {cash}。', en: 'Enhancing unit {id} requires {cost} resources; {cash} available.'},
    'action.upgradeFailed': {zh: '机体 {id} 强化请求被系统拒绝。', en: 'Enhancement request for unit {id} was rejected.'},
    'action.upgraded': {zh: '机体 {id} 已强化至 LEVEL {level}，消耗 {cost} 战术资源。', en: 'Unit {id} enhanced to LEVEL {level}; {cost} resources consumed.'},

    'strategy.example1': {zh: '优先保护核心区域，在保护目标周围部署 Canon 机体，优先强化最接近核心的单位。', en: 'Protect the core area. Deploy Canon units around the protected target and enhance the closest units first.'},
    'strategy.example2': {zh: '沿全部攻击路线建立连续火力覆盖，优先部署 Gatling，让敌方单位持续暴露在压制火力下。', en: 'Establish continuous fire coverage along all attack routes. Prefer Gatling units for sustained suppression.'},
    'strategy.example3': {zh: '优先进行迟滞作战：在长直攻击路线部署 Slower，在转向节点补充火力机体。', en: 'Prioritize delay tactics: deploy Slower units on long approaches and damage units at turning points.'},
    'strategy.example4': {zh: '前期保存战术资源，随后沿攻击路线部署 Sniper，在敌方接近保护目标前进行远距离清除。', en: 'Conserve resources early, then deploy Sniper units to eliminate hostiles before they reach the protected target.'},
    'strategy.example5': {zh: '在敌军容易集结的转向节点部署 Gatling，优先强化现有机体，再考虑扩大部署。', en: 'Deploy Gatling units at choke points where hostiles concentrate. Enhance existing units before expanding deployment.'},
    'strategy.example6': {zh: '始终保留至少 50 战术资源，其余资源用于强化保护目标附近的低成本火力。', en: 'Maintain a reserve of at least 50 resources. Use the remainder on low-cost firepower near the protected target.'},
    'strategy.example7': {zh: '确保每条攻击路线都有火力覆盖，不允许任何方向完全失守。', en: 'Maintain fire coverage on every attack route. Do not leave any approach undefended.'},
    'strategy.example8': {zh: '将战术资源集中于地图中央，在中央火力区持续部署和强化，暂时放弃外围阵地。', en: 'Concentrate tactical resources in the center. Build and enhance the central fire zone while temporarily yielding outer positions.'},
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
