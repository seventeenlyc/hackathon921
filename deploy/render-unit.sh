#!/usr/bin/env bash
#
# 服务端 systemd 配置渲染：env 文件幂等合并 + 静态 unit 模板。
# 被 deploy/bootstrap-server.sh source；也被 tests/render-unit.test.js 单独 source 调用。
#
# 设计目标（issue #135）：重跑 bootstrap 不得静默抹掉 unit 上已有的配置。
#   - env 文件（默认 /etc/pd/pd-leaderboard.env）是环境配置的**唯一真值来源**；
#     unit 自身只保留非环境指令（ExecStart、资源限制等）与一条 EnvironmentFile= 指向它。
#   - 必需键缺失才补（deterministic 值），已存在则原样保留，绝不覆盖运维手改。
#   - provider 键（DEEPSEEK_BASE_URL / DEEPSEEK_MODEL）：本次传参则写入/更新；未传参但
#     已存在则保留；未传参且不存在则不写（回落代码默认）。这是 #135 的核心。
#   - 非托管键（PD_DEV_PASSWORD_FILE 及任何运维自加键）：永不触碰，原样保留。
#   - 首次创建 env 文件时，从既有 unit 与 drop-in 迁移所有 Environment= 行，确保不丢。
#   - 渲染后自检：必需键缺失、或「重跑前已存在的可选键重跑后消失」均为致命错误（fail closed）。
#
# 之所以用 EnvironmentFile 而不是把 Environment= 直接写进 unit：unit 是 644 全局可读，
# 集中到 env 文件（600 root:root）后，配置只有一处真值，重跑时幂等合并、不降级；
# unit 模板因此变成纯静态（无 ${PROVIDER_ENV} 之类的行内命令替换），历史上 ${PROVIDER_ENV}
# 粘行把 PD_CURRENT_LINK 吃掉的那类拼串 bug 从结构上消失。

# verify_service_config <env_file> <unit_path>
#   只校验不写：unit 有 EnvironmentFile= 与 ExecStart=，env 文件有全部必需键。
#   成功返回 0；失败打印到 stderr 并返回 1（不 exit）。
verify_service_config() {
    local env_file="$1" unit_path="$2"
    grep -q "^EnvironmentFile=${env_file}\$" "$unit_path" \
        || { printf '%s\n' "verify: unit 缺少 EnvironmentFile=${env_file}" >&2; return 1; }
    grep -q '^ExecStart=' "$unit_path" \
        || { printf '%s\n' "verify: unit 缺少 ExecStart=" >&2; return 1; }
    local k
    for k in PD_DB_PATH PD_SESSION_SECRET_FILE DEEPSEEK_API_KEY_FILE PD_CURRENT_LINK PD_PORT; do
        grep -q "^${k}=" "$env_file" \
            || { printf '%s\n' "verify: env 文件缺少必需键 ${k}" >&2; return 1; }
    done
    return 0
}

