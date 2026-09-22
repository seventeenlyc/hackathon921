// 输入校验测试：这些规则是服务端边界，前端来的任何值都必须过这一关。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_WAVE, sanitizeLimit, sanitizeUsername, sanitizeWave } from '../src/validate';

test('sanitizeUsername 接受中英文/数字/下划线/短横线并 trim', () => {
    assert.equal(sanitizeUsername('  Alice  '), 'Alice');
    assert.equal(sanitizeUsername('玩家_01'), '玩家_01');
    assert.equal(sanitizeUsername('a-b_c'), 'a-b_c');
});

test('sanitizeUsername 拒绝空 / 超长 / 非法字符 / 非字符串', () => {
    assert.equal(sanitizeUsername(''), null);
    assert.equal(sanitizeUsername('   '), null);
    assert.equal(sanitizeUsername('abc/def'), null);
    assert.equal(sanitizeUsername('x<img>y'), null);
    assert.equal(sanitizeUsername('<script>alert(1)</script>'), null);
    assert.equal(sanitizeUsername(42), null);
    assert.equal(sanitizeUsername(null), null);
    assert.equal(sanitizeUsername(undefined), null);
});

test('sanitizeUsername 长度边界：16 合法、17 非法', () => {
    assert.equal(sanitizeUsername('a'.repeat(16)), 'a'.repeat(16));
    assert.equal(sanitizeUsername('a'.repeat(17)), null);
});

test('sanitizeWave 只接受 1..MAX_WAVE 的整数', () => {
    assert.equal(sanitizeWave(1), 1);
    assert.equal(sanitizeWave(MAX_WAVE), MAX_WAVE);
    assert.equal(sanitizeWave(0), null);
    assert.equal(sanitizeWave(-3), null);
    assert.equal(sanitizeWave(2.5), null);
    assert.equal(sanitizeWave(MAX_WAVE + 1), null);
    assert.equal(sanitizeWave('7'), null);
    assert.equal(sanitizeWave(Number.MAX_SAFE_INTEGER), null);
    assert.equal(sanitizeWave(NaN), null);
});

test('sanitizeLimit 默认 10、非正数回落默认、上限 100', () => {
    assert.equal(sanitizeLimit(undefined), 10);
    assert.equal(sanitizeLimit('abc'), 10);
    assert.equal(sanitizeLimit(0), 10);
    assert.equal(sanitizeLimit(-5), 10);
    assert.equal(sanitizeLimit(3), 3);
    assert.equal(sanitizeLimit('25'), 25);
    assert.equal(sanitizeLimit(1000), 100);
});
