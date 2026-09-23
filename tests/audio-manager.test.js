const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

function loadAudioManager(tracks = ['/audio/background/background.mp3']) {
    const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'AudioManager.ts'), 'utf8');
    const js = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 },
    }).outputText;
    const moduleObj = { exports: {} };
    new Function('module', 'exports', 'require', '__BACKGROUND_TRACKS__', js)(
        moduleObj, moduleObj.exports, require, tracks,
    );
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
        this.onended = null;
    }
    play() {
        this.playCount += 1;
        if (this.behavior.throw) throw new Error('decode failed');
        if (this.behavior.reject) return Promise.reject(new Error('autoplay blocked'));
        return Promise.resolve();
    }
    pause() { this.pauseCount += 1; }
    end() { if (this.onended) this.onended(); }
}

async function test(name, fn) {
    try { await fn(); console.log('PASS: ' + name); }
    catch (error) { console.error('FAIL: ' + name, error); process.exitCode = 1; }
}

(async () => {
    const AudioManager = loadAudioManager();

    await test('music reuses its element and does not reset on repeated start', async () => {
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
        assert.strictEqual(created[0].src, '/audio/background/background.mp3');
        assert.strictEqual(created[0].loop, false);
        assert.strictEqual(created[0].volume, 0.24);
        assert.strictEqual(created[0].playCount, 1);
        assert.strictEqual(created[0].currentTime, 12);
    });

    await test('ended tracks choose another folder track without an immediate repeat', async () => {
        const tracks = [
            '/audio/background/a.mp3',
            '/audio/background/b.ogg',
            '/audio/background/c.wav',
        ];
        const created = [];
        const randomValues = [0, 0, 0.9];
        const manager = new AudioManager(src => {
            const audio = new FakeAudio(src);
            created.push(audio);
            return audio;
        }, tracks, () => randomValues.shift());

        manager.startMusic();
        created[0].end();
        created[1].end();

        assert.deepStrictEqual(created.map(audio => audio.src), [tracks[0], tracks[1], tracks[0]]);
        assert.ok(created.every(audio => audio.volume === 0.24 && audio.loop === false));
    });

    await test('wave 201 switches from the playlist to the fixed final track', async () => {
        const created = [];
        const manager = new AudioManager(src => {
            const audio = new FakeAudio(src);
            created.push(audio);
            return audio;
        });
        manager.setWave(200);
        manager.startMusic();
        manager.setWave(201);
        assert.strictEqual(created[0].pauseCount, 1);
        assert.strictEqual(created[1].src, '/audio/final_bgm.mp3');
        assert.strictEqual(created[1].loop, true);
        assert.strictEqual(created[1].volume, 0.24);
        assert.strictEqual(created[1].playCount, 1);
        manager.setMuted(true);
        manager.setMuted(false);
        manager.startMusic();
        created[0].end();

        assert.strictEqual(created.length, 2);
        assert.strictEqual(created[1].playCount, 2);
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
        const background = fs.readFileSync(path.join(__dirname, '..', 'public', 'audio', 'background', 'background.mp3'));
        const startsWithId3 = background.toString('ascii', 0, 3) === 'ID3';
        const startsWithMpegFrame = background.length > 1 && background[0] === 0xff && (background[1] & 0xe0) === 0xe0;
        assert.ok(startsWithId3 || startsWithMpegFrame);
        assert.ok(background.length > 0);

        const finalTrack = fs.readFileSync(path.join(__dirname, '..', 'public', 'audio', 'final_bgm.mp3'));
        const finalStartsWithId3 = finalTrack.toString('ascii', 0, 3) === 'ID3';
        const finalStartsWithMpegFrame = finalTrack.length > 1 && finalTrack[0] === 0xff && (finalTrack[1] & 0xe0) === 0xe0;
        assert.ok(finalStartsWithId3 || finalStartsWithMpegFrame);

        for (const name of ['wave.wav', 'game-over.wav']) {
            const file = fs.readFileSync(path.join(__dirname, '..', 'public', 'audio', name));
            assert.strictEqual(file.toString('ascii', 0, 4), 'RIFF');
            assert.strictEqual(file.toString('ascii', 8, 12), 'WAVE');
            assert.strictEqual(file.toString('ascii', 12, 16), 'fmt ');
            assert.ok(file.length > 44);
        }
    });

    await test('Vite playlist includes every supported audio file in the background folder', async () => {
        const { default: config } = await import('../vite.config.mjs');
        const tracks = JSON.parse(config.define.__BACKGROUND_TRACKS__);
        const directory = path.join(__dirname, '..', 'public', 'audio', 'background');
        const expected = fs.readdirSync(directory)
            .filter(name => /\.(mp3|ogg|wav|m4a)$/i.test(name))
            .sort()
            .map(name => `/audio/background/${encodeURIComponent(name)}`);
        assert.deepStrictEqual(tracks, expected);
        assert.ok(tracks.length > 0);
    });
})();
