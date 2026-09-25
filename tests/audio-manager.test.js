const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

// The licensed demo BGM and its phase/special-track machinery were removed in
// the 2026-09-25 de-branding. These tests cover the AudioManager surface that
// remains: the two locally generated WAV cues (wave / game-over), mute, pause,
// visibility, and master volume. They must run without a DOM.

function loadAudioManager() {
    const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'AudioManager.ts'), 'utf8');
    const js = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 },
    }).outputText;
    const loaded = {exports: {}};
    // The module no longer expects the BGM build-time `define`s.
    new Function('module', 'exports', js)(loaded, loaded.exports);
    return loaded.exports.AudioManager;
}

class FakeVisibility {
    hidden = false;
    listeners = {};
    addEventListener(name, listener) { (this.listeners[name] ||= []).push(listener); }
    dispatch(name) { for (const listener of this.listeners[name] || []) listener(); }
}

class FakeAudio {
    constructor(src) {
        this.src = src;
        this.loop = false;
        this.currentTime = 0;
        this.volume = 1;
        this.playCount = 0;
        this.pauseCount = 0;
        this.onended = null;
        this.onerror = null;
    }
    play() { this.playCount += 1; return undefined; }
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

    await test('IDLE is silent and there is no BGM machinery', () => {
        const created = [];
        const manager = new AudioManager(src => { const a = new FakeAudio(src); created.push(a); return a; });
        // The old startMusic() is gone; calling it must not exist on the API.
        assert.equal(typeof manager.startMusic, 'undefined');
        assert.equal(typeof manager.setWave, 'undefined');
        assert.equal(typeof manager.duckForMissionComplete, 'undefined');
        assert.equal(typeof manager.musicPhase, 'undefined');
        assert.deepEqual(created, []);
    });

    await test('beginRun resets run state without playing any music', () => {
        const created = [];
        const manager = new AudioManager(src => { const a = new FakeAudio(src); created.push(a); return a; });
        manager.beginRun(1);
        assert.deepEqual(created, [], 'no music is created on run start');
    });

    await test('playWaveReached plays the wave cue once; a second call while active is a no-op', () => {
        const created = [];
        const manager = new AudioManager(src => { const a = new FakeAudio(src); created.push(a); return a; });
        manager.beginRun(1);
        manager.playWaveReached();
        assert.equal(created.length, 1);
        assert.equal(created[0].src, '/audio/wave.wav');
        assert.equal(created[0].playCount, 1);
        // While the cue is still active, a second call must not replay or stack.
        manager.playWaveReached();
        assert.equal(created.length, 1);
        assert.equal(created[0].playCount, 1);
        // After the cue ends it can fire again.
        created[0].end();
        manager.playWaveReached();
        assert.equal(created[0].playCount, 2);
    });

    await test('game over stops cues and plays the game-over cue once', () => {
        const created = [];
        const manager = new AudioManager(src => { const a = new FakeAudio(src); created.push(a); return a; });
        manager.beginRun(1);
        manager.playWaveReached();
        const waveCue = created[0];
        manager.playGameOver();
        assert.ok(waveCue.pauseCount > 0, 'the wave cue is paused on game over');
        assert.equal(created.at(-1).src, '/audio/game-over.wav');
        assert.equal(created.at(-1).playCount, 1);
        // Repeated game-over calls are suppressed within the same run.
        manager.playGameOver();
        assert.equal(created.at(-1).playCount, 1);
    });

    await test('mute pauses cues and unmute does not auto-resume music', () => {
        const created = [];
        const manager = new AudioManager(src => { const a = new FakeAudio(src); created.push(a); return a; });
        manager.beginRun(1);
        manager.playWaveReached();
        const cue = created[0];
        manager.setMuted(true);
        assert.ok(cue.pauseCount > 0);
        manager.setMuted(false);
        assert.deepEqual(created, [cue], 'unmuting never creates a music track');
    });

    await test('pause pauses cues; resume does not start music', () => {
        const created = [];
        const manager = new AudioManager(src => { const a = new FakeAudio(src); created.push(a); return a; });
        manager.beginRun(1);
        manager.playWaveReached();
        const cue = created[0];
        manager.setPaused(true);
        assert.ok(cue.pauseCount > 0);
        manager.setPaused(false);
        assert.deepEqual(created, [cue]);
    });

    await test('a hidden tab pauses cues and never resumes music on return', () => {
        const visibility = new FakeVisibility();
        const created = [];
        const manager = new AudioManager(src => { const a = new FakeAudio(src); created.push(a); return a; },
            {visibility});
        manager.beginRun(1);
        manager.playWaveReached();
        const cue = created[0];
        visibility.hidden = true;
        visibility.dispatch('visibilitychange');
        assert.ok(cue.pauseCount > 0);
        visibility.hidden = false;
        visibility.dispatch('visibilitychange');
        assert.deepEqual(created, [cue], 'no music is created on becoming visible');
    });

    await test('master volume scales the cues and is clamped', () => {
        const created = [];
        const manager = new AudioManager(src => { const a = new FakeAudio(src); created.push(a); return a; });
        manager.beginRun(1);
        manager.playWaveReached();
        const waveCue = created[0];
        manager.setVolume(0.5);
        assert.equal(waveCue.volume, 0.18 * 0.5);
        manager.playGameOver();
        const overCue = created.at(-1);
        assert.equal(overCue.volume, 0.2 * 0.5);
        manager.setVolume(5);
        assert.ok(overCue.volume <= 0.2 && waveCue.volume <= 0.18);
        manager.setVolume(-1);
        assert.equal(waveCue.volume, 0);
    });

    await test('the two cue assets are real PCM WAV files', () => {
        for (const name of ['wave.wav', 'game-over.wav']) {
            const file = fs.readFileSync(path.join(__dirname, '..', 'public', 'audio', name));
            assert.equal(file.toString('ascii', 0, 4), 'RIFF');
            assert.equal(file.toString('ascii', 8, 12), 'WAVE');
            assert.equal(file.toString('ascii', 12, 16), 'fmt ');
            assert.ok(file.length > 44);
        }
    });

    await test('no licensed demo audio remains in the public audio folder', () => {
        const dir = path.join(__dirname, '..', 'public', 'audio');
        const entries = fs.readdirSync(dir);
        assert.deepEqual(entries.sort(), ['game-over.wav', 'wave.wav'],
            'only the two generated cues remain; the background/ folder and all demo tracks are gone');
        assert.ok(!fs.existsSync(path.join(dir, 'background')),
            'the background/ playlist folder must not exist');
    });
})();
