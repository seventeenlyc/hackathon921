# 部署 —— 开发者须知

这份文档说明**你写的代码怎么变成线上的东西**，以及在此之前你的代码必须满足什么。

面向在本仓库写代码的人。服务器初始化、回滚、凭据管理属于运维侧，在 `deploy/README.md`，
需要主机访问权限才用得上，**日常开发不需要，也不需要有人手动部署**。

部署相关的已确认决定记录在 `docs/PRODUCT_CONCEPT.md` §14（真值来源）。

## 速览

| | |
|---|---|
| 线上地址 | `https://prompt-defense.crowntime.cn` |
| 上线方式 | **合并到 `main` 自动部署**，没有手动步骤 |
| PR 上会发生什么 | 跑 `CI` workflow（构建 + 类型检查 + 后端测试），不部署 |
| 线上现在是什么 | 静态前端 + **排行榜与 LLM 代理后端服务**（Node.js 22 + SQLite） |
| 数据库 | SQLite，独立文件（`deploy/README.md`） |
| LLM 代理 | **已实现**：`POST /api/agent/decide`；`GET /api/health` 报告 `providerConfigured` |

## 一、你的代码怎么上线

```
开 PR  ─────────►  CI workflow：构建 + 类型检查 + workflow 校验
   │
合并到 main ─────►  Deploy workflow：build job ─► deploy job ─► 线上
```

合并后大约一两分钟生效。在仓库 Actions 页面看 `Deploy` workflow，
最后一步 `Verify deployment` 会自动校验线上版本确实变成了你这次的 commit，**它绿了就是真上线了**。

### 确认自己的改动真的上线了

```sh
curl -s https://prompt-defense.crowntime.cn/version.txt
```

返回一个 commit sha，和你合并的那个对比即可。

建议用 `curl` 而不是浏览器 —— 浏览器缓存会让你对着旧页面怀疑人生。

## 二、CI 会跑什么（也就是你本地该先跑什么）

推之前在本地跑这几条，和 CI 完全一致：

```sh
npm ci
npm run test         # == vite build + 前端测试（贴图、排行榜、agent），构建和校验一步两用
npx tsc --noEmit
npm run test:server  # 后端 API 测试：tsc 编译后由 Node 内置 test runner 运行，无需额外依赖
```

任何一条挂了，CI 也会挂，PR 进不去。

**注意 `npm run lint` 不存在** —— `AGENTS.md` 提到了它，但仓库里目前没有这个 script。
别浪费时间找。

### Node 版本

`package.json` 的 `engines` 是 `>=20.19.0`（Vite 8 的下限），CI 用 Node 22，满足要求。

迁移到 Vite 之前上游遗留的 `engines: ">=14 <18"` 声明、`overrides` 里的 `deasync` 固定，
以及配套的 Node 16 虚拟环境说明，都已随 issue #1 一并删除 —— 本地和 CI 都不再需要它们。

## 三、写代码时的约束

这一节是这份文档真正重要的部分。

### 1. 后端已存在：排行榜 API（2026-09-22 起）

后端技术栈**已选型**（`docs/PRODUCT_CONCEPT.md` §14）：**Node.js 22 内置模块 + SQLite**，
零运行时 npm 依赖。线上 nginx 把 `/api/` 反代到本机 Node 服务（见 `deploy/README.md`）。

契约与约束：

- 前端只通过 `/api/` 调用。LLM 代理已在 `server/src/agent.ts` 实现；不要顺手新增其他服务端能力。
- 成绩写入以**服务端记录的对局证据**为准，不是客户端上报的最终分数（§9）。
- 改 API 路径或语义时，同步更新 `docs/PRODUCT_CONCEPT.md` §9。
- 后端 TypeScript 源码在 `server/`，由 CI 用 `npm run build:server` 编译成 JS；**服务器上不构建、
  不安装依赖**，只运行编译产物。给后端引入运行时 npm 依赖之前先在 §14 记录。

#### SQLite 增量迁移与回滚

身份、排行榜与提示词溯源使用同一个 SQLite 文件。身份迁移会创建 `users` 表与 UID 索引，并为旧 `runs` 补 `user_id`；服务启动时按昵称大小写不敏感分组，为既有 run 回填 legacy UID。旧系统已合并的同名玩家无法由迁移拆分，历史头像保持为空，旧成绩与 Prompt 链会保留。提示词迁移还会在需要时补 `runs.prompt_head_id`，并创建 `prompt_nodes` 表及其索引。迁移可重复执行，不删除历史 run、波次事件、成绩或 Prompt 节点。

升级生产服务前，先在运维侧备份 SQLite 文件（示例：`cp leaderboard.sqlite3 leaderboard.sqlite3.bak-$(date +%Y%m%d%H%M%S)`），再切换编译产物。迁移验证必须使用独立的临时 SQLite 文件，不能用生产库做测试。

回退代码前先验证旧版本能容忍新增的列和表；旧代码不会读取 `prompt_nodes`，因此会暂时看不到历史，但原有成绩仍在。不要为了回退自动删除 `prompt_nodes` 或 `prompt_head_id`；需要恢复数据时使用升级前备份，并按运维流程停服、替换和复核数据库。

### 2. LLM 密钥绝不能进前端

两个独立的理由，每一个都足够：

- **安全**：前端直连等于把 key 公开。
- **功能**：国内网络下玩家浏览器**根本连不上**境外模型服务。实测 `api.anthropic.com`
  被地域封锁、`api.openai.com` DNS 被污染；`api.deepseek.com` 通，项目因此选了 DeepSeek
  （见 §14）。

