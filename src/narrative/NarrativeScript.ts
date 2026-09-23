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
 * The Chinese lines are original game dialogue revised against Production I.G's
 * episode 20/21/24–26 synopses (see the v2 worldbuilding document). Those pages
 * are plot summaries, NOT a dialogue transcript: no line below claims to quote
 * the anime. Routes, Ishikawa's upload and wave 256 are game inventions. English
 * is an unreviewed working translation; character portrait rights still require
 * confirmation before release.
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
                    zh: '两路信号的行动节拍一致。源头还没定位。',
                    en: 'The two routes move in the same rhythm. We still cannot locate the source.',
                },
            },
            {
                speaker: 'kusanagi',
                text: {
                    zh: '先别认定是谁。把两条路线都看住。',
                    en: 'Do not decide who is behind it yet. Keep eyes on both routes.',
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
                    zh: '参谋，第二条路线已标出来。防线怎么调，看眼前的战场。',
                    en: 'Officer, the second route is marked. Adjust the defense to the battlefield in front of you.',
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
                    zh: '接口记录是军用规格，但装备从哪儿来的，还没有证据。',
                    en: 'The interface records meet military specifications, but we have no proof of where the equipment came from.',
                },
            },
            {
                speaker: 'batou',
                text: {
                    zh: '一身雇佣兵的行头，拿的却是军用装备？',
                    en: 'Mercenary gear on the outside, military hardware underneath?',
                },
            },
            {
                speaker: 'kusanagi',
                text: {
                    zh: '装备不是雇主的签名。先保存记录，别抢着下结论。',
                    en: 'Equipment is not an employer\'s signature. Save the records before drawing conclusions.',
                },
            },
            {
                speaker: 'ishikawa',
                text: {
                    zh: '备份好了。厚生省那条调查线索，看来有人想让它断在这里。',
                    en: 'Backed up. It seems someone wants our Health and Labor Ministry lead to end here.',
                },
            },
            {
                speaker: 'kusanagi',
                text: {
                    zh: '那就守住证据。其余的，活过这一波再查。',
                    en: 'Then protect the evidence. We can investigate the rest after we survive this wave.',
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
                text: {zh: '行动权限撤了。看来他们不打算给九课留退路。', en: 'Operational authority revoked. It looks like they are leaving Section 9 no way out.'},
            },
            {
                speaker: 'ishikawa',
                text: {
                    zh: '葵给的线索和厚生省的调查记录还在。我需要时间把副本送出去。',
                    en: 'Aoi\'s lead and the Health and Labor Ministry records are still here. I need time to send copies out.',
                },
            },
            {
                speaker: 'kusanagi',
                text: {
                    zh: '参谋，第四条路线开了。守住这里，给石川争取传输时间。',
                    en: 'Officer, the fourth route is open. Hold this position so Ishikawa can finish the transfer.',
                },
            },
            {
                speaker: 'tachikoma',
                text: {
                    zh: '中央链路断了；本地通讯还通。少校，我在。',
                    en: 'The central link is down; local comms still work. Major, I\'m here.',
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
                    zh: '少校，副本已送到九课以外。厚生省那条证据链，不只我们握着了。',
                    en: 'Major, the copies reached nodes outside Section 9. We are no longer the only ones holding the Health and Labor Ministry evidence.',
                },
            },
            {
                speaker: 'terminal',
                text: {
                    zh: '外部节点：已确认。分发状态：不可逆。首要任务：完成。',
                    en: 'External nodes: confirmed. Distribution: irreversible. Primary mission: complete.',
                },
            },
            {
                speaker: 'kusanagi',
                text: {
                    zh: '真相送出去了。人还在，就还有路可走。',
                    en: 'The truth is out. As long as we are alive, there is still a way forward.',
                },
            },
            {
                speaker: 'terminal',
                text: {
                    zh: '警报。多方向重装信号接近。识别代号：海坊主。',
                    en: 'Alert. Heavy units approaching from multiple directions. Designation: Umibozu.',
                },
            },
            {
                speaker: 'batou',
                text: {
                    zh: '不是来抢一份已经传开的资料。他们是来清除九课的。',
                    en: 'They are not here for data that has already spread. They are here to eliminate Section 9.',
                },
            },
            {
                speaker: 'kusanagi',
                text: {
                    zh: '任务完成。守住阵地，也给其他人留条退路。',
                    en: 'The mission is complete. Hold the line and leave the others a way out.',
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
                    zh: '资料发出去那一刻，九课就不再是唯一的保管人。',
                    en: 'The moment the data went out, Section 9 stopped being its sole keeper.',
                },
            },
            {
                speaker: 'kusanagi',
                recording: true,
                text: {
                    zh: '如果你还在听，就别把活下去当作违抗命令。',
                    en: 'If you can still hear this, do not mistake survival for disobedience.',
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
