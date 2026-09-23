/**
 * Background-story tests (issue #99).
 *
 * Three layers, matching the repo's existing style:
 *  - the real extraction/parse module (`scripts/player-story.mjs`) against the
 *    real document, so page and doc cannot drift;
 *  - source-level guards that the reader renders text safely, is reachable and
 *    keyboard-operable, and stays a pure view;
 *  - build/bookkeeping guards (version, test wiring).
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(projectRoot, relative), 'utf8');
const docPath = 'docs/保护笑脸男-游戏世界观与剧情设定-v2.md';

async function test(name, fn) {
    try {
        await fn();
        console.log(`  ok  ${name}`);
    } catch (error) {
        console.error(`FAIL  ${name}`);
        throw error;
    }
}

(async () => {
    console.log('Background story');

    const {
        extractPlayerMarkdown,
        parseStoryBlocks,
        parseInline,
        buildPlayerStory,
        PLAYER_STORY_MARKERS,
    } = await import('../scripts/player-story.mjs');

    const doc = read(docPath);

    // ---------------------------------------------------------------------
    // Single-source extraction
    // ---------------------------------------------------------------------
    await test('the document carries the player/internal markers', () => {
        assert.ok(doc.includes(PLAYER_STORY_MARKERS.playerStart), 'missing PLAYER-STORY:START');
        assert.ok(doc.includes(PLAYER_STORY_MARKERS.playerEnd), 'missing PLAYER-STORY:END');
        assert.ok(doc.includes(PLAYER_STORY_MARKERS.internalStart), 'missing INTERNAL-DESIGN:START');
        const playerStart = doc.indexOf(PLAYER_STORY_MARKERS.playerStart);
        const playerEnd = doc.indexOf(PLAYER_STORY_MARKERS.playerEnd);
        const internalStart = doc.indexOf(PLAYER_STORY_MARKERS.internalStart);
        assert.ok(playerStart < playerEnd, 'player markers must be ordered');
        assert.ok(playerEnd <= internalStart, 'the internal design must follow the player region');
    });

    await test('the player region starts at the worldview and covers the premise', () => {
        const markdown = extractPlayerMarkdown(doc);
        assert.ok(markdown.includes('# 0. 世界观总纲'), 'the worldview summary must be player-facing');
        assert.ok(markdown.includes('# Part I：原作剧情的游戏世界观还原'), 'Part I must be player-facing');
        assert.ok(markdown.includes('## 1. 核心设定'), 'the adaptation premise must be player-facing');
    });

    await test('the player region never leaks the internal design', () => {
        const markdown = extractPlayerMarkdown(doc);
        for (const spoiler of [
            '九课战术装备',
            'TACHIKOMA RESCUE',
            'SECRET ENDING',
            'SECRET ARCHIVE',
            '附录 A. 游戏内剧情演出脚本',
            '三层结局',
        ]) {
            assert.ok(!markdown.includes(spoiler), `player region leaked internal content: ${spoiler}`);
        }
    });

    await test('buildPlayerStory is deterministic and non-empty', () => {
        const first = JSON.stringify(buildPlayerStory(doc));
        const second = JSON.stringify(buildPlayerStory(doc));
        assert.strictEqual(first, second, 'extraction must be deterministic');
        assert.ok(JSON.parse(first).blocks.length > 20, 'expected a substantial player story');
    });

    await test('the packaged blocks contain no internal spoiler text', () => {
        const packed = JSON.stringify(buildPlayerStory(doc));
        assert.ok(!packed.includes('WAVE 256'), 'the packed story must not contain future-wave spoilers');
        assert.ok(!packed.includes('EvoMap'), 'the packed story must not contain unlicensed brand items');
    });

    // ---------------------------------------------------------------------
    // Parsing
    // ---------------------------------------------------------------------
    await test('inline runs preserve bold and code without markup', () => {
        assert.deepStrictEqual(parseInline('a **b** c `d`'), [
            {text: 'a '},
            {text: 'b', bold: true},
            {text: ' c '},
            {text: 'd', code: true},
        ]);
        assert.deepStrictEqual(parseInline('plain'), [{text: 'plain'}]);
    });

    await test('block parsing covers the subset the story uses', () => {
        const blocks = parseStoryBlocks([
            '# Title',
            '',
            'A paragraph.',
            '',
            '> a quote',
            '',
            '- one',
            '- two',
            '',
            '``` text',
            'SECTION 9',
            '```',
            '',
            '---',
        ].join('\n'));

        assert.deepStrictEqual(blocks.map(block => block.type),
            ['heading', 'paragraph', 'quote', 'list', 'code', 'rule']);
        assert.strictEqual(blocks[0].level, 1);
        assert.strictEqual(blocks[3].ordered, false);
        assert.strictEqual(blocks[4].text, 'SECTION 9');
    });

    await test('every parsed block uses a known type and runs are text-only', () => {
        const allowed = new Set(['heading', 'paragraph', 'quote', 'list', 'code', 'rule']);
        for (const block of buildPlayerStory(doc).blocks) {
            assert.ok(allowed.has(block.type), `unknown block type ${block.type}`);
            const runGroups = [block.runs, ...(block.items || [])].filter(Boolean);
            for (const runs of runGroups) {
                for (const run of runs) {
                    assert.strictEqual(typeof run.text, 'string');
                    assert.ok(run.text.length > 0);
                }
            }
        }
    });

    await test('an unmarked document fails closed', () => {
        assert.throws(() => extractPlayerMarkdown('# no markers here'), /PLAYER-STORY/);
    });

    // ---------------------------------------------------------------------
    // Reader behaviour (source guards: the repo tests DOM-free)
    // ---------------------------------------------------------------------
    await test('the reader renders text safely, never as HTML', () => {
        const reader = read('src/narrative/StoryReader.ts');
        assert.doesNotMatch(reader, /innerHTML/, 'story text must never be injected as HTML');
        assert.match(reader, /textContent/, 'story text must be written with textContent');
        assert.match(reader, /createTextNode/, 'plain runs must be text nodes');
    });

    await test('the reader is keyboard operable and restores focus', () => {
        const reader = read('src/narrative/StoryReader.ts');
        assert.match(reader, /handleKeyDown/, 'the reader must handle keys');
        assert.match(reader, /Escape/, 'Escape must close the reader');
        assert.match(reader, /'Tab'/, 'Tab must be trapped inside the dialog');
        assert.match(reader, /previousFocus/, 'focus must return to the entry point');
        assert.match(reader, /\.focus\(\)/, 'the reader must move focus on open/close');
    });

    await test('the reader follows the language toggle and opens over existing overlays', () => {
        const reader = read('src/narrative/StoryReader.ts');
        assert.match(reader, /onLangChange/, 'the shell copy must follow the language toggle');
        assert.match(reader, /getLang/, 'the English note must be language aware');
        assert.match(reader, /narrative-open/, 'the reader must yield to a running story scene');
        const styles = read('src/styles/styles.less');
        assert.match(styles, /\.story-overlay\s*\{/);
        assert.match(styles, /@media \(max-width: 640px\)[\s\S]*?\.story-overlay/,
            'narrow screens must get a full-height scrollable reader');
    });

    await test('the reader is a pure view: it never touches game or Prompt state', () => {
        const reader = read('src/narrative/StoryReader.ts');
        const imports = [...reader.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(match => match[1]);
        for (const forbidden of ['agent/', 'Game', 'CashManager', 'StrategyStore', 'leaderboard',
            'WavesManager']) {
            assert.ok(!imports.some(specifier => specifier.includes(forbidden)),
                `reading the story must not import ${forbidden}`);
        }
        assert.ok(!/holdForNarrative|gameLoop|promptDefense/.test(reader.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')),
            'reading the story must not call into the game or Prompt layer');
    });

    await test('the setting text lives only in the document, not in source', () => {
        const premise = '替石川争取足够时间';
        for (const file of ['src/narrative/PlayerStory.ts', 'src/narrative/StoryReader.ts', 'src/i18n.ts']) {
            assert.ok(!read(file).includes(premise), `${file} must not hardcode story text`);
        }
        assert.ok(read('src/narrative/PlayerStory.ts').includes('__PLAYER_STORY__'),
            'the story must come from the build-time extraction');
    });

    // ---------------------------------------------------------------------
    // Wiring
    // ---------------------------------------------------------------------
    await test('the page exposes a discoverable, accessible entry and reader', () => {
        const index = read('index.html');
        assert.match(index, /<button id="story-open"[^>]*data-i18n="story\.open"/,
            'the header must expose a labelled background-story entry');
        assert.match(index, /id="story-overlay"[^>]*role="dialog"[^>]*aria-modal="true"/,
            'the reader must be a modal dialog');
        assert.match(index, /id="story-body"[^>]*tabindex="0"/, 'the readable region must be focusable');
        for (const id of ['story-title', 'story-eyebrow', 'story-close', 'story-lang-note', 'story-spoiler-note']) {
            assert.ok(index.includes(`id="${id}"`), `the reader must expose #${id}`);
        }
        assert.doesNotMatch(index, /<img[^>]*story/i, 'the reader must not pull in remote art');
    });

    await test('the entry is wired to the reader and exposed for QA', () => {
        const manager = read('src/InterfaceManager.ts');
        assert.match(manager, /getElementById\('story-open'\)/);
        assert.match(manager, /storyReader\.open\(storyButton\)/);
        const game = read('src/Game.ts');
        assert.match(game, /story:\s*\{[\s\S]*?open:[\s\S]*?close:/, 'promptDefense must expose the reader');
        // 登录浮窗是第一屏，首次进入也必须能打开阅读。
        const gate = read('src/leaderboard/LeaderboardUI.ts');
        assert.match(gate, /gate-story/, 'the profile gate must expose a story entry');
        assert.match(gate, /storyReader\.open\(storyButton\)/);
    });

    await test('the build extracts the player region at build time', () => {
        const config = read('vite.config.mjs');
        assert.match(config, /buildPlayerStory/);
        assert.match(config, /__PLAYER_STORY__:\s*JSON\.stringify\(playerStory\)/);
    });

    await test('the test suite runs this file', () => {
        const scripts = JSON.parse(read('package.json')).scripts;
        assert.ok(scripts.test.includes('tests/background-story.test.js'));
    });

    console.log('All Background story tests passed.');
})().catch(error => {
    process.exitCode = 1;
    console.error(error);
});
