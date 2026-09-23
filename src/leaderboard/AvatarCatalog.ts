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
