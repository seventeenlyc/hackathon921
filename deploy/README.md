# 部署 —— 运维手册

服务器初始化、回滚、凭据管理。**需要主机访问权限**。

日常开发不需要这份文档 —— 合并到 `main` 即自动部署。开发者看 `docs/DEPLOYMENT.md`。

部署相关的已确认决定记录在 `docs/PRODUCT_CONCEPT.md` §14（真值来源）。

## 架构

```
push 到 main
  └─ GitHub Actions: npm ci → 前端构建/测试 → tsc → 后端编译/测试
       └─ rsync dist/（含编译后的 server/）到 服务器:<APP_DIR>/releases/<commit-sha>/
            ├─ 原子切换 current 符号链接 → 校验 https://<域名>/version.txt
            └─ 原子切换 current-server 符号链接 → 后端进程自检版本后由 systemd 拉起
```

**构建只在 CI 发生，服务器不参与构建。** 这是 `docs/PRODUCT_CONCEPT.md` §14 的硬约束：
目标机是已承载其他生产业务的共享服务器，构建峰值会挤压既有服务。服务器需要 Node 22
来**运行**后端（见 §5），但同样不在上面构建、也不安装依赖——后端 TypeScript 在 CI 编译成 JS。

服务器上的目录布局：

```
<APP_DIR>/
├── releases/
│   ├── <commit-sha>/
│   │   ├── index.html …   前端构建产物（nginx root）
│   │   └── server/        后端编译产物（JS，systemd 运行）
│   └── ...                每次部署一个目录，保留最近 5 个
├── current         -> releases/<commit-sha>            nginx root
├── current-server  -> releases/<commit-sha>/server     后端运行目录
└── data/           leaderboard.sqlite3、session_secret  属 pd-leaderboard
```

nginx 的 `root` 指向 `current`。nginx 在**每次请求时**才解析符号链接，所以
**切换版本不需要 reload nginx**，部署用户因此完全不需要 sudo。

产物上传是增量的：`rsync --link-dest` 拿上一个版本当基准，配合 `--checksum` 按内容比对
（CI 每次都是全新构建，mtime 全是新的，少了 `--checksum` 优化收益为零）。实测一次典型的
代码改动，过境数据从 3.6MB 降到 50KB。跨境链路约 11KB/s，这一步曾经要 313 秒。

清理逻辑保留最近 5 个版本，但**两类版本永不删除**：本次部署的版本，以及切换前
`current` 指向的版本。第二条必须有：人工回滚到旧版本后，那个目录 mtime 已经很旧，
会落在保留窗口之外，照常清理就会把刚刚回滚上去、正打算再回滚的那一版删掉。

## 一次性初始化

### 1. DNS

添加 A 记录 `prompt-defense.crowntime.cn` → 目标机公网 IP。

`*.crowntime.cn` 的通配符证书在目标机上已存在且已被其他站点复用，**不需要跑 certbot**。

### 2. 安全组

确认 22 端口对 `0.0.0.0/0` 放行。GitHub 托管 runner 出口 IP 动态，无法按 IP 白名单。
可接受的依据：目标机 sshd 已关闭密码认证，且部署账号无 sudo。

### 3. 生成部署密钥

专用密钥，不要复用任何个人密钥：

```sh
ssh-keygen -t ed25519 -N '' -C 'github-actions@prompt-defense' -f ./deploy_key
```

### 4. 在服务器上执行初始化

把本目录传到服务器，以 root 执行一次（脚本幂等，可重复执行）：

```sh
SSL_CERT=/绝对路径/fullchain.pem \
SSL_KEY=/绝对路径/privkey.pem \
  ./bootstrap-server.sh "$(cat deploy_key.pub)"
```

要换成其它 OpenAI 兼容端点时，把端点与模型一起传（不是密钥，会写进 env 文件；首次写入后
重跑 bootstrap **不必再传**，env 文件会幂等保留，见 §5「环境配置真值来源」）：

```sh
DEEPSEEK_BASE_URL=https://<host>/openai/v1 \
DEEPSEEK_MODEL=<model-name> \
SSL_CERT=/绝对路径/fullchain.pem SSL_KEY=/绝对路径/privkey.pem \
  ./bootstrap-server.sh "$(cat deploy_key.pub)"
```

