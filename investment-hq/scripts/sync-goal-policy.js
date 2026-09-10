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
const TODAY = '2026-09-10';
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
const approvedStockWeight = payload.portfolio.targetPortfolio.reduce((sum, row) => sum + Number(row.weight || 0), 0);
const targetStockWeight = Number(payload.portfolio.finalStockPolicy?.targetStockWeight ?? (1 - Number(payload.portfolio.opportunityCash.weight)));
const targetCashWeight = 1 - targetStockWeight;
const targetStockPct = Math.round(targetStockWeight * 100);
const targetCashPct = Math.round(targetCashWeight * 100);
const approvedStockPct = Math.round(approvedStockWeight * 100);
const unallocatedStockWeight = Math.max(0, targetStockWeight - approvedStockWeight);
const formalPolicyLabel = `最终${targetStockPct}%股票；当前${formalHoldingCount}只已批准${approvedStockPct}%`;

const goals = read('goals.json');
goals.asOf = TODAY;
goals.activePhase = {
  id: 'principal-growth',
  status: 'active-principal-growth-only',
  objective: '积累期只优化本金增长与风险调整后总回报；最终100%股票，现金只是未批准额度的临时形态。',
  source: 'accumulation-plan.json'
};
goals.dividendRunway.status = 'historical-research-only';
goals.dividendRunway.executionEligible = false;
goals.dividendRunway.note = `历史股息研究情景，仅保留用于敏感性追溯；其积累期暂假设未批准的${Math.round(unallocatedStockWeight * 100)}%股票额度取得与已批准六只相同的承保回报，不是已完成配置。`;
goals.portfolioReturnScenarios.base.annualReturn = baseReturn;
goals.portfolioReturnScenarios.base.fiveYearMultiple = multiple(baseReturn, 5);
goals.portfolioReturnScenarios.base.tenYearMultiple = multiple(baseReturn, 10);
goals.portfolioReturnScenarios.base.note = `已批准六只${approvedStockPct}%股票袖套的公司报告基准回报归一化加权；剩余${Math.round(unallocatedStockWeight * 100)}%股票额度未批准，不预支回报`;
goals.portfolioReturnScenarios.underwriting.annualReturn = underwritingReturn;
goals.portfolioReturnScenarios.underwriting.fiveYearMultiple = multiple(underwritingReturn, 5);
goals.portfolioReturnScenarios.underwriting.tenYearMultiple = multiple(underwritingReturn, 10);
goals.portfolioReturnScenarios.underwriting.note = `已批准六只股票袖套归一化承保：A类按悲观/基准/乐观25%/60%/15%，B类按40%/50%/10%。最终100%股票的完整回报要等剩余席位批准后重算`;
goals.dividendAcceleration.twoStage.accumulationReturn = baseReturn;
goals.dividendAcceleration.status = 'deferred-until-accumulation-complete';
goals.dividendAcceleration.executionEligible = false;
goals.dividendAcceleration.twoStage.accumulationYield = payload.portfolio.currentDividendBaseline.targetPortfolio / payload.portfolio.totalAssets;
goals.dividendAcceleration.contributionSensitivity = {
  status: 'scenario-only',
  actualAnnualContribution: null,
  annualContributions: [0, 300000, 500000, 1000000],
  robustness: { delayedStartMonths: 12, completionRate: 0.8, contributionYears: 5 },
  note: `新增本金按月末等额投入并持续到安全线，暂用已批准六只股票袖套的归一化承保回报；剩余${Math.round(unallocatedStockWeight * 100)}%额度未批准，该敏感性不是已承诺现金流。`
};
goals.dividendAcceleration.incomePortfolio = {
  status: 'conditional-blueprint-over-current-research-caps',
  maxHoldings: 7,
  cashWeight: 0.23,
  terminalReturnFloor: 0.08,
  rows: [
    { name: '贵州茅台', weight: 0.19, currentResearchCap: 0.30, normalizedAfterTaxDps: 51.98123, assumedAfterTaxYield: 0.0452, routineHaircut: 0.15, severeHaircut: 0.20, returnModel: 'moutai.json', capSource: 'moutai.json position.hard', role: '品牌现金流核心', gate: '约1150元及以下且现金收入、渠道与普通分红能力通过复核' },
    { name: '招商银行', weight: 0.16, currentResearchCap: 0.10, normalizedAfterTaxDps: 2.00, assumedAfterTaxYield: 0.0508, routineHaircut: 0.15, severeHaircut: 0.35, returnModel: 'cmb.json', capSource: 'cmb.json position.hard', role: '低成本负债金融股息', gate: '资本充足率、资产质量、信用成本和派息能力通过金融口径复核' },
    { name: '中国移动H', weight: 0.14, currentResearchCap: 0.08, normalizedAfterTaxDps: 4.216, assumedAfterTaxYield: 0.0620, routineHaircut: 0.15, severeHaircut: 0.15, returnModel: 'china-mobile.json', capSource: 'china-mobile.json position.hard', role: '通信基础设施稳定器', gate: '约68港元及以下；长账龄应收、资本开支与港股通税后回报通过' },
    { name: '质量白电一只', weight: 0.10, currentResearchCap: 0.08, normalizedAfterTaxDps: 4.30, assumedAfterTaxYield: 0.0570, routineHaircut: 0.15, severeHaircut: 0.40, returnModel: 'midea.json', capSource: 'midea.json/gree.json position.hard; DPS暂按美的', role: '美的/海尔/格力择一的成熟现金流', gate: '只选一只；税后率、总回报、治理、现金覆盖和接班风险全部通过' },
    { name: '长江电力', weight: 0.10, currentResearchCap: 0.05, normalizedAfterTaxDps: 1.00, assumedAfterTaxYield: 0.0435, routineHaircut: 0.15, severeHaircut: 0.10, returnModel: 'cypc.json', capSource: 'cypc.json position.hard', role: '水电现金流稳定器', gate: '约23元及以下且来水、负债、资本开支和分红覆盖通过' },
    { name: '福耀玻璃', weight: 0.08, currentResearchCap: 0.10, normalizedAfterTaxDps: 2.20, assumedAfterTaxYield: 0.0368, routineHaircut: 0.15, severeHaircut: 0.40, returnModel: 'fuyao.json', capSource: 'fuyao.json position.hard', role: '全球制造与股息增长', gate: '海外扩产回报、关税、自由现金流和普通分红覆盖通过' }
  ],
  constraints: [
    '条件蓝图六席77%+23%现金合计100%；但当前个股研究硬上限只承保58%，超限部分不得计入正式路径',
    '任何单一公司正常普通股息贡献不超过20%；银行保险合计不超过16%',
    '运营商与公用事业合计不超过24%；福耀为当前唯一已命名制造业席位',
    '特别股息、现金利息、卖出收益和本金返还不计入目标',
    '宇通、宁德或康臣只有在最新论文和价格闸门同时通过后，才可竞争空缺席位；不得自动写入',
    '腾讯若迁移时基准十年IRR仍不低于12%，不机械卖出；延后迁移或提高资产门槛'
  ],
  note: '这是未来迁移阶段的条件蓝图，不是2026年的买入清单。招行、中国移动、白电和长电的蓝图权重超过现有个股研究硬上限，超限部分必须等未来重新承保；在此之前正式路径只采用上限内的保守股息率。'
};
const blueprintTerminalYield = goals.dividendAcceleration.incomePortfolio.rows.reduce(
  (sum, row) => sum + row.weight * row.assumedAfterTaxYield,
  0
);
const terminalYield = goals.dividendAcceleration.incomePortfolio.rows.reduce(
  (sum, row) => sum + Math.min(row.weight, row.currentResearchCap) * row.assumedAfterTaxYield,
  0
);
const maxDividendContributionLimit = 0.20;
const seventhSeatMaxWeight = 0.10;
const tenYearTerminalYield = 0.052;
const maxExistingWeightedDividend = Math.max(...goals.dividendAcceleration.incomePortfolio.rows.map(
  row => Math.min(row.weight, row.currentResearchCap) * row.assumedAfterTaxYield
));
const concentrationRepairPortfolioYield = maxExistingWeightedDividend / maxDividendContributionLimit;
const concentrationRepairIncrement = concentrationRepairPortfolioYield - terminalYield;
const concentrationRepairSeatYield = concentrationRepairIncrement / seventhSeatMaxWeight;
const singleSeatTargetYield = (tenYearTerminalYield - terminalYield) / seventhSeatMaxWeight;
const warehouseSeatYield = 0.052;
const portfolioYieldWithWarehouseSeat = terminalYield + seventhSeatMaxWeight * warehouseSeatYield;
const maxPortfolioYieldWithSingleSeat = terminalYield / (1 - maxDividendContributionLimit);
const existingContributionRequiredAtTarget = tenYearTerminalYield * (1 - maxDividendContributionLimit);
const repairSeatContribution = concentrationRepairIncrement / concentrationRepairPortfolioYield;
const canRepairConcentrationWithinBothLimits = repairSeatContribution <= maxDividendContributionLimit;
const approvedWeight = goals.dividendAcceleration.incomePortfolio.rows.reduce(
  (sum, row) => sum + Math.min(row.weight, row.currentResearchCap),
  0
);
const terminalProbabilities = { A: [0.25, 0.60, 0.15], B: [0.40, 0.50, 0.10] };
const terminalReturnRows = goals.dividendAcceleration.incomePortfolio.rows.map(row => {
  const model = read(`stocks/${row.returnModel}`);
  const scenarios = [model.scenarios?.pessimistic?.irr10y, model.scenarios?.base?.irr10y, model.scenarios?.optimistic?.irr10y].map(Number);
  const probabilities = terminalProbabilities[model.grade];
  if (!probabilities || !scenarios.every(Number.isFinite)) throw new Error(`${row.name}终态回报模型不完整`);
  const approvedRowWeight = Math.min(row.weight, row.currentResearchCap);
  const underwrittenTenYearReturn = scenarios.reduce((sum, value, index) => sum + value * probabilities[index], 0);
  return {
    ...row,
    qualityGrade: model.grade,
    approvedWeight: approvedRowWeight,
    pessimisticTenYearReturn: scenarios[0],
    baseTenYearReturn: scenarios[1],
    underwrittenTenYearReturn
  };
});
goals.dividendAcceleration.incomePortfolio.rows = terminalReturnRows;
const terminalUnallocatedWeight = 1 - approvedWeight;
const terminalBaseReturn = terminalReturnRows.reduce((sum, row) => sum + row.approvedWeight * row.baseTenYearReturn, 0)
  + terminalUnallocatedWeight * 0.015;
