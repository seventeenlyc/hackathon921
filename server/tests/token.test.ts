// 会话 token 测试：签名往返、防篡改、过期与时钟偏移。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TOKEN_TTL_MS, signToken, verifyToken } from '../src/token';

const SECRET = 'test-secret';

test('签发的 token 可被校验并还原昵称', () => {
    const now = 1_000_000;
    const token = signToken(SECRET, 'Alice', now);
    assert.equal(verifyToken(SECRET, token, now), 'Alice');
});

test('篡改签名无效', () => {
    const now = 1_000_000;
    const token = signToken(SECRET, 'Alice', now);
    const [payload, signature] = token.split('.');
    const broken = `${payload}.${signature.slice(0, -1)}${signature.endsWith('A') ? 'B' : 'A'}`;
    assert.equal(verifyToken(SECRET, broken, now), null);
});

test('篡改 payload（改成别的昵称）无效', () => {
    const now = 1_000_000;
    const token = signToken(SECRET, 'Alice', now);
    const signature = token.split('.')[1];
    const forgedPayload = Buffer.from(`${now}.Bob`).toString('base64url');
    assert.equal(verifyToken(SECRET, `${forgedPayload}.${signature}`, now), null);
});

test('换密钥后旧 token 失效', () => {
    const now = 1_000_000;
    const token = signToken('other-secret', 'Alice', now);
    assert.equal(verifyToken(SECRET, token, now), null);
});

test('过期 token 失效，未过期仍有效', () => {
    const issued = 1_000_000;
    const token = signToken(SECRET, 'Alice', issued);
    assert.equal(verifyToken(SECRET, token, issued + TOKEN_TTL_MS - 1), 'Alice');
    assert.equal(verifyToken(SECRET, token, issued + TOKEN_TTL_MS + 1), null);
});

test('签发时间远超当前时间视为无效，少量偏移可容忍', () => {
    const now = 1_000_000;
    const farFuture = signToken(SECRET, 'Alice', now + 10 * 60 * 1000);
    assert.equal(verifyToken(SECRET, farFuture, now), null);

    const slightSkew = signToken(SECRET, 'Alice', now + 1000);
    assert.equal(verifyToken(SECRET, slightSkew, now), 'Alice');
});

test('畸形 token 返回 null 而不是抛错', () => {
    const now = 1_000_000;
    const badInputs: any[] = ['', 'nodot', '.', 'a.b', 'x.y.z', null, undefined, 123, {}];
    for (const bad of badInputs) {
        assert.equal(verifyToken(SECRET, bad, now), null);
    }
});

test('payload 中昵称非法时视为无效', () => {
    const now = 1_000_000;
    // 直接构造一个签名正确的 token，但昵称含非法字符，校验必须拒绝。
    const payload = `${now}.bad/name`;
    const token = signToken(SECRET, 'bad/name', now);
    assert.equal(verifyToken(SECRET, token, now), null);
    assert.ok(payload.length > 0);
});
