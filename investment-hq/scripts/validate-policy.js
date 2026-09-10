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
const approvedStockWeight = pf.targetPortfolio.reduce((sum, row) => sum + row.weight, 0);
const finalStockPolicy = pf.finalStockPolicy;
check(JSON.stringify(formalNames) === JSON.stringify(targetNames), '正式名单与目标组合顺序一致');
check(pf.targetPortfolio.length <= pf.concentrationPolicy.maxHoldings, '正式目标不超过七席');
check(finalStockPolicy?.targetStockWeight === 1 && finalStockPolicy?.targetCashWeight === 0
  && close(approvedStockWeight, finalStockPolicy.approvedSixTargetWeight)
  && close(approvedStockWeight + finalStockPolicy.unallocatedStockWeightAtApprovedTargets + pf.opportunityCash.weight, 1), '最终100%股票目标、已批准股票与待批准股票额度口径一致');
check(pf.policyAuthority.status === 'authoritative-execution-policy', 'portfolio.json声明为唯一执行政策');
check(efficiency.executionEligible === false && efficiency.authoritativePolicy === 'portfolio.json', '九公司稳健前沿明确隔离为研究情景');
check(goals.dividendRunway.status === 'historical-research-only' && goals.dividendRunway.executionEligible === false, '旧90%股票达标时钟明确隔离为历史研究');
check(goals.activePhase?.status === 'active-principal-growth-only'
  && goals.dividendAcceleration.status === 'deferred-until-accumulation-complete'
  && goals.dividendAcceleration.executionEligible === false, '本金增长为唯一主动阶段，股息迁移已冻结');
check(payload.accumulationPlan?.completionDefinition?.normalCompletionStockWeight === 0.64
  && payload.accumulationPlan?.completionDefinition?.policyTargetStockWeight === 1
  && payload.accumulationPlan?.completionDefinition?.permanentOpportunityCashFloor === 0, '建仓完成线已修正为最终100%股票且不设永久现金仓');
check(pf.deploymentClock.rows.find(row => row.stage === '条件允许时')?.stockWeightRange === '64%—76%'
  && pf.deploymentClock.rows.find(row => row.stage === '最终目标')?.stockWeightRange === '100%', '六只现有容量与最终100%股票目标分开记录');
check(pf.executionPlan.rows.length === 0 && pf.executionPlan.expectedBuyTotal === 0, '旧执行单已撤回，当前没有把条件队列当成订单');

check(close(goals.portfolioReturnScenarios.base.annualReturn, metrics.weightedReturn), '静态公司基准回报与正式七席动态计算一致');
check(close(goals.portfolioReturnScenarios.underwriting.annualReturn, metrics.underwritingWeightedReturn), '静态承保回报与正式七席动态计算一致');
const formalPath = metrics.dividendAcceleration.paths.find(row => row.id === 'underwrittenTwoStage');
check(bottleneck.baseline.nominalMonth === formalPath.nominal.months, '瓶颈表名义月份与动态路径一致');
check(bottleneck.baseline.safetyMonth === formalPath.safety.months, '瓶颈表安全月份与动态路径一致');
check(goals.targets.find(row => row.id === 'dividend1m').status.includes('未来目标'), '股息目标已降为建仓完成后的未来目标');
check(ledger.checkpointMonths.includes(formalPath.migrationStartMonth), '月度账本包含迁移检查点');
check(ledger.checkpointMonths.includes(formalPath.nominal.months) && ledger.checkpointMonths.includes(formalPath.safety.months), '月度账本包含名义与安全检查点');
check(metrics.postTriggeredDividend === null && metrics.postPrimaryQueueDividend === null, '未配置的候选股息情景保持为空而非0');
check(metrics.alerts.some(row => row.title === '当前阶段已切换为本金增长优先')
  && !metrics.alerts.some(row => row.title.includes('终态') || row.title.includes('股息')), '主动预警聚焦本金增长并屏蔽终态股息提醒');
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
check(ledger.deploymentRanges.find(row => row.month === 18)?.maxStockWeight === 1, '月度账本最终目标已修正为100%股票');
check(ledger.snapshots.every(row => Number.isFinite(Number(row.netExternalFlow))), '每个月度快照都有净入金字段');
const incomeAudit = metrics.incomePortfolioAudit;
check(incomeAudit.holdingCount <= incomeAudit.maxHoldings, '终态收息蓝图不超过七个股票席位');
check(close(incomeAudit.totalWeight, 1), '终态七席与现金权重合计100%');
check(close(incomeAudit.normalYield, incomeAudit.modelYield), '冻结前的终态模型只使用当前个股研究上限');
check(incomeAudit.status === 'conditional-blueprint-over-current-research-caps'
  && close(incomeAudit.blueprintTotalWeight, 1)
  && close(incomeAudit.stockWeight, 0.58)
  && incomeAudit.overweightRows.length === 4
  && incomeAudit.blueprintYield > incomeAudit.normalYield
  && incomeAudit.maxDividendContribution > 0.20, '终态蓝图的超限权重与集中度缺口被诚实保留，且已冻结执行');
