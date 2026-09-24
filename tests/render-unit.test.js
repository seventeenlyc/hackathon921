// render-unit.test.js —— 部署渲染逻辑回归测试（无 DOM、无 systemd、无 root、无网络）。
//
// 通过 spawn bash source deploy/render-unit.sh，在临时目录里反复调用 render_service_config，
// 验证 issue #135 的修复：重跑 bootstrap（不带 provider 参数）不得静默抹掉 unit 上已有的
//   - PD_DEV_PASSWORD_FILE（运维手加 / drop-in 迁移）
//   - DEEPSEEK_BASE_URL / DEEPSEEK_MODEL（provider 端点与模型）
//
// 场景：
//   1. 迁移：旧式 unit（Environment= 内联）+ drop-in(PD_DEV_PASSWORD_FILE) → env 文件全量继承，unit 改用 EnvironmentFile=。
//   2. 幂等不降级：不带参数重跑 → 三个可选键全部仍在、值不变。
//   3. provider 更新保留 dev 密码：带新 provider 参数 → provider 更新、PD_DEV_PASSWORD_FILE 仍在。
//   4. #135 核心：provider 更新后不带参数重跑 → provider 仍是更新后的值（不回落默认）、PD_DEV_PASSWORD_FILE 仍在。
//   5. 自检：verify_service_config 对缺失必需键的 env 文件返回非零。

const assert = require('assert');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const REPO = path.join(__dirname, '..');
const RENDER_UNIT = path.join(REPO, 'deploy', 'render-unit.sh');

const APP_DIR = '/srv/apps/prompt-defense.crowntime.cn';
const NODE_BIN = '/usr/local/bin/node';
const LB_USER = 'pd-leaderboard';
const PORT = '8781';

function mkdtemp() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'render-unit-'));
}

// 旧式 unit（Environment= 内联），用于迁移场景。
function oldStyleUnit(envFile) {
    return [
        '[Unit]',
        'Description=prompt-defense leaderboard API',
        'After=network.target',
        '',
        '[Service]',
        'Type=simple',
        `User=${LB_USER}`,
        `Group=${LB_USER}`,
        `WorkingDirectory=${APP_DIR}/current-server`,
        `Environment=PD_DB_PATH=${APP_DIR}/data/leaderboard.sqlite3`,
        `Environment=PD_SESSION_SECRET_FILE=${APP_DIR}/data/session_secret`,
        `Environment=DEEPSEEK_API_KEY_FILE=${APP_DIR}/data/deepseek_key`,
        `Environment=DEEPSEEK_BASE_URL=https://chatapi.weixin.qq.com/openai/v1`,
        `Environment=DEEPSEEK_MODEL=Deepseek-v4-flash`,
        `Environment=PD_CURRENT_LINK=${APP_DIR}/current-server`,
        `Environment=PD_PORT=${PORT}`,
        `ExecStart=${NODE_BIN} ${APP_DIR}/current-server/main.js`,
        'Restart=always',
        'RestartSec=2',
        'MemoryMax=256M',
        '',
        '[Install]',
        'WantedBy=multi-user.target',
        '',
    ].join('\n');
}

function writeFile(p, content) { fs.writeFileSync(p, content); }

function render(dir, args = {}) {
    const envFile = path.join(dir, 'pd-leaderboard.env');
    const unitPath = path.join(dir, 'pd-leaderboard.service');
    const env = {
        ...process.env,
        RSC_ENV_FILE: envFile,
        RSC_UNIT_PATH: unitPath,
        RSC_APP_DIR: APP_DIR,
        RSC_NODE_BIN: NODE_BIN,
        RSC_LB_USER: LB_USER,
        RSC_PORT: PORT,
        RSC_BASE_URL: args.baseUrl || '',
        RSC_MODEL: args.model || '',
    };
    const cmd = `set -euo pipefail; source "${RENDER_UNIT}"; render_service_config "$RSC_ENV_FILE" "$RSC_UNIT_PATH" "$RSC_APP_DIR" "$RSC_NODE_BIN" "$RSC_LB_USER" "$RSC_PORT" "$RSC_BASE_URL" "$RSC_MODEL"`;
    execFileSync('bash', ['-c', cmd], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    return { envFile, unitPath };
}

function verifyOnly(dir, envFileName = 'pd-leaderboard.env', unitName = 'pd-leaderboard.service') {
    const envFile = path.join(dir, envFileName);
    const unitPath = path.join(dir, unitName);
    const env = { ...process.env };
    const cmd = `set -euo pipefail; source "${RENDER_UNIT}"; verify_service_config "$1" "$2"`;
    try {
        execFileSync('bash', ['-c', cmd, 'verify', envFile, unitPath], { env, stdio: ['ignore', 'pipe', 'pipe'] });
        return 0;
    } catch (e) {
        return e.status ?? 1;
    }
}

function envValue(envFile, key) {
    const txt = fs.readFileSync(envFile, 'utf8');
    const re = new RegExp(`^${key}=(.*)$`, 'm');
    const m = txt.match(re);
    return m ? m[1] : null;
}
function envHas(envFile, key) { return envValue(envFile, key) !== null; }
function unitText(dir) { return fs.readFileSync(path.join(dir, 'pd-leaderboard.service'), 'utf8'); }

let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log('  ✓', name); passed++; }

