/**
 * Operator profile avatars for the login gate.
 *
 * Original Tian Ji Zhen portraits generated for this project. The IDs are stable so the
 * leaderboard and server validation can treat them as an enumerated set.
 *
 * Deliberately pure (no image imports): headless tests transpile this module
 * directly. The WebP URL mapping lives in avatarAssets.ts.
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
    {id: 'sentinel', nameKey: 'gate.avatar.sentinel', romaji: 'GUANXING'},
    {id: 'vector', nameKey: 'gate.avatar.vector', romaji: 'SIZHEN'},
    {id: 'nexus', nameKey: 'gate.avatar.nexus', romaji: 'ZHUJIA'},
    {id: 'orbit', nameKey: 'gate.avatar.orbit', romaji: 'FEIYU'},
    {id: 'prism', nameKey: 'gate.avatar.prism', romaji: 'DANQING'},
    {id: 'cipher', nameKey: 'gate.avatar.cipher', romaji: 'ZHAOYE'},
    {id: 'atlas', nameKey: 'gate.avatar.atlas', romaji: 'ZIWEI'},
    {id: 'helix', nameKey: 'gate.avatar.helix', romaji: 'LINGSHU'},
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

// Celestial, talisman and formation call signs match the Tian Ji Zhen artwork.
export const RANDOM_USERNAMES_ZH: readonly string[] = [
    '星河执阵',
    '云海听雷',
    '青霄御风',
    '紫垣观星',
    '玄枢演阵',
    '寒玉照夜',
    '飞羽踏云',
    '丹青落符',
    '墨羽归墟',
    '流光守阵',
    '霜华藏锋',
    '千机问道',
    '北斗巡天',
    '南斗明灯',
    '灵枢听雨',
    '天机行者',
];

export const RANDOM_USERNAMES_EN: readonly string[] = [
    'StarWarden',
    'CloudSeer',
    'JadeSentinel',
    'ThunderSage',
    'WindRider',
    'RuneWeaver',
    'NightWatcher',
    'FrostKeeper',
    'CelestialGuard',
    'ArrayKeeper',
    'SkySentinel',
    'InkWanderer',
    'FeatherWalker',
    'MoonSeeker',
    'MysticScribe',
    'HeavenSeeker',
];
