#!/usr/bin/env bash
#
# 一次性服务器初始化。在目标主机上以 root 执行一次，此后所有部署都由 CI 完成。
#
# 设计约束（docs/PRODUCT_CONCEPT.md §14「部署环境约束」）：
#   - 目标机是已承载其他生产业务的共享服务器，本脚本只新增，绝不修改既有站点的配置
#   - 新服务与既有业务隔离：独立系统用户，且该用户没有 sudo
#   - 服务器不参与构建，只接收 CI 产出的静态产物
#
# 用法：
#   SSL_CERT=/绝对路径/fullchain.pem \
#   SSL_KEY=/绝对路径/privkey.pem \
#     ./bootstrap-server.sh 'ssh-ed25519 AAAA... deploy@prompt-defense'
#
# 可选：覆盖 provider 的 OpenAI 兼容端点与模型名（不是密钥；不传则用代码内置默认值
# api.deepseek.com / deepseek-chat）。环境配置以 /etc/pd/pd-leaderboard.env 为唯一真值
# 来源（unit 用 EnvironmentFile= 指向它），重跑 bootstrap 幂等合并、不会抹掉已写下的值：
# 传参则写入/更新，不传参但 env 文件里已有则保留，不传参且没有则不写（回落代码默认）。
# 因此首次配置好后，重跑**不必**再传一次（issue #135）。
#   DEEPSEEK_BASE_URL=https://<host>/openai/v1 DEEPSEEK_MODEL=<model> \
#     ./bootstrap-server.sh 'ssh-ed25519 AAAA... deploy@prompt-defense'
#
# 本脚本幂等，可安全重复执行。

set -euo pipefail

DOMAIN="prompt-defense.crowntime.cn"
DEPLOY_USER="deploy-prompt-defense"
LEADERBOARD_USER="pd-leaderboard"
PD_PORT="8781"
APP_DIR="/srv/apps/${DOMAIN}"
NGINX_CONF="/etc/nginx/conf.d/${DOMAIN}.conf"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE="${SCRIPT_DIR}/nginx/${DOMAIN}.conf.template"

PUBKEY="${1:-}"

die() { echo "错误: $*" >&2; exit 1; }
step() { echo; echo "==> $*"; }

[ "$(id -u)" -eq 0 ] || die "需要以 root 执行"
[ -n "$PUBKEY" ] || die "缺少部署公钥。用法: SSL_CERT=... SSL_KEY=... $0 '<部署公钥>'"
[ -n "${SSL_CERT:-}" ] || die "需要 SSL_CERT=<fullchain.pem 绝对路径>"
[ -n "${SSL_KEY:-}" ]  || die "需要 SSL_KEY=<privkey.pem 绝对路径>"
[ -r "$SSL_CERT" ] || die "证书不可读: $SSL_CERT"
[ -r "$SSL_KEY" ]  || die "私钥不可读: $SSL_KEY"
[ -f "$TEMPLATE" ] || die "找不到 nginx 模板: $TEMPLATE"
command -v nginx >/dev/null || die "未找到 nginx"
command -v rsync >/dev/null || die "未找到 rsync（CI 推送产物需要）"

step "创建部署用户 ${DEPLOY_USER}（不授予 sudo）"
if id -u "$DEPLOY_USER" >/dev/null 2>&1; then
    echo "用户已存在，跳过"
else
    useradd --system --create-home --home-dir "/home/${DEPLOY_USER}" \
            --shell /bin/bash "$DEPLOY_USER"
    echo "已创建"
fi

step "安装部署公钥"
SSH_DIR="/home/${DEPLOY_USER}/.ssh"
AUTH_KEYS="${SSH_DIR}/authorized_keys"
install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$SSH_DIR"
touch "$AUTH_KEYS"
chmod 600 "$AUTH_KEYS"
chown "${DEPLOY_USER}:${DEPLOY_USER}" "$AUTH_KEYS"
if grep -qxF "$PUBKEY" "$AUTH_KEYS"; then
    echo "公钥已在 authorized_keys 中，跳过"
else
    printf '%s\n' "$PUBKEY" >> "$AUTH_KEYS"
    echo "已追加"
