/**
 * Avatar image URLs, keyed by the ids in AvatarCatalog.
 *
 * The imports are static on purpose: Vite rewrites each one into a
 * content-hashed URL, and a missing or renamed file fails the build instead of
 * turning into a silent 404 at runtime (same rationale as tools/texturePaths.ts).
 * Kept apart from AvatarCatalog so the catalogue stays a pure module that
 * headless tests can load without an image loader.
 */
import aramaki from '../assets/avatars/01_aramaki.png';
import kusanagi from '../assets/avatars/02_kusanagi.png';
import batou from '../assets/avatars/03_batou.png';
import togusa from '../assets/avatars/04_togusa.png';
import ishikawa from '../assets/avatars/05_ishikawa.png';
import saito from '../assets/avatars/06_saito.png';
import paz from '../assets/avatars/07_paz.png';
import boma from '../assets/avatars/08_boma.png';
import type {AvatarId} from './AvatarCatalog';

export const AVATAR_SRC: Record<AvatarId, string> = {
    aramaki,
    kusanagi,
    batou,
    togusa,
    ishikawa,
    saito,
    paz,
    boma,
};
