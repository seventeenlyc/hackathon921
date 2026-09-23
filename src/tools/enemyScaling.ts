/**
 * 敌方数值随波次成长的纯函数。
 *
 * WavesManager（生成波次）与 InterfaceManager（敌方情报面板展示）共用同一套系数：
 * 改动任何系数只允许改这里。规则与 WavesManager.generateWave / enemyFactory 一致：
 * - 生命成长：base × (1 + wave / 10)
 * - 速度成长：base × min(1 + wave / 30, cap)，cap 因敌型而异（fast 1.7、armored/healer 1.5、其余不加速即 1）
 * - 前 200 波整体再乘 0.4 给玩家前期留缓冲，201 波起全额
 * - 精英 Boss（boss）例外：永远保留 0.4 缓冲，且 201 波起生命固定在 152 波水位
 */

export function waveLifeRatio(wave: number): number {
    return 1 + wave / 10;
}

export function waveSpeedMultiplier(wave: number, cap: number): number {
    return Math.min(1 + wave / 30, cap);
}

export function earlyWaveReliefFactor(wave: number, alwaysApply = false): number {
    return alwaysApply || wave <= 200 ? 0.4 : 1;
}

/** 精英 Boss 专用：201 波起不再增长，固定在 152 波的生命水位。 */
export function bossLifeRatio(wave: number): number {
    return waveLifeRatio(Math.min(wave, 152));
}

export function enemyLifeAtWave(baseLife: number, wave: number, alwaysRelief = false): number {
    const ratio = alwaysRelief ? bossLifeRatio(wave) : waveLifeRatio(wave);
    return baseLife * ratio * earlyWaveReliefFactor(wave, alwaysRelief);
}

export function enemySpeedAtWave(baseSpeed: number, wave: number, cap: number, alwaysRelief = false): number {
    const multiplier = alwaysRelief ? 1 : waveSpeedMultiplier(wave, cap);
    return baseSpeed * multiplier * earlyWaveReliefFactor(wave, alwaysRelief);
}