脚本会：创建无 sudo 的系统用户 → 安装公钥 → 建应用目录 → 放一个占位页面 →
检查 Node 与后端数据目录/签名密钥（provider 密钥缺失时只提示，见 §5）→
幂等渲染 env 文件与 unit（provider 端点/模型可选，见 §5）→
渲染并安装 nginx 配置 → `nginx -t` → reload。

**`nginx -t` 失败时脚本会自动回滚自己的配置文件并退出**，不会让一个坏配置把
这台机上其他站点一起带下去。

### 5. 初始化排行榜后端（root，一次性）

后端是 Node.js 22 内置模块（`node:http` / `node:sqlite` / `node:crypto`）+ SQLite，由 systemd
以**独立系统用户**运行。`bootstrap-server.sh` 在 root 下幂等地完成这一节；下面说明它做了什么，
便于排障。

- **Node.js 22（≥22.13）**：运行后端的唯一前提；该版本起 `node:sqlite` 不再需要
  `--experimental-sqlite` flag。**服务器上不构建、不 `npm install`**——后端由 CI 编译成 JS 后同步。
- **独立系统用户 `pd-leaderboard`**：`--system`，无登录 shell，无 sudo。隔离要求见
  `docs/PRODUCT_CONCEPT.md` §14 —— **不要复用**静态站的 `deploy-prompt-defense`。
- **数据目录 `<APP_DIR>/data`**：属 `pd-leaderboard`（mode 750），存
  `leaderboard.sqlite3`（WAL）。750 确保静态站的部署用户读不到排行榜数据库。
- **会话签名密钥 `<APP_DIR>/data/session_secret`**：首次用 `openssl rand -hex 32` 生成，
  权限 600、属 `pd-leaderboard`。**绝不进仓库**（`AGENTS.md`「密钥」）。
- **LLM provider 密钥 `<APP_DIR>/data/deepseek_key`**：DeepSeek API key，权限 600、
  属 `pd-leaderboard`，**绝不进仓库**。供 `/api/agent/decide` 使用（issue #22）；
  缺失时后端照常启动，只是该端点返回 503 `PROVIDER_NOT_CONFIGURED`，排行榜不受影响。
  脚本不生成它（无法本地生成），只在缺失时提示、在存在时校正属主与权限 —— 放置步骤见
  下方「放置 LLM provider 密钥」。
- **systemd unit** `/etc/systemd/system/pd-leaderboard.service` —— **纯静态模板**：
  所有环境配置以 `/etc/pd/pd-leaderboard.env` 为唯一真值来源（issue #135），unit 只用
  `EnvironmentFile=` 指向它，自身不再内联任何 `Environment=`。这样重跑 bootstrap 时
  env 文件幂等合并、不会静默抹掉已写下的值（详见下方「环境配置真值来源」）。

  ```ini
  [Unit]
  Description=prompt-defense leaderboard API
  After=network.target

  [Service]
  Type=simple
  User=pd-leaderboard
  Group=pd-leaderboard
  WorkingDirectory=/srv/apps/prompt-defense.crowntime.cn/current-server
  EnvironmentFile=/etc/pd/pd-leaderboard.env
  # node 路径不是固定值：脚本用 command -v node 解析后写入（本机为 /usr/local/bin/node）。
  ExecStart=/usr/local/bin/node /srv/apps/prompt-defense.crowntime.cn/current-server/main.js
  Restart=always
  RestartSec=2
  # §14 要求的进程内存上限。排行榜是轻量 I/O 服务，256M 有充足余量。
  MemoryMax=256M
  NoNewPrivileges=yes
  PrivateTmp=yes

  [Install]
  WantedBy=multi-user.target
  ```

  env 文件（`600 root:root`，由 systemd 以 root 读取）的**必需键**（缺失时 bootstrap 补齐）：

  ```ini
  PD_DB_PATH=/srv/apps/prompt-defense.crowntime.cn/data/leaderboard.sqlite3
  PD_SESSION_SECRET_FILE=/srv/apps/prompt-defense.crowntime.cn/data/session_secret
  DEEPSEEK_API_KEY_FILE=/srv/apps/prompt-defense.crowntime.cn/data/deepseek_key
  PD_CURRENT_LINK=/srv/apps/prompt-defense.crowntime.cn/current-server
  PD_PORT=8781
  ```

  **可选键**（bootstrap 不带参数重跑时原样保留，绝不抹掉）：

  ```ini
  # provider 端点/模型（留空回落代码默认 api.deepseek.com / deepseek-chat）
  DEEPSEEK_BASE_URL=https://<host>/openai/v1
  DEEPSEEK_MODEL=<model-name>
  # 开发模式密码文件（人工 QA 入口，见 docs/ops/dev-mode-password.md）
  PD_DEV_PASSWORD_FILE=/etc/pd/dev-password
  ```

  env 文件只放**路径**与端点/模型名，绝不放密钥本身（密钥仍在 `data/` 下 600 的文件里）。
  路径不是密钥，但收紧到 `600 root:root` 比 644 更稳；systemd 以 root 读取
  `EnvironmentFile`，服务进程不需要直接读它。