fi

step "创建应用目录 ${APP_DIR}"
# 注意：不碰 /srv/apps 本身的属主与权限，那里还有其他应用。
[ -d /srv/apps ] || install -d -m 755 -o root -g root /srv/apps
mkdir -p "${APP_DIR}/releases"
# nginx 以 nginx 用户读取静态文件，需要目录的 x 权限穿透，故为 755。
chown "${DEPLOY_USER}:${DEPLOY_USER}" "$APP_DIR" "${APP_DIR}/releases"
chmod 755 "$APP_DIR" "${APP_DIR}/releases"

step "放置占位版本"
# 首次部署完成前先让站点有东西可返回，否则 nginx 配置正确但访问 404，很难排查。
if [ -e "${APP_DIR}/current" ]; then
    echo "current 已存在（指向 $(readlink "${APP_DIR}/current" || echo '?')），保持不动"
else
    PLACEHOLDER="${APP_DIR}/releases/_bootstrap"
    mkdir -p "$PLACEHOLDER"
    cat > "${PLACEHOLDER}/index.html" <<'HTML'
<!doctype html>
<meta charset="utf-8">
<title>prompt-defense</title>
<p>站点已初始化，等待首次部署。</p>
HTML
    echo "_bootstrap" > "${PLACEHOLDER}/version.txt"
    chown -R "${DEPLOY_USER}:${DEPLOY_USER}" "$PLACEHOLDER"
    chmod -R a+rX "$PLACEHOLDER"
    ln -sfn "releases/_bootstrap" "${APP_DIR}/current.tmp"
    mv -Tf "${APP_DIR}/current.tmp" "${APP_DIR}/current"
    chown -h "${DEPLOY_USER}:${DEPLOY_USER}" "${APP_DIR}/current"
    echo "已创建"
fi

step "检查 Node.js（后端运行前提：>= 22.13，node:sqlite 才免 --experimental-sqlite）"
NODE_BIN="$(command -v node || true)"
[ -n "$NODE_BIN" ] || die "未找到 node：排行榜后端需要 Node.js >= 22.13"
NODE_VERSION="$("$NODE_BIN" -p 'process.versions.node')"
NODE_MAJOR="${NODE_VERSION%%.*}"
NODE_REST="${NODE_VERSION#*.}"
NODE_MINOR="${NODE_REST%%.*}"
if [ "$NODE_MAJOR" -lt 22 ] || { [ "$NODE_MAJOR" -eq 22 ] && [ "$NODE_MINOR" -lt 13 ]; }; then
    die "Node.js ${NODE_VERSION} 过低：需要 >= 22.13，否则 node:sqlite 需要 --experimental-sqlite"
fi
echo "Node ${NODE_VERSION} 可用（${NODE_BIN}）"

step "创建后端系统用户 ${LEADERBOARD_USER}（无 sudo、无登录 shell）"
if id -u "$LEADERBOARD_USER" >/dev/null 2>&1; then
    echo "用户已存在，跳过"
else
    NOLOGIN="$(command -v nologin || echo /usr/sbin/nologin)"
    useradd --system --no-create-home --shell "$NOLOGIN" "$LEADERBOARD_USER"
    echo "已创建"
fi

step "准备后端数据目录与会话签名密钥"
# 750 + 独立属主：静态站的部署用户读不到排行榜数据库（§14 隔离要求）。
install -d -m 750 -o "$LEADERBOARD_USER" -g "$LEADERBOARD_USER" "${APP_DIR}/data"
SECRET_FILE="${APP_DIR}/data/session_secret"
if [ -f "$SECRET_FILE" ]; then
    echo "密钥已存在，保持不动"
else
    command -v openssl >/dev/null || die "未找到 openssl（生成会话密钥需要）"
    ( umask 077; openssl rand -hex 32 > "$SECRET_FILE" )
    chown "${LEADERBOARD_USER}:${LEADERBOARD_USER}" "$SECRET_FILE"
    chmod 600 "$SECRET_FILE"
    echo "已生成 ${SECRET_FILE}"
fi

