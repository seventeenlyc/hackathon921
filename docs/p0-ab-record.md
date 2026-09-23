# #6 P0 验证记录：两个不同 Prompt 产生可见不同的 AI 行为

本文件记录 issue #6 的验证证据与仍无法保证的限制。它是产品成立条件
（`docs/IDEA.md` §7、`docs/PRODUCT_CONCEPT.md` §11）的落地记录，不是需求规格。

## 本次改动（候选可见性修复）

`src/agent/snapshot.ts` 的 `pathShapingCandidates` 原先从路径起点（出生点）逐格
线性扫描，最多做 10 次 A* 探测、收集 4 个候选即停。结果：单路线中段/基地附近
合法且更优的改道墙永远不可见（issue #6 诊断评论中的 25 格单路线复现：第 12 格
+4 路程，其余 +2，旧实现只返回出生点附近的 0–3 格）。

改为按路线与区域**分层抽样**：

- 每条路线按进度划分为 `frontline`（出生点附近）、`midfield`、`base`（基地附近）
  三个区域，与 `buildCandidates` 的区域词汇一致。
- 对每个 (路线, 区域) 先探测其中心格；中心格非法（被占/封路/无增益）时按向外
  扩展顺序最多再试一格，单区域探测上限 `ZONE_SAMPLE_BUDGET = 2`。
- 探测预算 `MAX_PATH_SHAPING_PROBES = 24`（4 路线 × 3 区域 × 2 重试），接受上限
  `MAX_PATH_SHAPING_CANDIDATES = 4` 不变。
- 选择阶段保证区域与路线覆盖：先每路线取一个最佳，再补齐缺失区域，最后按绕路
  增量填充，最后按 `addedTiles` 降序输出（“最佳改道优先”契约不变，覆盖不被排序挤掉）。
- 合法性与实际绕路增量仍由引擎判定：`routeLengthAfterBuilding` 临时建墙跑真实 A*，
  `null` 即 `BLOCKS_PATH`，失败 fail closed。LLM 不直接改网格、不参与逐帧寻路。

`PathShapingCandidate` 增加必填 `zone` 字段，让模型在“盘绕出生点”与“基地附近
布防”之间做出可分辨的选择；`server/src/agent.ts` 的系统提示已同步说明该字段。

## 确定性验证（无 DOM，真实 A*）

`tests/agent/strategy-ab.test.js` 用真实 `easyAStar` 在 24×13 网格上跑：

- **区域分化**：“基地附近布防”选择器只接受 base 区格，“出生点盘绕”只接受
  frontline 区格；两者的塔位区域分布、金币曲线、活路径长度逐波发散。
- **路径重算不变量**：建墙加长路径，撤墙恢复短路径（re-path），无缓存串味；
  出生点/基地格返回 `CELL_OCCUPIED`，封死唯一走廊返回 `BLOCKS_PATH`，均 fail closed。
- **预算实测**：真实 A* 下 path-shaping 一次 3 次探测、快照 1193 字符、
  0.6ms/次（24×13 网格），远在 `MAX_PATH_SHAPING_PROBES = 24`、
  `MAX_SNAPSHOT_CHARS = 6500` 与单波 PLANNING 预算内。

`tests/agent/snapshot.test.js` 补了失败在前、修复在后的回归：中段 +4 改道可见、
每候选带 `zone`、单路线不被首路抢光预算、占用/非法格跳过仍覆盖三区域、探测预算
有界。

## 真实 DeepSeek A/B（单决策，同快照）

`tests/manual/deepseek-ab.mjs`（手动、非 `npm test`；不读不提交 key，key 在部署
服务器）对线上 `https://prompt-defense.crowntime.cn/api/agent/decide`
（`GET /api/health` → `providerConfigured: true`）发送**同一份带三区域
pathShapingCandidates 的确定性快照**，每个 Prompt 重复 6 次：

| Prompt | 区域分布 | 塔种 | 一致性 |
| --- | --- | --- | --- |
| A 基地附近布防·激进 | base ×12，frontline ×0 | canon ×12 | 6/6 一致 |
| B 出生点盘绕·保留 30%·减速快速敌人 | frontline ×12，base ×0 | slow ×6，canon ×6 | 6/6 一致 |

- 同一快照、只换策略 Prompt：塔位区域、塔种分布**肉眼可分辨且稳定复现**。
- A 全 canon（“最大化伤害输出”），B 建 slow（“优先减速快速敌人”）—— Prompt 的
  策略意图被模型翻译成不同动作，而非随机波动。

这满足 issue #6 验收标准的核心：“两个 Prompt 产生可见不同且稳定复现的 AI 行为”。

## 仍无法保证的限制（诚实记录）

1. **不是完整多波对局。** 本 A/B 是**单决策**（同一 PLANNING 快照），不是整局多波
   推演。#6 正文还要求“塔种类分布、建造节奏、金币曲线肉眼可分辨”的整局对比。跑整局
   需要在浏览器里驱动完整 game loop（AI 每波调 `/api/agent/decide`、引擎逐帧模拟、
   记录逐波塔位/金币/到达波次），本次未做。单决策结果强烈支持 #6，但不等同于整局
   验收。
2. **“瑞士卷”布局不可保证。** 单格改道墙通常只加几格，A* 会在堵点后很快回到原路；
   完美迷宫/螺旋需要逐波连续建墙。本改动让模型**看得见**各区域改道格，使逐波盘绕
   成为可能，但不保证能画出固定形状的“瑞士卷”——实际可实现的绕路增量以引擎实测的
   `addedTiles` 为准，不以画出固定形状作假保证。
3. **卖塔改道重算未在引擎层实测。** 当前 `GameActions` 没有卖塔动作，因此
   “卖塔打开通路后途中敌人重新寻路”这一类缺陷在引擎层暂不可测；确定性测试在
   FakeBattlefield 上验证了“建墙→加长、撤墙→恢复”的核心重算不变量。
4. **未做产品级 RNG/种子。** #5 已关闭（不做 seed 化）。A/B 用“同快照”替代“同种子
   地图”来控制变量，不引入未确认的产品种子功能。
5. **`npm run lint` 未运行：** 仓库未配置 lint 脚本（`AGENTS.md` 的验证块列了它，
   但相应脚本尚未建立）。已运行：`npx tsc --noEmit`（clean）、`npm run test`
   （全绿，含新增 `tests/agent/strategy-ab.test.js`）、`npm run test:server`（87/87）。

## 复现

```bash
npm ci
npx tsc --noEmit
npm run test
# 真实 DeepSeek A/B（需线上 provider 已配置，不接触 key）：
node tests/manual/deepseek-ab.mjs            # 默认线上地址
AB_REPEATS=6 node tests/manual/deepseek-ab.mjs
```
