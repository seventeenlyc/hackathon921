/**
 * Player-facing story extraction (issue #99).
 *
 * `docs/保护笑脸男-游戏世界观与剧情设定-v2.md` is the single maintenance point
 * for the setting. This module is the only place that turns its
 * `PLAYER-STORY`-marked region into the structured blocks the in-game reader
 * renders, so the page and the document cannot drift into two copies.
 *
 * It is deliberately plain ESM with no dependencies:
 *  - `vite.config.mjs` imports it at build/dev time and bakes the result in via
 *    `define`, so the packed client only ever contains the player region — never
 *    the internal design (future waves, endings, unimplemented mechanics);
 *  - `tests/background-story.test.js` imports it directly to guard the doc.
 */

const PLAYER_START = '<!-- PLAYER-STORY:START -->';
const PLAYER_END = '<!-- PLAYER-STORY:END -->';
const INTERNAL_START = '<!-- INTERNAL-DESIGN:START -->';

/** Everything between the first `PLAYER-STORY` marker pair, trimmed. */
export function extractPlayerMarkdown(markdown) {
    const doc = String(markdown).replace(/\r\n?/g, '\n');
    const start = doc.indexOf(PLAYER_START);
    if (start < 0) throw new Error(`missing ${PLAYER_START}`);
    const end = doc.indexOf(PLAYER_END, start + PLAYER_START.length);
    if (end < 0) throw new Error(`missing ${PLAYER_END}`);
    const body = doc.slice(start + PLAYER_START.length, end).trim();
    if (body.length === 0) throw new Error('the player story region is empty');
    return body;
}

/** Inline runs: `**bold**` and `` `code` `` are the only constructs used. */
export function parseInline(text) {
    const runs = [];
    const pattern = /(\*\*([^*]+)\*\*)|(`([^`]+)`)/g;
    let cursor = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
        if (match.index > cursor) runs.push({text: text.slice(cursor, match.index)});
        if (match[2] != null) runs.push({text: match[2], bold: true});
        else runs.push({text: match[4], code: true});
        cursor = pattern.lastIndex;
    }
    if (cursor < text.length) runs.push({text: text.slice(cursor)});
    return runs.filter(run => run.text.length > 0);
}

const HEADING = /^(#{1,6})\s+(.*)$/;
const FENCE = /^```/;
const RULE = /^(?:-{3,}|\*{3,}|_{3,})$/;
const QUOTE = /^>\s?(.*)$/;
const LIST_ITEM = /^([-*]|\d+\.)\s+(.*)$/;

/**
 * Minimal, intentionally narrow Markdown subset used by the player region:
 * headings, paragraphs, blockquotes, (un)ordered lists, fenced code and rules.
 * Anything richer is treated as paragraph text so it can never smuggle markup
 * into the reader.
 */
export function parseStoryBlocks(markdown) {
    const lines = String(markdown).replace(/\r\n?/g, '\n').split('\n');
    const blocks = [];
    let paragraph = [];
    let index = 0;

    const flush = () => {
        if (paragraph.length === 0) return;
        blocks.push({type: 'paragraph', runs: parseInline(paragraph.join(' '))});
        paragraph = [];
    };

    while (index < lines.length) {
        const line = lines[index];
        const trimmed = line.trim();

        if (trimmed === '') {
            flush();
            index += 1;
            continue;
        }

        if (FENCE.test(trimmed)) {
            flush();
            const code = [];
            index += 1;
            while (index < lines.length && !FENCE.test(lines[index].trim())) {
                code.push(lines[index]);
                index += 1;
            }
            index += 1; // closing fence
            blocks.push({type: 'code', text: code.join('\n')});
            continue;
        }

        if (RULE.test(trimmed)) {
            flush();
            blocks.push({type: 'rule'});
            index += 1;
            continue;
        }

        const heading = HEADING.exec(trimmed);
        if (heading) {
            flush();
            blocks.push({type: 'heading', level: heading[1].length, runs: parseInline(heading[2].trim())});
            index += 1;
            continue;
        }

        if (QUOTE.test(trimmed)) {
            flush();
            const quoted = [];
            while (index < lines.length && QUOTE.test(lines[index].trim())) {
                quoted.push(QUOTE.exec(lines[index].trim())[1]);
                index += 1;
            }
            blocks.push({type: 'quote', runs: parseInline(quoted.join(' '))});
            continue;
        }

        const item = LIST_ITEM.exec(trimmed);
        if (item) {
            flush();
            const ordered = /\d/.test(item[1]);
            const items = [];
            while (index < lines.length) {
                const next = LIST_ITEM.exec(lines[index].trim());
                if (!next) break;
                items.push(parseInline(next[2].trim()));
                index += 1;
            }
            blocks.push({type: 'list', ordered, items});
            continue;
        }

        paragraph.push(trimmed);
        index += 1;
    }

    flush();
    return blocks;
}

/** The packaged shape injected as `__PLAYER_STORY__`. */
export function buildPlayerStory(markdown) {
    return {blocks: parseStoryBlocks(extractPlayerMarkdown(markdown))};
}

export const PLAYER_STORY_MARKERS = Object.freeze({
    playerStart: PLAYER_START,
    playerEnd: PLAYER_END,
    internalStart: INTERNAL_START,
});
