# 🌐 Prompt Defense // 保护笑脸男 · 塔奇克马防御协议
### ⚡ 黑客松作品 · 攻壳机动队 × 进化酒馆主题 AI 战术塔防

<p align="center">
  <a href="https://prompt-defense.crowntime.cn/">
    <img src="https://img.shields.io/badge/LIVE%20DEMO-立即试玩-35e2ff?style=for-the-badge&logo=googlechrome&logoColor=white" alt="Live Demo" />
  </a>
  <img src="https://img.shields.io/badge/VERSION-v0.2.4-00f2fe?style=for-the-badge" alt="Version" />
  <img src="https://img.shields.io/badge/THEME-攻壳机动队%20%7C%20进化酒馆-ff007f?style=for-the-badge" alt="Theme" />
  <img src="https://img.shields.io/badge/LLM-DeepSeek-blue?style=for-the-badge" alt="LLM Engine" />
  <img src="https://img.shields.io/badge/LICENSE-MIT-green?style=for-the-badge" alt="License" />
</p>

---

## 🔗 在线体验入口

> 🚀 **公网试玩节点已上线（无需配置环境，即开即玩）：**
> **👉 [https://prompt-defense.crowntime.cn/](https://prompt-defense.crowntime.cn/)**

---

## 🍸 世界观设定：赛博深处的「进化酒馆」

> *"我思故我在，但若没有优秀的策略，你的 Ghost 撑不过第 5 波。"*

在公安九课的最深层数据链路中，存在一处被称为**「进化酒馆」（Evolution Tavern）**的战术沙盒中继站。
这里是各路黑客与战术指挥官的聚集地——大家举杯切磋的不是手速，而是对自主智能体的 **“驯导艺术”**。

外界敌对势力正在对核心中枢发起代号为 **“笑脸男（The Laughing Man）”** 的数字围剿。作为公安九课的战略指挥官，你不能直接微操战场上的每一个炮塔；你的武器是 **自然语言策略（Tactical Prompt）**。你将指令注入战术自律机体 **塔奇克马（Tachikoma）** 的电子脑，看着它在战场上自主观察、决策、布防与升级。

每一次失败，都是演化树上的一次分支剪枝；每一局战损，都在酒馆的赛博吧台前催生出更坚韧的策略 Prompt。

---

## 🎯 核心玩法与游戏哲学

### 1. 玩家不控塔，玩家“训导” AI
传统塔防考验点击手速与格子记忆；**Prompt Defense 考验人机协同的战术表达**。
* **人类角色**：战略架构师。编写自然语言 Prompt，设定资源约束、优先级、阵地偏好和应急预案。
* **AI 角色（塔奇克马）**：前线战术执行者。感知战场网格与敌人动态，自主调用游戏动作接口（建塔、升阶、索敌）实施防守。

$$ \text{人类意图} \longrightarrow \text{自然语言 Prompt} \longrightarrow \text{LLM 战术决策} \longrightarrow \text{引擎动作执行} \longrightarrow \text{战场波次演进} $$

### 2. 局内动态进化（In-Game Evolution）
* **1 枚硬币 = 1 局生命**，挑战无限递增的无尽波次（Endless Roguelike Waves）。
* **策略无需在开局锁定**：战斗进行中，你可以根据敌情随时追加、修订 Prompt（从 `v1.0` 迭代到 `v2.0`、`v3.0`）。
* **真因果反馈**：改动一句话，亲眼目睹塔奇克马在下一个波次做出截然不同的布阵反应！

---

## ✨ 项目特色与黑客松技术亮点

- 🧠 **大模型战术代理（Powered by DeepSeek）**：
  将自然语言指令转化为严谨的结构化操作（建塔坐标、型号决策、经济保留），支持思维纠错与自适应调整。
- ⚙️ **严格的引擎-Agent 分层架构（Engine-Agent Decoupling）**：
  确定性物理引擎与 A* 寻路独立负责逐帧渲染与伤害判定；LLM 绝不污染游戏帧循环，通过严格的沙盒动作接口交互，防越权、防幻觉、保证对局公平性。
- 🕹️ **攻壳机动队战术 UI 与沉浸式体验**：
  公安九课战术终端风格界面、笑脸男核心守卫、动态扫频启动终端与赛博声效，提供黑客松评委与玩家最极致的视听张力。
- 🏆 **本地与分布式排行榜（Leaderboard）**：
  实时追踪最佳指挥官与波次记录，对局回放与策略演化轨迹沉淀。

---

## 💡 战术策略 Prompt 灵感示例

你可以像对战友说话一样向塔奇克马下达战术方针：

```text
【公安九课战术指令】
1. 经济原则：始终保留至少 30% 的资金作为应急储备，严禁单波次挥霍一空。
2. 阵型构造：优先在敌人行进拐角处部署激光减速塔，为后方火力网争取时间。
3. 动态应对：当侦测到高生命值重装单位时，优先将单体高爆发炮塔升至满级；若敌人逼近核心笑脸男 3 格以内，放弃存钱立刻堵路！
```

---

## 🛠️ 本地运行与开发指南

### 前置要求
- Node.js 16+ / 18+
- npm 或 pnpm

### 1. 快速克隆与安装
```bash
git clone https://github.com/seventeenlyc/hackathon921.git
cd hackathon921
npm install
```

### 2. 启动本地开发服务器
```bash
# 启动 Vite 本地服务
npm run dev

# 或在 Windows 下运行带端口自动检测与浏览器唤起的脚本：
./start.bat
```

打开浏览器访问提示的本地地址（通常为 `http://localhost:1234` 或 `http://localhost:5173`）即可启动战术终端。

### 3. 代码检查与验证
```bash
npm run test
npx tsc --noEmit
```

---

## 👥 鸣谢与致敬 (Credits & Attribution)

- **底座灵感与致谢**：游戏底座与极简像素塔防引擎 Fork 自 [CorentinTh/inert](https://github.com/CorentinTh/inert)，感谢原作者 Corentin Thomasset 的精妙设计！
- **世界观致敬**：致敬士郎正宗与神山健治经典名作《攻壳机动队：S.A.C.》系列中的公安九课、塔奇克马与笑脸男。
- **开源许可证**：本项目遵循 [MIT License](LICENSE)，保留原开源作者署名与版权声明。
