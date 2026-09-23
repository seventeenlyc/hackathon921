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
    'app.name': {zh: '保护笑脸男', en: 'PROTECT AOI'},
    'header.subtitle': {zh: '公安九课 · 塔奇克马防御协议', en: 'SECTION 9 · TACHIKOMA DEFENSE PROTOCOL'},

    // Shell / battlefield UI (previously hardcoded in index.html).
    'shell.eyebrow': {zh: '公安九课 // 战术网络', en: 'SECTION 9 // TACTICAL NETWORK'},
    'towers.heading': {zh: '塔奇克马部署', en: 'TACHIKOMA UNITS'},
    'towers.selectHint': {zh: '选择塔奇克马机体以查看战术参数。', en: 'Select a Tachikoma unit to view tactical specifications.'},
    'console.eyebrow': {zh: '塔奇克马指挥网络', en: 'TACHIKOMA COMMAND NETWORK'},
    'console.heading': {zh: '战术命令终端', en: 'TACTICAL ORDER TERMINAL'},
    'settings.title': {zh: '系统设置', en: 'SYSTEM CONFIG'},
    'settings.spawnerNote': {zh: '修改攻击路线数量将重新开始当前行动。', en: 'Changing the number of attack routes will restart the current operation.'},
    'controls.hint': {zh: '双击战场重新打开作战终端。', en: 'Double-click the battlefield to reopen the command terminal.'},

    // Accessible names / tooltips (previously hardcoded in index.html).
    'aria.battlefield': {zh: '塔奇克马战术防御区域。双击打开作战终端。', en: 'Tachikoma tactical defense area. Double-click to open the command terminal.'},
    'aria.battlefieldControls': {zh: '战场控制', en: 'Battlefield controls'},
    'aria.battlefieldStatus': {zh: '战场状态', en: 'Battlefield status'},
    'aria.deployableUnits': {zh: '可部署塔奇克马机体', en: 'Deployable Tachikoma units'},
    'aria.hideControls': {zh: '隐藏作战终端', en: 'Hide command terminal'},
    'title.hideControls': {zh: '隐藏终端', en: 'Hide terminal'},
    'aria.gameControls': {zh: '作战控制', en: 'Operation controls'},
    'aria.githubRepository': {zh: 'GitHub 源代码仓库', en: 'GitHub source repository'},

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

    'oil.label': {zh: '天然机油', en: 'Natural Oil'},
    'oil.button': {zh: '天然机油，花费 {cost} 金币，攻速提高 50% 持续 5 秒', en: 'Natural Oil, costs {cost} cash, increases attack speed by 50% for 5 seconds'},
    'oil.ready': {zh: '可使用 · 1000 ¢', en: 'Ready · 1000 ¢'},
    'oil.notRunning': {zh: '仅运行时可使用', en: 'Available while running'},
    'oil.active': {zh: '生效中 · 剩余 {seconds} 秒', en: 'Active · {seconds}s left'},
    'oil.cooldown': {zh: '冷却中 · 剩余 {seconds} 秒', en: 'Cooldown · {seconds}s left'},
    'oil.failure.NOT_RUNNING': {zh: '仅运行时可使用', en: 'Available while running'},
    'oil.failure.ALREADY_ACTIVE': {zh: '机油正在生效', en: 'Natural Oil is already active'},
    'oil.failure.COOLDOWN': {zh: '机油仍在冷却', en: 'Natural Oil is cooling down'},
    'oil.failure.INSUFFICIENT_FUNDS': {zh: '金币不足，需要 1000 ¢', en: 'Insufficient cash: 1000 ¢ required'},

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

    // Unit display names / descriptions. Display-only: the engine keeps the
    // protocol `name` / `description` fields untranslated for the AI snapshot.
    'tower.canon.name': {zh: 'Canon 塔奇克马', en: 'Canon Tachikoma'},
    'tower.canon.description': {zh: '标准火力机体。部署成本低，适合前期快速建立防线。', en: 'Standard fire-support unit. Low deployment cost, ideal for establishing an early defense.'},
    'tower.gatling.name': {zh: 'Gatling 塔奇克马', en: 'Gatling Tachikoma'},
    'tower.gatling.description': {zh: '高速压制火力机体，以持续射击压制密集目标。', en: 'High-rate suppression unit designed for sustained fire against concentrated hostiles.'},
    'tower.slow.name': {zh: 'Slower 塔奇克马', en: 'Slower Tachikoma'},
    'tower.slow.description': {zh: '电子战支援机体，可迟滞敌方单位推进。', en: 'Electronic-warfare support unit capable of slowing hostile advances.'},
    'tower.sniper.name': {zh: 'Sniper 塔奇克马', en: 'Sniper Tachikoma'},
    'tower.sniper.description': {zh: '远程精确火力机体。射程和单次火力极高，但射击间隔较长。', en: 'Long-range precision-fire unit. Exceptional range and damage, with a long firing interval.'},
    'tower.laser.name': {zh: 'Laser 塔奇克马', en: 'Laser Tachikoma'},
    'tower.laser.description': {zh: '定向能火力机体。持续锁定同一目标时，输出会逐步提升。', en: 'Directed-energy unit whose output increases while maintaining lock on the same target.'},

    // Runtime-composed unit strings (previously hardcoded in InterfaceManager).
    'tower.cardAria': {zh: '{name}，部署需要 {cost} 战术资源', en: '{name}, deployment cost {cost} resources'},
    'tower.cardPlaceTitle': {zh: '{name} · {cost} 战术资源 · 点击部署', en: '{name} · {cost} resources · click to deploy'},
    'tower.cardDetailsTitle': {zh: '{name} · {cost} 战术资源 · 点击查看战术参数', en: '{name} · {cost} resources · click to view tactical specifications'},
    'tower.dpsTitle': {zh: '每秒持续火力', en: 'Damage Per Second'},
    'tower.summary': {zh: '{name} × {count}', en: '{name} × {count}'},

    'lb.boardAi': {zh: 'AI 榜', en: 'AI'},
    'lb.boardHuman': {zh: '人类榜', en: 'Human'},
    'lb.boardTotal': {zh: '总榜', en: 'Total'},
    'lb.modeAi': {zh: 'AI', en: 'AI'},
    'lb.modeHuman': {zh: '人类', en: 'Human'},

    'snackbar.noMoney': {zh: '战术资源不足，无法部署该机体。', en: 'Insufficient tactical resources to deploy this unit.'},

    'lb.title': {zh: '作战记录', en: 'OPERATION RECORDS'},
    'lb.empty': {zh: '暂无作战记录。', en: 'No operation records.'},
    'lb.wave': {zh: 'WAVE {wave}', en: 'WAVE {wave}'},
    'lb.shared': {zh: '九课网络', en: 'SEC-9 NETWORK'},
    'lb.offline': {zh: '离线 · 本地档案', en: 'OFFLINE · LOCAL ARCHIVE'},
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

    // 战术工作站位壳层（issue #66）：Header / 地图框 / 三栏面板 / 数据库 / 威胁情报。
    'map.live': {zh: 'LIVE', en: 'LIVE'},
    'map.sector': {zh: '作战扇区 09-A', en: 'SECTOR 09-A'},
    'map.layer': {zh: '网络层 DEEP_3', en: 'NETWORK LAYER: DEEP_3'},
    'map.intrusion': {zh: '入侵检测 — 自律清除程序接入中', en: 'INTRUSION DETECTED — AUTONOMOUS SUPPRESSION NETWORK'},
    'map.liveBar': {zh: '战术地图 // 实况', en: 'TACTICAL MAP // LIVE'},
    'map.waveTag': {zh: '波次 {wave}', en: 'WAVE {wave}'},
    'threat.title': {zh: '敌性体情报', en: 'THREAT INFORMATION'},
    'threat.wave': {zh: '当前波次', en: 'CURRENT WAVE'},
    'threat.idle': {zh: '待机 — 未捕获敌性体信号', en: 'STANDBY — NO HOSTILE SIGNALS'},
    'neural.title': {zh: '神经链接', en: 'NEURAL LINK'},
    'items.title': {zh: '支援道具', en: 'BATTLE ITEMS'},
    'database.tabHostile': {zh: '敌性体', en: 'HOSTILE'},
    'enemy.simple.name': {zh: '傀儡型', en: 'PUPPET'},
    'enemy.simple.desc': {zh: '数量最多的基础敌性体，成群涌向核心。', en: 'The most common hostile; swarms the core in numbers.'},
    'enemy.fast.name': {zh: '猎袭型', en: 'HUNTER'},
    'enemy.fast.desc': {zh: '高速突进型，行动最快，需要提前拦截。', en: 'Fastest mover on the field; intercept it early.'},
    'enemy.armored.name': {zh: '装甲执行体', en: 'ENFORCER'},
    'enemy.armored.desc': {zh: '重装甲执行单位，需要集中火力击穿。', en: 'Heavy armor; concentrate fire to break through.'},
    'enemy.healer.name': {zh: '中继型', en: 'RELAY'},
    'enemy.healer.desc': {zh: '修复周围敌性体，应当优先排除。', en: 'Repairs nearby hostiles; neutralize it first.'},
    'enemy.boss.name': {zh: '压制体', en: 'SUPPRESSOR'},
    'enemy.boss.desc': {zh: '高耐久压制单位，突破后威胁最大。', en: 'High-durability suppressor; the gravest threat.'},

    // 登录浮窗：文案区分中英文；标题/眉标复用 app.name、header.subtitle、shell.eyebrow 既有 key。
    'gate.systemOnline': {zh: '系统 // 在线', en: 'SYSTEM // ONLINE'},
    'gate.identTitle': {zh: '作战人员识别', en: 'OPERATOR IDENTIFICATION'},
    'gate.ident': {zh: '选择你的作战档案，接入塔奇克马战术网络。', en: 'Enter your operator profile to access the Tachikoma Tactical Network.'},
    'gate.profileTitle': {zh: '01 // 选择头像', en: '01 // OPERATOR PROFILE'},
    'gate.codenameTitle': {zh: '02 // 作战代号', en: '02 // CODENAME'},
    'gate.placeholder': {zh: '输入你的作战代号', en: 'ENTER YOUR CODENAME'},
    'gate.random': {zh: '随机档案', en: 'RANDOM PROFILE'},
    'gate.continue': {zh: '接入系统', en: 'ACCESS'},
    'gate.langToggle': {zh: 'EN', en: '中文'},
    'gate.footerLeft': {zh: '公安九课', en: 'PUBLIC SECURITY SECTION 9'},
    'gate.footerRight': {zh: '塔奇克马链路 // 待机', en: 'TACHIKOMA LINK // STANDBY'},
    'gate.invalid': {zh: '代号无效 — 请输入 1–16 个有效字符。', en: 'INVALID CODENAME — Use 1–16 valid characters.'},
    'gate.avatar.aramaki': {zh: '课长', en: 'CHIEF'},
    'gate.avatar.kusanagi': {zh: '少校', en: 'MAJOR'},
    'gate.avatar.batou': {zh: '巴特', en: 'BATOU'},
    'gate.avatar.togusa': {zh: '托古萨', en: 'TOGUSA'},
    'gate.avatar.ishikawa': {zh: '石川', en: 'ISHIKAWA'},
    'gate.avatar.saito': {zh: '斉藤', en: 'SAITO'},
    'gate.avatar.paz': {zh: '帕兹', en: 'PAZ'},
    'gate.avatar.boma': {zh: '波马', en: 'BOMA'},

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
    'action.unknownItem': {zh: '未知战术道具「{item}」。', en: 'Unknown tactical item "{item}".'},
    'action.usedItem': {zh: '已使用战术道具「{item}」。', en: 'Used tactical item "{item}".'},
    'action.itemCooldown': {zh: '战术道具「{item}」正在冷却中。', en: 'Tactical item "{item}" is on cooldown.'},
    'action.itemAlreadyActive': {zh: '战术道具「{item}」正在生效中。', en: 'Tactical item "{item}" is already active.'},
    'action.insufficientItem': {zh: '使用「{item}」需要 {cost} 战术资源，当前仅剩 {cash}。', en: 'Using "{item}" requires {cost} resources; {cash} available.'},
    'action.itemFailed': {zh: '使用「{item}」失败（{error}）。', en: 'Failed to use "{item}" ({error}).'},

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
    root.querySelectorAll<HTMLElement>('[data-i18n-aria-label]').forEach(element => {
        element.setAttribute('aria-label', t(element.dataset.i18nAriaLabel!));
    });
    document.title = t('app.title');
}
