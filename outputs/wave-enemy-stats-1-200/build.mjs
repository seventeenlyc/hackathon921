import fs from "node:fs/promises";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const outputDir = "G:/hackathon921/outputs/wave-enemy-stats-1-200";
const outputPath = `${outputDir}/wave-enemy-stats-1-200.xlsx`;
const fontFamily = "Aptos";

const baseStats = [
  ["SimpleEnemy", "普通敌人", 50, 2.5, 10, 5, 8, "无", "生命 × (1 + 波次 / 10)"],
  ["FastEnemy", "快速敌人", 200, 4, 10, 20, 8, "无", "生命按波次增长；速度 × min(1 + 波次 / 30, 1.7)"],
  ["ArmoredEnemy", "装甲敌人", 200, 2.5, 10, 10, 8, "当前代码没有实际伤害减免", "生命按波次增长；速度 × min(1 + 波次 / 30, 1.5)"],
  ["HealerEnemy", "治疗敌人", 200, 2.5, 10, 10, 8, "40px 内其他敌人治疗 100 HP/s；效果持续/刷新 100ms", "生命按波次增长；速度 × min(1 + 波次 / 30, 1.5)"],
  ["BossEnemy", "Boss", 2000, 2.5, 10, 100, 16, "无额外技能；高生命、高半径、高奖励", "生命 × (1 + 波次 / 10)；速度不随波次增长"],
];

const ceilPositive = value => Math.ceil(value);
const splitMaxFor = quantity => Math.floor((quantity - 1) / 3);

const rows = [];
for (let wave = 1; wave <= 200; wave += 1) {
  const isOpening = wave < 4;
  const isBossWave = wave % 8 === 0;
  const isStandard = !isOpening && !isBossWave;
  const lifeMultiplier = 1 + wave / 10;
  const simpleQty = isOpening ? 9 + wave : null;
  const fastQty = isStandard ? ceilPositive(2 + wave / 5) : null;
  const armoredQty = isStandard ? 10 + wave : null;
  const splitMax = isStandard ? splitMaxFor(10 + wave) : null;
  const bossQty = isBossWave ? ceilPositive(wave / 10) : null;
  const optionalHealerRange = isBossWave ? `0 或 1-${ceilPositive(wave / 10)}` : "";

  let waveType;
  let countSummary;
  let notes;
  if (isOpening) {
    waveType = "开局固定";
    countSummary = `Simple × ${simpleQty}`;
    notes = "固定生成，无随机分支";
  } else if (isBossWave) {
    waveType = "Boss波（每8波）";
    countSummary = `Boss × ${bossQty}；Healer：${optionalHealerRange}`;
    notes = "Boss固定；Healer约40%概率出现";
  } else {
    waveType = "普通随机波";
    countSummary = `Fast：0/${fastQty}；Armored：${armoredQty} 或 Split`;
    notes = "Fast约30%；Split约40%；否则直出Armored";
  }

  rows.push([
    wave,
    waveType,
    null,
    simpleQty,
    null,
    fastQty,
    null,
    null,
    armoredQty,
    null,
    null,
    isStandard ? `40%：q=${10 + wave}，s=0..${splitMax}；s>0→Armored=s×ceil(q/s)、Healer=s；s=0→0敌人` : "",
    isStandard ? `0..${splitMax}` : null,
    null,
    null,
    bossQty,
    null,
    isBossWave ? 2.5 : null,
    optionalHealerRange,
    countSummary,
    notes,
  ]);
}

const workbook = Workbook.create();
const waveSheet = workbook.worksheets.add("波次明细");
const enemySheet = workbook.worksheets.add("敌人基础数值");
const rulesSheet = workbook.worksheets.add("规则说明");

for (const sheet of [waveSheet, enemySheet, rulesSheet]) {
  sheet.showGridLines = false;
}

waveSheet.getRange("A1").values = [["单路敌人波次明细（第1–200波）"]];
waveSheet.getRange("A2").values = [["范围：单路 = map.enemyBases.length 为 1；数量按当前源码的 for(j < quantity) 实际生成规则整理。波次4以后含随机分支，不能还原成唯一固定的敌人总数。"]];
waveSheet.getRange("A4:U4").values = [[
  "波次", "波次类型", "生命倍率", "Simple数量", "Simple生命", "Fast数量（出现时）", "Fast生命", "Fast速度",
  "Armored直出数量", "Armored生命", "Armored速度", "Split分支规则", "Split分支Healer数量", "Healer生命", "Healer速度",
  "Boss数量", "Boss生命", "Boss速度", "Boss波可选Healer数量", "单路敌人数量说明", "备注",
]];
waveSheet.getRange("A5:U204").values = rows;

