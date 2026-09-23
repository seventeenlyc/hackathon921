// Signed session token bound to the server-created page-session UID.
// The UID is an internal identity key; nicknames and avatars remain display data.

import { createHmac, timingSafeEqual } from 'node:crypto';

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

/** Sign the internal UID and issue time. The API never renders the UID as profile text. */
export function signToken(secret: string, uid: number, issuedAt: number): string {
    if (!Number.isSafeInteger(uid) || uid < 1) throw new Error('INVALID_UID');
    const payload = `${issuedAt}.${uid}`;
    return `${toBase64Url(payload)}.${sign(secret, payload)}`;
}

/** Validate signature and lifetime, returning the bound UID or null. */
export function verifyToken(secret: string, token: unknown, now: number): number | null {
    if (typeof token !== 'string' || token.length === 0) return null;
    const dot = token.indexOf('.');
    if (dot <= 0) return null;

    const payloadB64 = token.slice(0, dot);
    const signature = token.slice(dot + 1);
    if (signature.length === 0) return null;

    let payload: string;
    try {
        payload = fromBase64Url(payloadB64);
    } catch (error) {
        return null;
    }

    const expected = sign(secret, payload);
    const given = Buffer.from(signature);
    const want = Buffer.from(expected);
    if (given.length !== want.length || !timingSafeEqual(given, want)) return null;

    const sep = payload.indexOf('.');
    if (sep <= 0) return null;
    const issuedAt = Number(payload.slice(0, sep));
    if (!Number.isSafeInteger(issuedAt)) return null;
    if (issuedAt > now + CLOCK_SKEW_MS) return null;
    if (now - issuedAt > TOKEN_TTL_MS) return null;

    const uidText = payload.slice(sep + 1);
    if (!/^[1-9]\d*$/.test(uidText)) return null;
    const uid = Number(uidText);
    return Number.isSafeInteger(uid) ? uid : null;
}
