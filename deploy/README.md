# 部署 —— 运维手册

服务器初始化、回滚、凭据管理。**需要主机访问权限**。

日常开发不需要这份文档 —— 合并到 `main` 即自动部署。开发者看 `docs/DEPLOYMENT.md`。

部署相关的已确认决定记录在 `docs/PRODUCT_CONCEPT.md` §14（真值来源）。

## 架构

```
push 到 main
  └─ GitHub Actions: npm ci → npm run test → tsc --noEmit → 后端测试
       └─ rsync dist/ 与 server/ 到 服务器:<APP_DIR>/releases/<commit-sha>/
            ├─ 原子切换 current 符号链接 → 校验 https://<域名>/version.txt
            └─ 原子切换 current-server 符号链接 → 后端进程自检版本后由 systemd 拉起
```

**构建只在 CI 发生，服务器不参与构建。** 这是 `docs/PRODUCT_CONCEPT.md` §14 的硬约束：
目标机是已承载其他生产业务的共享服务器，构建峰值会挤压既有服务。这也是服务器上
没有也不需要 node 的原因。后端是 Python 源码，CI 同样只同步文件，不在服务器上安装依赖。

服务器上的目录布局：

```
<APP_DIR>/
├── releases/
│   ├── <commit-sha>/
│   │   ├── index.html …   前端构建产物（nginx root）
│   │   └── server/        后端源码（Python，systemd 运行）
│   └── ...                每次部署一个目录，保留最近 5 个
├── current         -> releases/<commit-sha>            nginx root
├── current-server  -> releases/<commit-sha>/server     后端运行目录
├── data/           leaderboard.sqlite3、session_secret  属 pd-leaderboard
└── venv/           Python 虚拟环境（一次性安装）
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

脚本会：创建无 sudo 的系统用户 → 安装公钥 → 建应用目录 → 放一个占位页面 →
渲染并安装 nginx 配置 → `nginx -t` → reload。

**`nginx -t` 失败时脚本会自动回滚自己的配置文件并退出**，不会让一个坏配置把
这台机上其他站点一起带下去。

### 5. 初始化排行榜后端（root，一次性）

后端是 FastAPI + SQLite，由 systemd 以**独立系统用户**运行。`bootstrap-server.sh` 在 root 下
幂等地完成这一节；下面说明它做了什么，便于排障。登录 shell 为 `nologin`，无 sudo。

- **独立系统用户 `pd-leaderboard`**：`--system`，无登录 shell，无 sudo。隔离要求见
  `docs/PRODUCT_CONCEPT.md` §14 —— **不要复用**静态站的 `deploy-prompt-defense`。
- **Python 虚拟环境 `<APP_DIR>/venv`**：`python3 -m venv` 创建，再安装
  `server/requirements.txt`。**依赖只在此安装一次**；服务器上不做构建，也不在每次部署时装依赖。
- **数据目录 `<APP_DIR>/data`**：属 `pd-leaderboard`（mode 750），存
  `leaderboard.sqlite3`（WAL）。750 确保静态站的部署用户读不到排行榜数据库。
- **会话签名密钥 `<APP_DIR>/data/session_secret`**：首次用 `openssl rand -hex 32` 生成，
  权限 600、属 `pd-leaderboard`。**绝不进仓库**（`AGENTS.md`「密钥」）。
- **systemd unit** `/etc/systemd/system/pd-leaderboard.service`：

  ```ini
  [Unit]
  Description=prompt-defense leaderboard API
  After=network.target

  [Service]
  Type=simple
  User=pd-leaderboard
  Group=pd-leaderboard
  WorkingDirectory=/srv/apps/prompt-defense.crowntime.cn/current-server
  Environment=PD_DB_PATH=/srv/apps/prompt-defense.crowntime.cn/data/leaderboard.sqlite3
  Environment=PD_SESSION_SECRET_FILE=/srv/apps/prompt-defense.crowntime.cn/data/session_secret
  ExecStart=/srv/apps/prompt-defense.crowntime.cn/venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8781
  Restart=always
  RestartSec=2
  # §14 要求的进程内存上限。排行榜是轻量 I/O 服务，256M 有充足余量。
  MemoryMax=256M
  NoNewPrivileges=yes
  PrivateTmp=yes

  [Install]
  WantedBy=multi-user.target
  ```

- **部署用户为何仍然不需要 sudo**：unit 用 `Restart=always`。部署只切换 `current-server`
  符号链接；服务进程在每个请求前比对一次版本文件，发现变化就退出，systemd 随即用新代码拉起。
  切换与重启都不需要部署用户的任何特权——与静态站「符号链接原子切换、不 reload nginx」
  是同一个思路。
- **nginx 反代与限流**：见 `nginx/<域名>.conf.template` 的 `/api/` location，`limit_req`
  按 §14 要求配置。

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
| 依赖变更需人工重装 | 改了 `server/requirements.txt` 的 PR 合并后，服务不会自动装新依赖 | 运维在 `<APP_DIR>` 重跑 `venv/bin/pip install -r releases/<sha>/server/requirements.txt`，再 `systemctl restart pd-leaderboard` |
| 后端回滚需重启 | 前端回滚改 `current` 即可，后端还要让服务重启 | 改 `current-server` 符号链接，再 `systemctl restart pd-leaderboard` |
| SQLite 单写入者 | 高并发写入会串行化 | 黑客松规模足够；写入已限流 |
