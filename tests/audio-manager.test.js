const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const specialNames = {
    1: 'inner universe（启动战斗专用不循环）.mp4',
    151: 'Freak Out (151波次专用曲).mp4',
    201: 'M01 謡I-Making of Cyborg （201波次启动此曲专用）.mp4',
    256: 'MVlithium flower(256彩蛋专用）.mp4',
};
const specialTracks = Object.fromEntries(Object.entries(specialNames)
    .map(([wave, name]) => [wave, `/audio/${encodeURIComponent(name)}`]));

function loadAudioManager(tracks = ['/audio/background/background.mp3', ...Object.values(specialTracks)], phasePools = {
    tactical: tracks, siege: tracks, lastStand: tracks,
}) {
    const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'AudioManager.ts'), 'utf8');
    const js = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 },
    }).outputText;
    const loaded = {exports: {}};
    new Function('module', 'exports', '__BACKGROUND_TRACKS__', '__SPECIAL_MUSIC_PATHS__', '__PHASE_MUSIC_PATHS__', js)(
        loaded, loaded.exports, tracks, specialTracks, phasePools,
    );
    return loaded.exports.AudioManager;
}

class FakeClock {
    now = 0;
    pending = new Map();
    nextId = 0;
    schedule = (callback, delay) => {
        const id = ++this.nextId;
        this.pending.set(id, {at: this.now + delay, callback});
        return () => this.pending.delete(id);
    };
    tick(ms) {
        const until = this.now + ms;
        while (true) {
            const next = [...this.pending.entries()]
                .filter(([, task]) => task.at <= until)
                .sort((a, b) => a[1].at - b[1].at)[0];
            if (!next) break;
            this.now = next[1].at;
            this.pending.delete(next[0]);
            next[1].callback();
        }
        this.now = until;
    }
    environment(visibility) {
        return {now: () => this.now, schedule: this.schedule, visibility};
    }
}

class FakeVisibility {
    hidden = false;
    listeners = {};
    addEventListener(name, listener) { (this.listeners[name] ||= []).push(listener); }
    dispatch(name) { for (const listener of this.listeners[name] || []) listener(); }
}

class FakeAudio {
    constructor(src, behavior = {}) {
        this.src = src;
        this.behavior = behavior;
        this.loop = false;
        this.currentTime = 0;
        this.volume = 1;
        this.playCount = 0;
        this.pauseCount = 0;
        this.onended = null;
        this.onerror = null;
    }
    play() {
        this.playCount += 1;
        if (this.behavior.throw) throw new Error('decode failed');
        if (this.behavior.reject && this.playCount === 1) return Promise.reject(new Error('autoplay blocked'));
        // Most tests model an immediately-started medium. Separate tests below
        // exercise the real HTMLMediaElement.play() promise timing.
        return undefined;
    }
    pause() { this.pauseCount += 1; }
    end() { this.onended?.(); }
    error() { this.onerror?.(); }
}

async function test(name, fn) {
    try { await fn(); console.log('PASS: ' + name); }
    catch (error) { console.error('FAIL: ' + name, error); process.exitCode = 1; }
}

