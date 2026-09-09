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

const goals = read('goals.json');
goals.asOf = TODAY;
goals.dividendRunway.status = 'historical-research-only';
goals.dividendRunway.executionEligible = false;
goals.dividendRunway.note = '历史90%股票研究情景，仅保留用于敏感性追溯；正式执行与目标日期读取七席84%股票+16%现金的underwrittenTwoStage路径。';
goals.portfolioReturnScenarios.base.annualReturn = baseReturn;
goals.portfolioReturnScenarios.base.fiveYearMultiple = multiple(baseReturn, 5);
goals.portfolioReturnScenarios.base.tenYearMultiple = multiple(baseReturn, 10);
goals.portfolioReturnScenarios.base.note = '正式七席积累组合84%股票+16%现金按公司报告基准回报加权；不为凑仓位突破单股上限';
goals.portfolioReturnScenarios.underwriting.annualReturn = underwritingReturn;
goals.portfolioReturnScenarios.underwriting.fiveYearMultiple = multiple(underwritingReturn, 5);
goals.portfolioReturnScenarios.underwriting.tenYearMultiple = multiple(underwritingReturn, 10);
goals.portfolioReturnScenarios.underwriting.note = '正式七席84%股票+16%现金，A类按悲观/基准/乐观25%/60%/15%，B类按40%/50%/10%，现金1.5%';
goals.dividendAcceleration.twoStage.accumulationReturn = baseReturn;
goals.dividendAcceleration.contributionSensitivity = {
  status: 'scenario-only',
  actualAnnualContribution: null,
  annualContributions: [0, 300000, 500000, 1000000],
  robustness: { delayedStartMonths: 12, completionRate: 0.8, contributionYears: 5 },
  note: '新增本金按月末等额投入并持续到安全线，始终使用正式七席承保回报与终态股息率；这是能力敏感性，不是已承诺现金流，也不得使用杠杆或生活备用金。'
};
const accumulationPhase = goals.dividendAcceleration.phasePortfolios.find(row => row.id === 'accumulation');
accumulationPhase.targetReturn = underwritingReturn;
accumulationPhase.companyBaseReturn = baseReturn;
write('goals.json', goals);

payload = bootstrapPayload();
metrics = payload.decisionMetrics;
const paths = Object.fromEntries(metrics.dividendAcceleration.paths.map(row => [row.id, row]));
const formal = paths.underwrittenTwoStage;
const companyBase = paths.twoStage;
const incomeFirst = paths.incomeFirst;
const contributionSensitivity = metrics.dividendAcceleration.contributionSensitivity;
if (!formal?.nominal || !formal?.safety || !companyBase?.nominal || !incomeFirst?.nominal) throw new Error('股息路径模拟不完整');

const dividendTarget = goals.targets.find(row => row.id === 'dividend1m');
dividendTarget.status = `正式七席承保：名义约${formal.nominal.duration}；安全约${formal.safety.duration}`;
dividendTarget.note = `当前保守正常化税后股息约${(payload.portfolio.currentDividendBaseline.current / 10000).toFixed(2)}万元，口径区间7.12万—7.19万元。正式七席84%股票+16%现金的公司基准机械加权为${(baseReturn * 100).toFixed(2)}%，名义线/安全线约${companyBase.nominal.duration}/${companyBase.safety.duration}；质量折扣后承保年化${(underwritingReturn * 100).toFixed(2)}%，名义线约${formal.nominal.duration}、安全线约${formal.safety.duration}。`;
goals.dividendAcceleration.rules[0] = `当前七席政策的承保回报为${(underwritingReturn * 100).toFixed(2)}%，两阶段路径约${formal.nominal.duration}/${formal.safety.duration}；“现在转高股息”模型约${incomeFirst.nominal.duration}/${incomeFirst.safety.duration}，但后者要求终态股息资产在12个月内以预设买点买到，当前没有候选通过全部闸门。`;
goals.dividendAcceleration.rules[1] = `${(baseReturn * 100).toFixed(2)}%是正式七席公司基准机械加权，不作为保守规划输入；组合承保年化为${(underwritingReturn * 100).toFixed(2)}%。有满36个月实绩后，若滚动三年年化低于7.5%，切换7%压力路径并重算日期。`;
goals.dividendAcceleration.note = `终态4.45%税后率按预设买点口径构造，不是当前现价收益率。正式七席积累期公司基准为${(baseReturn * 100).toFixed(2)}%，承保为${(underwritingReturn * 100).toFixed(2)}%；旧九公司90/10模型的10.31%/8.44%只保留为历史研究，不再决定执行日期。两阶段当前比“立即收息”模型慢${formal.safety.months - incomeFirst.safety.months}个月，但后者尚无可执行资产供给。`;
const pessimisticReturn = metrics.targetRows.reduce((sum, row) => sum + row.weight * (Number(row.pessimisticIrr) || 0), 0)
  + metrics.cashWeight * (metrics.cashReturn || 0);
