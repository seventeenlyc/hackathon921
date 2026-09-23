/**
 * 敌方数值随波次成长的纯函数。
 *
 * WavesManager（生成波次）与 InterfaceManager（敌方情报面板展示）共用同一套系数：
 * 改动任何系数只允许改这里。规则与 WavesManager.generateWave / enemyFactory 一致：
 * - 生命成长：base × (1 + wave / 10)
 * - 速度成长：base × min(1 + wave / 30, cap)，cap 因敌型而异（fast 1.7、armored/healer 1.5、其余不加速即 1）
 * - 前 200 波整体再乘 0.4 给玩家前期留缓冲，201 波起全额
 * - 精英 Boss 是例外：201 波起生命冻结在等效第 152 波（数量仍随波次增长），且始终享受 0.4 缓冲
 */

/** 201 波起 Boss 属性冻结在等效第 152 波，见 WavesManager 的精英波生成逻辑。 */
export const BOSS_FIXED_EFFECTIVE_WAVE = 152;

export function waveLifeRatio(wave: number): number {
    return 1 + wave / 10;
}

export function waveSpeedMultiplier(wave: number, cap: number): number {
    return Math.min(1 + wave / 30, cap);
}

export function earlyWaveReliefFactor(wave: number, isBoss = false): number {
    return wave <= 200 || isBoss ? 0.4 : 1;
}

/** Boss 的生命成长系数：201 波起固定在等效第 152 波。 */
export function bossLifeRatio(wave: number): number {
    return wave >= 201 ? waveLifeRatio(BOSS_FIXED_EFFECTIVE_WAVE) : waveLifeRatio(wave);
}

export function enemyLifeAtWave(baseLife: number, wave: number, isBoss = false): number {
    const ratio = isBoss ? bossLifeRatio(wave) : waveLifeRatio(wave);
    return baseLife * ratio * earlyWaveReliefFactor(wave, isBoss);
}

export function enemySpeedAtWave(baseSpeed: number, wave: number, cap: number, isBoss = false): number {
    return baseSpeed * waveSpeedMultiplier(wave, cap) * earlyWaveReliefFactor(wave, isBoss);
}