- **部署用户为何仍然不需要 sudo**：unit 用 `Restart=always`。部署只切换 `current-server`
  符号链接；服务进程在每个请求前比对一次版本文件，发现变化就退出，systemd 随即用新代码拉起。
  切换与重启都不需要部署用户的任何特权——与静态站「符号链接原子切换、不 reload nginx」
  是同一个思路。
- **nginx 反代与限流**：见 `nginx/<域名>.conf.template` 的 `/api/` location，`limit_req`
  按 §14 要求配置。

#### 放置 LLM provider 密钥（root，一次性）

provider key 由人放置：脚本不会生成它（无法本地生成）、不打印它，缺 key 时只提示不失败。
**不要把它写进 unit 或任何环境文件** —— unit 是 `644 root:root`，任何用户都能读到；
unit 里只放**路径**，密钥本身留在 `pd-leaderboard` 专属的文件里。

```sh
read -rs -p 'DEEPSEEK_API_KEY: ' K; echo                       # 不回显，也不进 shell history
( umask 077; printf '%s' "$K" > /srv/apps/prompt-defense.crowntime.cn/data/deepseek_key )
chmod 600 /srv/apps/prompt-defense.crowntime.cn/data/deepseek_key
chown pd-leaderboard:pd-leaderboard /srv/apps/prompt-defense.crowntime.cn/data/deepseek_key
unset K
systemctl restart pd-leaderboard
journalctl -u pd-leaderboard -n 5 --no-pager                   # 期望出现「LLM 代理已配置」
```

验证（不回显密钥）：`curl -s http://127.0.0.1:8781/api/health` 应含 `"providerConfigured":true`。

缺 key 或属主/权限不对时，服务照常启动，只有 `/api/agent/decide` 返回 503
`PROVIDER_NOT_CONFIGURED` —— 排行榜不受影响。脚本每次运行都会把该文件的属主与权限校正为
`600 pd-leaderboard`，因为「服务起来了但代理报未配置」是最难排查的一类症状。

轮换：用同样方式覆盖该文件 → `systemctl restart pd-leaderboard`。密钥只应存在一份，
换掉后确认旧副本（含其它路径下的历史文件）都已清理。

#### 环境配置真值来源（issue #135）

**`/etc/pd/pd-leaderboard.env` 是后端环境配置的唯一真值来源。** unit 不再内联 `Environment=`，
避免重跑 bootstrap 时被整份重写、把运维手加的配置静默抹掉（历史上因此丢过开发模式密码与
provider 端点，服务以降级配置重启且无报错）。

`bootstrap-server.sh` 对 env 文件做**幂等合并**（逻辑在 `deploy/render-unit.sh`，可被
`tests/render-unit.test.js` 独立验证）：

- **必需键**（`PD_DB_PATH` / `PD_SESSION_SECRET_FILE` / `DEEPSEEK_API_KEY_FILE` /
  `PD_CURRENT_LINK` / `PD_PORT`）：缺失才补，已存在则**保留**（不覆盖运维手改）。
- **provider 键**（`DEEPSEEK_BASE_URL` / `DEEPSEEK_MODEL`）：本次传参则写入/更新；未传参但
  env 文件里已有则**保留**；未传参且没有则不写（回落代码默认）。**不带参数重跑不再抹掉。**