function test(name, fn) {
    console.log(name);
    fn();
}

// ── 场景 1：迁移 ──
test('迁移：旧式 unit + drop-in → env 文件全量继承，unit 改用 EnvironmentFile=', () => {
    const dir = mkdtemp();
    writeFile(path.join(dir, 'pd-leaderboard.service'), oldStyleUnit());
    fs.mkdirSync(path.join(dir, 'pd-leaderboard.service.d'));
    writeFile(
        path.join(dir, 'pd-leaderboard.service.d', '10-dev-password.conf'),
        '[Service]\nEnvironment="PD_DEV_PASSWORD_FILE=/etc/pd/dev-password"\n',
    );
    // env 文件尚不存在 —— 首次运行应从 unit + drop-in 迁移。

    const { envFile, unitPath } = render(dir);  // 不带参数

    // 必需键全部继承
    for (const k of ['PD_DB_PATH', 'PD_SESSION_SECRET_FILE', 'DEEPSEEK_API_KEY_FILE', 'PD_CURRENT_LINK', 'PD_PORT']) {
        ok(`迁移保留必需键 ${k}`, envHas(envFile, k));
    }
    // provider 从旧 unit 迁移过来（不被默认值覆盖）
    ok('迁移 provider DEEPSEEK_BASE_URL', envValue(envFile, 'DEEPSEEK_BASE_URL') === 'https://chatapi.weixin.qq.com/openai/v1');
    ok('迁移 provider DEEPSEEK_MODEL', envValue(envFile, 'DEEPSEEK_MODEL') === 'Deepseek-v4-flash');
    // dev 密码从 drop-in 迁移到 env 文件（变得持久，不再仅依赖可删的 drop-in）
    ok('迁移 PD_DEV_PASSWORD_FILE', envValue(envFile, 'PD_DEV_PASSWORD_FILE') === '/etc/pd/dev-password');
    // unit 改用 EnvironmentFile=，且不再内联任何 Environment=（配置单一来源）
    const unit = fs.readFileSync(unitPath, 'utf8');
    ok('unit 含 EnvironmentFile=', unit.includes(`EnvironmentFile=${envFile}`));
    ok('unit 不再内联 Environment=', !/^Environment=/m.test(unit));
    ok('unit 仍有 ExecStart=', /^ExecStart=/m.test(unit));

    fs.rmSync(dir, { recursive: true, force: true });
});

// ── 场景 2：幂等不降级 ──
test('幂等不降级：不带参数重跑，三个可选键全部仍在、值不变', () => {
    const dir = mkdtemp();
    writeFile(path.join(dir, 'pd-leaderboard.service'), oldStyleUnit());
    fs.mkdirSync(path.join(dir, 'pd-leaderboard.service.d'));
    writeFile(path.join(dir, 'pd-leaderboard.service.d', '10-dev-password.conf'),
        '[Service]\nEnvironment="PD_DEV_PASSWORD_FILE=/etc/pd/dev-password"\n');

    const { envFile } = render(dir);  // 首次：迁移
    const before = {
        base: envValue(envFile, 'DEEPSEEK_BASE_URL'),
        model: envValue(envFile, 'DEEPSEEK_MODEL'),
        dev: envValue(envFile, 'PD_DEV_PASSWORD_FILE'),
    };
    // 删掉 drop-in（模拟运维已把 dev 密码迁进 env 文件后清理 drop-in），仅靠 env 文件
    fs.rmSync(path.join(dir, 'pd-leaderboard.service.d', '10-dev-password.conf'));

    render(dir);  // 不带参数重跑：不应降级
    render(dir);  // 再跑一次确认幂等

    ok('DEEPSEEK_BASE_URL 重跑后仍在且不变', envValue(envFile, 'DEEPSEEK_BASE_URL') === before.base);
    ok('DEEPSEEK_MODEL 重跑后仍在且不变', envValue(envFile, 'DEEPSEEK_MODEL') === before.model);
    ok('PD_DEV_PASSWORD_FILE 重跑后仍在且不变', envValue(envFile, 'PD_DEV_PASSWORD_FILE') === before.dev);

    fs.rmSync(dir, { recursive: true, force: true });
});

