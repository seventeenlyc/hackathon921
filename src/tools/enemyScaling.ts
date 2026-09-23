/**
 * 敌方数值随波次成长的纯函数。
 *
 * WavesManager（生成波次）与 InterfaceManager（敌方情报面板展示）共用同一套系数：
 * 改动任何系数只允许改这里。规则与 WavesManager.generateWave / enemyFactory 一致：
 * - 生命成长：base × (1 + wave / 10)
 * - 速度成长：base × min(1 + wave / 30, cap)，cap 因敌型而异（fast 1.7、armored/healer 1.5、其余不加速即 1）
 * - 前 200 波整体再乘 0.4 给玩家前期留缓冲，201 波起全额
 */

export function waveLifeRatio(wave: number): number {
    return 1 + wave / 10;
}

export function waveSpeedMultiplier(wave: number, cap: number): number {
    return Math.min(1 + wave / 30, cap);
}

export function earlyWaveReliefFactor(wave: number): number {
    return wave <= 200 ? 0.4 : 1;
}

export function enemyLifeAtWave(baseLife: number, wave: number): number {
    return baseLife * waveLifeRatio(wave) * earlyWaveReliefFactor(wave);
}

export function enemySpeedAtWave(baseSpeed: number, wave: number, cap: number): number {
    return baseSpeed * waveSpeedMultiplier(wave, cap) * earlyWaveReliefFactor(wave);
}
