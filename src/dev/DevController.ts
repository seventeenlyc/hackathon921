// 开发模式控制器（人工 QA 用）。
//
// 这是「人工 QA」入口，不是 AI 能力：它只做两件事——
//   1. 向服务端 `/api/dev/unlock` 提交密码，把当前页面会话 UID 标记为开发会话；
//   2. 在内存里保管开局前的起始波次 / 起始战术资源，供引擎在 IDLE 时应用。
//
// 密码只存在于服务端（环境变量或密码文件），永远不进前端代码、构建产物或提交。
// 是否计入排行榜以服务端 `dev_sessions` 持久化表为准（见 server/src/store.ts），
// 前端只负责在解锁后跳过本地的 RunSync / 成绩提交，避免无意义的 403 噪音。
//
// 本模块刻意不依赖任何 DOM 或引擎单例：状态机与数值校验可脱离浏览器单测，
// 真正改写 waveManager / cashManager 的动作放在 StrategyQueue（引擎边界内）。

export type DevState = 'locked' | 'unlocked';

export interface DevConfig {
    startWave: number;
    startCash: number;
}

/** 起始波次的合法区间。上限取一个对 QA 足够大、又不至于让生成器卡死的范围。 */
export const DEV_MIN_START_WAVE = 1;
export const DEV_MAX_START_WAVE = 9999;
/** 起始战术资源的合法区间：非负整数，上限防荒谬值。 */
export const DEV_MAX_START_CASH = 1_000_000_000;

export type DevUnlockReason =
    | 'NO_SESSION'
    | 'INVALID_PASSWORD'
    | 'DEV_MODE_UNAVAILABLE'
    | 'INVALID_SESSION'
    | 'RUN_ALREADY_STARTED'
    | 'NETWORK_ERROR'
    | 'UNKNOWN';

export type DevConfigReason =
    | 'NOT_INTEGER'
    | 'WAVE_OUT_OF_RANGE'
    | 'CASH_OUT_OF_RANGE';

export interface DevFetchResult {
    ok: boolean;
    status: number;
    body: any;
}

/** 抽象出的传输层，便于在无 fetch 的环境下注入测试替身。 */
export interface DevTransport {
    post(path: string, body: unknown, token: string | null): Promise<DevFetchResult>;
}

const DEFAULT_API_BASE = '/api';

/** 默认传输层：浏览器 fetch，超时与错误都归一成 { ok:false }。 */
function makeDefaultTransport(apiBase: string): DevTransport {
    return {
        async post(path, body, token): Promise<DevFetchResult> {
            const headers: Record<string, string> = { 'content-type': 'application/json' };
            if (token) headers.authorization = 'Bearer ' + token;
            try {
                const response = await fetch(apiBase + path, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(body),
                });
                let parsed: any = null;
                try { parsed = await response.json(); } catch (e) { /* 形如 502 处理 */ }
                return { ok: response.ok, status: response.status, body: parsed };
            } catch (error) {
                return { ok: false, status: 0, body: null };
            }
        },
    };
}

type Listener = () => void;

export class DevController {
    private unlocked = false;
    private config: DevConfig;
    private readonly listeners: Listener[] = [];
    private readonly getToken: () => string | null;
    private readonly transport: DevTransport;

    constructor(
        getToken: () => string | null,
        options: { transport?: DevTransport; apiBase?: string; defaultStartCash: number } = { defaultStartCash: 200 },
    ) {
        this.getToken = getToken;
        this.transport = options.transport || makeDefaultTransport(options.apiBase || DEFAULT_API_BASE);
        this.config = { startWave: 1, startCash: options.defaultStartCash };
    }

    get isUnlocked(): boolean {
        return this.unlocked;
    }

    get state(): DevState {
        return this.unlocked ? 'unlocked' : 'locked';
    }

    getConfig(): DevConfig {
        return { ...this.config };
    }

    onChange(listener: Listener): void {
        this.listeners.push(listener);
    }

    private notify(): void {
        for (const listener of this.listeners) {
            try { listener(); } catch (e) { /* 一个监听器失败不影响其他 */ }
        }
    }

    /** 提交开发密码；成功后当前会话 UID 在服务端被标记为不计榜。 */
    async unlock(password: string): Promise<{ ok: true } | { ok: false; reason: DevUnlockReason }> {
        if (typeof password !== 'string' || password.length === 0) {
            return { ok: false, reason: 'INVALID_PASSWORD' };
        }
        if (this.unlocked) return { ok: true };
        const token = this.getToken();
        if (!token) return { ok: false, reason: 'NO_SESSION' };
        const res = await this.transport.post('/dev/unlock', { password }, token);
        if (res.ok) {
            this.unlocked = true;
            this.notify();
            return { ok: true };
        }
        return { ok: false, reason: this.reasonFromStatus(res) };
    }

    private reasonFromStatus(res: DevFetchResult): DevUnlockReason {
        const error = res.body && typeof res.body === 'object' ? res.body.error : null;
        switch (error) {
            case 'DEV_MODE_UNAVAILABLE': return 'DEV_MODE_UNAVAILABLE';
            case 'INVALID_SESSION': return 'INVALID_SESSION';
            case 'RUN_ALREADY_STARTED': return 'RUN_ALREADY_STARTED';
            case 'INVALID_PASSWORD': return 'INVALID_PASSWORD';
            default:
                return res.status === 0 ? 'NETWORK_ERROR' : 'UNKNOWN';
        }
    }

    /** 设置起始波次；仅校验整数与范围，是否真改写引擎由调用方在 IDLE 时决定。 */
    setStartWave(value: number): { ok: true } | { ok: false; reason: DevConfigReason } {
        if (!Number.isInteger(value)) return { ok: false, reason: 'NOT_INTEGER' };
        if (value < DEV_MIN_START_WAVE || value > DEV_MAX_START_WAVE) {
            return { ok: false, reason: 'WAVE_OUT_OF_RANGE' };
        }
        if (this.config.startWave === value) return { ok: true };
        this.config = { ...this.config, startWave: value };
        this.notify();
        return { ok: true };
    }

    /** 设置起始战术资源；同样只做数值校验。 */
    setStartCash(value: number): { ok: true } | { ok: false; reason: DevConfigReason } {
        if (!Number.isInteger(value)) return { ok: false, reason: 'NOT_INTEGER' };
        if (value < 0 || value > DEV_MAX_START_CASH) return { ok: false, reason: 'CASH_OUT_OF_RANGE' };
        if (this.config.startCash === value) return { ok: true };
        this.config = { ...this.config, startCash: value };
        this.notify();
        return { ok: true };
    }
}
