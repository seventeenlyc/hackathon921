# AI 决策闭环与战术反馈改造设计规范 (Design Spec)

## 一、 背景与动因

在接入真实 LLM Provider 进行实测时，发现现有 Agent 决策回路存在以下五项核心缺陷：
1. **“塔奇克马判断”重复报落点**：服务端直接拼接各动作工具参数中的 `decision_summary`；缺失时前端生成含坐标动作的文字，导致终端输出沦为机械的落点复述，掩盖了高层战略思考。
2. **输出语言不随界面切换**：请求未携带客户端当前语言，服务端系统提示词缺失语言约束，导致界面切成英文时判断文本仍为中文。
3. **禁放点反复尝试**：引擎拒绝（如 `BLOCKS_PATH`、`CELL_OCCUPIED`）仅打入日志，未反馈给模型，导致模型在相同无效坐标上反复尝试。
4. **外层布防偏保守**：系统提示词默认“保守/少量动作”，且候选格算法按靠近基地排序，导致模型倾向在基地内环扎堆，忽视玩家“前沿拦截”或“积极消费”指令。
5. **工具异常静默与误导**：未知工具被静默丢弃，参数解析失败被当成空对象，导致“通信/协议异常”被误导为“模型主动战术等待”。

## 二、 目标与非目标

### 目标
- **解耦意图与执行**：战局研判（`decision_summary`）仅体现宏观战况与策略取舍，绝不包含坐标数字；坐标与具体建造转移至战术执行日志。
- **双语联动**：请求携带经过校验的 `lang` (`zh` | `en`)，提示词严格约束输出语言，界面切换时即时刷新。
- **单局持久禁放反馈**：单局内永久记录已确认禁放点（`BLOCKS_PATH` / `CELL_OCCUPIED`），在快照中排除并提供模型反馈，短路本地重复调用；`INSUFFICIENT_FUNDS` 单独处理。
- **前沿/中场/基地分层候选**：候选格按路径进度（0-35% 前沿、35-70% 中场、70-100% 基地守门）配额采样并附加 `zone` 标签，配合提示词优先级反转，让激进与前沿策略真实生效。
- **工具调用明确诊断**：严格解析参数，暴露诊断元数据，区分主动等待与协议故障。
- **更新产品文档**：修订 `docs/PRODUCT_CONCEPT.md` §7。

### 非目标
- 不引入新的非 DOM 运行依赖或外部网络库。
- 不修改确定性游戏物理引擎（寻路、碰撞、伤害结算仍由引擎全权负责）。
- 不展示原始思维链（CoT）。

## 三、 详细架构设计

### 1. 服务端 Agent 契约 (`server/src/agent.ts`)
- **请求校验**：`validateAgentRequest` 支持可选的 `lang?: 'zh' | 'en'`，缺省默认为 `'zh'`。
- **系统提示词 (AGENT_SYSTEM_PROMPT)**：
  - 明确“玩家策略高于一切默认偏好”：若玩家要求积极消费、前沿布防或特定阵型，必须优先执行，覆盖默认的节约偏好。
  - 约束输出语言：强制要求决策摘要（包括各工具参数中的 `decision_summary` 以及无动作时的回复内容）必须使用 `lang` 指定的语言（中文或英文）。
  - 约束摘要语义：`decision_summary` 是面向玩家的高层战局评估（敌情威胁、路线覆盖、战术取舍），**严禁包含具体坐标 (i, j)、格子索引或机械动作复述**。
- **工具 Schema**：更新 `DECISION_SUMMARY_PROPERTY.description`，强调其为宏观战术意图且禁止包含具体坐标。
- **工具提取与诊断**：
  - `parseArguments` 在解析失败时保留错误标记或抛出结构化信息。
  - 提取单条宏观研判文本（每轮至多提取一条有效研判，过滤掉包含坐标的无效复述）。
  - 响应支持诊断字段 `diagnostics`。

### 2. 候选格生成算法 (`src/agent/snapshot.ts`)
- **禁放点过滤**：`createSnapshot` 接受 `invalidCells?: string[] | Set<string>`，在筛选 `buildCandidates` 和 `pathShapingCandidates` 时，预先排除所有已知禁放格。
- **分层区间采样 (Zone Partitioning)**：
  - 计算候选格对应的路径节点在整条敌人路线上的进度比例：
    - `frontline`: 进度 0% ~ 35%
    - `midfield`: 进度 35% ~ 70%
    - `base`: 进度 70% ~ 100%
  - 每个候选格对象附加 `zone: 'frontline' | 'midfield' | 'base'`。
  - 最终的 `buildCandidates` 按配额聚合（例如 3 个 frontline，3 个 midfield，2 个 base），避免内环低距离权重垄断全部候选名额。

### 3. 客户端运行时与反馈回路 (`src/agent/AgentRuntime.ts`)
- **禁放点状态管理**：
  - 运行时维护 `confirmedInvalidCells = new Map<string, string>()`（key: `"i:j"`, value: reason）。
  - 遇到 `BLOCKS_PATH` 或 `CELL_OCCUPIED` 时记录入 map。
  - 遇到 `INSUFFICIENT_FUNDS` 绝不计入禁放。
  - 在每局初始化或重置时（通过 `resetInvalidCells()`）清空。
- **快照与请求增强**：
  - 调用 `createSnapshot` 时传入已知禁放点。
  - 请求服务端时传入 `{ strategy, state, lang: getLang() }`。
  - 快照中的 `state` 包含 `invalidCells: string[]`（已排序或限制前 20 个）。
- **研判与日志解耦**：
  - 移除原 `actionPlanSummary` 自动拿坐标和塔类型冒充战略摘要的逻辑。
  - 模型未给出合法摘要时，使用本地化占位符（如 `reasoning.summaryUnavailable`），绝不回退为坐标操作。
  - 坐标与具体动作仅在 `onDecision`（执行日志）中呈现。
- **协议异常显式上报**：
  - 识别解析错误与畸变调用，触发 `onError`，不将协议故障静默转化为“无动作”。

### 4. 国际化与 UI 同步
- 在 `src/i18n.ts` 中新增或对齐 `reasoning.summaryUnavailable` 等键。
- 语言切换事件触发时，立即清空旧语言的战局研判缓存。

### 5. 产品文档修订 (`docs/PRODUCT_CONCEPT.md` §7)
- 废除“无摘要时以动作列表替代”的旧决议。
- 确立“战局研判面向战略意图，战术动作面向执行日志”的永久分离原则。

## 四、 测试与验证计划

1. **服务端测试 (`server/tests/agent.test.ts`)**：
   - 验证 `lang` 字段校验与默认值处理。
   - 验证系统提示词中包含语言、优先级反转与禁止坐标的约束。
   - 验证工具调用参数解析错误处理。
2. **快照算法测试 (`tests/agent/snapshot.test.js`)**：
   - 验证已知禁放点被成功过滤。
   - 验证候选格包含 `zone` 分区标签，且前沿、中场、基地均有代表性候选格。
3. **运行时反馈测试 (`tests/agent/agent-runtime.test.js`)**：
   - 验证禁放点在发生 `BLOCKS_PATH` / `CELL_OCCUPIED` 后被记录。
   - 验证 `INSUFFICIENT_FUNDS` 不被记录为禁放。
   - 验证对已知禁放点的调用被运行时拦截短路。
   - 验证请求携带当前 `lang`。
   - 验证没有摘要时不再以坐标动作字符串充当摘要。
