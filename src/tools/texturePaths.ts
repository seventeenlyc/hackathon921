/**
 * Texture URLs for every externally drawn entity.
 *
 * The imports are static on purpose: Vite rewrites each one into a
 * content-hashed URL, and a missing or renamed file fails the build instead of
 * turning into a silent 404 at runtime.
 */
import armoredEnemy from '../assets/entities/enemies/armored.webp';
import bossEnemy from '../assets/entities/enemies/boss.webp';
import fastEnemy from '../assets/entities/enemies/fast.webp';
import healerEnemy from '../assets/entities/enemies/healer.webp';
import simpleEnemy from '../assets/entities/enemies/simple.webp';
import canonTower from '../assets/entities/towers/canon.webp';
import gatlingTower from '../assets/entities/towers/gatling.webp';
import laserTower from '../assets/entities/towers/laser.webp';
import slowTower from '../assets/entities/towers/slow.webp';
import sniperTower from '../assets/entities/towers/sniper.webp';
import homeBase from '../assets/entities/home/home.webp';
import enemyBase from '../assets/entities/home/enermy.webp';
import tianjiRock from '../assets/obstacles/tianji-rock.webp';
import obstacle1 from '../assets/obstacles/obstacle_01.webp';
import obstacle2 from '../assets/obstacles/obstacle_02.webp';
import obstacle3 from '../assets/obstacles/obstacle_03.webp';
import obstacle4 from '../assets/obstacles/obstacle_04.webp';
import obstacle5 from '../assets/obstacles/obstacle_05.webp';
import obstacle6 from '../assets/obstacles/obstacle_06.webp';

import simpleEnemyRight from '../assets/entities/enemies/simple-right.webp';
import simpleEnemyDown from '../assets/entities/enemies/simple-down.webp';
import simpleEnemyLeft from '../assets/entities/enemies/simple-left.webp';
import fastEnemyRight from '../assets/entities/enemies/fast-right.webp';
import fastEnemyDown from '../assets/entities/enemies/fast-down.webp';
import fastEnemyLeft from '../assets/entities/enemies/fast-left.webp';
import armoredEnemyRight from '../assets/entities/enemies/armored-right.webp';
import armoredEnemyDown from '../assets/entities/enemies/armored-down.webp';
import armoredEnemyLeft from '../assets/entities/enemies/armored-left.webp';
import healerEnemyRight from '../assets/entities/enemies/healer-right.webp';
import healerEnemyDown from '../assets/entities/enemies/healer-down.webp';
import healerEnemyLeft from '../assets/entities/enemies/healer-left.webp';
import bossEnemyRight from '../assets/entities/enemies/boss-right.webp';
import bossEnemyDown from '../assets/entities/enemies/boss-down.webp';
import bossEnemyLeft from '../assets/entities/enemies/boss-left.webp';

export const texturePaths = {
    enemyDirections: {
        simple: {up: simpleEnemy, right: simpleEnemyRight, down: simpleEnemyDown, left: simpleEnemyLeft},
        fast: {up: fastEnemy, right: fastEnemyRight, down: fastEnemyDown, left: fastEnemyLeft},
        armored: {up: armoredEnemy, right: armoredEnemyRight, down: armoredEnemyDown, left: armoredEnemyLeft},
        healer: {up: healerEnemy, right: healerEnemyRight, down: healerEnemyDown, left: healerEnemyLeft},
        boss: {up: bossEnemy, right: bossEnemyRight, down: bossEnemyDown, left: bossEnemyLeft},
    },
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
    home: homeBase,
    enemy: enemyBase,
    // Each placed obstacle picks one of these six textures at random.
    terrain: {
        obstacles: [obstacle1, obstacle2, obstacle3, obstacle4, obstacle5, obstacle6],
        artwork: tianjiRock
    }
};
