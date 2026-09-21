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

后续步骤：
  1. 确认 DNS A 记录 ${DOMAIN} 已指向本机
  2. 在 GitHub 仓库配置 Secrets：DEPLOY_HOST / DEPLOY_USER / DEPLOY_SSH_KEY / DEPLOY_KNOWN_HOSTS
  3. push 到 main 触发首次部署
DONE
