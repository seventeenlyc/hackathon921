/**
 * Operator profile avatars for the login gate.
 *
 * Neutral geometric icons — no copyrighted imagery. The IDs are stable so the
 * leaderboard and server validation can treat them as an enumerated set.
 *
 * Deliberately pure (no image imports): headless tests transpile this module
 * directly. The PNG URL mapping lives in avatarAssets.ts.
 */

export type AvatarId =
    | 'sentinel'
    | 'vector'
    | 'nexus'
    | 'orbit'
    | 'prism'
    | 'cipher'
    | 'atlas'
    | 'helix';

export interface AvatarEntry {
    id: AvatarId;
    /** i18n key of the displayed name. */
    nameKey: string;
    /** Romaji label rendered under the name (same in both languages). */
    romaji: string;
}

export const AVATARS: readonly AvatarEntry[] = [
    {id: 'sentinel', nameKey: 'gate.avatar.sentinel', romaji: 'SENTINEL'},
    {id: 'vector', nameKey: 'gate.avatar.vector', romaji: 'VECTOR'},
    {id: 'nexus', nameKey: 'gate.avatar.nexus', romaji: 'NEXUS'},
    {id: 'orbit', nameKey: 'gate.avatar.orbit', romaji: 'ORBIT'},
    {id: 'prism', nameKey: 'gate.avatar.prism', romaji: 'PRISM'},
    {id: 'cipher', nameKey: 'gate.avatar.cipher', romaji: 'CIPHER'},
    {id: 'atlas', nameKey: 'gate.avatar.atlas', romaji: 'ATLAS'},
    {id: 'helix', nameKey: 'gate.avatar.helix', romaji: 'HELIX'},
];

export function isKnownAvatarId(id: string): id is AvatarId {
    return AVATARS.some((avatar) => avatar.id === id);
}

export function randomAvatarId(): AvatarId {
    return AVATARS[Math.floor(Math.random() * AVATARS.length)].id;
}

export function randomUsername(lang?: string): string {
    const list = lang === 'en' ? RANDOM_USERNAMES_EN : RANDOM_USERNAMES_ZH;
    return list[Math.floor(Math.random() * list.length)];
}

export const RANDOM_USERNAMES_ZH: readonly string[] = [
    '哨兵',
    '矢量',
    '枢纽',
    '轨道',
    '棱镜',
    '密文',
    '擎天',
    '螺旋',
    '守卫者',
    '指挥官',
    '战术官',
    '防御核心',
    '网络行者',
    '电子幽灵',
    '算法之心',
    '逻辑核心',
];

export const RANDOM_USERNAMES_EN: readonly string[] = [
    'Sentinel',
    'Vector',
    'Nexus',
    'Orbit',
    'Prism',
    'Cipher',
    'Atlas',
    'Helix',
    'Commander',
    'Tactician',
    'Defender',
    'NetRunner',
    'CyberGhost',
    'LogicCore',
    'WireRunner',
    'CoreGuard',
];