step "检查 LLM provider 密钥（data/deepseek_key，供 /api/agent/decide 使用）"
# provider key 由人放置：脚本不生成（也无法本地生成）、不打印、更不写进 unit ——
# unit 是 644 全局可读，写进去等于公开；unit 里只放路径。
# 缺 key 不是致命错误：后端照常启动，只有 /api/agent/decide 返回 503
# PROVIDER_NOT_CONFIGURED（server/src/main.ts 的设计），所以这里只提示、不 die。
DEEPSEEK_KEY_FILE="${APP_DIR}/data/deepseek_key"
if [ -f "$DEEPSEEK_KEY_FILE" ]; then
    # 属主/权限不对会让服务读不到 key，症状是「服务正常但代理报未配置」，最难排查；
    # 因此与 session_secret 一样直接校正。
    chown "${LEADERBOARD_USER}:${LEADERBOARD_USER}" "$DEEPSEEK_KEY_FILE"
    chmod 600 "$DEEPSEEK_KEY_FILE"
    echo "已存在，权限已校正为 600 ${LEADERBOARD_USER}:${LEADERBOARD_USER}"
else
    echo "尚未配置：/api/agent/decide 将返回 503 PROVIDER_NOT_CONFIGURED（排行榜不受影响）" >&2
    echo "放置步骤见 deploy/README.md §5「放置 LLM provider 密钥」；放好后：systemctl restart pd-leaderboard" >&2
fi

step "放置占位后端（等待首次部署）"
if [ -e "${APP_DIR}/current-server" ]; then
    echo "current-server 已存在，保持不动"
else
    PLACEHOLDER_SERVER="${APP_DIR}/releases/_bootstrap-server"
    mkdir -p "$PLACEHOLDER_SERVER"
    # 占位服务同样自检 current-server 变化：首次部署切换符号链接后它主动退出，
    # 由 systemd（Restart=always）拉起真实代码，部署用户因此不需要任何 sudo。
    cat > "${PLACEHOLDER_SERVER}/main.js" <<'PLACEHOLDER_JS'
const http = require('node:http');
const fs = require('node:fs');
const link = process.env.PD_CURRENT_LINK || '';
const started = link && fs.existsSync(link) ? fs.realpathSync(link) : '';
http.createServer((req, res) => {
    res.statusCode = 503;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'NOT_DEPLOYED' }));
}).listen(Number(process.env.PD_PORT || 8781), '127.0.0.1', () => {
    console.log('占位后端已启动，等待首次真实部署');
});
if (link) {
    setInterval(() => {
        const current = fs.existsSync(link) ? fs.realpathSync(link) : '';
        if (current && current !== started) {
            console.log('检测到部署，退出以让 systemd 拉起真实后端');
            process.exit(0);
        }
    }, 3000);
}
PLACEHOLDER_JS
    chown -R "${LEADERBOARD_USER}:${LEADERBOARD_USER}" "$PLACEHOLDER_SERVER"
    chmod 755 "$PLACEHOLDER_SERVER"
    chmod 644 "${PLACEHOLDER_SERVER}/main.js"
    ln -sfn "releases/_bootstrap-server" "${APP_DIR}/current-server.tmp"
    mv -Tf "${APP_DIR}/current-server.tmp" "${APP_DIR}/current-server"
    chown -h "${LEADERBOARD_USER}:${LEADERBOARD_USER}" "${APP_DIR}/current-server"
    echo "已创建"
fi

# 环境配置以 /etc/pd/pd-leaderboard.env 为唯一真值来源（issue #135）：unit 只用
# EnvironmentFile= 指向它，自身不再内联 Environment=。bootstrap 对 env 文件做幂等合并：
#   - 必需键缺失才补，已存在则保留，不覆盖运维手改。
#   - provider 键（DEEPSEEK_BASE_URL / DEEPSEEK_MODEL）：传参则写入/更新；未传但已有则保留；
#     未传且没有则不写（回落代码默认）。这是 #135 的核心：不带参数重跑不再静默抹掉。
#   - 非托管键（PD_DEV_PASSWORD_FILE 及任何运维自加键）：永不触碰。
# 首次创建 env 文件时从既有 unit 与 drop-in 迁移所有 Environment= 行，确保不丢。
# 渲染逻辑与自检抽到 deploy/render-unit.sh，可被 tests/render-unit.test.js 独立验证。
ENV_FILE="/etc/pd/pd-leaderboard.env"
UNIT_PATH="/etc/systemd/system/pd-leaderboard.service"
# /etc/pd 可能已存在（开发模式密码文件 /etc/pd/dev-password 由人放置）；只在缺失时创建，
# 不改既有目录的属主与权限，避免与既有 dev-password 共用目录时产生意外。
if [ ! -d /etc/pd ]; then
    install -d -m 755 -o root -g root /etc/pd
