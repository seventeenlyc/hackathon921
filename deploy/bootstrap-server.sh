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

step "安装后端 systemd 服务 pd-leaderboard.service"
UNIT_PATH="/etc/systemd/system/pd-leaderboard.service"
cat > "$UNIT_PATH" <<UNIT
[Unit]
Description=prompt-defense leaderboard API
After=network.target

[Service]
Type=simple
User=${LEADERBOARD_USER}
Group=${LEADERBOARD_USER}
WorkingDirectory=${APP_DIR}/current-server
Environment=PD_DB_PATH=${APP_DIR}/data/leaderboard.sqlite3
Environment=PD_SESSION_SECRET_FILE=${APP_DIR}/data/session_secret
Environment=PD_CURRENT_LINK=${APP_DIR}/current-server
Environment=PD_PORT=${PD_PORT}
ExecStart=${NODE_BIN} ${APP_DIR}/current-server/main.js
Restart=always
RestartSec=2
# §14 要求的进程内存上限。排行榜是轻量 I/O 服务，256M 有充足余量。
MemoryMax=256M
NoNewPrivileges=yes
PrivateTmp=yes

[Install]
WantedBy=multi-user.target
UNIT
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
