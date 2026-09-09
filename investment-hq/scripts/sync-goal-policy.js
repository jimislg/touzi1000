#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  bootstrapPayload,
  simulateDividendAcceleration
} = require('../server');

const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const TODAY = '2026-09-09';
const read = name => JSON.parse(fs.readFileSync(path.join(DATA, name), 'utf8'));
const write = (name, value) => fs.writeFileSync(path.join(DATA, name), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
const multiple = (rate, years) => Number(Math.pow(1 + rate, years).toFixed(4));
const duration = months => `${Math.floor(months / 12)}年${months % 12 ? `${months % 12}个月` : ''}`;
const dateAt = (startDate, months) => {
  const [year, month] = startDate.split('-').map(Number);
  const value = new Date(Date.UTC(year, month - 1 + months, 1));
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}`;
};

let payload = bootstrapPayload();
let metrics = payload.decisionMetrics;
const baseReturn = metrics.weightedReturn;
const underwritingReturn = metrics.underwritingWeightedReturn;
if (![baseReturn, underwritingReturn].every(Number.isFinite)) throw new Error('无法从正式目标组合计算回报');
const formalHoldingCount = payload.portfolio.targetPortfolio.length;
const targetStockWeight = 1 - Number(payload.portfolio.opportunityCash.weight);
const targetCashWeight = Number(payload.portfolio.opportunityCash.weight);
const targetStockPct = Math.round(targetStockWeight * 100);
const targetCashPct = Math.round(targetCashWeight * 100);
const formalPolicyLabel = `${formalHoldingCount}只正式目标、${targetStockPct}%股票+${targetCashPct}%现金`;

const goals = read('goals.json');
goals.asOf = TODAY;
goals.dividendRunway.status = 'historical-research-only';
goals.dividendRunway.executionEligible = false;
goals.dividendRunway.note = `历史90%股票研究情景，仅保留用于敏感性追溯；正式执行与目标日期读取当前${formalPolicyLabel}的underwrittenTwoStage路径。`;
goals.portfolioReturnScenarios.base.annualReturn = baseReturn;
goals.portfolioReturnScenarios.base.fiveYearMultiple = multiple(baseReturn, 5);
goals.portfolioReturnScenarios.base.tenYearMultiple = multiple(baseReturn, 10);
goals.portfolioReturnScenarios.base.note = `当前${formalPolicyLabel}按公司报告基准回报加权；宇通退出后的权重留在现金，不为凑仓位突破单股上限`;
goals.portfolioReturnScenarios.underwriting.annualReturn = underwritingReturn;
goals.portfolioReturnScenarios.underwriting.fiveYearMultiple = multiple(underwritingReturn, 5);
goals.portfolioReturnScenarios.underwriting.tenYearMultiple = multiple(underwritingReturn, 10);
goals.portfolioReturnScenarios.underwriting.note = `当前${formalPolicyLabel}，A类按悲观/基准/乐观25%/60%/15%，B类按40%/50%/10%，现金1.5%`;
goals.dividendAcceleration.twoStage.accumulationReturn = baseReturn;
goals.dividendAcceleration.twoStage.accumulationYield = payload.portfolio.currentDividendBaseline.targetPortfolio / payload.portfolio.totalAssets;
goals.dividendAcceleration.contributionSensitivity = {
  status: 'scenario-only',
  actualAnnualContribution: null,
  annualContributions: [0, 300000, 500000, 1000000],
  robustness: { delayedStartMonths: 12, completionRate: 0.8, contributionYears: 5 },
  note: `新增本金按月末等额投入并持续到安全线，始终使用当前${formalPolicyLabel}的承保回报与终态股息率；这是能力敏感性，不是已承诺现金流，也不得使用杠杆或生活备用金。`
};
goals.dividendAcceleration.incomePortfolio = {
  status: 'future-income-blueprint-with-one-vacancy',
  maxHoldings: 7,
  cashWeight: 0.23,
  terminalReturnFloor: 0.08,
  rows: [
    { name: '贵州茅台', weight: 0.19, assumedAfterTaxYield: 0.0452, routineHaircut: 0.15, severeHaircut: 0.20, role: '品牌现金流核心', gate: '约1150元及以下且现金收入、渠道与普通分红能力通过复核' },
    { name: '招商银行', weight: 0.16, assumedAfterTaxYield: 0.0508, routineHaircut: 0.15, severeHaircut: 0.35, role: '低成本负债金融股息', gate: '资本充足率、资产质量、信用成本和派息能力通过金融口径复核' },
    { name: '中国移动H', weight: 0.14, assumedAfterTaxYield: 0.0620, routineHaircut: 0.15, severeHaircut: 0.15, role: '通信基础设施稳定器', gate: '约68港元及以下；长账龄应收、资本开支与港股通税后回报通过' },
    { name: '质量白电一只', weight: 0.10, assumedAfterTaxYield: 0.0570, routineHaircut: 0.15, severeHaircut: 0.40, role: '美的/海尔/格力择一的成熟现金流', gate: '只选一只；税后率、总回报、治理、现金覆盖和接班风险全部通过' },
    { name: '长江电力', weight: 0.10, assumedAfterTaxYield: 0.0435, routineHaircut: 0.15, severeHaircut: 0.10, role: '水电现金流稳定器', gate: '约23元及以下且来水、负债、资本开支和分红覆盖通过' },
    { name: '福耀玻璃', weight: 0.08, assumedAfterTaxYield: 0.0368, routineHaircut: 0.15, severeHaircut: 0.40, role: '全球制造与股息增长', gate: '海外扩产回报、关税、自由现金流和普通分红覆盖通过' }
  ],
  constraints: [
    '当前六个已命名股票加23%现金/未分配资金合计100%；第七席保持空缺，质量白电槽最终只能选择一家公司',
    '任何单一公司正常普通股息贡献不超过20%；银行保险合计不超过16%',
    '运营商与公用事业合计不超过24%；福耀为当前唯一已命名制造业席位',
    '特别股息、现金利息、卖出收益和本金返还不计入目标',
    '宇通、宁德或康臣只有在最新论文和价格闸门同时通过后，才可竞争空缺席位；不得自动写入',
    '腾讯若迁移时基准十年IRR仍不低于12%，不机械卖出；延后迁移或提高资产门槛'
  ],
  note: '这是未来迁移阶段的条件蓝图，不是2026年的买入清单。宇通按2026-09-08最新结论移出，当前只识别六只股票并保留一个空缺席位；税后率均须按届时买点和税制复核。'
};
const terminalYield = goals.dividendAcceleration.incomePortfolio.rows.reduce(
  (sum, row) => sum + row.weight * row.assumedAfterTaxYield,
  0
);
const maxDividendContributionLimit = 0.20;
const seventhSeatMaxWeight = 0.10;
const tenYearTerminalYield = 0.052;
const maxExistingWeightedDividend = Math.max(...goals.dividendAcceleration.incomePortfolio.rows.map(
  row => row.weight * row.assumedAfterTaxYield
));
const concentrationRepairPortfolioYield = maxExistingWeightedDividend / maxDividendContributionLimit;
const concentrationRepairIncrement = concentrationRepairPortfolioYield - terminalYield;
const concentrationRepairSeatYield = concentrationRepairIncrement / seventhSeatMaxWeight;
const singleSeatTargetYield = (tenYearTerminalYield - terminalYield) / seventhSeatMaxWeight;
const warehouseSeatYield = 0.052;
const portfolioYieldWithWarehouseSeat = terminalYield + seventhSeatMaxWeight * warehouseSeatYield;
const maxPortfolioYieldWithSingleSeat = terminalYield / (1 - maxDividendContributionLimit);
const existingContributionRequiredAtTarget = tenYearTerminalYield * (1 - maxDividendContributionLimit);
const seventhSeatGate = {
  status: 'single-seat-cannot-complete-ten-year-yield-gate',
  currentSixYield: terminalYield,
  targetTerminalYield: tenYearTerminalYield,
  maxSeatWeight: seventhSeatMaxWeight,
  maxDividendContribution: maxDividendContributionLimit,
  largestExistingWeightedDividend: maxExistingWeightedDividend,
  concentrationRepair: {
    minimumPortfolioYield: concentrationRepairPortfolioYield,
    requiredWeightedDividend: concentrationRepairIncrement,
    minimumSeatAfterTaxYieldAtMaxWeight: concentrationRepairSeatYield,
    conclusion: '第七席按10%配置时，税后普通股息率至少约5.01%，才只是把最高单一股息贡献压回20%以内。'
  },
  warehouseGateScenario: {
    seatAfterTaxYield: warehouseSeatYield,
    portfolioYield: portfolioYieldWithWarehouseSeat,
    largestExistingDividendContribution: maxExistingWeightedDividend / portfolioYieldWithWarehouseSeat,
    remainingYieldGap: tenYearTerminalYield - portfolioYieldWithWarehouseSeat
  },
  singleSeatTargetScenario: {
    requiredSeatAfterTaxYieldAtMaxWeight: singleSeatTargetYield,
    candidateDividendContribution: (seventhSeatMaxWeight * singleSeatTargetYield) / tenYearTerminalYield,
    violatesContributionLimit: (seventhSeatMaxWeight * singleSeatTargetYield) / tenYearTerminalYield > maxDividendContributionLimit
  },
  feasibilityBoundary: {
    maximumPortfolioYieldWithFixedSixAndOneCompliantNewContributor: maxPortfolioYieldWithSingleSeat,
    existingSixContributionRequiredAtTarget: existingContributionRequiredAtTarget,
    existingSixContributionShortfall: existingContributionRequiredAtTarget - terminalYield
  },
  requirements: [
    '候选公司质量至少B类，承保十年总回报不低于8%，不得依赖估值扩张',
    '按获批最大权重计算，正常化税后普通股息率足以把单一股息贡献压至20%以内',
    '正常化自由现金流覆盖普通股息不低于1.2倍；金融业改用资本与可分配利润口径',
    '与现有六席不重复占用行业风险预算，且不靠特别股息、周期峰值或本金返还',
    '第七席只能修复集中度；5.2%终态税后率还需现有六席更低买价或重新配重共同完成'
  ],
  conclusion: '保持现有六席收益贡献不变时，任何单一第七席都无法在20%股息贡献上限内把组合税后率推到5.2%；不得用13.61%的高风险股息假设伪造十年路径。'
};
goals.dividendAcceleration.seventhSeatGate = seventhSeatGate;
goals.dividendAcceleration.purchasingPower = {
  status: 'planning-scenario',
  baseYear: 2026,
  baseAnnualIncome: 1000000,
  planningInflation: 0.03,
  inflationScenarios: [0.02, 0.03, 0.04],
  routineBuffer: 1.2,
  dividendGrowthEvidenceYears: 3,
  projectionYears: 30,
  severeTerminalReturn: 0.06,
  contributionSensitivity: {
    status: 'capacity-unconfirmed',
    actualAnnualContribution: null,
    annualContributions: [0, 300000, 500000, 620000, 1000000],
    targetYears: [10, 15, 20],
    searchCeiling: 5000000,
    robustness: { horizonYears: 15, delayedStartMonths: 12, completionRate: 0.8, contributionYears: 5 },
    note: '购买力情景中的新增本金按月末等额投入，并使用3%规划通胀；它是现金流能力敏感性，不是已承诺入金。达到目标前若支用股息，日期必须另行重算。'
  },
  spendingPolicy: {
    beforeRealRoutine: '购买力路径的日期以全部普通股息复投为前提；提前支用必须单独重算，不能沿用原日期',
    afterRealRoutine: '年度支用上限为100万元乘以自2026年起的累计实际通胀，且不超过压力后普通股息；正常年份至少保留约20%继续复投',
    growthFailure: '若连续两年普通股息增长低于实际通胀，冻结支用额并重算组合',
    severeFailure: '若严重压力股息低于购买力目标，不卖出本金维持表面收入'
  },
  note: '3%只是长期规划情景，不代表对未来CPI的预测；每年用实际居民消费价格指数更新累计购买力因子。股息增长必须来自每股普通股息和自由现金流，不把新增本金带来的股息增长算作公司增长。'
};
goals.dividendAcceleration.twoStage.terminalReturn = 0.08;
goals.dividendAcceleration.twoStage.terminalYield = terminalYield;
goals.dividendAcceleration.incomeFirst.terminalReturn = 0.08;
goals.dividendAcceleration.incomeFirst.terminalYield = terminalYield;
const accumulationPhase = goals.dividendAcceleration.phasePortfolios.find(row => row.id === 'accumulation');
accumulationPhase.targetReturn = underwritingReturn;
accumulationPhase.companyBaseReturn = baseReturn;
accumulationPhase.targetYield = goals.dividendAcceleration.twoStage.accumulationYield;
accumulationPhase.allocation = '茅台25%＋腾讯15%＋招行10%＋福耀10%＋安踏8%＋泡泡6%＋现金26%；宇通退出，当前只批准六只正式目标';
const incomePhase = goals.dividendAcceleration.phasePortfolios.find(row => row.id === 'income');
incomePhase.targetReturn = 0.08;
incomePhase.targetYield = terminalYield;
incomePhase.allocation = '茅台19%＋招行16%＋中国移动H14%＋质量白电一只10%＋长电10%＋福耀8%＋现金/空缺23%；当前六席，第七席不预设公司';
incomePhase.gate = '任一单一公司普通股息贡献不超过20%；六个已命名席位统一减息15%后仍须按重算资产线覆盖100万元；空缺席位不得用未经验证的高股息公司硬填。';
write('goals.json', goals);

payload = bootstrapPayload();
metrics = payload.decisionMetrics;
const paths = Object.fromEntries(metrics.dividendAcceleration.paths.map(row => [row.id, row]));
const formal = paths.underwrittenTwoStage;
const companyBase = paths.twoStage;
const incomeFirst = paths.incomeFirst;
const contributionSensitivity = metrics.dividendAcceleration.contributionSensitivity;
const incomePortfolioAudit = metrics.incomePortfolioAudit;
const purchasingPowerAudit = metrics.purchasingPowerAudit;
if (!formal?.nominal || !formal?.safety || !companyBase?.nominal || !incomeFirst?.nominal || !purchasingPowerAudit?.planning?.realRoutineSafety) throw new Error('股息路径模拟不完整');

const dividendTarget = goals.targets.find(row => row.id === 'dividend1m');
dividendTarget.status = `当前六只正式目标承保：名义约${formal.nominal.duration}；日常安全约${formal.safety.duration}`;
dividendTarget.note = `当前保守正常化税后股息约${(payload.portfolio.currentDividendBaseline.current / 10000).toFixed(2)}万元，口径区间7.12万—7.19万元。当前${formalPolicyLabel}的公司基准机械加权为${(baseReturn * 100).toFixed(2)}%，名义线/日常安全线约${companyBase.nominal.duration}/${companyBase.safety.duration}；质量折扣后承保年化${(underwritingReturn * 100).toFixed(2)}%，名义线约${formal.nominal.duration}、日常安全线约${formal.safety.duration}。终态只识别六个收入席位，税后率${(incomePortfolioAudit.normalYield * 100).toFixed(3)}%；复合严重减息后仍有100万元需约${Math.round(incomePortfolioAudit.severeSafetyAssets / 10000)}万元。按3%规划通胀保持2026年购买力并保留20%缓冲，约需${purchasingPowerAudit.planning.realRoutineSafety.duration}。`;
goals.dividendAcceleration.rules[0] = `当前${formalPolicyLabel}的承保回报为${(underwritingReturn * 100).toFixed(2)}%，两阶段路径约${formal.nominal.duration}/${formal.safety.duration}；“现在转高股息”模型约${incomeFirst.nominal.duration}/${incomeFirst.safety.duration}，但它同样不能把空缺席位当成已获得的收益率。`;
goals.dividendAcceleration.rules[1] = `${(baseReturn * 100).toFixed(2)}%是当前正式目标公司基准机械加权，不作为保守规划输入；组合承保年化为${(underwritingReturn * 100).toFixed(2)}%。有满36个月实绩后，若滚动三年年化低于7.5%，切换7%压力路径并重算日期。`;
goals.dividendAcceleration.rules[3] = '资产达到1800万元只是启动迁移的必要条件；中国移动、长电、质量白电、招行等仍须逐一通过现金流和普通分红覆盖闸门。宇通只有重新获批后才能参与。';
goals.dividendAcceleration.rules[5] = `名义100万元不是购买力目标；按3%规划通胀，2026年100万元购买力和20%缓冲约在${purchasingPowerAudit.planning.realRoutineSafety.duration}达到。每年用实际CPI更新，不把3%写成预测。`;
goals.dividendAcceleration.note = `终态${(incomePortfolioAudit.normalYield * 100).toFixed(3)}%税后率只来自六个已命名收入席位与23%现金/空缺，不是当前现价收益率。当前积累期公司基准为${(baseReturn * 100).toFixed(2)}%，承保为${(underwritingReturn * 100).toFixed(2)}%；旧含宇通七席及九公司模型只保留为历史研究。两阶段与“立即收息”模型的差异为${formal.safety.months - incomeFirst.safety.months}个月，但后者当前没有可执行资产供给。`;
const pessimisticReturn = metrics.targetRows.reduce((sum, row) => sum + row.weight * (Number(row.pessimisticIrr) || 0), 0)
  + metrics.cashWeight * (metrics.cashReturn || 0);
goals.goalPathAudit.asOf = TODAY;
goals.goalPathAudit.companyBaseReturn = baseReturn;
goals.goalPathAudit.underwritingReturn = underwritingReturn;
goals.goalPathAudit.fullPessimisticReturn = pessimisticReturn;
goals.goalPathAudit.baseline.companyBaseReturn = baseReturn;
goals.goalPathAudit.baseline.underwritingReturn = underwritingReturn;
goals.goalPathAudit.baseline.normalizedAfterTaxDividend = payload.portfolio.currentDividendBaseline.current;
goals.honestRestatement.quantification = `当前${formalPolicyLabel}的公司基准机械加权约${(baseReturn * 100).toFixed(2)}%，对应两阶段名义线${companyBase.nominal.duration}、安全线${companyBase.safety.duration}，但这是上行执行线。质量折扣后承保年化约${(underwritingReturn * 100).toFixed(2)}%，名义线${formal.nominal.duration}、安全线${formal.safety.duration}；旧含宇通七席及九公司模型不再作为正式口径。`;
goals.honestRestatement.dividendPath = `正式组合最多7只，但当前只批准6只，目标股票上限${targetStockPct}%、现金${targetCashPct}%；积累期只用达到回报闸门的复利资产，把总资产做至1800万元后分24个月迁移。滚动十二个月普通股息达到120万元且压力后仍有100万元只是日常安全验收；若要维持2026年100万元购买力，目标需按实际通胀逐年上调。空缺席位通过后必须重新计算全部日期。`;
goals.timeline = [
  { date: '2026-09', event: '起点：总资产1000万元（股票195.11万＋现金804.89万）' },
  { date: formal.migrationStartDate, event: `当前六只正式目标承保：资产约1800万元，开始24个月股息迁移` },
  { date: formal.nominal.date, event: `当前六只正式目标名义线：约${formal.nominal.duration}达到100万元税后普通股息能力` },
  { date: formal.safety.date, event: `当前六只正式目标日常安全线：约${formal.safety.duration}达到120万元，可承受约15%削减` },
  { date: purchasingPowerAudit.planning.realRoutineSafety.date, event: `3%规划通胀：2026年100万元购买力加20%缓冲` }
];
write('goals.json', goals);

const pf = payload.portfolio;
const spec = goals.dividendAcceleration;
const common = {
  principal: Number(pf.totalAssets),
  startDate: spec.startDate,
  startStockWeight: Number(pf.stockMarketValue) / Number(pf.totalAssets),
  targetStockWeight: 1 - Number(pf.opportunityCash.weight),
  cashReturn: Number(pf.opportunityCash.baseAnnualReturn),
  accumulationYield: Number(spec.twoStage.accumulationYield),
  deploymentMonths: Number(spec.twoStage.deploymentMonths),
  migrationStartAssets: Number(spec.twoStage.migrationStartAssets),
  migrationMonths: Number(spec.twoStage.migrationMonths),
  terminalReturn: Number(spec.twoStage.terminalReturn),
  terminalYield: Number(spec.twoStage.terminalYield),
  nominalDividend: Number(spec.nominalDividend),
  safetyDividend: Number(spec.safetyDividend)
};
pf.deploymentClock.rows = pf.deploymentClock.rows.map(row => {
  if (row.stage === '18个月') return { ...row, stockWeightRange: '65%—74%', cashWeightRange: '26%—35%', action: '当前六只正式目标最高达到74%股票；第七席未通过不得填仓' };
  if (row.stage === '24个月复核') return { ...row, stockWeightRange: '65%—74%', cashWeightRange: '26%—35%', action: '若仍低于65%，重算正常化盈利和机会成本；候选未过闸门前维持74%股票上限' };
  return row;
});
pf.deploymentClock.note = '18个月是两阶段模型的条件目标，不是无条件满仓倒计时；当前只批准六只正式目标，股票上限74%。第七席必须由最新研究另行批准。';
write('portfolio.json', pf);
const run = (annualReturn, terminalYield = common.terminalYield, deploymentMonths = common.deploymentMonths) =>
  simulateDividendAcceleration({ ...common, accumulationReturn: annualReturn, terminalYield, deploymentMonths });

const bottleneck = read('goal-bottleneck.json');
bottleneck.asOf = TODAY;
bottleneck.baseline = {
  accumulationReturn: underwritingReturn,
  terminalAfterTaxYield: common.terminalYield,
  nominalMonth: formal.nominal.months,
  safetyMonth: formal.safety.months,
  nominalAssets: Math.round(formal.nominal.assets),
  safetyAssets: Math.round(formal.safety.assets)
};
bottleneck.criticalCorrection = {
  incomeFirstNominalMonth: incomeFirst.nominal.months,
  incomeFirstSafetyMonth: incomeFirst.safety.months,
  twoStageNominalMonth: formal.nominal.months,
  twoStageSafetyMonth: formal.safety.months,
  conclusion: `宇通按2026-09-08最新结论退出后，当前政策为${formalPolicyLabel}，承保回报降至${(underwritingReturn * 100).toFixed(2)}%；两阶段与“立即收息”模型相差${formal.safety.months - incomeFirst.safety.months}个月。空缺席位没有合格替代，不能沿用旧收益率。`
};
const returnInputs = [
  [0.07, '压力线'], [0.075, '三年预警线'], [underwritingReturn, '当前正式目标承保'],
  [0.095, '可争取实绩'], [baseReturn, '当前正式目标公司基准'], [0.12, '强情景，不承保']
];
bottleneck.returnSensitivity = returnInputs.map(([annualReturn, label]) => {
  const result = run(annualReturn);
  return { annualReturn, nominalMonth: result.nominal.months, safetyMonth: result.safety.months, deltaSafetyVsBaseline: result.safety.months - formal.safety.months, label };
});
const yieldInputs = [
  [common.terminalYield, '当前六席收入蓝图'], [0.04, '补位后最低改善线'], [0.05, '机会目标'],
  [0.052, '十年条件之一'], [0.055, '高要求，风险上升'], [0.06, '不得作为规划基准']
];
bottleneck.yieldSensitivity = yieldInputs.map(([terminalAfterTaxYield, label]) => {
  const result = run(underwritingReturn, terminalAfterTaxYield);
  return {
    terminalAfterTaxYield,
    assetsNeededForSafety: Math.round(1200000 / terminalAfterTaxYield),
    nominalMonth: result.nominal.months,
    safetyMonth: result.safety.months,
    deltaSafetyVsBaseline: result.safety.months - formal.safety.months,
    label
  };
});
const combinedInputs = [
  ['underwritten', '当前正式目标承保', underwritingReturn, common.terminalYield, '规划基准'],
  ['improvedReturn', '只提高实绩', 0.095, common.terminalYield, '仍超过十年安全线'],
  ['improvedYield', '只锁定更高收益率', underwritingReturn, 0.05, '仍超过十年安全线'],
  ['tenYearStretch', '十年安全线条件目标', 0.095, 0.052, '约9年11个月；不是承诺']
];
bottleneck.combinedTargets = combinedInputs.map(([id, label, accumulationReturn, terminalAfterTaxYield, status]) => {
  const result = run(accumulationReturn, terminalAfterTaxYield);
  return { id, label, accumulationReturn, terminalAfterTaxYield, nominalMonth: result.nominal.months, safetyMonth: result.safety.months, status };
});
bottleneck.contributionSensitivity = {
  status: 'capacity-unconfirmed',
  rows: contributionSensitivity.rows,
  tenYearNominalThreshold: contributionSensitivity.tenYearNominalThreshold,
  tenYearSafetyThreshold: contributionSensitivity.tenYearSafetyThreshold,
  robustness: contributionSensitivity.robustness,
  note: contributionSensitivity.note,
  conclusion: `持续投入是比提高回报假设更可控的加速器；十年安全线数学门槛约为每年${Math.round(contributionSensitivity.tenYearSafetyThreshold.annualContribution / 10000 * 10) / 10}万元。若允许迟一年且实际仅完成计划80%，年度能力缓冲需约${Math.round(contributionSensitivity.robustness.combinedPlannedAnnualContribution / 10000 * 10) / 10}万元。实际能力尚未确认，因此0元仍是正式规划基线。`
};
bottleneck.terminalIncomeAudit = incomePortfolioAudit;
bottleneck.seventhSeatGate = seventhSeatGate;
bottleneck.purchasingPowerAudit = purchasingPowerAudit;
bottleneck.tenYearGate.priceEquivalent = `若普通股息不增长，5.2%相当于以当前六席${(common.terminalYield * 100).toFixed(3)}%占位收益率所对应买价的约${(common.terminalYield / 0.052 * 100).toFixed(1)}%完成迁移；第七席或可持续DPS增长必须用新证据验证。`;
const return95 = bottleneck.returnSensitivity.find(row => row.annualReturn === 0.095);
const yield50 = bottleneck.yieldSensitivity.find(row => row.terminalAfterTaxYield === 0.05);
bottleneck.bottleneckRanking[0].evidence = `在当前${(underwritingReturn * 100).toFixed(2)}%承保回报下，终态税后率从${(common.terminalYield * 100).toFixed(3)}%提高到5.0%，安全线提前约${formal.safety.months - yield50.safetyMonth}个月；补位收益不能在公司通过前预支。`;
bottleneck.bottleneckRanking[1].evidence = `积累期从${(underwritingReturn * 100).toFixed(2)}%提高到9.5%，安全线提前约${formal.safety.months - return95.safetyMonth}个月；当前26%现金中有10%来自宇通退出，是保持决策纪律的显性代价。`;
const tenYearPowerContribution = purchasingPowerAudit.contributionSensitivity.horizonThresholds.find(row => row.horizonYears === 10);
bottleneck.decision = `宇通退出后，当前${formalPolicyLabel}的承保日期为名义${formal.nominal.duration}、日常安全${formal.safety.duration}。旧含宇通七席与九公司路径均失效。终态当前只有六个已命名收入席位，正常税后率${(incomePortfolioAudit.normalYield * 100).toFixed(3)}%；复合严重压力后仍有100万元需约${Math.round(incomePortfolioAudit.severeSafetyAssets / 10000)}万元。按3%规划通胀维持2026年购买力并保留20%缓冲，零新增本金需${purchasingPowerAudit.planning.realRoutineSafety.duration}；若压到十年，需持续外部净投入约${Math.round(tenYearPowerContribution.routine.annualContribution / 10000 * 10) / 10}万元/年。`;
write('goal-bottleneck.json', bottleneck);

const cashDeployment = read('cash-deployment.json');
cashDeployment.asOf = TODAY;
cashDeployment.targetStockWeight = common.targetStockWeight;
cashDeployment.permanentOpportunityCashWeight = 1 - common.targetStockWeight;
cashDeployment.excessWaitingCash = Math.max(0, cashDeployment.currentCash - pf.totalAssets * (1 - common.targetStockWeight));
cashDeployment.underwrittenEquityReturn = (underwritingReturn - (1 - common.targetStockWeight) * common.cashReturn) / common.targetStockWeight;
cashDeployment.currentUnderwrittenPortfolioReturn = cashDeployment.currentStockWeight * cashDeployment.underwrittenEquityReturn
  + (1 - cashDeployment.currentStockWeight) * common.cashReturn;
cashDeployment.targetUnderwrittenPortfolioReturn = underwritingReturn;
cashDeployment.currentAnnualDrag = underwritingReturn - cashDeployment.currentUnderwrittenPortfolioReturn;
cashDeployment.annualOpportunityCostCny = Number((cashDeployment.currentAnnualDrag * pf.totalAssets).toFixed(2));
const deploymentLabels = new Map(cashDeployment.deploymentScenarios.map(row => [row.months, { label: row.label, judgment: row.judgment }]));
const deploymentResults = [6, 12, 18, 24, 36, 60, 120].map(months => ({ months, result: run(underwritingReturn, common.terminalYield, months) }));
const baselineDeployment = deploymentResults.find(row => row.months === 18).result;
cashDeployment.deploymentScenarios = deploymentResults.map(({ months, result }) => ({
  months,
  migrationMonth: result.migrationStartMonth,
  nominalMonth: result.nominal.months,
  safetyMonth: result.safety.months,
  delayVs18Safety: result.safety.months - baselineDeployment.safety.months,
  label: deploymentLabels.get(months).label,
  judgment: deploymentLabels.get(months).judgment
}));
cashDeployment.protocol = cashDeployment.protocol.map(row => {
  if (row.month === 18) return { ...row, stockWeightRange: '65%—74%', action: '若低于65%，如实延后达标日期；当前六只正式目标最多承载74%股票。' };
  return row;
});
cashDeployment.cashManagement = '当前六只正式目标只能承载74%股票，其余26%含宇通退出后尚未分配的10%；未部署资金只做高流动性、低信用风险、不阻碍未来合格买入的现金管理，利息不计入股息100万元验收。';
write('cash-deployment.json', cashDeployment);

const ledger = read('goal-ledger.json');
ledger.policyAsOf = TODAY;
ledger.checkpointMonths = [...new Set([0, 3, 6, 12, 18, 36, 60, formal.migrationStartMonth, formal.nominal.months, formal.safety.months])].sort((a, b) => a - b);
ledger.rules = ledger.rules.map(rule => rule.replace('第8只不得直接新增，必须先退出一个现有席位。', '第8只不得作为计划新增；若券商已经实际成交则如实登记并标红，随后必须退出一个席位。'));
ledger.deploymentRanges = ledger.deploymentRanges.map(row => row.month === 18 ? { ...row, maxStockWeight: targetStockWeight, label: '积累期部署门（当前六只正式目标）' } : row);
ledger.snapshots = ledger.snapshots.map(row => ({ netExternalFlow: 0, ...row }));
if (!ledger.rules.some(rule => rule.includes('净入金'))) ledger.rules.push('每期新增或提取本金必须记录为净入金；滚动收益率按资金流调整后计算，禁止把追加本金当作投资收益。');
write('goal-ledger.json', ledger);

const evolution = read('portfolio-evolution.json');
evolution.asOf = TODAY;
evolution.policyAuthority.version = '2026-09-09-v2';
evolution.policyAuthority.formalStructure = `${formalHoldingCount}只正式目标、${targetStockPct}%股票上限、${targetCashPct}%机会现金（含10%未分配）`;
if (!evolution.timeline.some(row => row.date === TODAY && row.title === '纠正七席组合承保回报与目标日期')) {
  evolution.timeline.push({
    date: TODAY,
    title: '纠正七席组合承保回报与目标日期',
    detail: `正式组合已缩为84%股票+16%现金，但旧目标日期仍沿用九公司90/10模型。按七席逐股质量折扣重算，公司基准${(baseReturn * 100).toFixed(2)}%、承保${(underwritingReturn * 100).toFixed(2)}%；两阶段名义线改为${formal.nominal.duration}（${formal.nominal.date}），安全线改为${formal.safety.duration}（${formal.safety.date}）。旧10年6个月/12年10个月不再作为正式承保。`,
    source: '七席执行政策与目标日期一致性审计-20260909.md'
  });
}
if (!evolution.timeline.some(row => row.date === TODAY && row.title === '按最新宇通结论撤回正式仓位')) {
  evolution.timeline.push({
    date: TODAY,
    title: '按最新宇通结论撤回正式仓位',
    detail: `以2026-09-08最新有效研究为准：宇通正式目标从10%降为0%，旧≤30元买入计划撤回；当前${formalPolicyLabel}。宁德与康臣均不自动补位，空缺权重留现金。所有股息率与目标日期已重算。`,
    source: '宇通最新结论与组合角色纠错-20260909.md'
  });
}
evolution.latestPlan.targetWeights = pf.targetPortfolio.map(row => ({
  name: row.name,
  weight: row.weight,
  note: row.role
}));
evolution.latestPlan.opportunityCash = {
  weight: pf.opportunityCash.weight,
  note: pf.opportunityCash.role
};
evolution.latestPlan.initialExecution = {
  status: pf.executionPlan.status,
  buyFirst: true,
  summary: '当前仅保留腾讯400股≤460港元、福耀2000股≤57.70元的待核对计划；宇通6600股旧计划已撤回。'
};
evolution.latestPlan.notes[0] = `当前${formalPolicyLabel}按报告机械加权约${(baseReturn * 100).toFixed(2)}%，质量折扣承保约${(underwritingReturn * 100).toFixed(2)}%；5年2倍和10年5倍仍不是基准承诺。`;
evolution.latestPlan.notes[1] = `当前六只目标仓位普通股息约${(payload.portfolio.currentDividendBaseline.targetPortfolio / 10000).toFixed(3)}万元；按当前承保，资产达到1800万元后才启动24个月迁移，名义线约${formal.nominal.duration}、日常安全线约${formal.safety.duration}。`;
evolution.latestPlan.notes[2] = '部署纪律：腾讯、福耀首轮待核对计划完成后股票仓位约22.26%；宇通不在当前买入清单，茅台或其他新公司仍须先解决实际七席占满问题。';
evolution.latestPlan.notes[5] = `终态当前为六个已命名股票加23%现金/空缺；逐股严重复合减息后仍有100万元需约${Math.round(incomePortfolioAudit.severeSafetyAssets / 10000)}万元，不能预支第七席收益。`;
evolution.latestPlan.notes[6] = `按3%规划通胀维持2026年100万元购买力并保留20%缓冲，约需${purchasingPowerAudit.planning.realRoutineSafety.duration}；正式支用额每年改用实际CPI更新。`;
evolution.latestPlan.notes[7] = `在不提高回报和股息率假设时，十年购买力安全线需持续外部净投入约${Math.round(tenYearPowerContribution.routine.annualContribution / 10000 * 10) / 10}万元/年；实际能力尚未确认，不作为正式路径。`;
evolution.unresolved = [
  {
    item: '终态第七席仍空缺',
    impact: `当前六席股息集中度最高${(incomePortfolioAudit.maxDividendContribution * 100).toFixed(1)}%，超过20%上限；占位路径不是完整终态方案。`,
    resolution: '等待宇通或其他候选同时通过质量、价格、现金覆盖与组合角色审查后，再重新计算权重、收益率和目标日期。'
  }
];
write('portfolio-evolution.json', evolution);

console.log(JSON.stringify({
  policy: formalPolicyLabel,
  companyBaseReturn: baseReturn,
  underwritingReturn,
  migration: { months: formal.migrationStartMonth, date: formal.migrationStartDate },
  nominal: formal.nominal,
  safety: formal.safety,
  purchasingPower: purchasingPowerAudit.planning,
  incomeFirst: { nominal: incomeFirst.nominal, safety: incomeFirst.safety }
}, null, 2));
