const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

// Execute the real TextureManager with a fake image factory so the aspect-ratio
// contract of `draw` is pinned down without a browser DOM (issue #67).
const exportsObject = {};
vm.runInNewContext(
    ts.transpileModule(fs.readFileSync('src/tools/TextureManager.ts', 'utf8'), {
        compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020},
    }).outputText,
    {exports: exportsObject, require: () => assert.ok(false, 'TextureManager must stay dependency-free')}
);
const {TextureManager} = exportsObject;

function makeImage(width, height, complete = true) {
    return {src: '', complete, naturalWidth: width, naturalHeight: height, onload: null};
}

function makeCtx() {
    const calls = [];
    return {
        calls,
        save() { calls.push(['save']); },
        translate(x, y) { calls.push(['translate', x, y]); },
        rotate(r) { calls.push(['rotate', r]); },
        restore() { calls.push(['restore']); },
        drawImage(image, x, y, w, h) { calls.push(['drawImage', x, y, w, h]); },
    };
}

let currentImage = null;
const manager = new TextureManager(() => currentImage);

// One distinct src per case: TextureManager caches images by src, so reusing a
// src would silently test the previously injected image.
function draw(src, w, h, rotation = 0) {
    const ctx = makeCtx();
    const ok = manager.draw(ctx, src, 0, 0, w, h, rotation);
    return {ok, ctx};
}

(() => {
    // Wide art (sniper turret, 228x159) in a square box: contain-fit, never stretched.
    currentImage = makeImage(228, 159);
    let {ok, ctx} = draw('tex-wide', 40, 40);
    assert.equal(ok, true);
    const drawCall = ctx.calls.find(c => c[0] === 'drawImage');
    const [, x, y, w, h] = drawCall;
    assert.equal(w, 40, 'wide art fills the box width');
    assert.ok(Math.abs(h - (159 * 40 / 228)) < 1e-9, 'height follows the source aspect ratio');
    assert.equal(x, -w / 2, 'drawn centered on the x axis');
    assert.equal(y, -h / 2, 'drawn centered on the y axis');
    console.log('  ok  wide sprite is contain-fitted, not stretched');

    // Tall art (puppet enemy, 68x108) in a square box: the height wins.
    currentImage = makeImage(68, 108);
    ({ok, ctx} = draw('tex-tall', 16, 16));
    assert.equal(ok, true);
    const [, , y2, w2, h2] = ctx.calls.find(c => c[0] === 'drawImage');
    assert.equal(h2, 16, 'tall art fills the box height');
    assert.ok(Math.abs(w2 - (68 * 16 / 108)) < 1e-9, 'width follows the source aspect ratio');
    assert.equal(y2, -8, 'drawn centered on the y axis');
    console.log('  ok  tall sprite is contain-fitted, not stretched');

    // Rotation is applied around the sprite center (tower aiming).
    currentImage = makeImage(100, 100);
    ({ctx} = draw('tex-square', 40, 40, 1.25));
    assert.deepEqual(ctx.calls.find(c => c[0] === 'rotate'), ['rotate', 1.25], 'rotation is forwarded to the context');
    console.log('  ok  rotation is forwarded for tower aiming');

    // Fail closed: an image that has not finished loading draws nothing.
    currentImage = makeImage(100, 100, false);
    ({ok, ctx} = draw('tex-unloaded', 40, 40));
    assert.equal(ok, false);
    assert.ok(!ctx.calls.some(c => c[0] === 'drawImage'), 'incomplete textures are never drawn');
    console.log('  ok  unloaded textures fail closed without drawing');

    currentImage = makeImage(100, 0);
    ({ok, ctx} = draw('tex-invalid-height', 40, 40));
    assert.equal(ok, false);
    assert.ok(!ctx.calls.some(c => c[0] === 'drawImage'), 'invalid dimensions are never drawn');
    console.log('  ok  invalid texture dimensions fail closed');

    console.log('All TextureManager aspect-ratio tests passed.');
})();