- **非托管键**（`PD_DEV_PASSWORD_FILE` 及任何运维自加键）：**永不触碰**，原样保留。
- 首次创建 env 文件时，从既有 unit 与 `*.service.d/` drop-in 迁移所有 `Environment=` 行，
  确保不丢（因此从旧版 unit 升级到 env 文件方式时，开发模式密码等配置会自动迁进 env 文件）。
- 渲染后自检：必需键缺失、或「重跑前已存在的可选键重跑后从 env 文件消失」均为致命错误
  （fail closed，未安装/未重启）。

#### 新增配置：放 env 文件还是 drop-in？

后端环境配置的**唯一真值来源是 `/etc/pd/pd-leaderboard.env`**。新增一项环境变量时有两个选择：

- **直接写进 env 文件**（推荐）：`PD_XXX=...` 加到 `/etc/pd/pd-leaderboard.env`，`systemctl restart pd-leaderboard`。
  bootstrap 重跑时把它当作**非托管键**原样保留、永不触碰。这是唯一不会在下次 bootstrap 时丢失的方式。
- **systemd drop-in** `*.service.d/<name>.conf`：也生效，但 bootstrap 不知道它存在。drop-in 一旦被删
  （或被人手误清 `*.service.d/`），配置就静默消失——这正是开发模式密码曾经出问题的形态
  （见 issue #135 临时缓解）。因此 drop-in 只应作为 env 文件不可用时的临时手段，配置应最终落进 env 文件。

**不要往 `deploy/bootstrap-server.sh` 里加 `Environment=` 模板行来放新配置。** unit 模板刻意是
纯静态、不内联任何 `Environment=`；新增模板行会回到「重跑整份重写、抹掉运维手加项」的旧问题。
需要 bootstrap 自动管理的配置（如本次的 provider 端点/模型），才在 `render_service_config` 里
把它提升为「必需键」或「provider 类托管键」并配自检，而不是写进 unit 模板。

#### 换成其它 OpenAI 兼容端点（可选）

provider 的**端点**与**模型名**不是密钥，走 env 文件的 `DEEPSEEK_BASE_URL` / `DEEPSEEK_MODEL`；
密钥仍然只放在 `data/deepseek_key` 里。两者留空时用代码内置默认值
（`api.deepseek.com` / `deepseek-chat`）。首次用 bootstrap 传参写入后，重跑 bootstrap **不必再传**
（env 文件幂等保留，见上一节）。若要临时改回默认，手动从 env 文件删掉对应行再重跑。

生效的是哪个 provider，看这两处就知道：

```sh
systemctl show pd-leaderboard -p Environment --no-pager   # 含 EnvironmentFile 注入的值
journalctl -u pd-leaderboard -n 5 --no-pager   # LLM 代理已配置（<端点> / <模型>）
```

env 文件本身（唯一真值来源）：`cat /etc/pd/pd-leaderboard.env`（root）。

**换 provider 前先确认对方支持 function calling。** 前端只发策略与状态，动作靠 `tools`
回传（`server/src/agent.ts`）。协议兼容不等于工具调用行为一致：实测有的 OpenAI 兼容端点
接受 `tools` 参数、HTTP 200，但返回纯文本而不是 `tool_calls` —— 这种情况下
`extractAgentActions` 拿到空动作，AI 会整波不动（不崩，但不动）。

### 6. 配置 GitHub Secrets

仓库 Settings → Secrets and variables → Actions：

| Secret | 值 |
|---|---|
| `DEPLOY_HOST` | 目标机公网 IP |
| `DEPLOY_USER` | `deploy-prompt-defense` |
| `DEPLOY_SSH_KEY` | `deploy_key` 的**私钥**全文 |
| `DEPLOY_KNOWN_HOSTS` | `ssh-keyscan -H <IP>` 的输出 |

`DEPLOY_KNOWN_HOSTS` 不是可选项。部署流量走公网，不固定主机密钥（比如图省事用
`StrictHostKeyChecking=no`）等于放弃中间人防护。

主机地址与凭据只存在于 Secrets，不写进仓库 —— 见 `docs/PRODUCT_CONCEPT.md` §14。
配置完成后删除本地的 `deploy_key` 私钥。

