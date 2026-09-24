/**
 * 敌方数值随波次成长的纯函数。
 *
 * WavesManager（生成波次）与 InterfaceManager（敌方情报面板展示）共用同一套系数：
 * 改动任何系数只允许改这里。规则与 WavesManager.generateWave / enemyFactory 一致：
 * - 生命成长：base × (1 + wave / 10)
 * - 速度成长：base × min(1 + wave / 30, cap)，cap 因敌型而异（fast 1.7、armored/healer 1.5、其余不加速即 1）
 * - 前 200 波整体使用 0.52 系数（原 0.4 × 1.3），201 波起普通敌人按全额数值
 * - 精英 Boss（boss）在前 200 波使用 0.52；201 波起保持原 0.4 系数且生命固定在 152 波水位
 */

export function waveLifeRatio(wave: number): number {
    return 1 + wave / 10;
}

export function waveSpeedMultiplier(wave: number, cap: number): number {
    return Math.min(1 + wave / 30, cap);
}

export function earlyWaveReliefFactor(wave: number, alwaysApply = false): number {
    if (alwaysApply) return wave <= 200 ? 0.52 : 0.4;
    return wave <= 200 ? 0.52 : 1;
}

/** 精英 Boss 专用：201 波起不再增长，固定在 152 波的生命水位。 */
export function bossLifeRatio(wave: number): number {
    return waveLifeRatio(wave >= 201 ? 152 : wave);
}

export function enemyLifeAtWave(baseLife: number, wave: number, alwaysRelief = false): number {
    const ratio = alwaysRelief ? bossLifeRatio(wave) : waveLifeRatio(wave);
    return baseLife * ratio * earlyWaveReliefFactor(wave, alwaysRelief);
}

export function enemySpeedAtWave(baseSpeed: number, wave: number, cap: number, alwaysRelief = false): number {
    const multiplier = alwaysRelief ? 1 : waveSpeedMultiplier(wave, cap);
    return baseSpeed * multiplier * earlyWaveReliefFactor(wave, alwaysRelief);
}
