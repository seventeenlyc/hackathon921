/**
 * In-game narrative script (issue #100).
 *
 * This is the code-side single source for the five story beats. It mirrors the
 * `Wave 051 / 101 / 151 / 201 / 256` sections of
 * `docs/保护笑脸男-游戏世界观与剧情设定-v2.md`; when a line changes, change it
 * in both places in the same PR so the battle, the page and the document cannot
 * drift apart.
 *
 * Boundary semantics (why `requiresClear` exists):
 *  - Scene ① / ② / ③ play at the spawn-complete boundary before wave 51 / 101 /
 *    151: the previous wave's spawning has finished, but its enemies may still
 *    be alive, which is exactly the escalation the scene describes.
 *  - Scene ④ / ⑤ must not fire on `onWaveReached` (that only means the wave has
 *    *started* spawning, see `WavesManager`). They wait until the previous wave
 *    is truly cleared with the base still standing; if the defense falls, the
 *    scene is skipped entirely.
 *
 * The lines below are the original Chinese draft from issue #100. The English
 * strings are an initial, unreviewed working translation kept only so the
 * bilingual UI stays coherent; they are not an approved localization and must be
 * confirmed before release (same for the avatar art licensing).
 */

export type NarrativeLang = 'zh' | 'en';

export interface NarrativeText {
    zh: string;
    en: string;
}

export type NarrativeSpeakerId =
    | 'terminal'
    | 'aramaki'
    | 'kusanagi'
    | 'batou'
    | 'ishikawa'
    | 'tachikoma';

export interface NarrativeLine {
    speaker: NarrativeSpeakerId;
    text: NarrativeText;
    /** Archive recording: the character is not implied to be online right now. */
    recording?: boolean;
}

export interface NarrativeScene {
    id: string;
    /** The scene plays at the boundary before this wave starts. */
    beforeWave: number;
    /**
     * Wait for the previous wave to be fully cleared (and the base to survive)
     * before showing the scene. Used for the wave-200 and wave-256 beats.
     */
    requiresClear: boolean;
    /** After the last line, hand off to the "THE ENDLESS" archive step. */
    leadsToArchive?: boolean;
    /** Machine-facing phase code, kept in English like the rest of the HUD. */
    codeName: string;
    title: NarrativeText;
    lines: NarrativeLine[];
}

export type NarrativePortrait =
    | {kind: 'avatar'; avatarId: 'aramaki' | 'kusanagi' | 'batou' | 'ishikawa'}
    | {kind: 'tachikoma'}
    | {kind: 'terminal'};

export interface NarrativeSpeaker {
    id: NarrativeSpeakerId;
    name: NarrativeText;
    portrait: NarrativePortrait;
}

export const NARRATIVE_SPEAKERS: Record<NarrativeSpeakerId, NarrativeSpeaker> = {
    terminal: {
        id: 'terminal',
        name: {zh: '战术终端', en: 'TACTICAL TERMINAL'},
        portrait: {kind: 'terminal'},
    },
    aramaki: {
        id: 'aramaki',
        name: {zh: '荒卷', en: 'ARAMAKI'},
        portrait: {kind: 'avatar', avatarId: 'aramaki'},
    },
    kusanagi: {
        id: 'kusanagi',
        name: {zh: '草薙素子', en: 'KUSANAGI'},
        portrait: {kind: 'avatar', avatarId: 'kusanagi'},
    },
    batou: {
        id: 'batou',
        name: {zh: '巴特', en: 'BATOU'},
        portrait: {kind: 'avatar', avatarId: 'batou'},
    },
    ishikawa: {
        id: 'ishikawa',
        name: {zh: '石川', en: 'ISHIKAWA'},
        portrait: {kind: 'avatar', avatarId: 'ishikawa'},
    },
    tachikoma: {
        id: 'tachikoma',
        name: {zh: '塔奇克马', en: 'TACHIKOMA'},
        portrait: {kind: 'tachikoma'},
    },
};

