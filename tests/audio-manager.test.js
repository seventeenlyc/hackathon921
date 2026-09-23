const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

function loadAudioManager() {
    const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'AudioManager.ts'), 'utf8');
    const js = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 },
    }).outputText;
    const moduleObj = { exports: {} };
    new Function('module', 'exports', 'require', js)(moduleObj, moduleObj.exports, require);
    return moduleObj.exports.AudioManager;
}

class FakeAudio {
    constructor(src, behavior = {}) {
        this.src = src;
        this.behavior = behavior;
        this.loop = false;
        this.currentTime = 0;
        this.playCount = 0;
        this.pauseCount = 0;
    }
    play() {
        this.playCount += 1;
        if (this.behavior.throw) throw new Error('decode failed');
        if (this.behavior.reject) return Promise.reject(new Error('autoplay blocked'));
        return Promise.resolve();
    }
    pause() { this.pauseCount += 1; }
}

async function test(name, fn) {
    try { await fn(); console.log('PASS: ' + name); }
    catch (error) { console.error('FAIL: ' + name, error); process.exitCode = 1; }
}

(async () => {
    const AudioManager = loadAudioManager();

    await test('music loops, reuses its element, and does not reset on repeated start', async () => {
        const created = [];
        const manager = new AudioManager(src => {
            const audio = new FakeAudio(src);
            created.push(audio);
            return audio;
        });
        manager.startMusic();
        created[0].currentTime = 12;
        manager.startMusic();
        assert.strictEqual(created.length, 1);
        assert.strictEqual(created[0].src, '/audio/background.mp3');
        assert.strictEqual(created[0].loop, true);
        assert.strictEqual(created[0].playCount, 1);
        assert.strictEqual(created[0].currentTime, 12);
    });

    await test('playback rejection and synchronous media errors are non-fatal', async () => {
        const rejected = new AudioManager(() => new FakeAudio('/audio/bad.wav', { reject: true }));
        assert.doesNotThrow(() => rejected.startMusic());
        rejected.playWaveReached();
        rejected.playGameOver();
        await Promise.resolve();
        const thrown = new AudioManager(() => new FakeAudio('/audio/bad.wav', { throw: true }));
        assert.doesNotThrow(() => thrown.startMusic());
        assert.doesNotThrow(() => thrown.playWaveReached());
        assert.doesNotThrow(() => thrown.playGameOver());
    });

    await test('muted managers stay silent and synchronous wave calls do not stack sounds', () => {
        const created = [];
        const manager = new AudioManager(src => {
            const audio = new FakeAudio(src);
            created.push(audio);
            return audio;
        });
        manager.setMuted(true);
        manager.startMusic();
        manager.playWaveReached();
        manager.playGameOver();
        assert.deepStrictEqual(created, []);

        manager.setMuted(false);
        manager.playWaveReached();
        manager.playWaveReached();
        assert.strictEqual(created.length, 1);
        assert.strictEqual(created[0].playCount, 1);
    });

    await test('background asset is MP3 and cue assets remain valid PCM WAV files', () => {
        const background = fs.readFileSync(path.join(__dirname, '..', 'public', 'audio', 'background.mp3'));
        const startsWithId3 = background.toString('ascii', 0, 3) === 'ID3';
        const startsWithMpegFrame = background.length > 1 && background[0] === 0xff && (background[1] & 0xe0) === 0xe0;
        assert.ok(startsWithId3 || startsWithMpegFrame);
        assert.ok(background.length > 0);

        for (const name of ['wave.wav', 'game-over.wav']) {
            const file = fs.readFileSync(path.join(__dirname, '..', 'public', 'audio', name));
            assert.strictEqual(file.toString('ascii', 0, 4), 'RIFF');
            assert.strictEqual(file.toString('ascii', 8, 12), 'WAVE');
            assert.strictEqual(file.toString('ascii', 12, 16), 'fmt ');
            assert.ok(file.length > 44);
        }
    });
})();