fi

step "安装后端 systemd 服务 pd-leaderboard.service"
echo "provider 端点：${DEEPSEEK_BASE_URL:-<代码默认>}  模型：${DEEPSEEK_MODEL:-<代码默认>}"
# shellcheck source=render-unit.sh
. "${SCRIPT_DIR}/render-unit.sh"
render_service_config "$ENV_FILE" "$UNIT_PATH" "$APP_DIR" "$NODE_BIN" "$LEADERBOARD_USER" "$PD_PORT" "${DEEPSEEK_BASE_URL:-}" "${DEEPSEEK_MODEL:-}" \
    || die "渲染服务配置失败（未安装）"
# env 文件是环境配置的唯一真值来源。它只放路径与端点/模型名（不是密钥本身），
# 但收紧到 600 root:root 比 644 更稳；systemd 以 root 读取 EnvironmentFile，服务进程
# 不需要直接读它。unit 仍是 644（不含任何密钥，仅 EnvironmentFile= 指针与 ExecStart）。
chmod 600 "$ENV_FILE"
chown root:root "$ENV_FILE"
chmod 644 "$UNIT_PATH"
systemctl daemon-reload
systemctl enable pd-leaderboard.service >/dev/null
systemctl restart pd-leaderboard.service
echo "服务已启动（监听 127.0.0.1:${PD_PORT}）"

step "安装 nginx 配置 ${NGINX_CONF}"
BACKUP=""
if [ -f "$NGINX_CONF" ]; then
    BACKUP="$(mktemp)"
    cp -p "$NGINX_CONF" "$BACKUP"
    echo "已备份既有配置"
fi
TMP_CONF="$(mktemp)"
sed -e "s|__SSL_CERT__|${SSL_CERT}|g" \
    -e "s|__SSL_KEY__|${SSL_KEY}|g" \
    "$TEMPLATE" > "$TMP_CONF"
grep -q '__SSL_' "$TMP_CONF" && die "模板中仍有未替换的占位符"
install -m 644 -o root -g root "$TMP_CONF" "$NGINX_CONF"
rm -f "$TMP_CONF"

step "校验 nginx 配置"
# 校验失败必须立即回滚：这台机上还有其他生产站点，绝不能让一个坏配置把它们一起带下去。
if ! nginx -t; then
    echo "配置校验失败，正在回滚" >&2
    if [ -n "$BACKUP" ]; then
        install -m 644 -o root -g root "$BACKUP" "$NGINX_CONF"
        rm -f "$BACKUP"
    else
        rm -f "$NGINX_CONF"
    fi
    nginx -t || echo "警告：回滚后配置仍校验失败，需人工检查" >&2
    die "nginx 配置未生效，既有站点未受影响"
fi
[ -n "$BACKUP" ] && rm -f "$BACKUP"

step "reload nginx"
systemctl reload nginx

cat <<DONE

初始化完成。

  域名        https://${DOMAIN}
  应用目录    ${APP_DIR}
  部署用户    ${DEPLOY_USER}（无 sudo）
  排行榜后端  ${LEADERBOARD_USER} @ 127.0.0.1:${PD_PORT}（无 sudo、无登录 shell）

后续步骤：
  1. 确认 DNS A 记录 ${DOMAIN} 已指向本机
  2. 在 GitHub 仓库配置 Secrets：DEPLOY_HOST / DEPLOY_USER / DEPLOY_SSH_KEY / DEPLOY_KNOWN_HOSTS
  3. push 到 main 触发首次部署
DONE
