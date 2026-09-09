#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { bootstrapPayload, estimatedAnnualDividend, simulateDividendAcceleration } = require('../server');

const ROOT = path.resolve(__dirname, '..');
const read = name => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', name), 'utf8'));
const payload = bootstrapPayload();
const pf = payload.portfolio;
const metrics = payload.decisionMetrics;
const goals = payload.goals;
const bottleneck = payload.goalBottleneck;
const ledger = payload.goalLedger;
const efficiency = payload.portfolioEfficiency;
const errors = [];
const checks = [];

function check(condition, message) {
  checks.push(message);
  if (!condition) errors.push(message);
}
function close(a, b, tolerance = 1e-9) {
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tolerance;
}

const formalNames = pf.concentrationPolicy.formalNames;
const targetNames = pf.targetPortfolio.map(row => row.name);
check(JSON.stringify(formalNames) === JSON.stringify(targetNames), '正式名单与目标组合顺序一致');
check(pf.targetPortfolio.length <= pf.concentrationPolicy.maxHoldings, '正式目标不超过七席');
check(close(pf.targetPortfolio.reduce((sum, row) => sum + row.weight, 0) + pf.opportunityCash.weight, 1), '目标股票与现金权重合计100%');
check(pf.policyAuthority.status === 'authoritative-execution-policy', 'portfolio.json声明为唯一执行政策');
check(efficiency.executionEligible === false && efficiency.authoritativePolicy === 'portfolio.json', '九公司稳健前沿明确隔离为研究情景');
check(goals.dividendRunway.status === 'historical-research-only' && goals.dividendRunway.executionEligible === false, '旧90%股票达标时钟明确隔离为历史研究');
check(!pf.deploymentClock.rows.some(row => JSON.stringify(row).includes('90%')), '正式部署时钟不再保留90%股票执行口径');
check(pf.deploymentClock.rows.find(row => row.stage === '18个月')?.stockWeightRange === '70%—84%', '18个月部署上限与七席84%政策一致');