check(incomeAudit.routineDividendAtFormalSafetyAssets >= 1000000, '正式安全资产在线性减息15%后仍有100万元股息');
check(incomeAudit.severeSafetyAssets > incomeAudit.formalSafetyAssets, '复合严重压力资产线高于日常安全资产线');
check(incomeAudit.rows.every(row => row.gate && row.role), '终态每个席位都有角色和迁移闸门');
const seventhSeatGate = bottleneck.seventhSeatGate;
check(seventhSeatGate.status === 'current-caps-make-seven-seat-target-infeasible', '当前权重上限下单一第七席结构无解的事实已显式记录');
check(close(seventhSeatGate.concentrationRepair.minimumSeatAfterTaxYieldAtMaxWeight, 0.14633), '第七席10%权重修复集中度所需税后率为14.633%');
check(close(seventhSeatGate.singleSeatTargetScenario.requiredSeatAfterTaxYieldAtMaxWeight, 0.23693), '单靠第七席达到5.2%所需税后率为23.693%');
check(seventhSeatGate.singleSeatTargetScenario.violatesContributionLimit === true, '单靠第七席达到5.2%会违反20%股息贡献上限');
check(seventhSeatGate.feasibilityBoundary.maximumPortfolioYieldWithFixedSixAndOneCompliantNewContributor < seventhSeatGate.targetTerminalYield, '固定六席时新增一个合规股息来源仍无法达到5.2%');
const incomeWarehouse = payload.incomeWarehouse;
const yutongWarehouse = incomeWarehouse.candidates.find(row => row.name === '宇通客车');
check(yutongWarehouse.slotCap === 0 && yutongWarehouse.policyEntryPrice === 21 && !yutongWarehouse.decision.includes('≤30元只按原执行卡'), '收息预备库已撤回宇通旧30元买入规则');
check(incomeWarehouse.seventhSeatScreen.status === 'structurally-infeasible-under-current-caps'
  && incomeWarehouse.seventhSeatScreen.rows.every(row => row.structuralFeasible === false), '第七席候选没有被价格单项通过误判为可买');
const monitorScope = new Set(read('watchlist-monitor.json').scope);
check([...pf.watchlist, ...pf.candidates, ...incomeWarehouse.candidates].every(row => monitorScope.has(row.name)), '观察监控范围覆盖正式观察池、候选池和收息预备库并集');
const purchasingPower = metrics.purchasingPowerAudit;
const planningPower = purchasingPower.planning;
check(purchasingPower.rows.length === 3 && purchasingPower.rows.some(row => close(row.inflation, 0.02))
  && purchasingPower.rows.some(row => close(row.inflation, 0.03)) && purchasingPower.rows.some(row => close(row.inflation, 0.04)), '购买力审计包含2%/3%/4%通胀情景');
check(close(planningPower.inflation, goals.dividendAcceleration.purchasingPower.planningInflation), '购买力规划情景与静态政策一致');
check(planningPower.fixedRoutineRealDividend < 1000000, '固定120万元在规划到达日的2026年购买力低于100万元');
check(planningPower.realNominal.months > formalPath.safety.months, '实际购买力名义线晚于固定120万元日常安全线');
check(planningPower.realRoutineSafety && planningPower.realRoutineSafety.months > planningPower.realNominal.months,
  '购买力日常安全线晚于购买力名义线');
check(planningPower.realSevereSafety === null && purchasingPower.postAchievement === null,
  '60年内仍无解的购买力重压线保持为空，不伪造有限日期');
check(purchasingPower.dividendGrowthGate.status === 'unverified', '缺少三年股息增长历史时不得标记跑赢通胀');
check(goals.targets.find(row => row.id === 'dividend1m').note.includes('当前阶段不以股息率'), '目标卡明确说明股息目标当前不驱动换仓');

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
  targetStructure: `${finalStockPolicy.targetStockWeight * 100}%股票+${finalStockPolicy.targetCashWeight * 100}%现金（已批准${approvedStockWeight * 100}%）`,
  companyBaseReturn: metrics.weightedReturn,
  underwritingReturn: metrics.underwritingWeightedReturn,
  nominal: { months: formalPath.nominal.months, duration: formalPath.nominal.duration, date: formalPath.nominal.date },
  safety: { months: formalPath.safety.months, duration: formalPath.safety.duration, date: formalPath.safety.date },
  structuredCurrentDividend: Number(structuredCurrentDividend.toFixed(2)),
  baselineDividend: pf.currentDividendBaseline.current,
  dividendDifferencePct: Number((dividendDifference * 100).toFixed(3))
}, null, 2));
