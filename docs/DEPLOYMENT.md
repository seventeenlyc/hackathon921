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
| PR 上会发生什么 | 只跑构建检查，不部署 |
| 线上现在是什么 | **纯静态前端**，inert 塔防底座本身 |
| 后端 / 数据库 / LLM 代理 | **都还不存在** |

## 一、你的代码怎么上线

```
开 PR  ─────────►  build job 跑构建检查（不部署）
   │
合并到 main ─────►  build job  ─►  deploy job  ─►  线上
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

推之前在本地跑这三条，和 CI 完全一致：

```sh
npm ci
npm run test        # == parcel build + tests/texture-assets.test.js，构建和贴图校验一步两用
npx tsc --noEmit
```

任何一条挂了，CI 也会挂，PR 进不去。

**注意 `npm run lint` 不存在** —— `AGENTS.md` 提到了它，但仓库里目前没有这个 script。
别浪费时间找。

### `npm ci` 报 `EBADENGINE` 是正常的

那是**警告不是错误**，可以无视。

`package.json` 里的 `engines: ">=14 <18"` 是上游 inert 留下的过时声明。它描述的是
**Windows 上缺 VS C++ Build Tools** 时 `deasync` 装不上的情况（见 `.NODE_ENV_README.md`），
不是跨平台约束 —— Linux 和 macOS 自带编译工具链。

Node 22 下 `npm ci` / `build` / `test` / `tsc --noEmit` 全部实测通过，CI 用的就是 Node 22。
这个字段的清理属于 issue #1（迁移到 Vite）的范围。

## 三、写代码时的约束

这一节是这份文档真正重要的部分。

### 1. 没有后端可用

线上**只有一个静态文件服务器**。没有 API、没有数据库、没有任何服务端逻辑。

所以：写 `fetch('/api/...')` 会 404。目前任何需要服务端的功能（排行榜持久化、
用户身份、LLM 调用）都无处落地。

**后端技术栈按 `AGENTS.md` 尚未选型，选型定下来之前不要引入相关框架依赖。**
要加后端，先在 `docs/PRODUCT_CONCEPT.md` 记录选型决定并把对应条目从末尾的
「未决问题」清单里移除，这是 `AGENTS.md` 的硬性流程。

### 2. LLM 密钥绝不能进前端

两个独立的理由，每一个都足够：

- **安全**：前端直连等于把 key 公开。
- **功能**：国内网络下玩家浏览器**根本连不上**境外模型服务。实测 `api.anthropic.com`
  被地域封锁、`api.openai.com` DNS 被污染；`api.deepseek.com` 通，项目因此选了 DeepSeek
  （见 §14）。

所以服务端代理不是「以后再优化的安全加固」，是**功能前提**。在它存在之前，
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

### 6. 当前是 Parcel v1，#1 会迁到 Vite

现状：`parcel-bundler@1.12` + `pug` + `less` + `typescript@3.8`，2020 年的工具链。
入口是 `public/index.pug`，不是 `index.html`。

（`AGENTS.md` 里写的「Vite」与现状冲突，这是已知的文档偏差，issue #1 在跟踪。）

对你的影响：**迁移完成后部署流程不变**。入口始终是 `npm run build` → `dist/`，
Vite 的默认输出目录同样是 `dist`，workflow 一个字都不用改。

## 四、CI 挂了怎么办

| 现象 | 多半是 |
|---|---|
| `npm run test` 失败 | 构建报错，或贴图校验没过。`tests/texture-assets.test.js` 检查三件事：11 个贴图源文件存在、3 个渲染器（`Enemy.ts` / `Tower.ts` / `Rock.ts`）确实走 `textureManager.draw`、每个贴图都出现在 `dist/` 里。**贴图列表是硬编码的**，增删贴图要同步改这个测试 |
| `npx tsc --noEmit` 失败 | 类型错误。注意是 TS 3.8，比你习惯的语法旧 |
| `npm ci` 失败 | 依赖变更没有连同 lockfile 一起提交。**lockfile 是真值来源** |
| `Verify deployment` 失败但站点其实是好的 | GitHub runner 在境外，访问国内服务器可能超时。已带 5 次重试。先本地 `curl` 确认；本地正常就是网络问题，不是部署失败 |
| 页面白屏、控制台报资源 404 | `index.html` 被缓存成旧版，而它引用的旧 hash 资源已被清理。nginx 已对 `index.html` 配 `no-cache`，仍出现的话检查中间层缓存 |

deploy job 只在 `main` 上跑。你在 PR 上看到 `deploy` 显示为跳过，那是正常的。

## 五、这些你不用管

以下都是自动的或属于运维侧，**不需要你做任何事，也不需要主机访问权限**：

- 部署本身 —— 合并即上线
- 版本管理与回滚 —— 产物按 commit sha 存档，保留最近 5 个，回滚是改一次符号链接
- HTTPS 证书
- nginx 配置
- 服务器账号与密钥

需要回滚或服务器出了问题，找项目负责人，操作手册在 `deploy/README.md`。

## 六、还不存在的东西

别假设它们存在，也不要在没有对应决定的情况下顺手加上：

| 缺什么 | 状态 |
|---|---|
| 服务端 DeepSeek 代理 | 无代码，后端技术栈未选型 |
| 数据库 | 未选型 |
| 排行榜持久化 | 需要服务端可校验的对局证据，方案未定。宁可暂不做，也不要上线可任意伪造的接口 |
| Agent 运行时 | 无代码。issue #7 的「范围说明」写明待单独开 issue |
| 监控 / 告警 | 无 |

**当前线上版本不含任何 AI 能力**，就是塔防游戏本身。issue #6 的 P0 验证
（两个不同 Prompt 产生可见不同的 AI 行为）尚未通过，这是预期内的阶段状态。
