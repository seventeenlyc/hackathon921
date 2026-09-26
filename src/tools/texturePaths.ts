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
import homeBase from '../assets/entities/home/home.png';
import enemyBase from '../assets/entities/home/enermy.png';
import tianjiRock from '../assets/obstacles/tianji-rock.png';
import obstacle1 from '../assets/obstacles/obstacle_01.png';
import obstacle2 from '../assets/obstacles/obstacle_02.png';
import obstacle3 from '../assets/obstacles/obstacle_03.png';
import obstacle4 from '../assets/obstacles/obstacle_04.png';
import obstacle5 from '../assets/obstacles/obstacle_05.png';
import obstacle6 from '../assets/obstacles/obstacle_06.png';

import simpleEnemyRight from '../assets/entities/enemies/simple-right.png';
import simpleEnemyDown from '../assets/entities/enemies/simple-down.png';
import simpleEnemyLeft from '../assets/entities/enemies/simple-left.png';
import fastEnemyRight from '../assets/entities/enemies/fast-right.png';
import fastEnemyDown from '../assets/entities/enemies/fast-down.png';
import fastEnemyLeft from '../assets/entities/enemies/fast-left.png';
import armoredEnemyRight from '../assets/entities/enemies/armored-right.png';
import armoredEnemyDown from '../assets/entities/enemies/armored-down.png';
import armoredEnemyLeft from '../assets/entities/enemies/armored-left.png';
import healerEnemyRight from '../assets/entities/enemies/healer-right.png';
import healerEnemyDown from '../assets/entities/enemies/healer-down.png';
import healerEnemyLeft from '../assets/entities/enemies/healer-left.png';
import bossEnemyRight from '../assets/entities/enemies/boss-right.png';
import bossEnemyDown from '../assets/entities/enemies/boss-down.png';
import bossEnemyLeft from '../assets/entities/enemies/boss-left.png';

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
