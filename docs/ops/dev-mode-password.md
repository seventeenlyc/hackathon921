# 开发模式密码配置（运维）

开发模式是人工 QA 入口，让现场快速跳到指定波次（含特殊音乐波次 151 / 201 / 256）验证正常执行，而不必逐波打到那里。开发对局绝不进入排行榜或 Prompt 链。

**密码只存在于服务端。** 永远不要写进前端代码、构建产物或提交。服务端未配置密码时，开发入口 fail closed（`/api/dev/unlock` 返回 `503 DEV_MODE_UNAVAILABLE`）。

## 配置方式

二选一（文件优先）：

### 1. 密码文件（推荐）

只有服务运行用户可读的文件，写入纯文本密码（首尾空白会被 trim）：

```bash
echo -n 'your-strong-passphrase-here' | sudo -u pd tee /etc/pd/dev-password
sudo chmod 600 /etc/pd/dev-password
sudo chown pd:pd /etc/pd/dev-password
```

在 systemd unit 里：

```ini
Environment="PD_DEV_PASSWORD_FILE=/etc/pd/dev-password"
```

### 2. 环境变量（不推荐，会进 `systemctl show` 与 journal）

```ini
Environment="PD_DEV_PASSWORD=your-strong-passphrase-here"
```

> 密钥类配置统一走文件（`PD_SESSION_SECRET_FILE`、`DEEPSEEK_API_KEY_FILE` 同理），避免写进 unit 文件。开发密码不是会话密钥，但同样按密钥对待。

## 校验

- 密码长度上限 128 字符（服务端 `POST /api/dev/unlock` 校验）。
- 服务端用 SHA-256 摘要 + `timingSafeEqual` 常量时间比较，避免时序侧信道。
- 无尝试次数限制（QA 用途，现场调试友好）。

## 行为

- 解锁后，服务端把当前页面会话 UID 写入 `dev_sessions` 表，永久标记为不计榜。
- `POST /api/runs` 对该 UID 返回 `403 DEV_SESSION_UNRANKED`；排行榜查询不会出现该 UID 的任何 run / wave 事件。这是服务端兜底——即便客户端伪造，也无法产生计榜对局。
- 只有 UID 尚无任何 run 时才能切开发模式；已有计榜对局的 UID 返回 `409 RUN_ALREADY_STARTED`。
- 页面刷新按 `docs/PRODUCT_CONCEPT.md` §14 创建新 UID，原开发会话随旧 UID 失效——刷新后需重新确认档案并重新解锁。

## 关闭开发模式

删除配置（`PD_DEV_PASSWORD` / `PD_DEV_PASSWORD_FILE`）并重启服务，入口即 fail closed。已写入 `dev_sessions` 的旧 UID 仍是开发会话，但它们无法创建新 run，自然不会出现在排行榜。
