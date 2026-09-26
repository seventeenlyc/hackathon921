/**
 * Avatar image URLs, keyed by the ids in AvatarCatalog.
 *
 * The imports are static on purpose: Vite rewrites each one into a
 * content-hashed URL, and a missing or renamed file fails the build instead of
 * turning into a silent 404 at runtime (same rationale as tools/texturePaths.ts).
 * Kept apart from AvatarCatalog so the catalogue stays a pure module that
 * headless tests can load without an image loader.
 *
 * The images are original Tian Ji Zhen portraits generated for this project (no
 * third-party artwork).
 */
import sentinel from '../assets/avatars/01_sentinel.png';
import vector from '../assets/avatars/02_vector.png';
import nexus from '../assets/avatars/03_nexus.png';
import orbit from '../assets/avatars/04_orbit.png';
import prism from '../assets/avatars/05_prism.png';
import cipher from '../assets/avatars/06_cipher.png';
import atlas from '../assets/avatars/07_atlas.png';
import helix from '../assets/avatars/08_helix.png';
import type {AvatarId} from './AvatarCatalog';

export const AVATAR_SRC: Record<AvatarId, string> = {
    sentinel,
    vector,
    nexus,
    orbit,
    prism,
    cipher,
    atlas,
    helix,
};
