// 会话 token：仅昵称、无账号体系下的轻量身份。
//
// 设计约束（docs/PRODUCT_CONCEPT.md §9 / §14）：
//  - 无注册、无密码，token 只用来把「某次上报」绑定到「某个昵称」，防止替他人刷榜；
//  - 用 HMAC-SHA256 签名，密钥只存在于服务器（PD_SESSION_SECRET_FILE），绝不进仓库；
//  - 带签发时间，服务端校验有效期，过期即失效。
//
// 这**不是**防作弊的全部：成绩真值仍以服务端记录的对局证据为准（见 store.ts）。
// token 的作用是让「谁提交的」可校验，而不是让「分数」可校验。

import { createHmac, timingSafeEqual } from 'node:crypto';
import { sanitizeUsername } from './validate';

export const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

/** 允许的客户端时钟超前量：防止签名者时钟比服务器快一点就被判无效。 */
const CLOCK_SKEW_MS = 60 * 1000;

function toBase64Url(input: string | any): string {
    return Buffer.from(input).toString('base64url');
}

function fromBase64Url(encoded: string): string {
    return Buffer.from(encoded, 'base64url').toString('utf8');
}

function sign(secret: string, payload: string): string {
    return createHmac('sha256', secret).update(payload).digest('base64url');
}

/** 签发 token：payload 为 `<issuedAt>.<username>`，编码后与签名以 '.' 相连。 */
export function signToken(secret: string, username: string, issuedAt: number): string {
    const payload = `${issuedAt}.${username}`;
    return `${toBase64Url(payload)}.${sign(secret, payload)}`;
}

/**
 * 校验 token，返回其中的昵称；任何问题（格式、签名、过期、时钟超前、昵称非法）一律返回 null。
 * 比较签名用 timingSafeEqual，避免按字节比较泄露信息。
 */
export function verifyToken(secret: string, token: unknown, now: number): string | null {
    if (typeof token !== 'string' || token.length === 0) return null;
    const dot = token.indexOf('.');
    if (dot <= 0) return null;

    const payloadB64 = token.slice(0, dot);
    const signature = token.slice(dot + 1);
    if (signature.length === 0) return null;

    let payload: string;
    try {
        payload = fromBase64Url(payloadB64);
    } catch (e) {
        return null;
    }

    const expected = sign(secret, payload);
    const given = Buffer.from(signature);
    const want = Buffer.from(expected);
    if (given.length !== want.length || !timingSafeEqual(given, want)) return null;

    const sep = payload.indexOf('.');
    if (sep <= 0) return null;

    const issuedAt = Number(payload.slice(0, sep));
    if (!Number.isFinite(issuedAt)) return null;
    if (issuedAt > now + CLOCK_SKEW_MS) return null;
    if (now - issuedAt > TOKEN_TTL_MS) return null;

    return sanitizeUsername(payload.slice(sep + 1));
}
