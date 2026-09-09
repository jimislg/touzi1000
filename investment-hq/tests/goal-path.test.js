'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { bootstrapPayload, simulateDividendAcceleration, buildGoalPathTracking } = require('../server');

const baseArgs = {
  principal: 10000000,
  startDate: '2026-09-01',
  startStockWeight: 0.195107526,
  targetStockWeight: 0.84,
  cashReturn: 0.015,
  accumulationReturn: 0.0778145,
  accumulationYield: 0.028,
  deploymentMonths: 18,
  migrationStartAssets: 18000000,
  migrationMonths: 24,
  terminalReturn: 0.08,
  terminalYield: 0.044504,
  nominalDividend: 1000000,
  safetyDividend: 1200000
};

test('持续投入缩短目标时间，但零投入路径保持不变', () => {
  const baseline = simulateDividendAcceleration(baseArgs);
  const annualContribution = 500000;
  const contributed = simulateDividendAcceleration({ ...baseArgs, monthlyContribution: annualContribution / 12 });
  assert.equal(baseline.nominal.months, 135);
  assert.equal(baseline.safety.months, 163);
  assert.ok(contributed.nominal.months < baseline.nominal.months);
  assert.ok(contributed.safety.months < baseline.safety.months);
  assert.ok(Math.abs(contributed.safety.cumulativeContribution - annualContribution / 12 * contributed.safety.months) < 0.01);
  const delayed = simulateDividendAcceleration({ ...baseArgs, monthlyContribution: annualContribution / 12, contributionStartMonth: 13 });
  const fiveYearsOnly = simulateDividendAcceleration({ ...baseArgs, monthlyContribution: annualContribution / 12, contributionEndMonth: 60 });
  assert.ok(delayed.safety.months > contributed.safety.months);
  assert.ok(fiveYearsOnly.safety.months > contributed.safety.months);
});

test('冻结的终态收息蓝图仍诚实暴露超限权重与集中度缺口', () => {
  const payload = bootstrapPayload();
  const audit = payload.decisionMetrics.incomePortfolioAudit;
  assert.equal(audit.holdingCount, 6);
  assert.equal(payload.goals.dividendAcceleration.status, 'deferred-until-accumulation-complete');
  assert.equal(payload.goals.dividendAcceleration.executionEligible, false);
  assert.equal(audit.status, 'conditional-blueprint-over-current-research-caps');
  assert.ok(Math.abs(audit.totalWeight - 1) < 1e-12);
  assert.ok(Math.abs(audit.blueprintTotalWeight - 1) < 1e-12);
  assert.ok(Math.abs(audit.stockWeight - 0.58) < 1e-12);
  assert.equal(audit.overweightRows.length, 4);
  assert.ok(audit.blueprintYield > audit.normalYield);
  assert.ok(Math.abs(audit.normalYield - audit.modelYield) < 1e-12);
  assert.ok(audit.maxDividendContribution > 0.20);
  assert.ok(audit.routineDividendAtFormalSafetyAssets >= 1000000);
  assert.ok(audit.severeSafetyAssets > audit.formalSafetyAssets);
  assert.equal(audit.severeSafetyPath.months, 337);
  assert.equal(audit.severeSafetyPath.date, '2054-10');
  const gate = payload.goalBottleneck.seventhSeatGate;
  assert.equal(gate.status, 'current-caps-make-seven-seat-target-infeasible');
  assert.ok(Math.abs(gate.concentrationRepair.minimumSeatAfterTaxYieldAtMaxWeight - 0.14633) < 1e-12);
  assert.ok(Math.abs(gate.singleSeatTargetScenario.requiredSeatAfterTaxYieldAtMaxWeight - 0.23693) < 1e-12);
  assert.equal(gate.singleSeatTargetScenario.violatesContributionLimit, true);
  assert.ok(gate.feasibilityBoundary.maximumPortfolioYieldWithFixedSixAndOneCompliantNewContributor < gate.targetTerminalYield);
});

test('冻结的购买力模型在60年内无解时保持为空，而不是伪造日期', () => {
  const payload = bootstrapPayload();
  const formal = payload.decisionMetrics.dividendAcceleration.paths.find(row => row.id === 'underwrittenTwoStage');
  const audit = payload.decisionMetrics.purchasingPowerAudit;
  assert.equal(audit.planning.inflation, 0.03);
  assert.ok(audit.planning.fixedRoutineRealDividend < 1000000);
  assert.ok(audit.planning.realNominal.months > formal.safety.months);
  assert.equal(audit.planning.realRoutineSafety, null);
  assert.equal(audit.planning.realSevereSafety, null);
  assert.equal(audit.postAchievement, null);
  assert.equal(audit.dividendGrowthGate.status, 'unverified');
});

test('本金增长计划不会把条件队列当成订单，也不会自动恢复宇通', () => {
  const payload = bootstrapPayload();
  const plan = payload.accumulationPlan;
  assert.equal(plan.status, 'active-principal-growth-only');
  assert.equal(plan.completionDefinition.normalCompletionStockWeight, 0.64);
  assert.equal(plan.completionDefinition.permanentOpportunityCashFloor, 0.10);
  assert.equal(payload.portfolio.executionPlan.rows.length, 0);
  assert.equal(payload.portfolio.executionPlan.expectedBuyTotal, 0);
  assert.equal(plan.growthSeatCandidates.find(row => row.name === '宇通客车').status, '退出正式名单，保留观察仓');
  assert.ok(payload.decisionMetrics.alerts.some(row => row.title === '当前阶段已切换为本金增长优先'));
  assert.ok(!payload.decisionMetrics.alerts.some(row => row.title.includes('终态') || row.title.includes('股息')));
});

test('滚动收益剔除净入金，不能把追加本金算成投资回报', () => {
  const path = {
    paths: [{
      id: 'underwrittenTwoStage',
      checkpoints: [
        { months: 0, assets: 10000000, annualDividend: 70000, stockWeight: 0.2, phase: 'baseline' },
        { months: 36, assets: 14000000, annualDividend: 200000, stockWeight: 0.84, phase: 'accumulate' }
      ]
    }]
  };
  const tracking = buildGoalPathTracking({ goalLedger: {
    asOf: '2029-09-01', baselineDate: '2026-09-01', reviewFrequency: 'monthly',
    deploymentRanges: [{ month: 0, minStockWeight: 0, maxStockWeight: 0.84, label: '测试' }],
    rules: [],
    snapshots: [
      { date: '2026-09-01', totalAssets: 10000000, stockMarketValue: 2000000, stockWeight: 0.2, normalizedAfterTaxDividend: 70000, netExternalFlow: 0, thesisBreaches: [] },
      { date: '2029-09-01', totalAssets: 14000000, stockMarketValue: 11760000, stockWeight: 0.84, normalizedAfterTaxDividend: 200000, netExternalFlow: 4000000, thesisBreaches: [] }
    ]
  } }, path);
  assert.ok(Math.abs(tracking.rollingReturn) < 1e-12);
  assert.equal(tracking.cumulativeExternalFlow, 4000000);
  assert.match(tracking.rollingReturnMethod, /净入金/);
});
