/**
 * UI language (zh / en) with a toggle.
 *
 * Every user-visible string goes through `t(key)`. Static markup carries
 * `data-i18n` attributes and is filled by `applyStaticTranslations`; dynamic
 * text is re-rendered by components that subscribe to `onLangChange`.
 *
 * Deliberately free of top-level DOM access so it can be exercised from tests.
 *
 * The product is branded "Prompt Defense" — a prompt-driven AI tower defense.
 * The skin is a minimalist neutral theme inspired by the upstream inert project
 * (CorentinTh/inert). It contains no third-party IP: units are generic defense
 * towers, the protected target is "the core", and operators pick from a set of
 * neutral geometric avatars.
 */

export type Lang = 'zh' | 'en';

const STORAGE_KEY = 'promptDefense.lang';

interface Entry {
    zh: string;
    en: string;
}

const STRINGS: { [key: string]: Entry } = {
    'app.title': {zh: '天机阵 — Prompt Defense', en: 'Prompt Defense — AI Tower Defense'},
    'app.name': {zh: '天机阵', en: 'Prompt Defense'},
    'header.subtitle': {zh: 'Prompt 驱动 · AI 塔防', en: 'PROMPT-DRIVEN · AI TOWER DEFENSE'},

    // Shell / battlefield UI (previously hardcoded in index.html).
    'shell.eyebrow': {zh: '指挥控制台', en: 'COMMAND CONSOLE'},
    'aria.waveProgress': {zh: '波次进度', en: 'Wave progress'},
    'towers.heading': {zh: '我方塔位', en: 'DEFENSE TOWERS'},
    'console.eyebrow': {zh: '指挥网络', en: 'COMMAND NETWORK'},
    'console.heading': {zh: '战术命令终端', en: 'TACTICAL ORDER TERMINAL'},
    'settings.title': {zh: '系统设置', en: 'SYSTEM CONFIG'},
    'settings.spawnerNote': {zh: '修改攻击路线数量将重新开始当前行动。', en: 'Changing the number of attack routes will restart the current operation.'},
    'controls.hint': {zh: '双击战场重新打开作战终端。', en: 'Double-click the battlefield to reopen the command terminal.'},

    // Accessible names / tooltips (previously hardcoded in index.html).
    'aria.battlefield': {zh: '战术防御区域。双击打开作战终端。', en: 'Tactical defense area. Double-click to open the command terminal.'},
    'aria.battlefieldControls': {zh: '战场控制', en: 'Battlefield controls'},
    'aria.battlefieldStatus': {zh: '战场状态', en: 'Battlefield status'},
    'aria.deployableUnits': {zh: '可部署防御塔', en: 'Deployable defense towers'},
    'controls.panelToggle': {zh: '控制面板', en: 'CONTROLS'},
    'aria.gameControls': {zh: '作战控制', en: 'Operation controls'},
    'aria.githubRepository': {zh: 'GitHub 源代码仓库', en: 'GitHub source repository'},

    'label.wave': {zh: '防御波次', en: 'Wave'},
    'label.state': {zh: '作战状态', en: 'Phase'},
    'label.cash': {zh: '战术资源', en: 'Tactical Credit'},
    'label.spawners': {zh: '攻击路线：', en: 'Attack Routes:'},

    'strategy.label': {zh: '作战命令', en: 'Tactical Order'},
    'strategy.placeholder': {zh: '用自然语言向防御单位下达作战指令…', en: 'Issue a natural-language order to your defense units…'},
    'strategy.apply': {zh: '更新命令', en: 'Update Order'},
    'strategy.random': {zh: '参谋模板', en: 'Tactical Template'},
    'strategy.start': {zh: '下达命令并开始行动', en: 'Issue Order & Deploy'},
    'strategy.writeBeforeStart': {zh: '行动开始前必须下达作战命令。', en: 'Issue a tactical order before deployment.'},
    'strategy.writeBeforeApply': {zh: '请输入新的作战命令。', en: 'Enter a new tactical order.'},
    'strategy.hintEmpty': {zh: '等待作战命令。也可以载入「参谋模板」。', en: 'Awaiting tactical order. You may also load a Tactical Template.'},
    'strategy.notStarted': {zh: 'STANDBY — 防御单位等待首次作战命令。', en: 'STANDBY — Defense units awaiting initial tactical order.'},
    'strategy.queued': {zh: 'ORDER RECEIVED · 第 {wave} 波执行', en: 'ORDER RECEIVED · Effective wave {wave}'},
    'strategy.active': {zh: 'EXECUTING ORDER · 第 {wave} 波起', en: 'EXECUTING ORDER · Active from wave {wave}'},
    'strategy.tooLong': {zh: '命令 {length} 个字符，超过终端上限 {max}。', en: 'Order is {length} characters; terminal limit is {max}.'},

    'reasoning.title': {zh: 'AI 决策终端', en: 'AI DECISION TERMINAL'},
    'reasoning.status.waiting': {zh: '等待分析', en: 'AWAITING ANALYSIS'},
    'reasoning.status.planning': {zh: '战术分析中', en: 'ANALYZING BATTLEFIELD'},
    'reasoning.status.ready': {zh: '本轮决策摘要', en: 'WAVE DECISION SUMMARY'},
    'reasoning.status.unavailable': {zh: '摘要不可用', en: 'SUMMARY UNAVAILABLE'},
    'reasoning.summaryUnavailable': {zh: '本轮暂无战术研判', en: 'No tactical assessment available this wave'},
    'reasoning.empty': {zh: '等待 AI 对下一波做出决策…', en: 'Awaiting the next tactical decision…'},
    'reasoning.plan.build': {zh: '本轮计划在 ({i}, {j}) 部署 {type}。', en: 'Plan to deploy {type} at ({i}, {j}) this wave.'},
    'reasoning.plan.upgrade': {zh: '本轮计划升级坐标 {id} 的防御塔。', en: 'Plan to upgrade the tower at {id} this wave.'},
    'reasoning.plan.item': {zh: '本轮计划使用 {item}。', en: 'Plan to use {item} this wave.'},
    'reasoning.plan.more': {zh: '另有 {count} 项操作。', en: 'Plus {count} more action(s).'},
    'reasoning.plan.generic': {zh: '模型提交了 {count} 项操作，结果见下方执行日志。', en: 'The model submitted {count} action(s); see the execution log below.'},
    'reasoning.item.naturalOil': {zh: '天然机油', en: 'Natural Oil'},
    'decisions.label': {zh: '执行日志', en: 'EXECUTION LOG'},
    'decisions.empty': {zh: '等待 AI 自主判断。', en: 'Awaiting AI decisions.'},
    'decision.entry': {zh: 'WAVE {wave} · {action} // {detail}{message}', en: 'WAVE {wave} · {action} // {detail}{message}'},

    'mode.button': {zh: '切换指挥模式', en: 'Switch Command Mode'},
    'mode.toHuman': {zh: '接管现场部署', en: 'Assume Manual Control'},
    'mode.toAi': {zh: '移交 AI 自主指挥', en: 'Transfer to AI Control'},
    'mode.toHumanTitle': {zh: '重新部署并由玩家直接接管', en: 'Restart and assume direct tactical control'},
    'mode.toAiTitle': {zh: '重新部署并交由 AI 自主行动', en: 'Restart under autonomous AI control'},

    'control.pause': {zh: '暂停演算', en: 'Suspend'},
    'control.resume': {zh: '恢复演算', en: 'Resume'},
    'control.restart': {zh: '重新部署', en: 'Redeploy'},
    'control.lang': {zh: 'EN', en: '中文'},
    'control.langTitle': {zh: '切换语言（中 / EN）', en: 'Switch language (EN / 中文)'},
    'control.audio': {zh: '音效开', en: 'Sound On'},
    'control.audioMuted': {zh: '音效关', en: 'Sound Off'},

    // 状态框保持设计稿的「主值大字 + 副行小字」双语排布，但主值随界面语言：
    // 作战状态只显示当前界面语言的文案（中文界面中文、英文界面英文）。
    // 文案必须短——EN 最长 PLANNING（8 字符）、zh 最长战术分析中（5 个全角字符），
    // 才能在 1/3 卡宽内不截断地放下。
    'state.idle': {zh: '待机', en: 'STANDBY'},
    'state.running': {zh: '行动中', en: 'ACTION'},
    'state.paused': {zh: '已暂停', en: 'PAUSED'},
    'state.planning': {zh: '战术分析中', en: 'PLANNING'},

    'speed.label': {zh: '演算速度 x{speed}', en: 'Simulation x{speed}'},


    'item.evomap.name': {zh: '全域轨道打击', en: 'Orbital Strike'},
    'item.tripo.name': {zh: '火力重构', en: 'Firepower Reconfiguration'},
    'item.seeed.name': {zh: '天然机油', en: 'Natural Oil'},
    'item.hypershell.name': {zh: '应急修复', en: 'Emergency Repair'},
    'item.free': {zh: '免费', en: 'FREE'},
    'item.cost': {zh: '{cost} ¢', en: '{cost} ¢'},
    'item.waiting': {zh: '待机', en: 'WAITING'},
    'item.ready': {zh: '可使用', en: 'READY'},
    'item.active': {zh: '生效 {seconds}s', en: 'ACTIVE {seconds}s'},
    'item.cooldown': {zh: '冷却 {seconds}s', en: 'CD {seconds}s'},
    'item.insufficient': {zh: '资源不足', en: 'NO FUNDS'},
    'item.used': {zh: '{name} 已启用', en: '{name} activated'},
    'item.failure.NOT_RUNNING': {zh: '仅运行时可使用', en: 'Available while running'},
    'item.failure.ALREADY_ACTIVE': {zh: '道具正在生效', en: 'Item already active'},
    'item.failure.COOLDOWN': {zh: '道具仍在冷却', en: 'Item is cooling down'},
    'item.failure.INSUFFICIENT_FUNDS': {zh: '战术资源不足', en: 'Insufficient resources'},
    'item.failure.UNKNOWN_ITEM': {zh: '未知战术道具', en: 'Unknown tactical item'},

    'item.tripo.desc': {zh: '5 秒内所有防御塔火力提升至 300%（单发伤害 ×3）。冷却时间 10 秒。消耗 1000 战术资源。', en: 'Increases firepower of all towers to 300% (damage x3) for 5s. 10s cooldown. Costs 1000.'},
    'item.seeed.desc': {zh: '5 秒内所有防御塔攻击速度提升至 150%。冷却时间 10 秒。消耗 1000 战术资源。', en: 'Increases attack speed of all towers to 150% for 5s. 10s cooldown. Costs 1000.'},
    'item.evomap.desc': {zh: '对全图所有存活敌方单位造成当前生命值 2% 的伤害（至少 1 点）。前 2 次使用免费，随后 1000 战术资源/次。冷却时间 10 秒。', en: 'Deals 2% of current HP to all living enemies (min 1). First 2 uses free, then 1000 each. 10s cooldown.'},
    'item.hypershell.desc': {zh: '主基地恢复 25% 最大生命值（上限不超过最大值）。冷却时间 10 秒。消耗 1000 战术资源。', en: 'Repairs home base by 25% max HP (capped at max). 10s cooldown. Costs 1000.'},

    'result.gameOver': {zh: '防御终止', en: 'DEFENSE TERMINATED'},
    'result.wave': {zh: '防御波次', en: 'Wave Reached'},
    'result.rank': {zh: '作战排名', en: 'Operation Rank'},
    'result.towers': {zh: '部署塔位', en: 'Towers Deployed'},
    'result.decisions': {zh: '自主判断次数', en: 'Autonomous Decisions'},
    'result.cash': {zh: '剩余战术资源', en: 'Resources Remaining'},
    'result.duration': {zh: '行动时长', en: 'Operation Time'},

    'footer.source': {zh: '源代码：', en: 'Source:'},
    'footer.madeBy': {zh: '底座基于', en: 'Base on'},

    'tower.cost': {zh: '部署资源：', en: 'Deployment Cost:'},
    'tower.aimRadius': {zh: '有效射程：', en: 'Effective Range:'},
    'tower.damage': {zh: '单次火力：', en: 'Damage:'},
    'tower.reload': {zh: '射击间隔：', en: 'Fire Interval:'},
    'tower.dps': {zh: '持续火力：', en: 'DPS:'},

    // Unit display names / descriptions. Display-only: the engine keeps the
    // protocol `name` / `description` fields untranslated for the AI snapshot.
    'tower.canon.name': {zh: '震雷符炮', en: 'Canon Tower'},
    'tower.canon.description': {zh: '标准火力塔。部署成本低，适合前期快速建立防线。', en: 'Standard fire-support tower. Low deployment cost, ideal for establishing an early defense.'},
    'tower.gatling.name': {zh: '千机剑匣', en: 'Gatling Tower'},
    'tower.gatling.description': {zh: '高速压制火力塔，以持续射击压制密集目标。', en: 'High-rate suppression tower designed for sustained fire against concentrated targets.'},
    'tower.slow.name': {zh: '寒玉阵眼', en: 'Slower Tower'},
    'tower.slow.description': {zh: '电子战支援塔，可迟滞敌方单位推进。', en: 'Electronic-warfare support tower capable of slowing hostile advances.'},
    'tower.sniper.name': {zh: '穿云神弩', en: 'Sniper Tower'},
    'tower.sniper.description': {zh: '远程精确火力塔。射程和单次火力极高，但射击间隔较长。', en: 'Long-range precision-fire tower. Exceptional range and damage, with a long firing interval.'},
    'tower.laser.name': {zh: '紫霄天镜', en: 'Laser Tower'},
    'tower.laser.description': {zh: '定向能火力塔。持续锁定同一目标时，输出会逐步提升。', en: 'Directed-energy tower whose output increases while maintaining lock on the same target.'},

    // Runtime-composed unit strings (previously hardcoded in InterfaceManager).
    'tower.cardAria': {zh: '{name}，部署需要 {cost} 战术资源', en: '{name}, deployment cost {cost} resources'},
    'tower.cardPlaceTitle': {zh: '{name} · {cost} 战术资源 · 点击部署', en: '{name} · {cost} resources · click to deploy'},
    'tower.cardDetailsTitle': {zh: '{name} · {cost} 战术资源 · 点击查看战术参数', en: '{name} · {cost} resources · click to view tactical specifications'},
    'tower.upgrade.heading': {zh: '塔位强化', en: 'TOWER ENHANCEMENT'},
    'tower.upgrade.hint': {zh: '点击战场中的己方塔位查看实时参数', en: 'Select a friendly tower on the battlefield to inspect live stats.'},
    'tower.upgrade.level': {zh: '等级', en: 'LEVEL'},
    'tower.upgrade.cost': {zh: '强化费用', en: 'UPGRADE COST'},
    'tower.upgrade.button': {zh: '强化塔位', en: 'UPGRADE TOWER'},
    'tower.upgrade.insufficient': {zh: '资源不足', en: 'NO FUNDS'},
    'tower.upgrade.max': {zh: '已达最高等级', en: 'MAX LEVEL'},
    'tower.upgrade.reload': {zh: '装填', en: 'RELOAD'},
    'tower.dpsTitle': {zh: '每秒持续火力', en: 'Damage Per Second'},
    'tower.summary': {zh: '{name} × {count}', en: '{name} × {count}'},

    'lb.boardAi': {zh: 'AI 榜', en: 'AI'},
    'lb.boardHuman': {zh: '人类榜', en: 'Human'},
    'lb.boardTotal': {zh: '混合榜', en: 'Mixed'},
    'lb.modeAi': {zh: 'AI', en: 'AI'},
    'lb.modeHuman': {zh: '人类', en: 'Human'},

    'snackbar.noMoney': {zh: '战术资源不足，无法部署该塔位。', en: 'Insufficient tactical resources to deploy this tower.'},

    'lb.title': {zh: '作战记录', en: 'OPERATION RECORDS'},
    'lb.empty': {zh: '暂无作战记录。', en: 'No operation records.'},
    'lb.wave': {zh: 'WAVE {wave}', en: 'WAVE {wave}'},
    'lb.shared': {zh: '共享网络', en: 'SHARED NETWORK'},
    'lb.offline': {zh: '离线 · 本地档案', en: 'OFFLINE · LOCAL ARCHIVE'},
    'lb.you': {zh: '指挥官：{name}', en: 'OPERATOR: {name}'},
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

    // 战术工作站位壳层：Header / 地图框 / 三栏面板 / 数据库。
    'map.live': {zh: 'LIVE', en: 'LIVE'},
    'map.sector': {zh: '防御扇区 A', en: 'SECTOR A'},
    'map.layer': {zh: '网格层 GRID_3', en: 'GRID LAYER: GRID_3'},
    'map.intrusion': {zh: '入侵检测 — 防御网络接入中', en: 'INTRUSION DETECTED — DEFENSE NETWORK ENGAGING'},
    'map.liveBar': {zh: '战术地图 // 实况', en: 'TACTICAL MAP // LIVE'},
    'map.waveTag': {zh: '波次 {wave}', en: 'WAVE {wave}'},
    'neural.title': {zh: '指挥链路', en: 'COMMAND LINK'},
    'items.title': {zh: '支援道具', en: 'BATTLE ITEMS'},
    'database.title': {zh: '战力数据库', en: 'COMBAT DATABASE'},
    'database.tabHostile': {zh: '敌方情报', en: 'ENEMY INTELLIGENCE'},
    'database.waveTag': {zh: '第 {wave} 波 · 实时数值', en: 'WAVE {wave} · LIVE STATS'},
    'enemy.stat.hp': {zh: '生命', en: 'HP'},
    'enemy.stat.speed': {zh: '速度', en: 'SPD'},
    'enemy.stat.cash': {zh: '赏金', en: 'BOUNTY'},
    'tower.stat.cost': {zh: '费用', en: 'COST'},
    'tower.stat.dmg': {zh: '伤害', en: 'DMG'},
    'tower.stat.rate': {zh: '射速', en: 'RATE'},
    'tower.stat.range': {zh: '射程', en: 'RANGE'},
    'tower.rateContinuous': {zh: '持续', en: 'CONT.'},
    'enemy.simple.name': {zh: '铜甲傀儡', en: 'GRUNT'},
    'enemy.simple.desc': {zh: '数量最多的基础敌性单位，成群涌向核心。', en: 'The most common hostile; swarms the core in numbers.'},
    'enemy.fast.name': {zh: '赤羽飞梭', en: 'RUNNER'},
    'enemy.fast.desc': {zh: '高速突进型，行动最快，需要提前拦截。', en: 'Fastest mover on the field; intercept it early.'},
    'enemy.armored.name': {zh: '玄武重卫', en: 'ARMORED'},
    'enemy.armored.desc': {zh: '重装甲单位，需要集中火力击穿。', en: 'Heavy armor; concentrate fire to break through.'},
    'enemy.healer.name': {zh: '续灵灯使', en: 'REPAIRER'},
    'enemy.healer.desc': {zh: '修复周围敌方单位，应当优先排除。', en: 'Repairs nearby hostiles; neutralize it first.'},
    'enemy.boss.name': {zh: '噬阵饕餮', en: 'SUPPRESSOR'},
    'enemy.boss.desc': {zh: '高耐久压制单位，突破后威胁最大。', en: 'High-durability suppressor; the gravest threat.'},

    // 登录浮窗：文案区分中英文；标题/眉标复用 app.name、header.subtitle、shell.eyebrow 既有 key。
    'gate.systemOnline': {zh: '系统 // 在线', en: 'SYSTEM // ONLINE'},
    'gate.identTitle': {zh: '指挥官识别', en: 'OPERATOR IDENTIFICATION'},
    'gate.ident': {zh: '选择你的作战档案，接入指挥网络。', en: 'Enter your operator profile to access the command network.'},
    'gate.profileTitle': {zh: '01 // 选择头像', en: '01 // OPERATOR PROFILE'},
    'gate.codenameTitle': {zh: '02 // 作战代号', en: '02 // CODENAME'},
    'gate.placeholder': {zh: '输入你的作战代号', en: 'ENTER YOUR CODENAME'},
    'gate.random': {zh: '随机档案', en: 'RANDOM PROFILE'},
    'gate.continue': {zh: '接入系统', en: 'ACCESS'},
    'gate.langToggle': {zh: 'EN', en: '中文'},
    'gate.footerLeft': {zh: '天机阵', en: 'PROMPT DEFENSE'},
    'gate.footerRight': {zh: '指挥链路 // 待机', en: 'COMMAND LINK // STANDBY'},
    'gate.invalid': {zh: '代号无效 — 请输入 1–16 个有效字符。', en: 'INVALID CODENAME — Use 1–16 valid characters.'},
    'gate.avatar.sentinel': {zh: '观星', en: 'GUANXING'},
    'gate.avatar.vector': {zh: '司阵', en: 'SIZHEN'},
    'gate.avatar.nexus': {zh: '铸甲', en: 'ZHUJIA'},
    'gate.avatar.orbit': {zh: '飞羽', en: 'FEIYU'},
    'gate.avatar.prism': {zh: '丹青', en: 'DANQING'},
    'gate.avatar.cipher': {zh: '照夜', en: 'ZHAOYE'},
    'gate.avatar.atlas': {zh: '紫微', en: 'ZIWEI'},
    'gate.avatar.helix': {zh: '灵枢', en: 'LINGSHU'},

    // 开发模式（人工 QA）：扳手入口、解锁面板、不计榜提示。
    'dev.wrenchLabel': {zh: '开发模式入口', en: 'Developer mode access'},
    'dev.wrenchTitle': {zh: '开发模式（不计榜）', en: 'Developer mode (unranked)'},
    'dev.title': {zh: '开发模式', en: 'DEVELOPER MODE'},
    'dev.unranked': {zh: '开发模式 · 不计入排行榜', en: 'DEVELOPER MODE · NOT RANKED'},
    'dev.lockedIntro': {zh: '输入开发密码以启用开发模式。开发对局不会进入共享或本地排行榜。', en: 'Enter the developer passphrase to enable developer mode. Developer runs never enter the shared or local leaderboard.'},
    'dev.passwordLabel': {zh: '开发密码', en: 'Developer passphrase'},
    'dev.passwordPlaceholder': {zh: '输入开发密码', en: 'Enter developer passphrase'},
    'dev.unlock': {zh: '解锁', en: 'Unlock'},
    'dev.confirm': {zh: '确认', en: 'Confirm'},
    'dev.cancel': {zh: '关闭', en: 'Close'},
    'dev.humanOnly': {zh: '开发模式仅在 AI 指挥模式下可用。人类模式确认档案后会立即开始计榜对局，无法在开局前设置开发参数。请切换到 AI 模式后再试。', en: 'Developer mode is available in AI mode only. Human mode starts a ranked run immediately after profile confirmation, so dev parameters cannot be set before the run begins. Switch to AI mode first.'},
    'dev.unlockedIntro': {zh: '已解锁。在开局前设置起始波次与战术资源，随后按正常流程下达作战命令并开始行动。', en: 'Unlocked. Set the starting wave and tactical resources before deployment, then issue your order and deploy as usual.'},
    'dev.startWaveLabel': {zh: '起始波次', en: 'Starting Wave'},
    'dev.startCashLabel': {zh: '起始战术资源', en: 'Starting Resources'},
    'dev.lockedAfterStart': {zh: '对局进行中，开发参数已锁定。', en: 'Run in progress — dev parameters are locked.'},
    'dev.invalidWave': {zh: '波次须为 1–9999 的整数。', en: 'Wave must be an integer from 1 to 9999.'},
    'dev.invalidCash': {zh: '战术资源须为 0–1000000000 的整数。', en: 'Resources must be an integer from 0 to 1,000,000,000.'},
    'dev.error.NO_SESSION': {zh: '请先确认作战档案。', en: 'Confirm your operator profile first.'},
    'dev.error.INVALID_PASSWORD': {zh: '密码错误。', en: 'Incorrect passphrase.'},
    'dev.error.DEV_MODE_UNAVAILABLE': {zh: '服务端未配置开发模式，入口不可用。', en: 'Developer mode is not configured on the server; access is closed.'},
    'dev.error.INVALID_SESSION': {zh: '会话失效，请刷新页面后重试。', en: 'Session invalid; refresh the page and try again.'},
    'dev.error.RUN_ALREADY_STARTED': {zh: '当前会话已开局，不能再切为开发模式。', en: 'A ranked run has already started for this session.'},
    'dev.error.NETWORK_ERROR': {zh: '网络错误，无法连接服务端。', en: 'Network error; could not reach the server.'},
    'dev.error.UNKNOWN': {zh: '解锁失败，请稍后重试。', en: 'Unlock failed; please try again.'},
    'dev.banner': {zh: '开发模式已启用 · 不计入排行榜', en: 'DEVELOPER MODE ENABLED · NOT RANKED'},

    'agent.stateReadFailed': {zh: '战场状态读取失败，本轮无法进行战术判断。', en: 'Battlefield state unavailable; tactical decision skipped.'},
    'agent.noStrategy': {zh: '未收到作战命令，防御单位本波保持当前部署。', en: 'No tactical order received; defense units will maintain current deployment.'},
    'agent.timeout': {zh: '指挥网络在 {ms}ms 内未响应，本波维持当前命令。', en: 'Command network timed out after {ms}ms; maintaining current orders.'},
    'agent.unreachable': {zh: '无法连接指挥网络，本波维持当前命令。', en: 'Command network unreachable; maintaining current orders.'},
    'agent.httpError': {zh: '指挥网络返回 HTTP {status}，本波维持当前命令。', en: 'Command network returned HTTP {status}; maintaining current orders.'},
    'agent.unreadable': {zh: '收到无法解析的战术响应。', en: 'Received an unreadable tactical response.'},
    'agent.rejected': {zh: '本次战术请求被系统拒绝。', en: 'Tactical request rejected.'},
    'agent.unknownAction': {zh: '忽略未知战术动作「{name}」。', en: 'Ignored unknown tactical action "{name}".'},

    'action.unknownType': {zh: '未知塔类型「{type}」。可用类型：{types}。', en: 'Unknown tower type "{type}". Available types: {types}.'},
    'action.invalidCoords': {zh: '部署坐标必须为整数，收到 ({i}, {j})。', en: 'Deployment coordinates must be integers, got ({i}, {j}).'},
    'action.outOfBounds': {zh: '坐标 ({i}, {j}) 超出 {w}×{h} 作战区域。', en: 'Coordinates ({i}, {j}) are outside the {w}x{h} operation area.'},
    'action.typeUnavailable': {zh: '当前行动无法部署「{type}」塔。', en: 'Tower type "{type}" is unavailable in this operation.'},
    'action.cellOccupied': {zh: '坐标 ({i}, {j}) 已有塔位部署。', en: 'A tower is already deployed at ({i}, {j}).'},
    'action.blocksPath': {zh: '部署至 ({i}, {j}) 将阻断攻击路线。部署驳回。', en: 'Deployment at ({i}, {j}) would obstruct an attack route. Request denied.'},
    'action.cellUnbuildable': {zh: '坐标 ({i}, {j}) 不符合部署条件（{error}）。', en: 'Position ({i}, {j}) is unsuitable for deployment ({error}).'},
    'action.insufficientBuild': {zh: '部署 {type} 需要 {cost} 战术资源，当前仅剩 {cash}。', en: 'Deploying {type} requires {cost} resources; {cash} available.'},
    'action.built': {zh: '{type} 已部署至 ({i}, {j})，消耗 {cost} 战术资源。', en: '{type} deployed at ({i}, {j}); {cost} resources consumed.'},
    'action.badTowerId': {zh: '塔位 ID「{id}」无效，应为 "i:j"。', en: 'Invalid tower ID "{id}". Expected "i:j".'},
    'action.noTower': {zh: '坐标 ({i}, {j}) 未检测到己方塔位。', en: 'No friendly tower detected at ({i}, {j}).'},
    'action.maxLevel': {zh: '塔位 {id} 已达到最高强化等级 {level}。', en: 'Tower {id} has reached maximum enhancement level {level}.'},
    'action.insufficientUpgrade': {zh: '强化塔位 {id} 需要 {cost} 战术资源，当前仅剩 {cash}。', en: 'Enhancing tower {id} requires {cost} resources; {cash} available.'},
    'action.upgradeFailed': {zh: '塔位 {id} 强化请求被系统拒绝。', en: 'Enhancement request for tower {id} was rejected.'},
    'action.upgraded': {zh: '塔位 {id} 已强化至 LEVEL {level}，消耗 {cost} 战术资源。', en: 'Tower {id} enhanced to LEVEL {level}; {cost} resources consumed.'},
    'action.unknownItem': {zh: '未知战术道具「{item}」。', en: 'Unknown tactical item "{item}".'},
    'action.usedItem': {zh: '已使用战术道具「{item}」。', en: 'Used tactical item "{item}".'},
    'action.itemQueued': {zh: '已排队：将在本波首批敌人出现后尝试使用「{item}」。', en: 'Queued: "{item}" will be attempted after this wave’s first enemies spawn.'},
    'action.itemCooldown': {zh: '战术道具「{item}」正在冷却中。', en: 'Tactical item "{item}" is on cooldown.'},
    'action.itemAlreadyActive': {zh: '战术道具「{item}」正在生效中。', en: 'Tactical item "{item}" is already active.'},
    'action.insufficientItem': {zh: '使用「{item}」需要 {cost} 战术资源，当前仅剩 {cash}。', en: 'Using "{item}" requires {cost} resources; {cash} available.'},
    'action.itemFailed': {zh: '使用「{item}」失败（{error}）。', en: 'Failed to use "{item}" ({error}).'},

    'strategy.example1': {zh: '优先保护核心区域，在保护目标周围部署 Canon 塔，优先强化最接近核心的单位。', en: 'Protect the core area. Deploy Canon towers around the protected target and enhance the closest towers first.'},
    'strategy.example2': {zh: '沿全部攻击路线建立连续火力覆盖，优先部署 Gatling，让敌方单位持续暴露在压制火力下。', en: 'Establish continuous fire coverage along all attack routes. Prefer Gatling towers for sustained suppression.'},
    'strategy.example3': {zh: '优先进行迟滞作战：在长直攻击路线部署 Slower，在转向节点补充火力塔。', en: 'Prioritize delay tactics: deploy Slower towers on long approaches and damage towers at turning points.'},
    'strategy.example4': {zh: '前期保存战术资源，随后沿攻击路线部署 Sniper，在敌方接近保护目标前进行远距离清除。', en: 'Conserve resources early, then deploy Sniper towers to eliminate hostiles before they reach the protected target.'},
    'strategy.example5': {zh: '在敌军容易集结的转向节点部署 Gatling，优先强化现有塔位，再考虑扩大部署。', en: 'Deploy Gatling towers at choke points where hostiles concentrate. Enhance existing towers before expanding deployment.'},
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
