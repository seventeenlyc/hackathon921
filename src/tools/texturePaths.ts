declare const require: (path: string) => string;

export const texturePaths = {
    enemies: {
        simple: require('../../public/img/entities/enemies/simple.png'),
        fast: require('../../public/img/entities/enemies/fast.png'),
        armored: require('../../public/img/entities/enemies/armored.png'),
        healer: require('../../public/img/entities/enemies/healer.png'),
        boss: require('../../public/img/entities/enemies/boss.png')
    },
    towers: {
        canon: require('../../public/img/entities/towers/canon.png'),
        gatling: require('../../public/img/entities/towers/gatling.png'),
        slow: require('../../public/img/entities/towers/slow.png'),
        sniper: require('../../public/img/entities/towers/sniper.png'),
        laser: require('../../public/img/entities/towers/laser.png')
    },
    terrain: {
        rock: require('../../public/img/entities/terrain/rock.png')
    }
};