export const NARRATIVE_SCENES: readonly NarrativeScene[] = [
    {
        id: 'wave-051-unknown-attack',
        beforeWave: 51,
        requiresClear: false,
        codeName: 'UNKNOWN ATTACK',
        title: {zh: '未知袭击', en: 'UNKNOWN ATTACK'},
        lines: [
            {
                speaker: 'terminal',
                text: {
                    zh: '警报。第二条攻击路线已开启。敌方信号正在同步推进。',
                    en: 'Alert. A second attack route has opened. Hostile signals are advancing in sync.',
                },
            },
            {
                speaker: 'batou',
                text: {
                    zh: '两边同时来？这不是误打误撞。',
                    en: 'Both sides at once? This is not a coincidence.',
                },
            },
            {
                speaker: 'ishikawa',
                text: {
                    zh: '信号源藏得很深，暂时查不到谁在指挥。',
                    en: 'The signal source is well hidden. We cannot trace who is commanding them yet.',
                },
            },
            {
                speaker: 'kusanagi',
                text: {
                    zh: '提高警戒。这不是临时起意的攻击。',
                    en: 'Raise the alert level. This is no improvised attack.',
                },
            },
            {
                speaker: 'tachikoma',
                text: {
                    zh: '少校，我们需要重新分配防线吗？',
                    en: 'Major, should we redistribute the defense line?',
                },
            },
            {
                speaker: 'kusanagi',
                text: {
                    zh: '让参谋看清两条路线。接下来怎么守，由战场情况和他的策略决定。',
                    en: 'Let the officer see both routes. How we hold from here depends on the battlefield and his strategy.',
                },
            },
        ],
    },
    {
        id: 'wave-101-mercenaries',
        beforeWave: 101,
        requiresClear: false,
        codeName: 'MERCENARIES',
        title: {zh: '雇佣兵', en: 'MERCENARIES'},
        lines: [
            {
                speaker: 'terminal',
                text: {
                    zh: '第三条攻击路线已开启。新目标识别：雇佣兵。',
                    en: 'A third attack route has opened. New targets identified: mercenaries.',
                },
            },
            {
                speaker: 'ishikawa',
                text: {
                    zh: '等等，义体的接口编号……是军用规格。',
                    en: 'Wait. The prosthetic interface registry… it is military-grade.',
                },
            },
            {
                speaker: 'batou',
                text: {
                    zh: '普通雇佣兵从哪儿弄来这种装备？',
                    en: 'Where would ordinary mercenaries get hardware like this?',
                },
            },
            {
                speaker: 'kusanagi',
                text: {
                    zh: '先别替他们的雇主下结论。把证据存下来。',
                    en: 'Do not draw conclusions about their employer yet. Preserve the evidence.',
                },
            },
            {
                speaker: 'ishikawa',
                text: {
                    zh: '已经在备份。有人不想让我们继续查笑脸男。',
                    en: 'Already backing it up. Someone does not want us pursuing the Laughing Man.',
                },
            },
            {
                speaker: 'kusanagi',
                text: {
                    zh: '那就先守住这里，别让他们碰到证据。',
                    en: 'Then hold this position first. Do not let them reach the evidence.',
                },
            },
        ],
    },
    {
        id: 'wave-151-authorization-revoked',
        beforeWave: 151,
        requiresClear: false,
        codeName: 'AUTHORIZATION REVOKED',
        title: {zh: '权限撤销', en: 'AUTHORIZATION REVOKED'},
        lines: [
            {
                speaker: 'aramaki',
                text: {
                    zh: '少校，这是我作为课长给你的最后一道命令。',
                    en: 'Major. This is the last order I will give you as Chief.',
                },
            },
            {
                speaker: 'aramaki',
                text: {zh: '活下去。', en: 'Live.'},
            },
            {
                speaker: 'terminal',
                text: {
                    zh: '通讯中断。九课行动权限：撤销。中央网络：离线。',
                    en: 'Communication lost. Section 9 operational authority: revoked. Central network: offline.',
                },
            },
            {
                speaker: 'batou',
                text: {zh: '连我们的身份都抹掉了？', en: 'They erased even our identities?'},
            },
            {
                speaker: 'ishikawa',
                text: {
                    zh: '葵交出的资料还在。我需要时间把它送出九课。',
                    en: 'The data Aoi handed over is still here. I need time to get it out of Section 9.',
                },
            },
            {
                speaker: 'kusanagi',
                text: {
                    zh: '听到了吗，参谋？守住第四条路线，给石川争取时间。',
                    en: 'Did you hear that, officer? Hold the fourth route. Buy Ishikawa time.',
                },
            },
            {
                speaker: 'tachikoma',
                text: {
                    zh: '中央链路断了，但本地链路还在。我还听得见你们。',
                    en: 'The central link is down, but the local link is still up. We can still hear you.',
                },
            },
        ],
    },
    {
        id: 'wave-201-annihilation',
        beforeWave: 201,
        requiresClear: true,
        codeName: 'ANNIHILATION',
        title: {zh: '歼灭战', en: 'ANNIHILATION'},
        lines: [
            {
                speaker: 'ishikawa',
                text: {
                    zh: '少校，资料已经离开九课网络了。',
                    en: 'Major. The data has left the Section 9 network.',
                },
            },
            {
                speaker: 'terminal',
                text: {
                    zh: '外部节点持续增加。分发状态：不可逆。首要任务：完成。',
                    en: 'External nodes are multiplying. Distribution status: irreversible. Primary mission: accomplished.',
                },
            },
            {
                speaker: 'kusanagi',
                text: {
                    zh: '他们可以拆掉这里，但已经收不回那份真相。',
                    en: 'They can tear this place down, but they cannot take that truth back.',
                },
            },
            {
                speaker: 'terminal',
                text: {
                    zh: '警报。海陆空多方向信号接近。识别结果：海坊主。',
                    en: 'Alert. Signals closing from sea, land and air. Identification: Umibozu.',
                },
            },
            {
                speaker: 'batou',
                text: {
                    zh: '这阵仗不是来抢资料的。他们要把九课一并抹掉。',
                    en: 'This is not a raid for the data. They intend to wipe out Section 9 along with it.',
                },
            },
            {
                speaker: 'kusanagi',
                text: {
                    zh: '任务已经完成。现在，尽可能活下去。',
                    en: 'The mission is complete. Now survive as long as you can.',
                },
            },
            {
                speaker: 'terminal',
                text: {
                    zh: '当前目标：生存。第 201 波即将开始。',
                    en: 'Current objective: survive. Wave 201 is about to begin.',
                },
            },
        ],
    },
    {
        id: 'wave-256-the-endless',
        beforeWave: 257,
        requiresClear: true,
        leadsToArchive: true,
        codeName: 'THE ENDLESS',
        title: {zh: '无尽', en: 'THE ENDLESS'},
        lines: [
            {
                speaker: 'terminal',
                text: {
                    zh: '第 256 波：已守住。异常状态：超出预期存活区间。',
                    en: 'Wave 256: held. Anomalous status: survival beyond the expected interval.',
                },
            },
            {
                speaker: 'terminal',
                text: {
                    zh: '检索到加密档案。权限来源：未知。',
                    en: 'Encrypted archive detected. Authority source: unknown.',
                },
            },
            {
                speaker: 'ishikawa',
                recording: true,
                text: {
                    zh: '真相一旦传出去，就不再需要一座总部替它保管。',
                    en: 'Once the truth is out, it no longer needs a headquarters to keep it safe.',
                },
            },
            {
                speaker: 'kusanagi',
                recording: true,
                text: {
                    zh: '如果你还在听，说明有人选择继续往前走。',
                    en: 'If you are still listening, then someone chose to keep moving forward.',
                },
            },
            {
                speaker: 'terminal',
                text: {
                    zh: 'THE ENDLESS。SECRET ARCHIVE FOUND。',
                    en: 'THE ENDLESS. SECRET ARCHIVE FOUND.',
                },
            },
            {
                speaker: 'terminal',
                text: {
                    zh: '第 257 波待命。是否继续无尽挑战？',
                    en: 'Wave 257 standing by. Continue the endless challenge?',
                },
            },
        ],
    },
];
