# 🌐 Prompt Defense — AI 塔防

### ⚡ Prompt 驱动的 AI 战术塔防

<p align="center">
  <a href="https://prompt-defense.crowntime.cn/">
    <img src="https://img.shields.io/badge/LIVE%20DEMO-立即试玩-35e2ff?style=for-the-badge&logo=googlechrome&logoColor=white" alt="Live Demo" />
  </a>
  <img src="https://img.shields.io/badge/VERSION-v0.2.25-00f2fe?style=for-the-badge" alt="Version" />
  <img src="https://img.shields.io/badge/LLM-DeepSeek-blue?style=for-the-badge" alt="LLM Engine" />
  <img src="https://img.shields.io/badge/LICENSE-GPL--3.0-green?style=for-the-badge" alt="License" />
</p>

<p align="center">
  <img src="public/img/banner.png" alt="Prompt Defense — AI Tower Defense" width="700" />
</p>

---

## 🔗 在线体验入口

> 🚀 **公网试玩节点：** **👉 [https://prompt-defense.crowntime.cn/](https://prompt-defense.crowntime.cn/)**

---

## 🎯 核心玩法与游戏哲学

传统塔防考验点击手速与格子记忆；**Prompt Defense 考验人机协同的战术表达**。

### 1. 玩家不控塔，玩家“训导” AI
* **人类角色**：战略架构师。编写自然语言 Prompt，设定资源约束、优先级、阵地偏好和应急预案。
* **AI 角色**：前线战术执行者。感知战场网格与敌人动态，自主调用游戏动作接口（建塔、升阶、索敌）实施防守。

$$ \text{人类意图} \longrightarrow \text{自然语言 Prompt} \longrightarrow \text{LLM 战术决策} \longrightarrow \text{引擎动作执行} \longrightarrow \text{战场波次演进} $$

### 2. 局内动态进化（In-Game Evolution）
* **1 枚硬币 = 1 局生命**，挑战无限递增的无尽波次（Endless Roguelike Waves）。
* **策略无需在开局锁定**：战斗进行中，你可以根据敌情随时追加、修订 Prompt（从 `v1.0` 迭代到 `v2.0`、`v3.0`）。
* **真因果反馈**：改动一句话，亲眼目睹防御单位在下一个波次做出截然不同的布阵反应！

---

## ✨ 项目特色

- 🧠 **大模型战术代理（Powered by DeepSeek）**：
  将自然语言指令转化为严谨的结构化操作（建塔坐标、型号决策、经济保留），支持思维纠错与自适应调整。
- ⚙️ **严格的引擎-Agent 分层架构（Engine-Agent Decoupling）**：
  确定性物理引擎与 A\* 寻路独立负责逐帧渲染与伤害判定；LLM 绝不污染游戏帧循环，通过严格的沙盒动作接口交互，防越权、防幻觉、保证对局公平性。
- 🕹️ **极简战术终端 UI**：
  中性、克制的指挥控制台界面，灵感取自上游 [inert](https://github.com/CorentinTh/inert) 的极简塔防美学。
- 🏆 **本地与共享排行榜（Leaderboard）**：
  实时追踪最佳指挥官与波次记录，对局回放与策略演化轨迹沉淀。

---

## 💡 战术策略 Prompt 灵感示例

你可以像对战友说话一样向防御单位下达战术方针：

```text
1. 经济原则：始终保留至少 30% 的资金作为应急储备，严禁单波次挥霍一空。
2. 阵型构造：优先在敌人行进拐角处部署减速塔，为后方火力网争取时间。
3. 动态应对：当侦测到高生命值重装单位时，优先将单体高爆发炮塔升至满级；
   若敌人逼近核心 3 格以内，放弃存钱立刻堵路！
```

---

## 🛠️ 本地运行与开发指南

### 前置要求
- Node.js 18+ / 20+
- npm

### 1. 克隆与安装
```bash
git clone https://github.com/zuohaisu/hackathon921.git
cd hackathon921
npm ci
```

### 2. 启动本地开发服务器
```bash
npm run dev
```
打开浏览器访问提示的本地地址（通常为 `http://localhost:5173`）即可启动。

### 3. 代码检查与验证
```bash
npm run lint
npx tsc --noEmit
npm run test
```

---

## 📜 许可证与致谢

- **开源许可证**：本项目遵循 [GPL-3.0](LICENSE)。
- **底座来源**：游戏底座与极简塔防引擎 Fork 自 [CorentinTh/inert](https://github.com/CorentinTh/inert)
  （GPL-3.0），感谢原作者 **Corentin Thomasset** 的精妙设计。原 LICENSE 与署名均已保留。
- **参赛团队**：左海粟、邓海华、崔宏阳、张文畅。