### 7. 触发首次部署

push 到 `main` 即可。PR 上跑的是另一个 workflow（`ci.yml`），只做构建校验，不部署。

## 回滚

不需要重跑 CI，也不需要 sudo：

```sh
ssh <部署用户>@<主机>
cd <APP_DIR>
ls -1dt releases/*/              # 看有哪些版本，按时间倒序
ln -sfn releases/<目标sha> current.tmp
mv -Tf current.tmp current       # 原子切换
readlink current                 # 确认
```

回滚目标不会在下一次部署时被清理掉。

## 排障

**`https://<域名>/version.txt` 返回的 sha 不是最新的**
→ 部署没成功，或中间有缓存。先用 `curl` 而不是浏览器确认，再去 Actions 看 deploy job。

**`Verify deployment` 步骤失败，但站点其实是好的**
→ GitHub 托管 runner 在境外，访问国内目标机可能超时。该步骤已带 5 次重试。
本地 `curl` 确认一次；如果本地正常，是 runner 到目标机的网络问题，不是部署失败。

**站点 404 但 nginx 配置正常**
→ 检查 `<APP_DIR>/current` 是否存在、指向的目录是否还在。

**改了 nginx 配置模板之后**
→ 重新执行 `bootstrap-server.sh`，它会重新渲染、校验、reload。

**排行榜是空的 / 前端显示"离线"**
→ `systemctl status pd-leaderboard` 看服务是否在跑；`journalctl -u pd-leaderboard -n 50`
看报错。常见原因：`current-server` 符号链接缺失、venv 未初始化、`data/` 属主不对。

**部署后 API 仍是旧行为**
→ 进程自检重启可能未触发。`systemctl status pd-leaderboard` 看启动时间；
必要时由 root 执行 `systemctl restart pd-leaderboard`。

## 红线

- **不要在服务器上构建。** 不要为了省事装 node 然后 `git pull && npm run build`，
  内存余量不够，会挤压同机上的其他生产业务。
- **不要修改目标机上其他站点的配置。** 本项目的 nginx 配置是 `conf.d` 下一个独立文件，
  只新增不修改。`bootstrap-server.sh` 也刻意不触碰 `/srv/apps` 本身的属主与权限。
- **不要给部署用户通用 sudo。** 当前架构不需要——后端重启靠 `Restart=always` 与进程自检，
  不是靠 `systemctl restart`。若某个改动"需要 sudo 才能做"，多半是架构走偏了，先回来讨论。
- **不要把主机地址、凭据、证书路径写进仓库。**

## 已知风险

| 风险 | 说明 |
|---|---|
| 证书续期耦合 | 复用的通配符证书由同机另一应用续期，该应用下线会波及本站 |
| SSH 对公网开放 | runner 出口 IP 动态，无法白名单。缓解：sshd 仅密钥认证，部署账号无 sudo |
| 共享主机 | 同机其他业务的故障或资源占用会影响本站。既定约束，不是可修的缺陷 |
| 单点 | 无冗余、无负载均衡。黑客松阶段可接受 |

## 后端服务（2026-09-22 起）

排行榜后端已按「引入后端服务时」的流程落地：选型记录在 `docs/PRODUCT_CONCEPT.md` §14，
隔离四条（独立系统用户、独立数据库、进程内存上限、反向代理限流）全部实现，
初始化步骤见上文 §5。

**未来引入 LLM 代理时**，仍要先做同样的两件事：先在 `docs/PRODUCT_CONCEPT.md` 记录决定、
把对应条目从「未决问题」移除，再补齐该服务自己的隔离（独立系统用户与独立限流，
不要与排行榜服务共用账号）。LLM 密钥只存在于服务端的 `.env`（已 gitignore），
`.env.example` 只放安全占位符。

### 已知限制

| 限制 | 影响 | 缓解 |
|---|---|---|
| 后端回滚需重启 | 前端回滚改 `current` 即可，后端还要让服务重启 | 改 `current-server` 符号链接，再 `systemctl restart pd-leaderboard` |
| SQLite 单写入者 | 高并发写入会串行化 | 黑客松规模足够；写入已限流 |