for (let row = 5; row <= 204; row += 1) {
  waveSheet.getRange(`C${row}`).formulas = [[`=1+A${row}/10`]];
  waveSheet.getRange(`E${row}`).formulas = [[`=IF(D${row}<>"",50*C${row},"")`]];
  waveSheet.getRange(`G${row}`).formulas = [[`=IF(F${row}<>"",200*C${row},"")`]];
  waveSheet.getRange(`H${row}`).formulas = [[`=IF(F${row}<>"",MIN(4*(1+A${row}/30),4*1.7),"")`]];
  waveSheet.getRange(`J${row}`).formulas = [[`=IF(I${row}<>"",200*C${row},"")`]];
  waveSheet.getRange(`K${row}`).formulas = [[`=IF(I${row}<>"",2.5*MIN(1+A${row}/30,1.5),"")`]];
  waveSheet.getRange(`N${row}`).formulas = [[`=IF(M${row}<>"",200*C${row},"")`]];
  waveSheet.getRange(`O${row}`).formulas = [[`=IF(M${row}<>"",2.5*MIN(1+A${row}/30,1.5),"")`]];
  waveSheet.getRange(`Q${row}`).formulas = [[`=IF(P${row}<>"",2000*C${row},"")`]];
}

enemySheet.getRange("A1").values = [["敌人基础数值"]];
enemySheet.getRange("A2").values = [["生命值会按波次倍率增长；伤害、金币奖励和半径不随波次增长。"]];
enemySheet.getRange("A4:I4").values = [["源码类型", "中文名称", "基础生命", "基础速度", "接触基地伤害", "击杀奖励", "半径", "特殊能力/说明", "波次变化"]];
enemySheet.getRange("A5:I9").values = baseStats;

rulesSheet.getRange("A1").values = [["波次生成规则与口径"]];
rulesSheet.getRange("A3:B12").values = [
  ["整理范围", "第1–200波"],
  ["单路口径", "只计算一个 enemy base；多路时，当前 WavesManager 会把每组数量复制到每个敌方基地"],
  ["波次1–3", "SimpleEnemy 数量 = 9 + 波次，分别为10、11、12"],
  ["每8波", "BossEnemy 数量配置为 wave/10，实际 for 循环生成 ceil(wave/10) 个；另有约40%概率加入 HealerEnemy"],
  ["普通波 Fast", "约30%概率出现；配置数量为 2 + wave/5，实际生成 ceil(2 + wave/5) 个"],
  ["普通波 Armored", "约60%概率直接生成 10 + wave 个 ArmoredEnemy"],
  ["普通波 Split", "约40%概率；split=rand(0,(10+wave)/3)。split>0 时生成 split 组，每组 Armored 数量按 ceil((10+wave)/split)，并生成 split 个 HealerEnemy"],
  ["已知边界", "Split 可能取0，此时该分支不会生成敌人；这是当前代码的实际行为，表格没有替它修正"],
  ["生命倍率", "所有波次生成的敌人生命 = 基础生命 × (1 + 波次/10)"],
  ["来源", "G:/hackathon921/src/WavesManager.ts；G:/hackathon921/src/entities/enemies/Enemy.ts 及各敌人类文件"],
];

const titleFormat = { font: { name: fontFamily, size: 14, bold: true, color: "#1F2937" } };
const noteFormat = { font: { name: fontFamily, size: 10, italic: true, color: "#4B5563" } };
const headerFormat = { fill: "#1F4E78", font: { name: fontFamily, size: 10, bold: true, color: "#FFFFFF" }, horizontalAlignment: "center", verticalAlignment: "center", wrapText: true };
const bodyFormat = { font: { name: fontFamily, size: 10, color: "#1F2937" }, verticalAlignment: "center" };