// ── 场景 3：provider 更新保留 dev 密码 ──
test('provider 更新：带新 provider 参数 → provider 更新、PD_DEV_PASSWORD_FILE 仍在', () => {
    const dir = mkdtemp();
    writeFile(path.join(dir, 'pd-leaderboard.service'), oldStyleUnit());
    fs.mkdirSync(path.join(dir, 'pd-leaderboard.service.d'));
    writeFile(path.join(dir, 'pd-leaderboard.service.d', '10-dev-password.conf'),
        '[Service]\nEnvironment="PD_DEV_PASSWORD_FILE=/etc/pd/dev-password"\n');
    const { envFile } = render(dir);  // 迁移
    fs.rmSync(path.join(dir, 'pd-leaderboard.service.d', '10-dev-password.conf'));

    render(dir, { baseUrl: 'https://api.deepseek.com', model: 'deepseek-reasoner' });

    ok('provider 端点已更新', envValue(envFile, 'DEEPSEEK_BASE_URL') === 'https://api.deepseek.com');
    ok('provider 模型已更新', envValue(envFile, 'DEEPSEEK_MODEL') === 'deepseek-reasoner');
    ok('PD_DEV_PASSWORD_FILE 仍在', envValue(envFile, 'PD_DEV_PASSWORD_FILE') === '/etc/pd/dev-password');

    fs.rmSync(dir, { recursive: true, force: true });
});

// ── 场景 4（#135 核心）：provider 更新后不带参数重跑，不回落默认 ──
test('#135 核心：provider 更新后不带参数重跑 → provider 仍是更新后的值（不回落默认）', () => {
    const dir = mkdtemp();
    writeFile(path.join(dir, 'pd-leaderboard.service'), oldStyleUnit());
    fs.mkdirSync(path.join(dir, 'pd-leaderboard.service.d'));
    writeFile(path.join(dir, 'pd-leaderboard.service.d', '10-dev-password.conf'),
        '[Service]\nEnvironment="PD_DEV_PASSWORD_FILE=/etc/pd/dev-password"\n');
    const { envFile } = render(dir);
    fs.rmSync(path.join(dir, 'pd-leaderboard.service.d', '10-dev-password.conf'));
    render(dir, { baseUrl: 'https://api.deepseek.com', model: 'deepseek-reasoner' });

    // 此前正是 bug：不带参数重跑会把 provider 两行抹掉，服务回落 api.deepseek.com/deepseek-chat。
    render(dir);  // 不带参数

    ok('DEEPSEEK_BASE_URL 不回落默认', envValue(envFile, 'DEEPSEEK_BASE_URL') === 'https://api.deepseek.com');
    ok('DEEPSEEK_MODEL 不回落默认', envValue(envFile, 'DEEPSEEK_MODEL') === 'deepseek-reasoner');
    ok('PD_DEV_PASSWORD_FILE 不丢', envValue(envFile, 'PD_DEV_PASSWORD_FILE') === '/etc/pd/dev-password');

    fs.rmSync(dir, { recursive: true, force: true });
});

// ── 场景 5：自检对缺失必需键返回非零 ──
test('自检：verify_service_config 对缺失必需键的 env 文件返回非零', () => {
    const dir = mkdtemp();
    // 构造一个缺 PD_DB_PATH 的 env 文件 + 合法 unit
    writeFile(path.join(dir, 'pd-leaderboard.env'),
        ['PD_SESSION_SECRET_FILE=x', 'DEEPSEEK_API_KEY_FILE=y', 'PD_CURRENT_LINK=z', 'PD_PORT=8781', ''].join('\n'));
    writeFile(path.join(dir, 'pd-leaderboard.service'),
        `[Service]\nEnvironmentFile=${path.join(dir, 'pd-leaderboard.env')}\nExecStart=/bin/true\n`);
    const code = verifyOnly(dir);
    ok('缺 PD_DB_PATH 时 verify 返回非零', code !== 0);

    fs.rmSync(dir, { recursive: true, force: true });
});

console.log(`\n${passed} passed`);
