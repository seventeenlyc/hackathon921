/**
 * Texture URLs for every externally drawn entity.
 *
 * The imports are static on purpose: Vite rewrites each one into a
 * content-hashed URL, and a missing or renamed file fails the build instead of
 * turning into a silent 404 at runtime.
 */
import armoredEnemy from '../assets/entities/enemies/armored.png';
import bossEnemy from '../assets/entities/enemies/boss.png';
import fastEnemy from '../assets/entities/enemies/fast.png';
import healerEnemy from '../assets/entities/enemies/healer.png';
import simpleEnemy from '../assets/entities/enemies/simple.png';
import canonTower from '../assets/entities/towers/canon.png';
import gatlingTower from '../assets/entities/towers/gatling.png';
import laserTower from '../assets/entities/towers/laser.png';
import slowTower from '../assets/entities/towers/slow.png';
import sniperTower from '../assets/entities/towers/sniper.png';
import rockTerrain from '../assets/entities/terrain/rock.png';

export const texturePaths = {
    enemies: {
        simple: simpleEnemy,
        fast: fastEnemy,
        armored: armoredEnemy,
        healer: healerEnemy,
        boss: bossEnemy
    },
    towers: {
        canon: canonTower,
        gatling: gatlingTower,
        slow: slowTower,
        sniper: sniperTower,
        laser: laserTower
    },
    terrain: {
        rock: rockTerrain
    }
};
