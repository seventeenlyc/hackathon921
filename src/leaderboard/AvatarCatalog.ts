/**
 * Operator profile avatars for the login gate.
 *
 * Deliberately pure (no image imports): headless tests transpile this module
 * directly. The PNG URL mapping lives in avatarAssets.ts.
 */

export type AvatarId =
    | 'aramaki'
    | 'kusanagi'
    | 'batou'
    | 'togusa'
    | 'ishikawa'
    | 'saito'
    | 'paz'
    | 'boma';

export interface AvatarEntry {
    id: AvatarId;
    /** i18n key of the displayed zh name (e.g. 课长). */
    nameKey: string;
    /** Romaji label rendered under the zh name (e.g. ARAMAKI). */
    romaji: string;
}

export const AVATARS: readonly AvatarEntry[] = [
    {id: 'aramaki', nameKey: 'gate.avatar.aramaki', romaji: 'ARAMAKI'},
    {id: 'kusanagi', nameKey: 'gate.avatar.kusanagi', romaji: 'KUSANAGI'},
    {id: 'batou', nameKey: 'gate.avatar.batou', romaji: 'BATOU'},
    {id: 'togusa', nameKey: 'gate.avatar.togusa', romaji: 'TOGUSA'},
    {id: 'ishikawa', nameKey: 'gate.avatar.ishikawa', romaji: 'ISHIKAWA'},
    {id: 'saito', nameKey: 'gate.avatar.saito', romaji: 'SAITO'},
    {id: 'paz', nameKey: 'gate.avatar.paz', romaji: 'PAZ'},
    {id: 'boma', nameKey: 'gate.avatar.boma', romaji: 'BOMA'},
];

export function isKnownAvatarId(id: string): id is AvatarId {
    return AVATARS.some((avatar) => avatar.id === id);
}

export function randomAvatarId(): AvatarId {
    return AVATARS[Math.floor(Math.random() * AVATARS.length)].id;
}

export const RANDOM_USERNAMES_ZH: readonly string[] = [
    '草薙素子',
    '巴特',
    '荒卷大辅',
    '陀古萨',
    '石川',
    '斉藤',
    '帕兹',
    '波马',
    '笑脸男',
    '塔奇克马-01',
    '塔奇克马-02',
    '塔奇克马-07',
    '公安九课参谋',
    '电子幽灵',
    '网络潜行者',
    '义体游侠',
    '战术指挥官',
    '迷宫架构师',
];

export const RANDOM_USERNAMES_EN: readonly string[] = [
    'Major_Kusanagi',
    'Batou_09',
    'Chief_Aramaki',
    'Togusa',
    'Ishikawa',
    'Saito',
    'Tachikoma_01',
    'Tachikoma_07',
    'LaughingMan',
    'Cyber_Ghost',
    'Section9_Agent',
    'Net_Phantom',
    'Wire_Runner',
    'Logic_Core',
];

export function randomUsername(lang?: string): string {
    const list = lang === 'en' ? RANDOM_USERNAMES_EN : RANDOM_USERNAMES_ZH;
    return list[Math.floor(Math.random() * list.length)];
}