goals.goalPathAudit.asOf = TODAY;
goals.goalPathAudit.companyBaseReturn = baseReturn;
goals.goalPathAudit.underwritingReturn = underwritingReturn;
goals.goalPathAudit.fullPessimisticReturn = pessimisticReturn;
goals.goalPathAudit.baseline.companyBaseReturn = baseReturn;
goals.goalPathAudit.baseline.underwritingReturn = underwritingReturn;
goals.goalPathAudit.baseline.normalizedAfterTaxDividend = payload.portfolio.currentDividendBaseline.current;
goals.honestRestatement.quantification = `正式七席84%股票+16%现金的公司基准机械加权约${(baseReturn * 100).toFixed(2)}%，对应两阶段名义线${companyBase.nominal.duration}、安全线${companyBase.safety.duration}，但这是上行执行线。质量折扣后承保年化约${(underwritingReturn * 100).toFixed(2)}%，名义线${formal.nominal.duration}、安全线${formal.safety.duration}；旧九公司模型的10.31%/8.44%不再作为正式口径。`;
goals.honestRestatement.dividendPath = `正式组合最多7只，目标股票上限84%、现金16%；积累期只用达到回报闸门的复利资产，把总资产做至1800万元后分24个月迁移。滚动十二个月普通股息达到120万元且压力后仍有100万元才验收。实际积累回报约9.5%且终态税后普通股息率约5.2%同时成立时，安全线才可能压到十年以内。`;
goals.timeline = [
  { date: '2026-09', event: '起点：总资产1000万元（股票195.11万＋现金804.89万）' },
  { date: formal.migrationStartDate, event: `正式七席承保：资产约1800万元，开始24个月股息迁移` },
  { date: formal.nominal.date, event: `正式七席名义线：约${formal.nominal.duration}达到100万元税后普通股息能力` },
  { date: formal.safety.date, event: `正式七席安全线：约${formal.safety.duration}达到120万元，可承受约15%削减` }
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
  if (row.stage === '18个月') return { ...row, stockWeightRange: '70%—84%', cashWeightRange: '16%—30%', action: '条件满足时最高达到84%股票；未达买点不追价' };
  if (row.stage === '24个月复核') return { ...row, stockWeightRange: '70%—84%', cashWeightRange: '16%—30%', action: '若仍低于70%，重算正常化盈利和机会成本；七席上限仍为84%，不机械放宽买价' };
  return row;
});
pf.deploymentClock.note = '18个月是两阶段模型的条件目标，不是无条件满仓倒计时；只有价格与基本面闸门同时满足才计入部署，七席股票仓位硬上限为84%。';
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
  conclusion: `正式七席缩为84%股票+16%现金后，承保回报由旧九公司研究的8.44%降至${(underwritingReturn * 100).toFixed(2)}%；两阶段比“立即收息”模型慢${formal.safety.months - incomeFirst.safety.months}个月。立即收息路径当前不可执行，因为没有迁移候选在现价同时通过收益率、总回报、现金覆盖和基本面闸门。`
};
const returnInputs = [
  [0.07, '压力线'], [0.075, '三年预警线'], [underwritingReturn, '正式七席承保'],
  [0.095, '可争取实绩'], [baseReturn, '正式七席公司基准'], [0.12, '强情景，不承保']
];
bottleneck.returnSensitivity = returnInputs.map(([annualReturn, label]) => {
  const result = run(annualReturn);
  return { annualReturn, nominalMonth: result.nominal.months, safetyMonth: result.safety.months, deltaSafetyVsBaseline: result.safety.months - formal.safety.months, label };
});
const yieldInputs = [
  [0.04, '迁移失效'], [common.terminalYield, '正式七席承保'], [0.05, '机会目标'],
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
  ['underwritten', '正式七席承保', underwritingReturn, common.terminalYield, '规划基准'],
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
const return95 = bottleneck.returnSensitivity.find(row => row.annualReturn === 0.095);
const yield50 = bottleneck.yieldSensitivity.find(row => row.terminalAfterTaxYield === 0.05);
bottleneck.bottleneckRanking[0].evidence = `在正式七席${(underwritingReturn * 100).toFixed(2)}%承保回报下，终态税后率4.45%提高到5.0%，安全线提前约${formal.safety.months - yield50.safetyMonth}个月；达到5.2%并同时实现9.5%积累回报，才可能压到十年以内。`;
bottleneck.bottleneckRanking[1].evidence = `积累期从${(underwritingReturn * 100).toFixed(2)}%提高到9.5%，安全线提前约${formal.safety.months - return95.safetyMonth}个月；当前16%现金是七席硬上限的结构性拖累。`;
bottleneck.decision = `正式七席承保日期修正为名义${formal.nominal.duration}、安全${formal.safety.duration}。旧10年6个月/12年10个月属于九公司90/10研究口径或尚不可执行的立即收息模型。十年安全线仍要求积累回报约9.5%与终态5.2%税后普通股息率同时成立；当前没有证据证明条件已实现。`;
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
  if (row.month === 18) return { ...row, stockWeightRange: '70%—84%', action: '若低于70%，如实延后达标日期；即使机会充分，七席当前硬上限也只允许84%股票。' };
  return row;
});
cashDeployment.cashManagement = '正式七席当前只能承载84%股票，其余16%为永久机会现金和聚焦预备金；未部署资金只做高流动性、低信用风险、不阻碍股票买入的现金管理，利息不计入股息100万元验收。';
write('cash-deployment.json', cashDeployment);