waveSheet.getRange("A1:U1").format = titleFormat;
waveSheet.getRange("A2:U2").format = noteFormat;
waveSheet.getRange("A4:U4").format = headerFormat;
waveSheet.getRange("A5:U204").format = bodyFormat;
waveSheet.getRange("C5:C204").format.numberFormat = "0.0";
waveSheet.getRange("E5:Q204").format.numberFormat = "0.0";
waveSheet.getRange("A4:U204").format.borders = { insideHorizontal: { style: "thin", color: "#E5E7EB" }, bottom: { style: "thin", color: "#D1D5DB" } };
waveSheet.getRange("A4:U204").format.wrapText = true;
waveSheet.getRange("A:A").format.columnWidth = 8;
waveSheet.getRange("B:B").format.columnWidth = 17;
waveSheet.getRange("C:C").format.columnWidth = 10;
waveSheet.getRange("D:K").format.columnWidth = 13;
waveSheet.getRange("L:L").format.columnWidth = 54;
waveSheet.getRange("M:O").format.columnWidth = 15;
waveSheet.getRange("P:R").format.columnWidth = 12;
waveSheet.getRange("S:S").format.columnWidth = 38;
waveSheet.getRange("T:T").format.columnWidth = 54;
waveSheet.getRange("U:U").format.columnWidth = 46;
waveSheet.getRange("A1:U204").format.rowHeight = 30;
waveSheet.getRange("A1:U1").format.rowHeight = 26;
waveSheet.getRange("A2:U2").format.rowHeight = 34;
waveSheet.getRange("A4:U4").format.rowHeight = 38;
waveSheet.freezePanes.freezeRows(4);
waveSheet.tables.add("A4:U204", true, "WaveDetailTable");

enemySheet.getRange("A1:I1").format = titleFormat;
enemySheet.getRange("A2:I2").format = noteFormat;
enemySheet.getRange("A4:I4").format = headerFormat;
enemySheet.getRange("A5:I9").format = bodyFormat;
enemySheet.getRange("C5:G9").format.numberFormat = "0.0";
enemySheet.getRange("A4:I9").format.borders = { insideHorizontal: { style: "thin", color: "#E5E7EB" }, bottom: { style: "thin", color: "#D1D5DB" } };
enemySheet.getRange("A4:I9").format.wrapText = true;
enemySheet.getRange("A:A").format.columnWidth = 18;
enemySheet.getRange("B:B").format.columnWidth = 14;
enemySheet.getRange("C:G").format.columnWidth = 13;
enemySheet.getRange("H:I").format.columnWidth = 48;
enemySheet.getRange("A1:I9").format.rowHeight = 28;
enemySheet.getRange("A2:I2").format.rowHeight = 24;
enemySheet.getRange("A4:I4").format.rowHeight = 34;
enemySheet.freezePanes.freezeRows(4);
enemySheet.tables.add("A4:I9", true, "EnemyStatsTable");

rulesSheet.getRange("A1:B1").format = titleFormat;
rulesSheet.getRange("A3:B12").format = bodyFormat;
rulesSheet.getRange("A3:A12").format = { fill: "#EAF2F8", font: { name: fontFamily, size: 10, bold: true, color: "#1F2937" }, verticalAlignment: "center" };
rulesSheet.getRange("A3:B12").format.borders = { insideHorizontal: { style: "thin", color: "#D1D5DB" }, bottom: { style: "thin", color: "#D1D5DB" } };
rulesSheet.getRange("A3:B12").format.wrapText = true;
rulesSheet.getRange("A:A").format.columnWidth = 18;
rulesSheet.getRange("B:B").format.columnWidth = 100;
rulesSheet.getRange("A3:B12").format.rowHeight = 32;
rulesSheet.getRange("A1:B1").format.rowHeight = 26;

workbook.recalculate();

const waveCheck = await workbook.inspect({
  kind: "table",
  range: "波次明细!A4:U10",
  include: "values,formulas",
  tableMaxRows: 7,
  tableMaxCols: 21,
  maxChars: 12000,
});
console.log("WAVE_CHECK", waveCheck.ndjson);

const lateWaveCheck = await workbook.inspect({
  kind: "table",
  range: "波次明细!A199:U204",
  include: "values,formulas",
  tableMaxRows: 6,
  tableMaxCols: 21,
  maxChars: 12000,
});
console.log("LATE_WAVE_CHECK", lateWaveCheck.ndjson);

const formulaErrors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!",
  options: { useRegex: true, maxResults: 100 },
  summary: "final formula error scan",
});
console.log("FORMULA_ERRORS", formulaErrors.ndjson);

const preview = await workbook.render({ sheetName: "波次明细", range: "A1:U15", scale: 1, format: "png" });
await fs.writeFile(`${outputDir}/wave-preview.png`, new Uint8Array(await preview.arrayBuffer()));

await fs.mkdir(outputDir, { recursive: true });
const xlsx = await SpreadsheetFile.exportXlsx(workbook);
await xlsx.save(outputPath);
console.log(`EXPORTED ${outputPath}`);