const terminalUnderwrittenReturn = terminalReturnRows.reduce((sum, row) => sum + row.approvedWeight * row.underwrittenTenYearReturn, 0)
  + terminalUnallocatedWeight * 0.015;
const terminalPessimisticReturn = terminalReturnRows.reduce((sum, row) => sum + row.approvedWeight * row.pessimisticTenYearReturn, 0)
  + terminalUnallocatedWeight * 0.015;
goals.dividendAcceleration.incomePortfolio.terminalReturnFloor = terminalUnderwrittenReturn;
goals.dividendAcceleration.incomePortfolio.terminalBaseReturn = terminalBaseReturn;
goals.dividendAcceleration.incomePortfolio.returnAudit = {
  approvedStockWeight: approvedWeight,
  cashOrUnallocatedWeight: terminalUnallocatedWeight,
  cashReturn: 0.015,
  baseReturn: terminalBaseReturn,
  underwrittenReturn: terminalUnderwrittenReturn,
  pessimisticReturn: terminalPessimisticReturn,
  method: 'A类悲观/基准/乐观25%/60%/15%，B类40%/50%/10%；只按当前研究硬上限计权重，其余按1.5%现金回报'
};
const seventhSeatGate = {
  status: 'current-caps-make-seven-seat-target-infeasible',
  blueprintSixYield: blueprintTerminalYield,
  currentSixYield: terminalYield,
  approvedSixWeight: approvedWeight,
  targetTerminalYield: tenYearTerminalYield,
  maxSeatWeight: seventhSeatMaxWeight,
  maxDividendContribution: maxDividendContributionLimit,
  largestExistingWeightedDividend: maxExistingWeightedDividend,
  concentrationRepair: {
    minimumPortfolioYield: concentrationRepairPortfolioYield,
    requiredWeightedDividend: concentrationRepairIncrement,
    minimumSeatAfterTaxYieldAtMaxWeight: concentrationRepairSeatYield,
    resultingSeatDividendContribution: repairSeatContribution,
    canRepairWithinBothContributionLimits: canRepairConcentrationWithinBothLimits,
    conclusion: '按当前个股研究硬上限，第七席10%权重需约14.63%税后率才能稀释旧席集中度；但新席届时将贡献约34.1%股息，同样超过20%，因此结构无解。'
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
    largestExistingContributionAtMaximum: maxExistingWeightedDividend / maxPortfolioYieldWithSingleSeat,
    existingSixContributionRequiredAtTarget: existingContributionRequiredAtTarget,
    existingSixContributionShortfall: existingContributionRequiredAtTarget - terminalYield,
    canRepairConcentrationWithinBothLimits
  },
  requirements: [
    '候选公司质量至少B类，承保十年总回报不低于8%，不得依赖估值扩张',
    '按获批最大权重计算，正常化税后普通股息率足以把单一股息贡献压至20%以内',
    '正常化自由现金流覆盖普通股息不低于1.2倍；金融业改用资本与可分配利润口径',
    '与现有六席不重复占用行业风险预算，且不靠特别股息、周期峰值或本金返还',
    '先解决招行、中国移动、白电和长电的终态权重超限；未重新承保前不得引用3.839%蓝图率',
    '第七席、旧六席与总资产门槛必须一起重算；不得用价格单项触发买入'
  ],
  conclusion: '按当前个股研究硬上限，六席只承保58%权重和2.831%总资产税后股息率。固定六席时，任何单一第七席都无法在新旧公司均不超过20%股息贡献的前提下修复集中度，更无法承保5.2%。'
};
goals.dividendAcceleration.seventhSeatGate = seventhSeatGate;
const incomeWarehouse = read('income-warehouse.json');
incomeWarehouse.asOf = `${TODAY} 15:22 CST`;
incomeWarehouse.summary.eligibleNow = 0;
incomeWarehouse.summary.nearPriceButBlocked = [];
incomeWarehouse.summary.decision = '按当前个股研究硬上限，六席只承保58%权重和2.831%总资产税后股息率。固定六席时，单一第七席无法使新旧公司的股息贡献都不超过20%；所有候选只保留观察，不再设价格单项触发。';
incomeWarehouse.seventhSeatScreen.status = 'structurally-infeasible-under-current-caps';
incomeWarehouse.seventhSeatScreen.modelBasis = `终态条件蓝图六席权重77%、税后率${(blueprintTerminalYield * 100).toFixed(3)}%；但按当前个股研究硬上限，只承保${(approvedWeight * 100).toFixed(0)}%权重和${(terminalYield * 100).toFixed(3)}%税后率。`;
incomeWarehouse.seventhSeatScreen.tenYearBoundary = `第七席按10%权重需${(concentrationRepairSeatYield * 100).toFixed(2)}%税后率才能稀释旧席，但自身将贡献${(repairSeatContribution * 100).toFixed(1)}%股息，同样超限；因此必须先重做六席权重承保，不能靠价格解决。`;
incomeWarehouse.seventhSeatScreen.rows = incomeWarehouse.seventhSeatScreen.rows.map(row => {
  const requiredYieldForConcentrationRepair = concentrationRepairIncrement / Number(row.maxWeight);
  const concentrationGatePrice = Number(row.normalizedAfterTaxDps) / requiredYieldForConcentrationRepair;
  return {
    ...row,
    requiredYieldForConcentrationRepair,
    concentrationGatePrice,
    structuralFeasible: false,
    priceMath: '结构无解',
    decision: `固定当前六席硬上限时，即使价格降至约${concentrationGatePrice.toFixed(2)}${String(row.symbol).endsWith('.HK') ? '港元' : '元'}使新席稀释旧席，新席自身的股息贡献仍会超过20%。仅保留个股观察，不触发正式买入。`
  };
});
write('income-warehouse.json', incomeWarehouse);
goals.dividendAcceleration.purchasingPower = {
  status: 'planning-scenario',
  baseYear: 2026,
  baseAnnualIncome: 1000000,
  planningInflation: 0.03,
  inflationScenarios: [0.02, 0.03, 0.04],
  routineBuffer: 1.2,
  dividendGrowthEvidenceYears: 3,
  projectionYears: 30,
  severeTerminalReturn: terminalPessimisticReturn,
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
goals.dividendAcceleration.twoStage.terminalReturn = terminalUnderwrittenReturn;
goals.dividendAcceleration.twoStage.terminalYield = terminalYield;
goals.dividendAcceleration.incomeFirst.terminalReturn = terminalUnderwrittenReturn;
goals.dividendAcceleration.incomeFirst.terminalYield = terminalYield;
const accumulationPhase = goals.dividendAcceleration.phasePortfolios.find(row => row.id === 'accumulation');
accumulationPhase.targetReturn = underwritingReturn;
accumulationPhase.companyBaseReturn = baseReturn;
accumulationPhase.targetYield = goals.dividendAcceleration.twoStage.accumulationYield;
accumulationPhase.allocation = '最终100%股票；已批准茅台25%＋腾讯15%＋招行10%＋福耀10%＋安踏8%＋泡泡6%=74%，其余26%为待研究、待批准股票额度';
const incomePhase = goals.dividendAcceleration.phasePortfolios.find(row => row.id === 'income');
incomePhase.targetReturn = terminalUnderwrittenReturn;
incomePhase.targetYield = terminalYield;
incomePhase.allocation = '条件蓝图为茅台19%＋招行16%＋中国移动H14%＋质量白电10%＋长电10%＋福耀8%＋现金23%；当前研究硬上限只承保其中58%股票权重，其余42%视为未分配';
incomePhase.gate = '先使六席权重通过当届个股研究上限，再验收单一公司普通股息贡献不超过20%。超限权重、空缺席位和未验证DPS不得计入正式日期。';
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
if (!formal?.nominal || !formal?.safety || !companyBase?.nominal || !incomeFirst?.nominal || !purchasingPowerAudit?.planning) throw new Error('股息路径模拟不完整');
const routinePowerLabel = purchasingPowerAudit.planning.realRoutineSafety?.duration || '当前60年模型期内未达';
const routinePowerDate = purchasingPowerAudit.planning.realRoutineSafety?.date || '未定';

const dividendTarget = goals.targets.find(row => row.id === 'dividend1m');
dividendTarget.status = '未来目标：建仓完成后重新启动';
dividendTarget.note = `当前阶段不以股息率或收息结构驱动换仓。旧终态模型仅留作历史审计；待积累期100%股票建仓完成且用户明确重启后，再用当时数据重建。`;
goals.dividendAcceleration.rules[0] = `已批准六只股票袖套归一化承保回报为${(underwritingReturn * 100).toFixed(2)}%；终态股息模块已冻结，其日期不进入当前决策。`;
goals.dividendAcceleration.rules[1] = `${(baseReturn * 100).toFixed(2)}%是已批准六只股票袖套的基准机械加权，${(underwritingReturn * 100).toFixed(2)}%是质量折扣承保；最终100%股票组合须在剩余席位批准后重算。`;
goals.dividendAcceleration.rules[3] = '资产达到1800万元只是启动迁移的必要条件；招行、中国移动、白电和长电若未获得更高终态权重承保，只能按当前硬上限计算。宇通只有重新获批后才能参与。';
goals.dividendAcceleration.rules[5] = `名义100万元不是购买力目标；按3%规划通胀，2026年100万元购买力和20%缓冲在${routinePowerLabel}。本模块已冻结，重启时须用实际CPI与最新回报重算。`;
goals.dividendAcceleration.note = `本模块已冻结为未来研究。当前只能计算已批准六只股票袖套：基准${(baseReturn * 100).toFixed(2)}%、承保${(underwritingReturn * 100).toFixed(2)}%；最终100%股票组合在剩余席位批准前没有完整回报率。`;
const pessimisticContribution = metrics.targetRows.reduce((sum, row) => sum + row.weight * (Number(row.pessimisticIrr) || 0), 0)
  + metrics.cashWeight * (metrics.cashReturn || 0);
const pessimisticReturn = metrics.coveredWeight > 0 ? pessimisticContribution / metrics.coveredWeight : null;
goals.goalPathAudit.asOf = TODAY;
goals.goalPathAudit.companyBaseReturn = baseReturn;
goals.goalPathAudit.underwritingReturn = underwritingReturn;
goals.goalPathAudit.fullPessimisticReturn = pessimisticReturn;
goals.goalPathAudit.baseline.companyBaseReturn = baseReturn;
goals.goalPathAudit.baseline.underwritingReturn = underwritingReturn;
goals.goalPathAudit.baseline.normalizedAfterTaxDividend = payload.portfolio.currentDividendBaseline.current;
goals.honestRestatement.quantification = `已批准六只${approvedStockPct}%股票袖套的基准年化约${(baseReturn * 100).toFixed(2)}%，质量折扣承保约${(underwritingReturn * 100).toFixed(2)}%；若剩余${Math.round(unallocatedStockWeight * 100)}%股票额度取得同等承保回报，10年示意约${multiple(underwritingReturn, 10).toFixed(2)}倍，仍低于5倍目标。最终组合必须在新席位批准后重算。`;
goals.honestRestatement.dividendPath = `当前积累期最终目标是100%股票；现有六只已批准${approvedStockPct}%、有效硬容量76%，未批准额度临时以现金形式等待。终态股息模块已冻结，不进入当前决策。`;
goals.timeline = [
  { date: '2026-09', event: '起点：总资产1000万元（股票195.11万＋现金804.89万）' },
  { date: formal.migrationStartDate, event: `当前积累组合承保：资产约1800万元，只在收息席位通过时开始迁移` },
  { date: formal.nominal.date, event: `按终态当前研究硬上限：约${formal.nominal.duration}达到100万元税后普通股息能力` },
  { date: formal.safety.date, event: `按终态当前研究硬上限：约${formal.safety.duration}达到120万元，可承受约15%削减` },
  { date: routinePowerDate, event: `未来研究：3%规划通胀下的2026年100万元购买力加20%缓冲` }
];
write('goals.json', goals);

const pf = payload.portfolio;
const spec = goals.dividendAcceleration;
const common = {
  principal: Number(pf.totalAssets),
  startDate: spec.startDate,
  startStockWeight: Number(pf.stockMarketValue) / Number(pf.totalAssets),
  targetStockWeight,
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
pf.deploymentClock.note = '部署没有强制截止日。最终目标是100%股票；当前六只已批准74%、有效硬容量76%，剩余额度必须由合格新席位或重新批准的公司补足。不为100%目标放宽买价和基本面。';
pf.currentDividendBaseline.terminalYield = terminalYield;
pf.currentDividendBaseline.conditionalBlueprintYield = blueprintTerminalYield;
pf.currentDividendBaseline.assetsNeeded = Math.round(1000000 / terminalYield);
pf.currentDividendBaseline.safetyAssetsNeeded = Math.round(1200000 / terminalYield);
pf.currentDividendBaseline.note = `当前保守口径约71,177元，按安踏2.45港元DPS；旧前瞻口径按安踏3.00港元时约71,862元。终态3.839%条件蓝图中，招行、中国移动、白电和长电权重超过当前个股研究硬上限；正式路径已改用${(terminalYield * 100).toFixed(3)}%硬上限口径，不计现金利息、特别股息或超限权重。`;
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
  conclusion: `终态3.839%条件蓝图超过招行、中国移动、白电和长电的当前研究硬上限，不再作为承保口径。当前上限内只承保58%收息权重和${(terminalYield * 100).toFixed(3)}%总资产税后率，日常安全线改为${formal.safety.duration}。`
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
  [common.terminalYield, '当前硬上限承保'], [blueprintTerminalYield, '超限权重条件蓝图'], [0.04, '补位后最低改善线'], [0.05, '机会目标'],
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
bottleneck.tenYearGate.priceEquivalent = `若普通股息不增长，5.2%相当于以当前硬上限${(common.terminalYield * 100).toFixed(3)}%口径所对应买价的约${(common.terminalYield / 0.052 * 100).toFixed(1)}%完成迁移。但多只公司的质量与回报闸门会先于该价格失效，因此不是买入指令。`;
const return95 = bottleneck.returnSensitivity.find(row => row.annualReturn === 0.095);
const yield50 = bottleneck.yieldSensitivity.find(row => row.terminalAfterTaxYield === 0.05);
bottleneck.bottleneckRanking[0].evidence = `在当前${(underwritingReturn * 100).toFixed(2)}%承保回报下，终态税后率从${(common.terminalYield * 100).toFixed(3)}%提高到5.0%，安全线提前约${formal.safety.months - yield50.safetyMonth}个月；补位收益不能在公司通过前预支。`;
bottleneck.bottleneckRanking[1].evidence = `积累期从${(underwritingReturn * 100).toFixed(2)}%提高到9.5%，安全线提前约${formal.safety.months - return95.safetyMonth}个月；当前未批准的${Math.round(unallocatedStockWeight * 100)}%股票额度在新席位通过前临时以现金等待。`;
const tenYearPowerContribution = purchasingPowerAudit.contributionSensitivity.horizonThresholds.find(row => row.horizonYears === 10);
bottleneck.decision = `本模块已冻结为未来研究。旧模型下，当前${formalPolicyLabel}的积累承保年化为${(underwritingReturn * 100).toFixed(2)}%；3%规划通胀下的购买力安全线在${routinePowerLabel}。这些日期不进入当前选股、换仓或预警，建仓完成后须全部重算。`;
write('goal-bottleneck.json', bottleneck);

const cashDeployment = read('cash-deployment.json');
cashDeployment.asOf = TODAY;
cashDeployment.targetStockWeight = common.targetStockWeight;
cashDeployment.targetCashWeight = 1 - common.targetStockWeight;
cashDeployment.permanentOpportunityCashWeight = 0;
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
  if (row.month === 18) return { ...row, stockWeightRange: '70%—100%', action: '最终目标100%股票；当前六只有效容量76%，超出部分只能由已批准的新席位填补。' };
  return row;
});
cashDeployment.cashManagement = '最终现金目标0%。当前六只已批准74%、有效容量76%，其余24%—26%是待批准股票额度；在合格标的出现前，对应资金只做高流动性、低信用风险的临时管理。';
write('cash-deployment.json', cashDeployment);

