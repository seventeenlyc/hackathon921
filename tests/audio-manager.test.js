const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const specialNames = {
    1: 'inner universe（启动战斗专用不循环）.mp4',
    151: 'Freak Out (151波次专用曲).mp4',
    201: 'M01 謡I-Making of Cyborg （201波次启动此曲专用）.mp4',
    256: 'MVlithium flower(256彩蛋专用）.mp4',
};
const specialTracks = Object.fromEntries(Object.entries(specialNames)
    .map(([wave, name]) => [wave, `/audio/${encodeURIComponent(name)}`]));

function loadAudioManager(tracks = [
    '/audio/background/background.mp3',
    ...Object.values(specialTracks),
]) {
    const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'AudioManager.ts'), 'utf8');
    const js = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 },
    }).outputText;
    const moduleObj = { exports: {} };
    new Function('module', 'exports', 'require', '__BACKGROUND_TRACKS__', '__SPECIAL_MUSIC_PATHS__', js)(
        moduleObj, moduleObj.exports, require, tracks, specialTracks,
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
        }, undefined, () => 0);
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
            specialTracks[151],
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

        assert.deepStrictEqual(created.map(audio => audio.src), [tracks[0], tracks[2], tracks[0]]);
        assert.ok(created.every(audio => audio.volume === 0.24 && audio.loop === false));
    });

    await test('waves 1, 151, 201 and 256 play their dedicated tracks once outside the loop', async () => {
        const created = [];
        const tracks = [
            '/audio/background/background.mp3',
            ...Object.values(specialTracks),
            '/audio/extra.mp4',
        ];
        const manager = new AudioManager(src => {
            const audio = new FakeAudio(src);
            created.push(audio);
            return audio;
        }, tracks, () => 0);
        manager.startMusic();
        for (const wave of [1, 151, 201, 256]) {
            manager.setWave(wave);
            const dedicated = created[created.length - 1];
            assert.strictEqual(dedicated.src, specialTracks[wave]);
            assert.strictEqual(dedicated.loop, false);
            assert.strictEqual(dedicated.playCount, 1);
            manager.setWave(wave);
            dedicated.end();
            assert.ok([tracks[0], tracks[tracks.length - 1]].includes(created[created.length - 1].src));
            assert.notStrictEqual(created[created.length - 1].src, dedicated.src);
        }

        const dedicatedTracks = created.filter(audio => Object.values(specialTracks).includes(audio.src));
        assert.deepStrictEqual(dedicatedTracks.map(audio => audio.src), Object.values(specialTracks));
        assert.ok(created.filter(audio => !dedicatedTracks.includes(audio)).every(audio => audio.loop === false));
        manager.setMuted(true);
        manager.setMuted(false);
        manager.startMusic();
        assert.ok(created.every(audio => audio.src !== '/audio/final_bgm.mp3'));
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

    await test('regular background is MP3, milestone assets are MP4, and cues are PCM WAV', () => {
        const background = fs.readFileSync(path.join(__dirname, '..', 'public', 'audio', 'background', 'background.mp3'));
        const startsWithId3 = background.toString('ascii', 0, 3) === 'ID3';
        const startsWithMpegFrame = background.length > 1 && background[0] === 0xff && (background[1] & 0xe0) === 0xe0;
        assert.ok(startsWithId3 || startsWithMpegFrame);
        assert.ok(background.length > 0);

        for (const name of Object.values(specialNames)) {
            const specialTrack = fs.readFileSync(path.join(__dirname, '..', 'public', 'audio', name));
            assert.strictEqual(specialTrack.toString('ascii', 4, 8), 'ftyp', `${name} should be an MP4 container`);
            assert.ok(specialTrack.length > 1000);
        }
        for (const wave of Object.keys(specialNames)) {
            assert.ok(!fs.existsSync(path.join(__dirname, '..', 'public', 'audio', 'background', `${wave}.mp3`)));
        }

        for (const name of ['wave.wav', 'game-over.wav']) {
            const file = fs.readFileSync(path.join(__dirname, '..', 'public', 'audio', name));
            assert.strictEqual(file.toString('ascii', 0, 4), 'RIFF');
            assert.strictEqual(file.toString('ascii', 8, 12), 'WAVE');
            assert.strictEqual(file.toString('ascii', 12, 16), 'fmt ');
            assert.ok(file.length > 44);
        }
    });

    await test('Vite playlist includes all 12 regular demo tracks, excludes four milestones', async () => {
        const { default: config } = await import('../vite.config.mjs');
        const tracks = JSON.parse(config.define.__BACKGROUND_TRACKS__);
        const specials = JSON.parse(config.define.__SPECIAL_MUSIC_PATHS__);
        const directory = path.join(__dirname, '..', 'public', 'audio');
        const regularMp4 = fs.readdirSync(directory)
            .filter(name => /\.mp4$/i.test(name) && !Object.values(specialNames).includes(name))
            .sort()
            .map(name => `/audio/${encodeURIComponent(name)}`);
        assert.strictEqual(regularMp4.length, 12);
        assert.deepStrictEqual(specials, specialTracks);
        assert.deepStrictEqual(tracks, ['/audio/background/background.mp3', ...regularMp4]);
        assert.ok(tracks.every(track => !Object.values(specials).includes(track)));
    });
})();