(async () => {
    const AudioManager = loadAudioManager();

    await test('IDLE is silent; run one starts the dedicated track and reuses it', () => {
        const created = [];
        const clock = new FakeClock();
        const manager = new AudioManager(src => { const audio = new FakeAudio(src); created.push(audio); return audio; },
            undefined, () => 0, clock.environment());
        manager.startMusic();
        manager.onUserGesture();
        manager.setWave(151);
        assert.equal(created.length, 0);
        manager.beginRun(1);
        assert.equal(manager.musicPhase, 'tactical');
        assert.equal(created[0].src, specialTracks[1]);
        assert.equal(created[0].volume, 0);
        assert.equal(created[0].loop, false);
        clock.tick(450);
        assert.equal(created[0].volume, 0.24);
        created[0].currentTime = 12;
        manager.beginRun(1);
        manager.startMusic();
        assert.equal(created.length, 1);
        assert.equal(created[0].playCount, 1);
        assert.equal(created[0].currentTime, 12);
        created[0].end();
        assert.equal(created[1].src, '/audio/background/background.mp3');
    });

    await test('each narrative phase uses its own replaceable playlist after its milestone', () => {
        const tracks = ['/audio/tactical.mp3', '/audio/siege.mp3', '/audio/last.mp3', ...Object.values(specialTracks)];
        const phases = {tactical: [tracks[0]], siege: [tracks[1]], lastStand: [tracks[2]]};
        const Manager = loadAudioManager(tracks, phases);
        const created = [];
        const clock = new FakeClock();
        const manager = new Manager(src => { const audio = new FakeAudio(src); created.push(audio); return audio; },
            tracks, () => 0, clock.environment());
        manager.beginRun(1);
        created.at(-1).end();
        assert.equal(created.at(-1).src, tracks[0]);
        manager.setWave(151);
        clock.tick(450);
        created.at(-1).end();
        assert.equal(created.at(-1).src, tracks[1]);
        manager.setWave(201);
        clock.tick(1050);
        created.at(-1).end();
        assert.equal(created.at(-1).src, tracks[2]);
        manager.playGameOver();
        manager.beginRun(175);
        assert.equal(manager.musicPhase, 'siege');
        assert.equal(created.at(-1).src, tracks[1], 'a jump into the middle of a phase uses that phase playlist');
    });

    await test('regular tracks advance on ending without an immediate repeat', () => {
        const tracks = ['/audio/background/a.mp3', specialTracks[151], '/audio/background/b.ogg', '/audio/background/c.wav'];
        const created = [];
        const clock = new FakeClock();
        const randomValues = [0, 0, 0.9];
        const manager = new (loadAudioManager(tracks))(src => {
            const audio = new FakeAudio(src); created.push(audio); return audio;
        }, tracks, () => randomValues.shift(), clock.environment());
        manager.beginRun(2);
        clock.tick(450);
        created[0].end();
        clock.tick(450);
        created[1].end();
        clock.tick(450);
        assert.deepEqual(created.map(audio => audio.src), [tracks[0], tracks[2], tracks[0]]);
        assert.ok(created.every(audio => audio.volume === 0.24 && audio.loop === false));
    });

    await test('wave 200 ducks the active track and restores it without delaying play', () => {
        const clock = new FakeClock();
        const created = [];
        const manager = new AudioManager(src => { const audio = new FakeAudio(src); created.push(audio); return audio; },
            undefined, () => 0, clock.environment());
        manager.beginRun(200);
        clock.tick(450);
        const current = created[0];
        assert.equal(current.volume, 0.24);
        manager.duckForMissionComplete();
        clock.tick(180);
        assert.equal(current.volume, 0.24 * 0.35);
        clock.tick(600 + 180);
        assert.equal(current.volume, 0.24);
        assert.equal(created.length, 1);
        manager.duckForMissionComplete();
        clock.tick(90);
        manager.setWave(201);
        clock.tick(450 + 600);
        assert.equal(created.at(-1).src, specialTracks[201], 'a wave transition cancels an in-flight duck');
    });

    await test('milestones select once; phase fades and the 200 boundary holds briefly', () => {
        const created = [];
        const clock = new FakeClock();
        const tracks = ['/audio/background/background.mp3', ...Object.values(specialTracks), '/audio/extra.mp4'];
        const manager = new AudioManager(src => { const audio = new FakeAudio(src); created.push(audio); return audio; },
            tracks, () => 0, clock.environment());
        manager.beginRun(1);
        clock.tick(450);
        created[0].end();
        clock.tick(450);
        for (const [wave, phase] of [[151, 'siege'], [201, 'lastStand'], [256, 'lastStand']]) {
            const old = created.at(-1);
            manager.setWave(wave);
            assert.equal(manager.musicPhase, phase);
            assert.equal(old.pauseCount, 0, 'the current song must not be cut abruptly');
            clock.tick(225);
            assert.ok(old.volume > 0 && old.volume < 0.24);
            assert.equal(created.at(-1), old, 'the new song waits for fade-out');
            clock.tick(225);
            assert.ok(old.pauseCount > 0);
            if (wave === 201) {
                clock.tick(599);
                assert.equal(created.at(-1), old, 'wave 200 allows a controlled quiet beat');
                clock.tick(1);
            }
            const dedicated = created.at(-1);
            assert.equal(dedicated.src, specialTracks[wave]);
            assert.equal(dedicated.playCount, 1);
            manager.setWave(wave);
            clock.tick(450);
            assert.equal(dedicated.volume, 0.24);
            dedicated.end();
            assert.ok([tracks[0], tracks.at(-1)].includes(created.at(-1).src));
            assert.notEqual(created.at(-1).src, dedicated.src);
            clock.tick(450);
        }
        const dedicatedTracks = created.filter(audio => Object.values(specialTracks).includes(audio.src));
        assert.deepEqual(dedicatedTracks.map(audio => audio.src), Object.values(specialTracks));
        assert.ok(created.every(audio => audio.loop === false));
    });

    await test('mute, pause and visibility suspend music and cues without stacking or changing the selected phase', () => {
        const created = [];
        const clock = new FakeClock();
        const visibility = new FakeVisibility();
        const manager = new AudioManager(src => { const audio = new FakeAudio(src); created.push(audio); return audio; },
            undefined, () => 0, clock.environment(visibility));
        manager.beginRun(151);
        clock.tick(450);
        const music = created[0];
        manager.playWaveReached();
        const cue = created[1];
        manager.playWaveReached();
        assert.equal(cue.playCount, 1, 'the sound remains active until its ended event');
        manager.setVolume(0.5);
        assert.equal(music.volume, 0.12);
        assert.equal(cue.volume, 0.09);
        manager.setMuted(true);
        assert.ok(music.pauseCount > 0 && cue.pauseCount > 0);
        manager.playWaveReached();
        visibility.hidden = true;
        visibility.dispatch('visibilitychange');
        manager.setMuted(false);
        assert.equal(music.playCount, 1);
        visibility.hidden = false;
        visibility.dispatch('visibilitychange');
        visibility.dispatch('pointerdown');
        assert.equal(music.playCount, 2, 'visible resume and a simultaneous gesture must not double-play');
        assert.equal(manager.musicPhase, 'siege');
        manager.setPaused(true);
        const pausedCount = music.playCount;
        visibility.dispatch('keydown');
        assert.equal(music.playCount, pausedCount);
        manager.setPaused(false);
        assert.equal(music.playCount, pausedCount + 1);
        clock.tick(450);
        manager.playWaveReached();
        assert.equal(cue.playCount, 2);
        cue.end();
        manager.playWaveReached();
        assert.equal(cue.playCount, 3);
    });

    await test('hidden and muted phase changes resume only the latest milestone', () => {
        const visibility = new FakeVisibility();
        const clock = new FakeClock();
        const created = [];
        const manager = new AudioManager(src => { const audio = new FakeAudio(src); created.push(audio); return audio; },
            undefined, () => 0, clock.environment(visibility));
        visibility.hidden = true;
        manager.beginRun(150);
        manager.setWave(151);
        assert.deepEqual(created, []);
        visibility.hidden = false;
        visibility.dispatch('visibilitychange');
        assert.equal(created[0].src, specialTracks[151]);
        manager.setMuted(true);
        manager.setWave(201);
        manager.setMuted(false);
        assert.equal(created.at(-1).src, specialTracks[201]);
        assert.equal(created.filter(audio => audio.src === specialTracks[151]).length, 1);
        manager.playGameOver();
        manager.setMuted(true);
        manager.beginRun(1);
        assert.equal(created.filter(audio => audio.src === specialTracks[1]).length, 0);
        manager.setMuted(false);
        assert.equal(created.at(-1).src, specialTracks[1]);
    });

    await test('game over stops music and cues; a fresh run resets the phase and starts only one track', () => {
        const created = [];
        const clock = new FakeClock();
        const manager = new AudioManager(src => { const audio = new FakeAudio(src); created.push(audio); return audio; },
            undefined, () => 0, clock.environment());
        manager.beginRun(201);
        clock.tick(450);
        manager.playWaveReached();
        const cue = created[1];
        manager.playGameOver();
        assert.ok(cue.pauseCount > 0);
        assert.equal(created[2].src, '/audio/game-over.wav');
        manager.startMusic();
        manager.onUserGesture();
        assert.equal(created[0].playCount, 1, 'the result screen never resumes BGM');
        manager.beginRun(1);
        assert.equal(manager.musicPhase, 'tactical');
        assert.equal(created.at(-1).src, specialTracks[1]);
        manager.beginRun(1);
        assert.equal(created.filter(audio => audio.src === specialTracks[1]).length, 1);
    });

    await test('blocked autoplay is silent and retries on the next real gesture; bad media fails over', async () => {
        const created = [];
        const clock = new FakeClock();
        const visibility = new FakeVisibility();
        const manager = new AudioManager(src => {
            const audio = new FakeAudio(src, {reject: true}); created.push(audio); return audio;
        }, undefined, () => 0, clock.environment(visibility));
        manager.beginRun(1);
        await Promise.resolve();
        visibility.dispatch('pointerdown');
        assert.equal(created[0].playCount, 2);
        clock.tick(450);
        created[0].error();
        assert.equal(created[1].src, '/audio/background/background.mp3');
        const broken = new AudioManager(() => new FakeAudio('/audio/bad.wav', {throw: true}),
            undefined, () => 0, clock.environment());
        assert.doesNotThrow(() => broken.beginRun(1));
        assert.doesNotThrow(() => broken.playWaveReached());
        assert.doesNotThrow(() => broken.playGameOver());
    });

    await test('a slow media play promise cannot fade in before playback starts', async () => {
        const clock = new FakeClock();
        let startPlayback;
        let audio;
        const manager = new AudioManager(src => {
            audio = new FakeAudio(src);
            audio.play = () => new Promise(resolve => { startPlayback = resolve; });
            return audio;
        }, undefined, () => 0, clock.environment());
        manager.beginRun(1);
        clock.tick(1000);
        assert.equal(audio.volume, 0, 'no blast if the media takes time to load');
        startPlayback();
        await Promise.resolve();
        clock.tick(450);
        assert.equal(audio.volume, 0.24);
    });

    await test('a pending play cannot override a milestone transition when it resolves late', async () => {
        const clock = new FakeClock();
        const created = [];
        let startOld;
        const manager = new AudioManager(src => {
            const audio = new FakeAudio(src);
            if (src === '/audio/background/background.mp3') {
                audio.play = () => new Promise(resolve => { startOld = resolve; });
            }
            created.push(audio);
            return audio;
        }, undefined, () => 0, clock.environment());
        manager.beginRun(150);
        manager.setWave(151);
        assert.ok(created[0].pauseCount > 0);
        assert.equal(created[1].src, specialTracks[151]);
        startOld();
        await Promise.resolve();
        clock.tick(450);
        assert.equal(created[1].volume, 0.24);
        assert.equal(created[0].volume, 0);
    });

    await test('a late aborted play rejection cannot stop a newer resume on the same element', async () => {
        const clock = new FakeClock();
        let rejectOld;
        let audio;
        const manager = new AudioManager(src => {
            audio = new FakeAudio(src);
            audio.play = () => {
                audio.playCount++;
                return audio.playCount === 1 ? new Promise((_, reject) => { rejectOld = reject; }) : Promise.resolve();
            };
            return audio;
        }, undefined, () => 0, clock.environment());
        manager.beginRun(1);
        manager.setMuted(true);
        manager.setMuted(false);
        rejectOld(new Error('aborted old request'));
        await Promise.resolve();
        await Promise.resolve();
        manager.onUserGesture();
        assert.equal(audio.playCount, 2);
        clock.tick(450);
        assert.equal(audio.volume, 0.24);
    });

    await test('a missing dedicated track falls back to a phase track without blocking play', () => {
        const created = [];
        const manager = new AudioManager(src => {
            if (src === specialTracks[1]) throw new Error('missing');
            const audio = new FakeAudio(src);
            created.push(audio);
            return audio;
        }, undefined, () => 0, new FakeClock().environment());
        assert.doesNotThrow(() => manager.beginRun(1));
        assert.equal(created[0].src, '/audio/background/background.mp3');
    });

    await test('regular background is MP3, milestone assets are MP4, and cues are PCM WAV', () => {
        const background = fs.readFileSync(path.join(__dirname, '..', 'public', 'audio', 'background', 'background.mp3'));
        const startsWithId3 = background.toString('ascii', 0, 3) === 'ID3';
        const startsWithMpegFrame = background.length > 1 && background[0] === 0xff && (background[1] & 0xe0) === 0xe0;
        assert.ok(startsWithId3 || startsWithMpegFrame);
        assert.ok(background.length > 0);
        for (const name of Object.values(specialNames)) {
            const specialTrack = fs.readFileSync(path.join(__dirname, '..', 'public', 'audio', name));
            assert.equal(specialTrack.toString('ascii', 4, 8), 'ftyp', `${name} should be an MP4 container`);
            assert.ok(specialTrack.length > 1000);
        }
        for (const wave of Object.keys(specialNames)) {
            assert.ok(!fs.existsSync(path.join(__dirname, '..', 'public', 'audio', 'background', `${wave}.mp3`)));
        }
        for (const name of ['wave.wav', 'game-over.wav']) {
            const file = fs.readFileSync(path.join(__dirname, '..', 'public', 'audio', name));
            assert.equal(file.toString('ascii', 0, 4), 'RIFF');
            assert.equal(file.toString('ascii', 8, 12), 'WAVE');
            assert.equal(file.toString('ascii', 12, 16), 'fmt ');
            assert.ok(file.length > 44);
        }
    });

    await test('Vite playlist discovers 12 regular tracks and reads replaceable milestone names', async () => {
        const manifest = require('../audio-playlist.json');
        assert.deepEqual(manifest.milestones, specialNames);
        const { default: config, createPhaseMusicPaths, createSpecialMusicPaths } = await import('../vite.config.mjs');
        const tracks = JSON.parse(config.define.__BACKGROUND_TRACKS__);
        const specials = JSON.parse(config.define.__SPECIAL_MUSIC_PATHS__);
        const phases = JSON.parse(config.define.__PHASE_MUSIC_PATHS__);
        const directory = path.join(__dirname, '..', 'public', 'audio');
        const regularMp4 = fs.readdirSync(directory)
            .filter(name => /\.mp4$/i.test(name) && !Object.values(specialNames).includes(name))
            .sort().map(name => `/audio/${encodeURIComponent(name)}`);
        assert.equal(regularMp4.length, 12);
        assert.deepEqual(specials, specialTracks);
        assert.deepEqual(tracks, ['/audio/background/background.mp3', ...regularMp4]);
        assert.ok(tracks.every(track => !Object.values(specials).includes(track)));
        const assigned = Object.values(phases).flat();
        assert.deepEqual(assigned.sort(), [...tracks].sort(), 'all 13 regular tracks belong to one phase');
        for (const phase of ['tactical', 'siege', 'lastStand']) {
            assert.deepEqual(phases[phase], manifest.phases[phase].map(name =>
                `/audio/${name.split('/').map(encodeURIComponent).join('/')}`));
        }
        const sample = {tactical: ['a.mp3'], siege: ['b.mp3'], lastStand: ['c.mp3']};
        const available = ['/audio/a.mp3', '/audio/b.mp3', '/audio/c.mp3'];
        assert.deepEqual(createPhaseMusicPaths(sample, available), {
            tactical: ['/audio/a.mp3'], siege: ['/audio/b.mp3'], lastStand: ['/audio/c.mp3'],
        });
        assert.throws(() => createPhaseMusicPaths({...sample, siege: ['a.mp3']}, available), /duplicate/);
        assert.throws(() => createPhaseMusicPaths({...sample, siege: ['missing.mp3']}, available), /Unknown/);
        assert.throws(() => createPhaseMusicPaths({...sample, siege: []}, available), /Missing playlist/);
        assert.throws(() => createPhaseMusicPaths(sample, [...available, '/audio/new.mp3']), /assigned/);
        assert.deepEqual(createSpecialMusicPaths({151: 'background/replacement.ogg'},
            new Set(['background/replacement.ogg'])), {151: '/audio/background/replacement.ogg'});
        assert.throws(() => createSpecialMusicPaths({151: '../escape.mp4'}, new Set(['../escape.mp4'])), /Invalid/);
        assert.throws(() => createSpecialMusicPaths({151: 'missing.mp4'}, new Set()), /missing/);
    });
})();