const ledger = read('goal-ledger.json');
ledger.policyAsOf = TODAY;
ledger.checkpointMonths = [...new Set([0, 3, 6, 12, 18, 36, 60, formal.migrationStartMonth, formal.nominal.months, formal.safety.months])].sort((a, b) => a - b);
ledger.rules = ledger.rules.map(rule => rule.replace('第8只不得直接新增，必须先退出一个现有席位。', '第8只不得作为计划新增；若券商已经实际成交则如实登记并标红，随后必须退出一个席位。'));
ledger.deploymentRanges = ledger.deploymentRanges.map(row => row.month === 18 ? { ...row, maxStockWeight: targetStockWeight, label: '最终100%股票目标（条件式）' } : row);
ledger.snapshots = ledger.snapshots.map(row => ({ netExternalFlow: 0, ...row }));
if (!ledger.rules.some(rule => rule.includes('净入金'))) ledger.rules.push('每期新增或提取本金必须记录为净入金；滚动收益率按资金流调整后计算，禁止把追加本金当作投资收益。');
write('goal-ledger.json', ledger);

const evolution = read('portfolio-evolution.json');
evolution.asOf = TODAY;
evolution.policyAuthority.version = '2026-09-10-v4';
evolution.policyAuthority.formalStructure = `最终100%股票、0%现金；当前${formalHoldingCount}只已批准${approvedStockPct}%，其余${Math.round(unallocatedStockWeight * 100)}%待研究批准`;
if (!evolution.timeline.some(row => row.date === TODAY && row.title === '最终配置目标修正为100%股票')) {
  evolution.timeline.push({
    date: TODAY,
    title: '最终配置目标修正为100%股票',
    detail: `用户明确确认最终不保留永久现金仓。当前六只已批准目标${approvedStockPct}%、有效硬容量76%；距100%的24%—26%记为待研究股票额度，在获批前临时以现金存在，不自动分配给观察仓。`,
    source: '用户2026-09-10明确决策'
  });
}
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
if (!evolution.timeline.some(row => row.date === TODAY && row.title === '终态权重与个股研究上限对齐')) {
  evolution.timeline.push({
    date: TODAY,
    title: '终态权重与个股研究上限对齐',
    detail: `发现招行、中国移动、白电和长电的终态蓝图权重高于当前个股研究硬上限。3.839%改为条件蓝图；正式路径改按58%获批收息权重和${(terminalYield * 100).toFixed(3)}%税后率计算。`,
    source: '终态权重上限一致性审计-20260909.md'
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
  buyFirst: false,
  summary: '腾讯≤460港元与福耀≤57.70元旧计划均已撤回；当前无待执行订单。最新条件队列为福耀≤55、安踏≤72、腾讯≤420、茅台1240—1280，均须到价后重新确认。'
};
evolution.latestPlan.notes[0] = `最终100%股票；已批准六只${approvedStockPct}%袖套归一化基准约${(baseReturn * 100).toFixed(2)}%，质量折扣承保约${(underwritingReturn * 100).toFixed(2)}%。剩余席位未批准前，不能宣称最终组合回报已确定。`;
evolution.latestPlan.notes[1] = '当前阶段不考虑股息迁移与终态收息组合；待积累期建仓完成并由用户明确重启后，用当时数据重新研究。';
evolution.latestPlan.notes[2] = '部署纪律：当前无待执行订单；福耀、安踏、腾讯和茅台依最新价格闸门依次复核。宇通留在观察仓，不在买入清单。';
evolution.latestPlan.notes[5] = `终态六席77%是条件蓝图；按当前个股研究硬上限只承保58%和${(incomePortfolioAudit.normalYield * 100).toFixed(3)}%税后率。逐股严重复合减息后仍有100万元需约${Math.round(incomePortfolioAudit.severeSafetyAssets / 10000)}万元。`;
evolution.latestPlan.notes[6] = `旧购买力模型在3%规划通胀下的日常安全线为${routinePowerLabel}；已冻结，不进入当前本金增长决策。`;
evolution.latestPlan.notes[7] = `在不提高回报和股息率假设时，十年购买力安全线需持续外部净投入约${Math.round(tenYearPowerContribution.routine.annualContribution / 10000 * 10) / 10}万元/年；实际能力尚未确认，不作为正式路径。`;
evolution.unresolved = [
  {
    item: '终态蓝图四只公司超当前研究硬上限',
    impact: `招行16%>10%、中国移动14%>8%、白电10%>8%、长电10%>5%；条件蓝图3.839%不得计入正式日期，当前承保率为${(incomePortfolioAudit.normalYield * 100).toFixed(3)}%。`,
    resolution: '在迁移前逐股重做资本、现金流、回报与行业风险审查；只有新研究明确批准更高上限才可转入承保。'
  },
  {
    item: '终态第七席仍空缺',
    impact: `按当前硬上限，六席最高单一股息贡献${(incomePortfolioAudit.maxDividendContribution * 100).toFixed(1)}%。即使只新增一席，也无法同时把新旧公司都压到20%以内。`,
    resolution: '不再把第七席作为单点修补；必须同时重做旧六席权重、可持续DPS和总资产门槛。'
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
