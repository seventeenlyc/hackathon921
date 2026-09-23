import {sanitizeUsername} from './LeaderboardStore';
import {isKnownAvatarId} from './AvatarCatalog';
import type {AvatarId} from './AvatarCatalog';

/**
 * The nickname is deliberately page-scoped. It is a display/session identity,
 * not an account credential, so a refresh must ask again while server history
 * remains untouched.
 */
let username: string | null = null;

/** Same lifecycle as the nickname: page-scoped, validated against a whitelist. */
let avatarId: AvatarId | null = null;

export function getSessionUsername(): string | null {
    return username;
}

export function setSessionUsername(raw: string): boolean {
    const clean = sanitizeUsername(raw);
    if (!clean) return false;
    username = clean;
    return true;
}

export function getSessionAvatar(): AvatarId | null {
    return avatarId;
}

export function setSessionAvatar(raw: string): boolean {
    if (!isKnownAvatarId(raw)) return false;
    avatarId = raw;
    return true;
}

/** Remove the pre-session cookie once; failure must never block the game UI. */
export function clearLegacyUsernameCookie(): void {
    if (typeof document === 'undefined') return;
    try {
        document.cookie = 'pd_username=; Max-Age=0; Path=/';
    } catch (e) {
        // Sandboxed/privacy-restricted documents may reject cookie writes.
    }
}