所以服务端代理不是「以后再优化的安全加固」，是**功能前提**。当前代理已由排行榜后端承载；
前端不要写任何直连模型服务的代码。

### 3. 构建产物必须是 `dist/`，且必须有 `index.html`

部署流程认死这两条：

- 构建入口固定是 `npm run build`，输出到 `dist/`
- deploy 会检查 `dist/index.html` 存在，**不存在就拒绝上线并保持旧版本不变**（fail closed）

改 `package.json` 的 build script 之前先想到 CI。

### 4. 站点部署在域名根

`/img/...`、`/manifest.webmanifest` 这类绝对路径可以正常工作。

不要假设站点会挂在某个子路径下（如 `/game/`），当前配置下那样会让图标和 manifest 全部 404。

### 5. 不要为了让 CI 变绿而削弱检查

`AGENTS.md` 的明确规定：不得弱化、跳过或删除测试。被缺失的服务或工具阻塞时，
如实报告确切的限制以及哪些部分仍未验证。

另外每个行为变更都要有对应测试，覆盖正向行为、失败路径和状态流转。
**涉及 A* 路径的改动（建塔、卖塔）必须测路径重算** —— 这是本项目已知最容易漏的一类缺陷。

### 6. 构建是 Vite

工具链是 `vite@8` + `less` + `typescript@5`，入口是仓库根目录的 `index.html`。
`npm run dev` 起 dev server（http://localhost:5173/），`npm run build` 输出到 `dist/`，
`npm run preview` 在本地预览构建产物。

样式（`src/styles/styles.less`）和贴图（`src/assets/entities/`）都从 JS import，由 Vite
处理并加内容哈希。`src/tools/texturePaths.ts` 的 import 是静态的，**贴图改名或缺失会让构建
直接失败**，而不是变成运行时 404。`public/` 只放原样拷贝的静态文件（图标、
`manifest.webmanifest`、`humans.txt` 等）。

音频资源位于 `public/audio/`，构建后原样出现在 `dist/audio/`。普通背景曲目来自 `background/` 的 MP3、OGG、WAV、M4A 与 `audio/` 根目录的 MP4，按仓库根目录的 `audio-playlist.json` 分配到三个阶段；四首专用曲在同一配置中按波次标记。替换或新增资源需同步更新配置并重启开发服务器或重新构建；构建会检查曲目是否存在、是否重复或未分配。`wave.wav` 与 `game-over.wav` 是活动音效；替换资源时使用浏览器可播放的格式，并在替换前确认许可归属。旧的 `background.wav` 仅作为历史占位文件保留，不是活动背景音乐。资源请求或解码失败必须仍不阻塞游戏。

迁移（issue #1）没有改变部署契约：入口仍是 `npm run build` → `dist/`，
`deploy.yml` 一个字都没改。

## 四、CI 挂了怎么办

| 现象 | 多半是 |
|---|---|
| `npm run test` 失败 | 构建报错，或贴图校验没过。`tests/texture-assets.test.js` 检查三件事：13 个贴图源文件存在（`src/assets/entities/`）、4 个渲染器（`Enemy.ts` / `Tower.ts` / `Base.ts` / `Rock.ts`）确实走 `textureManager.draw`、每个贴图都出现在 `dist/` 里（Vite 输出到 `dist/assets/`，测试递归查找）。**贴图列表是硬编码的**，增删贴图要同步改这个测试 |
| `npx tsc --noEmit` 失败 | 类型错误（TypeScript 5）。`tsc` 只做类型检查，转译由 Vite/esbuild 负责 |
| `npm ci` 失败 | 依赖变更没有连同 lockfile 一起提交。**lockfile 是真值来源** |
| `Verify deployment` 失败但站点其实是好的 | GitHub runner 在境外，访问国内服务器可能超时。已带 5 次重试。先本地 `curl` 确认；本地正常就是网络问题，不是部署失败 |
| 页面白屏、控制台报资源 404 | `index.html` 被缓存成旧版，而它引用的旧 hash 资源已被清理。nginx 已对 `index.html` 配 `no-cache`，仍出现的话检查中间层缓存 |

PR 与部署是两个独立的 workflow：PR 上跑 `CI`，合并到 `main` 才跑 `Deploy`。
所以 PR 的检查列表里不会出现任何与部署有关的条目。

## 五、这些你不用管

以下都是自动的或属于运维侧，**不需要你做任何事，也不需要主机访问权限**：

- 部署本身 —— 合并即上线
- 版本管理与回滚 —— 产物按 commit sha 存档，保留最近 5 个，回滚是改一次符号链接
- HTTPS 证书
- nginx 配置
- 服务器账号与密钥

需要回滚或服务器出了问题，找项目负责人，操作手册在 `deploy/README.md`。

## 六、能力状态

以当前代码与部署为准；尚未实现的能力不要在没有对应决定的情况下顺手加上：

| 能力 | 状态 |
|---|---|
| 服务端 DeepSeek 代理 | **已实现**：经会话 token 准入；密钥、系统指令与工具 schema 留在服务端 |
| 数据库 | SQLite，已用于排行榜（`docs/PRODUCT_CONCEPT.md` §14） |
| 排行榜持久化 | **已实现**：服务端签发对局会话 + 逐波 append-only，成绩取服务端记录的最大波次（§9） |
| Agent 运行时 | **已实现**：按波次向代理请求决策，动作通过引擎接口执行 |
| 监控 / 告警 | 无 |

当前线上版本已具备 AI 决策代理和运行时。issue #6 的 P0 验证（两个不同 Prompt 产生可见不同的 AI 行为）仍未通过，不能据此宣称验证完成。
