const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../src/AudioManager.ts'), 'utf8');
const loaded = { exports: {} };
new Function('module', 'exports', ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 } }).outputText)(loaded, loaded.exports);
const { AudioManager } = loaded.exports;
class FakeAudio {
    constructor(src) {
        Object.assign(this, { src, loop: false, currentTime: 0, volume: 1, playCount: 0, pauseCount: 0, onended: null, onerror: null });
    }
    play() {
        this.playCount++;
    }
    pause() {
        this.pauseCount++;
    }
    end() {
        this.onended?.();
    }
}
function fixture() {
    const created = [];
    const visibility = { hidden: false, addEventListener(n, f) {
            this.listener = f;
        } };
    const manager = new AudioManager(src => {
        const a = new FakeAudio(src);
        created.push(a);
        return a;
    }, { visibility, random: () => 0 });
    return { manager, created, visibility };
}
async function test(name, fn) {
    try {
        await fn();
        console.log('PASS: ' + name);
    }
    catch (e) {
        console.error('FAIL: ' + name, e);
        process.exitCode = 1;
    }
}
(async () => {
    await test('selection waits for interaction and loops without stacking', () => {
        const { manager: m, created: c } = fixture();
        assert.equal(c.length, 0);
        m.unlock();
        assert.equal(c[0].src, '/audio/background/selected.mp3');
        assert.equal(c[0].loop, true);
        m.unlock();
        assert.equal(c[0].playCount, 1);
    });
    await test('normal battle rotates distinct tracks without consecutive repeats', () => {
        const { manager: m, created: c } = fixture();
        m.unlock();
        m.beginRun(1);
        const first = c.at(-1);
        assert.ok(first.src.includes('fight'));
        assert.ok(c[0].pauseCount);
        m.beginRun(1);
        assert.equal(first.playCount, 1);
        first.end();
        const next = c.at(-1);
        assert.notEqual(next.src, first.src);
        next.end();
        assert.notEqual(c.at(-1).src, next.src);
    });
    await test('Route expansion transition cuts immediately and repeated wave notifications preserve position', () => {
        const { manager: m, created: c } = fixture();
        m.beginRun(1);
        const fight = c.at(-1);
        m.setRouteExpansion(true);
        const boss = c.at(-1);
        assert.equal(boss.src, '/audio/background/boss.mp3');
        assert.equal(boss.loop, true);
        assert.ok(fight.pauseCount);
        boss.currentTime = 17;
        m.setRouteExpansion(true);
        assert.equal(boss.playCount, 1);
        assert.equal(boss.currentTime, 17);
        fight.end();
        assert.equal(c.at(-1), boss);
        m.setRouteExpansion(false);
        assert.ok(boss.pauseCount);
        assert.ok(c.at(-1).src.includes('fight'));
    });
    await test('pause mute and hidden tab resume one track at its existing position', () => {
        const { manager: m, created: c, visibility: v } = fixture();
        m.beginRun(1);
        const music = c[0];
        music.currentTime = 23;
        for (const method of ['setPaused', 'setMuted']) {
            m[method](true);
            m.unlock();
            const count = music.playCount;
            m[method](false);
            assert.equal(music.playCount, count + 1);
            assert.equal(music.currentTime, 23);
        }
        v.hidden = true;
        v.listener();
        const count = music.playCount;
        v.hidden = false;
        v.listener();
        assert.equal(music.playCount, count + 1);
        assert.equal(c.length, 1);
    });
    await test('wave cue does not stack; game over stops music and plays cue once', () => {
        const { manager: m, created: c } = fixture();
        m.beginRun(1);
        m.playWaveReached();
        const wave = c.at(-1);
        m.playWaveReached();
        assert.equal(wave.playCount, 1);
        wave.end();
        m.playWaveReached();
        assert.equal(wave.playCount, 2);
        m.playGameOver();
        const over = c.at(-1);
        assert.equal(over.src, '/audio/game-over.wav');
        assert.ok(c[0].pauseCount);
        m.playGameOver();
        m.unlock();
        assert.equal(over.playCount, 1);
        assert.equal(c.length, 3);
    });
    await test('volume clamps and scales music and cues', () => {
        const { manager: m, created: c } = fixture();
        m.beginRun(1);
        m.playWaveReached();
        m.setVolume(.5);
        assert.equal(c[0].volume, .24 * .5);
        assert.equal(c[1].volume, .18 * .5);
        m.playGameOver();
        assert.equal(c[2].volume, .2 * .5);
        m.setVolume(-1);
        assert.equal(c[1].volume, 0);
        assert.equal(c[2].volume, 0);
        m.setVolume(5);
        assert.equal(c[2].volume, .2);
    });
    await test('autoplay rejection retries on interaction and missing media is nonfatal', async () => {
        const c = [];
        const m = new AudioManager(src => {
            const a = new FakeAudio(src);
            a.play = () => {
                a.playCount++;
                return a.playCount === 1 ? Promise.reject(new Error('blocked')) : Promise.resolve();
            };
            c.push(a);
            return a;
        });
        m.unlock();
        await Promise.resolve();
        m.unlock();
        assert.equal(c[0].playCount, 2);
        const broken = new AudioManager(() => {
            throw new Error('missing');
        });
        assert.doesNotThrow(() => {
            broken.unlock();
            broken.beginRun(1);
            broken.setRouteExpansion(true);
            broken.playWaveReached();
            broken.playGameOver();
        });
    });
    await test('invalid run and muted start never play audio', () => {
        const { manager: m, created: c } = fixture();
        m.beginRun(0);
        assert.equal(c.length, 0);
        m.setMuted(true);
        m.unlock();
        m.beginRun(1);
        assert.ok(c.every(a => a.playCount === 0));
        m.setMuted(false);
        assert.equal(c.at(-1).playCount, 1);
    });
    await test('cue failure releases its latch and pause/mute/visibility suppress cues', async () => {
        const { manager: m, created: c, visibility: v } = fixture();
        m.beginRun(1);
        m.playWaveReached();
        const cue = c.at(-1);
        cue.onerror();
        m.playWaveReached();
        assert.equal(cue.playCount, 2);
        for (const setter of ['setPaused', 'setMuted']) {
            m[setter](true);
            assert.ok(cue.pauseCount > 0);
            m.playWaveReached();
            assert.equal(cue.playCount, 2);
            m[setter](false);
        }
        v.hidden = true;
        v.listener();
        m.playWaveReached();
        assert.equal(cue.playCount, 2);
        m.playGameOver();
        assert.equal(c.length, 2, 'hidden result does not play its cue');
        v.hidden = false;
        v.listener();
        m.beginRun(1);
        m.playGameOver();
        assert.equal(c.at(-1).src, '/audio/game-over.wav');
        assert.equal(c.at(-1).playCount, 1);
    });
    await test('only supplied music and generated WAV cues are shipped', () => {
        const dir = path.join(__dirname, '../public/audio');
        assert.deepEqual(fs.readdirSync(dir).sort(), ['background', 'game-over.wav', 'wave.wav']);
        assert.deepEqual(fs.readdirSync(path.join(dir, 'background')).sort(), ['boss.mp3', 'fight1.mp3', 'fight2.mp3', 'fight3.mp3', 'selected.mp3']);
        for (const name of ['wave.wav', 'game-over.wav']) {
            const b = fs.readFileSync(path.join(dir, name));
            assert.equal(b.toString('ascii', 0, 4), 'RIFF');
            assert.equal(b.toString('ascii', 8, 12), 'WAVE');
        }
        const hashes = new Set();
        for (const name of fs.readdirSync(path.join(dir, 'background'))) {
            const b = fs.readFileSync(path.join(dir, 'background', name));
            assert.ok(b.length > 1000);
            hashes.add(require('node:crypto').createHash('sha256').update(b).digest('hex'));
        }
        assert.equal(hashes.size, 5);
    });
})();
