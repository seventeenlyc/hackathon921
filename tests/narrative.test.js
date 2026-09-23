/**
 * Story-scene tests (issue #100).
 *
 * Two layers:
 *  - DOM-free behaviour of the real `NarrativeDirector` / `NarrativeScript` and
 *    the `GameLoop` narrative freeze, driven through minimal ports;
 *  - source-level guards that the overlay markup, wiring and version bookkeeping
 *    stay in place (same style as the other UI guard tests in this folder).
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {NARRATIVE_SCENES, NARRATIVE_SPEAKERS} = require('../.test-build/narrative/NarrativeScript.js');
const {NarrativeDirector, NARRATIVE_CLEAR_POLL_MS} = require('../.test-build/narrative/NarrativeDirector.js');
const {GameLoop} = require('../.test-build/agent/GameLoop.js');

const projectRoot = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(projectRoot, relative), 'utf8');

async function test(name, fn) {
    try {
        await fn();
        console.log(`  ok  ${name}`);
    } catch (error) {
        console.error(`FAIL  ${name}`);
        throw error;
    }
}

function fakePorts(overrides = {}) {
    const calls = {sleep: [], hold: 0};
    const ports = {
        hold: async hold => {
            calls.hold += 1;
            await hold();
        },
        sleep: async ms => {
            calls.sleep.push(ms);
        },
        hasLivingEnemies: () => false,
        baseAlive: () => true,
        stillRunning: () => true,
        ...overrides,
    };
    return {ports, calls};
}

(async () => {
    console.log('Narrative');

    // ---------------------------------------------------------------------
    // Script structure
    // ---------------------------------------------------------------------
    await test('script exposes the five beats with the documented wave gates', () => {
        const gates = NARRATIVE_SCENES.map(scene => ({
            id: scene.id,
            beforeWave: scene.beforeWave,
            requiresClear: scene.requiresClear,
            leadsToArchive: Boolean(scene.leadsToArchive),
        }));
        assert.deepStrictEqual(gates, [
            {id: 'wave-051-unknown-attack', beforeWave: 51, requiresClear: false, leadsToArchive: false},
            {id: 'wave-101-mercenaries', beforeWave: 101, requiresClear: false, leadsToArchive: false},
            {id: 'wave-151-authorization-revoked', beforeWave: 151, requiresClear: false, leadsToArchive: false},
            {id: 'wave-201-annihilation', beforeWave: 201, requiresClear: true, leadsToArchive: false},
            {id: 'wave-256-the-endless', beforeWave: 257, requiresClear: true, leadsToArchive: true},
        ]);
    });

    await test('only the wave-256 beat hands off to the archive step', () => {
        const archive = NARRATIVE_SCENES.filter(scene => scene.leadsToArchive);
        assert.strictEqual(archive.length, 1);
        assert.strictEqual(archive[0].id, 'wave-256-the-endless');
    });

    await test('every line has a known speaker and non-empty zh/en text', () => {
        for (const scene of NARRATIVE_SCENES) {
            assert.ok(scene.lines.length > 0, `${scene.id} has no lines`);
            assert.ok(scene.codeName.length > 0, `${scene.id} has no code name`);
            for (const lang of ['zh', 'en']) {
                assert.ok(scene.title[lang].trim().length > 0, `${scene.id} title ${lang} empty`);
            }
            for (const line of scene.lines) {
                assert.ok(NARRATIVE_SPEAKERS[line.speaker], `${scene.id} unknown speaker ${line.speaker}`);
                assert.ok(line.text.zh.trim().length > 0, `${scene.id} ${line.speaker} zh empty`);
                assert.ok(line.text.en.trim().length > 0, `${scene.id} ${line.speaker} en empty`);
                // Terminal output lines may be pure English codes (e.g. the
                // SECRET ARCHIVE banner); everything else must be Chinese.
                const terminalCode = /^[A-Z0-9 .。:：]+$/.test(line.text.zh.trim());
                assert.ok(terminalCode || /[\u4e00-\u9fff]/.test(line.text.zh),
                    `${scene.id} ${line.speaker} zh must be Chinese or a terminal code`);
            }
        }
    });

    await test('archive lines are explicitly marked as recordings', () => {
        const scene = NARRATIVE_SCENES.find(s => s.id === 'wave-256-the-endless');
        const recordings = scene.lines.filter(line => line.recording).map(line => line.speaker);
        assert.deepStrictEqual(recordings, ['ishikawa', 'kusanagi']);
    });

    await test('system bulletins use a terminal icon, not a ninth character avatar', () => {
        assert.deepStrictEqual(NARRATIVE_SPEAKERS.terminal.portrait, {kind: 'terminal'});
        assert.deepStrictEqual(NARRATIVE_SPEAKERS.tachikoma.portrait, {kind: 'tachikoma'});
        const characterIds = Object.values(NARRATIVE_SPEAKERS)
            .filter(speaker => speaker.portrait.kind === 'avatar')
            .map(speaker => speaker.portrait.avatarId);
        assert.deepStrictEqual(characterIds.sort(), ['aramaki', 'batou', 'ishikawa', 'kusanagi']);
        const overlay = read('src/narrative/NarrativeOverlay.ts');
        assert.match(overlay, /elements\.portraitTerminal\.hidden = !terminal/);
        assert.match(overlay, /elements\.avatar\.hidden = true/);
        assert.match(overlay, /elements\.avatar\.removeAttribute\('src'\)/,
            'the former human image must be cleared when a terminal line takes over');
        const markup = read('index.html');
        assert.match(markup, /id="narrative-portrait-terminal"[\s\S]*?<svg/);
    });

    await test('revised dialogue separates the ministry investigation from unproven attackers', () => {
        const [unknown, mercenaries, revoked, annihilation] = NARRATIVE_SCENES;
        assert.match(unknown.lines[2].text.zh, /源头还没定位/);
        assert.match(mercenaries.lines[1].text.zh, /军用规格.*没有证据/);
        assert.match(mercenaries.lines[4].text.zh, /厚生省/);
        assert.doesNotMatch(revoked.lines[3].text.zh, /身份.*抹掉/);
        assert.match(annihilation.lines[0].text.zh, /厚生省.*证据链/);
        assert.doesNotMatch(annihilation.lines[2].text.zh, /总部.*摧毁|拆掉这里/);
        const doc = read('docs/保护笑脸男-游戏世界观与剧情设定-v2.md');
        assert.match(doc, /剧情简介，不是动画逐字台本/);
        assert.match(doc, /production-ig\.com\/contents\/works_sp\/03_\/s02_\/000298\.html/);
    });

    await test('the script matches the single-source appendix in the v2 document', () => {
        const doc = read('docs/保护笑脸男-游戏世界观与剧情设定-v2.md');
        const start = doc.indexOf('# 附录 A. 游戏内剧情演出脚本');
        assert.ok(start >= 0, 'the v2 document must keep the in-game script appendix');
        const appendix = doc.slice(start);

        const dialogue = [];
        for (const row of appendix.split('\n')) {
            if (!row.startsWith('|')) continue;
            const cells = row.split('|').map(cell => cell.trim());
            if (cells.length < 4) continue;
            const speaker = cells[1];
            if (speaker === '说话者' || /^-+$/.test(speaker.replace(/\s/g, ''))) continue;
            dialogue.push(cells[2]);
        }

        const fromScript = NARRATIVE_SCENES.flatMap(scene => scene.lines.map(line => line.text.zh));
        assert.deepStrictEqual(dialogue, fromScript,
            'the document appendix and NarrativeScript.ts must not drift apart');
    });

    // ---------------------------------------------------------------------
    // Director behaviour
    // ---------------------------------------------------------------------
    await test('a boundary scene plays once and never repeats', async () => {
        const {ports, calls} = fakePorts();
        const played = [];
        const director = new NarrativeDirector(NARRATIVE_SCENES, ports, {
            play: async scene => {
                played.push(scene.id);
            },
        });

        await director.beforeWave(50);
        assert.deepStrictEqual(played, [], 'no scene is gated on wave 50');

        await director.beforeWave(51);
        assert.deepStrictEqual(played, ['wave-051-unknown-attack']);
        assert.strictEqual(calls.hold, 1);
        assert.strictEqual(director.hasPlayed('wave-051-unknown-attack'), true);

        await director.beforeWave(51);
        assert.deepStrictEqual(played, ['wave-051-unknown-attack'], 'skip/close must not replay the beat');
        assert.strictEqual(calls.hold, 1);
    });

    await test('reset() lets a fresh run replay every scene', async () => {
        const {ports} = fakePorts();
        const played = [];
        const director = new NarrativeDirector(NARRATIVE_SCENES, ports, {
            play: async scene => played.push(scene.id),
        });

        await director.beforeWave(51);
        director.reset();
        await director.beforeWave(51);
        assert.deepStrictEqual(played, ['wave-051-unknown-attack', 'wave-051-unknown-attack']);
    });

    await test('a clear-gated scene waits for an empty field before playing', async () => {
        let enemies = 3;
        const {ports, calls} = fakePorts({
            hasLivingEnemies: () => enemies > 0,
            sleep: async ms => {
                calls.sleep.push(ms);
                enemies -= 1;
            },
        });
        const played = [];
        const director = new NarrativeDirector(NARRATIVE_SCENES, ports, {
            play: async scene => played.push(scene.id),
        });

        // Wave 200 is only gate on the field being clear, not on the counter.
        await director.beforeWave(200);
        assert.deepStrictEqual(played, [], 'the wave-200 counter alone must not trigger the beat');

        await director.beforeWave(201);
        assert.strictEqual(calls.sleep.length, 3, 'the director polls until the field is clear');
        assert.ok(calls.sleep.every(ms => ms === NARRATIVE_CLEAR_POLL_MS));
        assert.deepStrictEqual(played, ['wave-201-annihilation']);
    });

    await test('a cleared field plays immediately without polling', async () => {
        const {ports, calls} = fakePorts();
        const played = [];
        const director = new NarrativeDirector(NARRATIVE_SCENES, ports, {
            play: async scene => played.push(scene.id),
        });

        await director.beforeWave(201);
        assert.strictEqual(calls.sleep.length, 0);
        assert.deepStrictEqual(played, ['wave-201-annihilation']);
    });

    await test('a lost run never plays the mission-complete beat', async () => {
        let alive = true;
        const {ports} = fakePorts({
            hasLivingEnemies: () => true,
            baseAlive: () => alive,
            sleep: async () => {
                // The base falls while the player is still on wave 200.
                alive = false;
            },
        });
        const played = [];
        const director = new NarrativeDirector(NARRATIVE_SCENES, ports, {
            play: async scene => played.push(scene.id),
        });

        await director.beforeWave(201);
        assert.deepStrictEqual(played, [], 'defeat must not show the success scene');
    });

    await test('a scene runs inside the freeze hold', async () => {
        const order = [];
        const {ports} = fakePorts({
            hold: async hold => {
                order.push('freeze');
                await hold();
                order.push('resume');
            },
        });
        const director = new NarrativeDirector(NARRATIVE_SCENES, ports, {
            play: async () => {
                order.push('play');
            },
        });

        await director.beforeWave(101);
        assert.deepStrictEqual(order, ['freeze', 'play', 'resume']);
    });

    await test('a throwing overlay is logged and does not stall the run', async () => {
        const {ports} = fakePorts();
        const director = new NarrativeDirector(NARRATIVE_SCENES, ports, {
            play: async () => {
                throw new Error('view exploded');
            },
        });

        const originalError = console.error;
        console.error = () => {};
        try {
            await director.beforeWave(101);
        } finally {
            console.error = originalError;
        }
        assert.strictEqual(director.hasPlayed('wave-101-mercenaries'), true,
            'a broken view must not retry forever');
    });

    // ---------------------------------------------------------------------
    // GameLoop narrative freeze
    // ---------------------------------------------------------------------
    await test('holdForNarrative freezes the simulation and restores running', async () => {
        const loop = new GameLoop();
        loop.start();
        const seen = [];
        loop.onChange(state => seen.push(state));

        await loop.holdForNarrative(async () => {
            assert.strictEqual(loop.state, 'narrative');
            assert.strictEqual(loop.isStepping(), false, 'the sim must be frozen while reading');
        });

        assert.strictEqual(loop.state, 'running');
        assert.deepStrictEqual(seen, ['narrative', 'running']);
    });

    await test('a throwing scene still restores running', async () => {
        const loop = new GameLoop();
        loop.start();
        await assert.rejects(loop.holdForNarrative(async () => {
            throw new Error('boom');
        }));
        assert.strictEqual(loop.state, 'running');
    });

    await test('pause is inert while a scene holds the loop', async () => {
        const loop = new GameLoop();
        loop.start();
        await loop.holdForNarrative(async () => {
            loop.pause();
            assert.strictEqual(loop.state, 'narrative', 'pause must not steal the narrative freeze');
        });
        assert.strictEqual(loop.state, 'running');
    });

    // ---------------------------------------------------------------------
    // Source-level integration guards
    // ---------------------------------------------------------------------
    await test('index.html mounts an accessible narrative dialog with an archive step', () => {
        const index = read('index.html');
        assert.match(index, /id="narrative-overlay"[^>]*role="dialog"[^>]*aria-modal="true"/,
            'the overlay must be a modal dialog');
        assert.match(index, /id="narrative-view"/);
        assert.match(index, /id="narrative-archive-view"/);
        for (const id of ['narrative-code', 'narrative-title', 'narrative-speaker', 'narrative-line',
            'narrative-avatar', 'narrative-portrait-terminal', 'narrative-portrait-tachikoma',
            'narrative-skip', 'narrative-close', 'narrative-back', 'narrative-next', 'narrative-continue']) {
            assert.ok(index.includes(`id="${id}"`), `overlay must expose #${id}`);
        }
        assert.match(index, /data-i18n="narrative\.archiveNote"/, 'the archive step must state the media is withheld');
        assert.doesNotMatch(index, /<img[^>]*narrative[^>]*src="https?:/i, 'no remote avatars');
    });

    await test('the overlay renders script text as text, never as HTML', () => {
        const overlay = read('src/narrative/NarrativeOverlay.ts');
        assert.doesNotMatch(overlay, /innerHTML/, 'dialogue must not be injected as HTML');
        assert.match(overlay, /textContent/, 'dialogue must be written with textContent');
        assert.match(overlay, /AVATAR_SRC/, 'character portraits must reuse the original gate avatars');
        assert.match(overlay, /onLangChange/, 'an open scene must follow the language toggle');
        assert.match(overlay, /previousFocus/, 'focus must be restored after the scene');
        assert.match(overlay, /handleKeyDown/, 'the scene must be keyboard driven');
    });

    await test('WavesManager gates each wave boundary on the narrative hook', () => {
        const waves = read('src/WavesManager.ts');
        assert.match(waves, /setNarrative\(narrative: WaveNarrative \| null\)/);
        assert.match(waves, /await this\.narrative\.beforeWave\(this\.waveCounter\)/);
        // The scene must run before PLANNING and before the human countdown.
        const sceneIndex = waves.indexOf('this.narrative.beforeWave');
        const planningIndex = waves.indexOf('holdForPlanning');
        assert.ok(sceneIndex >= 0 && sceneIndex < planningIndex, 'the scene must precede PLANNING');
        assert.ok(sceneIndex < waves.indexOf('interWaveDelayMs > 0'),
            'the human countdown must not run behind the scene');
    });

    await test('Game wires the director to the real battlefield and the narrative freeze', () => {
        const game = read('src/Game.ts');
        assert.match(game, /new NarrativeDirector\(/);
        assert.match(game, /hold: hold => gameLoop\.holdForNarrative\(hold\)/);
        assert.match(game, /enemyManager\.all\(\)\.some\(enemy => enemy\.alive\)/);
        assert.match(game, /baseAlive: \(\) => map\.homeBase\.getLife\(\) > 0/);
        assert.match(game, /stillRunning: \(\) => waveManager\.looping/);
        assert.match(game, /waveManager\.setNarrative\(narrativeDirector\)/);
    });

    await test('the narrative freeze does not touch the planning/Prompt path', () => {
        const loop = read('src/agent/GameLoop.ts');
        assert.match(loop, /'idle' \| 'running' \| 'paused' \| 'planning' \| 'narrative'/);
        assert.match(loop, /holdForNarrative/);
        const game = read('src/Game.ts');
        // The planning branch must stay keyed on 'planning' only; a scene is
        // 'narrative', so it can never lock or re-enqueue the strategy.
        assert.match(game, /if \(state === 'planning'\)/);
        assert.doesNotMatch(game, /state === 'narrative'/, 'reading a scene must not change Prompt state');
    });

    await test('promptDefense exposes a QA preview for every beat', () => {
        const game = read('src/Game.ts');
        assert.match(game, /narrative:\s*\{/, 'the QA surface must expose the story scenes');
        assert.match(game, /scenes: \(\) => NARRATIVE_SCENES\.map/);
        assert.match(game, /play: \(id: string\)/);
        assert.match(game, /gameLoop\.holdForNarrative\(\(\) => narrativeOverlay\.play\(scene\)\)/,
            'a preview during a live run must freeze like the real trigger');
    });

    await test('the status panel knows the narrative state in both languages', () => {
        const i18n = read('src/i18n.ts');
        assert.match(i18n, /'state\.narrative': \{zh: '[^']*[\u4e00-\u9fff][^']*', en: '[A-Z][^']*'\}/);
        // 对照副行已按需求退役：两种界面都只显示自己语言的文案。
        assert.ok(!i18n.includes(`'stateSub.narrative'`), 'the bilingual state sub-line is retired');
        const manager = read('src/InterfaceManager.ts');
        assert.match(manager, /state === 'narrative'/, 'the pause control must be disabled during a scene');
    });

    await test('scene styling exists and adapts to narrow screens', () => {
        const styles = read('src/styles/styles.less');
        assert.match(styles, /\.narrative-overlay\s*\{/);
        assert.match(styles, /\.narrative-archive\s*\{/);
        assert.match(styles, /@media \(max-width: 640px\)[\s\S]*\.narrative-overlay/);
    });

    await test('the front-end version is bumped in every tracked location', () => {
        const pkg = JSON.parse(read('package.json'));
        const lock = JSON.parse(read('package-lock.json'));
        assert.strictEqual(lock.version, pkg.version, 'package-lock root version must match package.json');
        assert.strictEqual(lock.packages[''].version, pkg.version, 'package-lock packages[""] version must match');
        const index = read('index.html');
        assert.ok(index.includes(`>v${pkg.version}<`), `index.html must show v${pkg.version}`);
    });

    console.log('All Narrative tests passed.');
})().catch(error => {
    process.exitCode = 1;
    console.error(error);
});