# render_service_config <env_file> <unit_path> <app_dir> <node_bin> <lb_user> <port> [base_url] [model]
#   幂等合并 env 文件并重写 unit 模板。成功返回 0；失败打印到 stderr 并返回 1（不 exit，
#   由调用方决定是否 die）。
render_service_config() {
    local env_file="$1" unit_path="$2" app_dir="$3" node_bin="$4"
    local lb_user="$5" port="$6"
    local base_url="${7:-}" model="${8:-}"
    local dropin_dir="${unit_path}.d"

    # 重跑前的可选键存在性快照（env 文件 ∪ 既有 unit ∪ drop-in），用于非降级自检。
    # provider 本次传参也算「预期重跑后仍存在」。
    local -A expect_after=()
    local k
    for k in DEEPSEEK_BASE_URL DEEPSEEK_MODEL PD_DEV_PASSWORD_FILE; do
        if [ "$k" = DEEPSEEK_BASE_URL ] && [ -n "$base_url" ]; then expect_after[$k]=1; continue; fi
        if [ "$k" = DEEPSEEK_MODEL ]    && [ -n "$model" ];    then expect_after[$k]=1; continue; fi
        if { [ -f "$env_file" ]  && grep -q "^${k}="            "$env_file"; } \
        || { [ -f "$unit_path" ] && grep -q "^Environment=${k}=" "$unit_path"; } \
        || { [ -d "$dropin_dir" ] && grep -rq "^Environment=${k}=" "$dropin_dir"/*.conf 2>/dev/null; }; then
            expect_after[$k]=1
        fi
    done

    # 收集既有环境键：env 文件 + 既有 unit/drop-in 的 Environment= 行（迁移用）。
    # Environment=KEY=VALUE 或 "KEY=VALUE" → KEY=VALUE；假定每行一对外（本仓库约定）。
    local tmp_env
    tmp_env="$(mktemp "${env_file}.tmp.XXXXXX")" || { printf '%s\n' "render: mktemp 失败" >&2; return 1; }
    # 收集里的每个 grep 都可能无匹配（返回 1）。本脚本以 `set -euo pipefail` 运行，
    # 一个无匹配的 grep 会让大括号组以非零退出、pipefail 连带 awk 段失败。因此每条 grep
    # 都用 `|| true` 兜住，且大括号组以 `true` 收尾，保证输入段恒为 0 —— 这样只有 awk
    # 本身出错才会走到 `|| { rm; return 1 }`。
    {
        [ -f "$env_file" ]  && cat "$env_file" || true
        if [ -f "$unit_path" ]; then
            grep -h '^Environment=' "$unit_path" 2>/dev/null \
                | sed 's/^Environment=//; s/^"//; s/"$//' || true
        fi
        if [ -d "$dropin_dir" ]; then
            local f
            for f in "$dropin_dir"/*.conf; do
                [ -f "$f" ] || continue
                grep -h '^Environment=' "$f" 2>/dev/null \
                    | sed 's/^Environment=//; s/^"//; s/"$//' || true
            done
        fi
        true
    } | awk \
        -v bu="$base_url" -v mo="$model" \
        -v dbp="${app_dir}/data/leaderboard.sqlite3" \
        -v ssf="${app_dir}/data/session_secret" \
        -v akf="${app_dir}/data/deepseek_key" \
        -v pcl="${app_dir}/current-server" \
        -v prt="$port" '
        BEGIN {
            nfill=0
            fk[nfill]="PD_DB_PATH";             fv[nfill]=dbp; nfill++
            fk[nfill]="PD_SESSION_SECRET_FILE";  fv[nfill]=ssf; nfill++
            fk[nfill]="DEEPSEEK_API_KEY_FILE";   fv[nfill]=akf; nfill++
            fk[nfill]="PD_CURRENT_LINK";         fv[nfill]=pcl; nfill++
            fk[nfill]="PD_PORT";                 fv[nfill]=prt; nfill++
            nset=0
            sk[nset]="DEEPSEEK_BASE_URL"; sv[nset]=bu; nset++
            sk[nset]="DEEPSEEK_MODEL";    sv[nset]=mo; nset++
        }
        /^[[:space:]]*#/ || /^[[:space:]]*$/ { print; next }
        {
            eq=index($0,"=")
            if(eq==0){ print; next }
            key=substr($0,1,eq-1)
            if(key in seen) next                  # 去重：保留首次出现
            seen[key]=1
            for(i=0;i<nset;i++) if(sk[i]==key && sv[i]!=""){ print key "=" sv[i]; next }
            print                                  # 保留既有（必需键已存在 / provider 保留 / 非托管键）
        }
        END {
            for(i=0;i<nfill;i++){ k=fk[i]; if(!(k in seen)){ print k "=" fv[i]; seen[k]=1 } }
            for(i=0;i<nset;i++){  k=sk[i]; if(sv[i]!="" && !(k in seen)){ print k "=" sv[i]; seen[k]=1 } }
        }
    ' > "$tmp_env" || { rm -f "$tmp_env"; printf '%s\n' "render: awk 渲染失败" >&2; return 1; }
    mv -f "$tmp_env" "$env_file" || { rm -f "$tmp_env"; printf '%s\n' "render: 写入 $env_file 失败" >&2; return 1; }

    # unit 模板：纯静态。所有环境配置已移入 env 文件，避免 ${PROVIDER_ENV} 类行内替换。
    cat > "$unit_path" <<UNIT
[Unit]
Description=prompt-defense leaderboard API
After=network.target

[Service]
Type=simple
User=${lb_user}
Group=${lb_user}
WorkingDirectory=${app_dir}/current-server
EnvironmentFile=${env_file}
ExecStart=${node_bin} ${app_dir}/current-server/main.js
Restart=always
RestartSec=2
# §14 要求的进程内存上限。排行榜是轻量 I/O 服务，256M 有充足余量。
MemoryMax=256M
NoNewPrivileges=yes
PrivateTmp=yes

[Install]
WantedBy=multi-user.target
UNIT

    # ── 自检 ──
    verify_service_config "$env_file" "$unit_path" || return 1
    # 非降级（#135 核心）：重跑前已存在或本次传参的可选键，重跑后必须在 env 文件里。
    for k in DEEPSEEK_BASE_URL DEEPSEEK_MODEL PD_DEV_PASSWORD_FILE; do
        if [ -n "${expect_after[$k]:-}" ]; then
            grep -q "^${k}=" "$env_file" \
                || { printf '%s\n' "render: 降级 —— ${k} 重跑前已存在/本次已传，重跑后从 env 文件消失" >&2; return 1; }
        fi
    done
    return 0
}