check(close(goals.portfolioReturnScenarios.base.annualReturn, metrics.weightedReturn), '静态公司基准回报与正式七席动态计算一致');
check(close(goals.portfolioReturnScenarios.underwriting.annualReturn, metrics.underwritingWeightedReturn), '静态承保回报与正式七席动态计算一致');
const formalPath = metrics.dividendAcceleration.paths.find(row => row.id === 'underwrittenTwoStage');
check(bottleneck.baseline.nominalMonth === formalPath.nominal.months, '瓶颈表名义月份与动态路径一致');
check(bottleneck.baseline.safetyMonth === formalPath.safety.months, '瓶颈表安全月份与动态路径一致');
check(goals.targets.find(row => row.id === 'dividend1m').status.includes(formalPath.safety.duration), '目标卡显示正式七席安全日期');
check(ledger.checkpointMonths.includes(formalPath.migrationStartMonth), '月度账本包含迁移检查点');
check(ledger.checkpointMonths.includes(formalPath.nominal.months) && ledger.checkpointMonths.includes(formalPath.safety.months), '月度账本包含名义与安全检查点');
check(metrics.postTriggeredDividend === null && metrics.postPrimaryQueueDividend === null, '未配置的候选股息情景保持为空而非0');
check(metrics.alerts.find(row => row.title === '名义100万元不是安全达标')?.detail.includes(formalPath.safety.duration), '安全线预警使用正式七席日期');
const contributionRows = metrics.dividendAcceleration.contributionSensitivity.rows;
const zeroContribution = contributionRows.find(row => row.annualContribution === 0);
check(zeroContribution?.nominal.months === formalPath.nominal.months && zeroContribution?.safety.months === formalPath.safety.months, '零追加情景与正式七席路径完全一致');
check(contributionRows.every((row, index) => index === 0 || row.safety.months < contributionRows[index - 1].safety.months), '年度净投入增加时安全线严格提前');
check(contributionRows.every(row => Math.abs(row.safety.cumulativeContribution - row.monthlyContribution * row.safety.months) < 0.01), '累计入金与月度投入和目标月份一致');
const tenYearContribution = metrics.dividendAcceleration.contributionSensitivity.tenYearSafetyThreshold;
check(tenYearContribution?.months === 120 && tenYearContribution.annualContribution > 0, '自动求得十年安全线年度净投入门槛');
const justBelowTenYear = simulateDividendAcceleration({
  principal: metrics.dividendAcceleration.principal,
  startDate: metrics.dividendAcceleration.startDate,
  startStockWeight: metrics.dividendAcceleration.startStockWeight,
  targetStockWeight: metrics.dividendAcceleration.targetStockWeight,
  cashReturn: pf.opportunityCash.baseAnnualReturn,
  ...goals.dividendAcceleration.twoStage,
  accumulationReturn: metrics.underwritingWeightedReturn,
  nominalDividend: goals.dividendAcceleration.nominalDividend,
  safetyDividend: goals.dividendAcceleration.safetyDividend,
  monthlyContribution: (tenYearContribution.annualContribution - 1) / 12
});
check(justBelowTenYear.safety.months > 120, '十年安全线年度净投入门槛为最小整数值');
const contributionRobustness = metrics.dividendAcceleration.contributionSensitivity.robustness;
check(contributionRobustness.delayedSafetyThreshold.annualContribution > tenYearContribution.annualContribution, '延迟一年开始所需年度投入高于无延迟门槛');
check(contributionRobustness.limitedYearsSafetyThreshold.annualContribution > tenYearContribution.annualContribution, '只投入前五年所需年度投入高于持续十年门槛');
check(contributionRobustness.combinedPlannedAnnualContribution * contributionRobustness.completionRate >= contributionRobustness.delayedSafetyThreshold.annualContribution, '抗中断计划能力覆盖延迟与20%短缺');
const robustPath = simulateDividendAcceleration({
  principal: metrics.dividendAcceleration.principal,
  startDate: metrics.dividendAcceleration.startDate,
  startStockWeight: metrics.dividendAcceleration.startStockWeight,
  targetStockWeight: metrics.dividendAcceleration.targetStockWeight,
  cashReturn: pf.opportunityCash.baseAnnualReturn,
  ...goals.dividendAcceleration.twoStage,
  accumulationReturn: metrics.underwritingWeightedReturn,
  nominalDividend: goals.dividendAcceleration.nominalDividend,
  safetyDividend: goals.dividendAcceleration.safetyDividend,
  monthlyContribution: contributionRobustness.combinedRealizedAnnualContribution / 12,
  contributionStartMonth: contributionRobustness.delayedStartMonths + 1
});
check(robustPath.safety.months <= 120, '抗中断能力情景在迟一年且兑现80%后仍通过十年安全线');
check(ledger.deploymentRanges.find(row => row.month === 18)?.maxStockWeight === 0.84, '月度账本部署上限与七席84%政策一致');
check(ledger.snapshots.every(row => Number.isFinite(Number(row.netExternalFlow))), '每个月度快照都有净入金字段');

const dividendByName = new Map(pf.dividends.perStock.map(row => [row.name, row]));
check(pf.holdings.every(row => dividendByName.has(row.name)), '每个真实持仓都有结构化正常化股息口径');
const structuredCurrentDividend = pf.holdings.reduce((sum, row) => {
  const fx = row.currency === 'HKD' ? row.marketValue / (row.quantity * row.priceAtSnapshot) : 1;
  return sum + (estimatedAnnualDividend(dividendByName.get(row.name), row.quantity, fx, row.marketValue) || 0);
}, 0);
const dividendDifference = Math.abs(structuredCurrentDividend - pf.currentDividendBaseline.current) / pf.currentDividendBaseline.current;
check(dividendDifference <= 0.01, '结构化逐股股息与当前基线差异不超过1%');

if (errors.length) {
  console.error(JSON.stringify({ ok: false, errors, checked: checks.length }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  checked: checks.length,
  policyVersion: pf.policyVersion,
  targetStructure: `${(1 - pf.opportunityCash.weight) * 100}%股票+${pf.opportunityCash.weight * 100}%现金`,
  companyBaseReturn: metrics.weightedReturn,
  underwritingReturn: metrics.underwritingWeightedReturn,
  nominal: { months: formalPath.nominal.months, duration: formalPath.nominal.duration, date: formalPath.nominal.date },
  safety: { months: formalPath.safety.months, duration: formalPath.safety.duration, date: formalPath.safety.date },
  structuredCurrentDividend: Number(structuredCurrentDividend.toFixed(2)),
  baselineDividend: pf.currentDividendBaseline.current,
  dividendDifferencePct: Number((dividendDifference * 100).toFixed(3))
}, null, 2));