const ledger = read('goal-ledger.json');
ledger.policyAsOf = TODAY;
ledger.checkpointMonths = [...new Set([0, 3, 6, 12, 18, 36, 60, formal.migrationStartMonth, formal.nominal.months, formal.safety.months])].sort((a, b) => a - b);
ledger.rules = ledger.rules.map(rule => rule.replace('第8只不得直接新增，必须先退出一个现有席位。', '第8只不得作为计划新增；若券商已经实际成交则如实登记并标红，随后必须退出一个席位。'));
ledger.deploymentRanges = ledger.deploymentRanges.map(row => row.month === 18 ? { ...row, maxStockWeight: 0.84, label: '积累期部署门（七席上限）' } : row);
ledger.snapshots = ledger.snapshots.map(row => ({ netExternalFlow: 0, ...row }));
if (!ledger.rules.some(rule => rule.includes('净入金'))) ledger.rules.push('每期新增或提取本金必须记录为净入金；滚动收益率按资金流调整后计算，禁止把追加本金当作投资收益。');
write('goal-ledger.json', ledger);

const evolution = read('portfolio-evolution.json');
evolution.asOf = TODAY;
evolution.policyAuthority.version = '2026-09-09-v1';
if (!evolution.timeline.some(row => row.date === TODAY && row.title === '纠正七席组合承保回报与目标日期')) {
  evolution.timeline.push({
    date: TODAY,
    title: '纠正七席组合承保回报与目标日期',
    detail: `正式组合已缩为84%股票+16%现金，但旧目标日期仍沿用九公司90/10模型。按七席逐股质量折扣重算，公司基准${(baseReturn * 100).toFixed(2)}%、承保${(underwritingReturn * 100).toFixed(2)}%；两阶段名义线改为${formal.nominal.duration}（${formal.nominal.date}），安全线改为${formal.safety.duration}（${formal.safety.date}）。旧10年6个月/12年10个月不再作为正式承保。`,
    source: '七席执行政策与目标日期一致性审计-20260909.md'
  });
}
evolution.latestPlan.notes[0] = `正式七席积累组合按当前报告机械加权约${(baseReturn * 100).toFixed(2)}%，质量折扣承保约${(underwritingReturn * 100).toFixed(2)}%；5年2倍和10年5倍仍不是基准承诺。`;
evolution.latestPlan.notes[1] = `七席目标仓位普通股息约28.995万元；按当前承保，资产达到1800万元后才启动24个月迁移，名义线约${formal.nominal.duration}、安全线约${formal.safety.duration}。`;
write('portfolio-evolution.json', evolution);

console.log(JSON.stringify({
  policy: '正式七席84%股票+16%现金',
  companyBaseReturn: baseReturn,
  underwritingReturn,
  migration: { months: formal.migrationStartMonth, date: formal.migrationStartDate },
  nominal: formal.nominal,
  safety: formal.safety,
  incomeFirst: { nominal: incomeFirst.nominal, safety: incomeFirst.safety }
}, null, 2));
