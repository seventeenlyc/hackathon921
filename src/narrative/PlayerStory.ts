/**
 * Player-facing background story (issue #99).
 *
 * The text is NOT maintained here. `docs/保护笑脸男-游戏世界观与剧情设定-v2.md`
 * is the single source; `vite.config.mjs` extracts its `PLAYER-STORY` region with
 * `scripts/player-story.mjs` and injects the parsed blocks as `__PLAYER_STORY__`.
 * Updating the document updates the reader — do not paste setting text into
 * source. The internal design (future waves, endings, unimplemented mechanics)
 * is outside that region and is deliberately never packed into the client.
 */

export interface StoryRun {
    text: string;
    bold?: boolean;
    code?: boolean;
}

export type StoryBlock =
    | {type: 'heading'; level: number; runs: StoryRun[]}
    | {type: 'paragraph'; runs: StoryRun[]}
    | {type: 'quote'; runs: StoryRun[]}
    | {type: 'list'; ordered: boolean; items: StoryRun[][]}
    | {type: 'code'; text: string}
    | {type: 'rule'};

export interface PlayerStory {
    blocks: StoryBlock[];
}

declare const __PLAYER_STORY__: PlayerStory;

export const PLAYER_STORY_BLOCKS: readonly StoryBlock[] = __PLAYER_STORY__.blocks;
