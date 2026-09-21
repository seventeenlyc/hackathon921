# 部署

`prompt-defense.crowntime.cn` 的静态前端部署。

## 形态

```
push 到 main
  └─ GitHub Actions: npm ci → npm run test（构建 + 贴图校验）→ tsc --noEmit
       └─ rsync dist/ 到 服务器:<APP_DIR>/releases/<commit-sha>/
            └─ 原子切换 current 符号链接 → 校验 https://<域名>/version.txt
```

**构建只在 CI 发生，服务器不参与构建。** 这是 `docs/PRODUCT_CONCEPT.md` §14 的硬约束：
目标机是已承载其他生产业务的共享服务器，构建峰值会挤压既有服务。

服务器上的目录布局：

```
<APP_DIR>/
├── releases/
│   ├── <commit-sha>/     每次部署一个目录，保留最近 5 个
│   └── ...
└── current -> releases/<commit-sha>
```

nginx 的 `root` 指向 `current`。nginx 在每次请求时才解析符号链接，所以**切换版本不需要
reload nginx**，部署用户因此完全不需要 sudo。

## 一次性初始化

### 1. DNS

添加 A 记录 `prompt-defense.crowntime.cn` → 目标机公网 IP。

`*.crowntime.cn` 的通配符证书在目标机上已存在且已被其他站点复用，**不需要跑 certbot**。

### 2. 生成部署密钥

在本地生成一对**专用**密钥，不要复用任何个人密钥：

```sh
ssh-keygen -t ed25519 -N '' -C 'github-actions@prompt-defense' -f ./deploy_key
```

### 3. 在服务器上执行初始化

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

### 4. 配置 GitHub Secrets

仓库 Settings → Secrets and variables → Actions：

| Secret | 值 |
|---|---|
| `DEPLOY_HOST` | 目标机公网 IP |
| `DEPLOY_USER` | `deploy-prompt-defense` |
| `DEPLOY_SSH_KEY` | `deploy_key` 的**私钥**全文 |
| `DEPLOY_KNOWN_HOSTS` | `ssh-keyscan -H <IP>` 的输出 |

主机地址与凭据只存在于 Secrets，不写进仓库 —— 见 `docs/PRODUCT_CONCEPT.md` §14。

配置完成后删除本地的 `deploy_key` 私钥。

### 5. 触发首次部署

push 到 `main` 即可。PR 上只跑 `build` job，不部署。

## 回滚

不需要重跑 CI，也不需要 sudo：

```sh
ssh <部署用户>@<主机> '
  cd <APP_DIR>
  ls -1dt releases/*/                      # 看有哪些版本
  ln -sfn releases/<目标sha> current.tmp
  mv -Tf current.tmp current               # 原子切换
  readlink current
'
```

清理逻辑会保护**本次部署的版本**和**上一版**，所以回滚目标不会在下一次部署时被删掉。

## 排障

**`https://<域名>/version.txt` 返回的 sha 不是最新的**
→ 部署没成功，或浏览器缓存。`version.txt` 和 `index.html` 都配了 `no-cache`，
先用 `curl` 而不是浏览器确认。

**Verify deployment 步骤失败，但站点其实是好的**
→ GitHub 托管 runner 在境外，访问这台国内机器可能超时。该步骤已带 5 次重试。
本地 `curl` 确认一次；如果本地正常，是 runner 到目标机的网络问题，不是部署失败。

**`npm ci` 报 `EBADENGINE`**
→ 警告而非错误。`package.json` 的 `engines: >=14 <18` 是上游 inert 留下的过时声明，
描述的是 Windows 上缺 VS Build Tools 时 deasync 装不上的情况（见 `.NODE_ENV_README.md`），
不是跨平台约束。Node 22 下 `npm ci` / `build` / `test` / `tsc` 均已实测通过。
该字段的清理属于 issue #1（迁移到 Vite）的范围。

**改了 nginx 配置模板之后**
→ 重新执行 `bootstrap-server.sh` 即可，它会重新渲染、校验、reload。

## 边界

- 本目录下的配置**只新增，不修改**目标机上任何既有站点的配置。
- 部署用户没有 sudo，可写范围仅限 `<APP_DIR>`。部署密钥即使泄露，影响面也限于这一个静态站。
- **本部署不含任何 LLM 能力。** 上线的是 inert 游戏底座本身。
  服务端 DeepSeek 代理尚无代码，后端技术栈按 `AGENTS.md` 仍未选型。
