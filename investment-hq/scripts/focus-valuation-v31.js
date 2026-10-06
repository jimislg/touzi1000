#!/usr/bin/env node

"use strict";

const inputs = {
  asOf: "2026-09-24 close CST",
  price: 4.66,
  currentShares: 14_442_199_726,
  quotedMarketCapCnyBn: 67.301,
  annual2025: {
    revenueCnyBn: 12.75869654216,
    attributableNetProfitCnyBn: 2.94633250088,
    deductNetProfitCnyBn: 2.71939199326,
    operatingCashFlowCnyBn: 7.20881342981,
    leaseCashPaymentsCnyBn: 2.58133517111,
    capexCnyBn: 0.15700127943,
    longTermInvestmentImpairmentCnyBn: 2.1523424,
    totalDps: 0.34,
  },
  h1_2025: {
    attributableNetProfitCnyBn: 2.66477962119,
    deductNetProfitCnyBn: 2.46456446489,
  },
  h1_2026: {
    revenueCnyBn: 5.99137562917,
    profitBeforeTaxCnyBn: 3.510997,
    incomeTaxCnyBn: 0.39269125643,
    minorityProfitCnyBn: -0.009749999,
    attributableNetProfitCnyBn: 3.12805574326,
    deductNetProfitCnyBn: 2.29053069517,
    operatingCashFlowCnyBn: 4.4534280324,
    leaseCashPaymentsCnyBn: 1.2177257,
    capexCnyBn: 0.4922592,
    segmentRevenueCnyBn: {
      buildingMedia: 5.62881509739,
      cinemaMedia: 0.34535476981,
      other: 0.01720576197,
    },
  },
  historical2021To2025: {
    revenueCnyBn: [
      14.83642293669, 9.42495914322, 11.90372491898,
      12.26210280788, 12.75869654216,
    ],
    attributableNetProfitCnyBn: [
      6.06316219253, 2.78995246191, 4.8271017185,
      5.15539413642, 2.94633250088,
    ],
    deductNetProfitCnyBn: [
      5.41386894152, 2.39425254409, 4.37384412599,
      4.6679873797, 2.71939199326,
    ],
    operatingCashFlowCnyBn: [
      9.5904168896, 6.69896102548, 7.6779967536,
      6.64181119052, 7.20881342981,
    ],
    leaseCashPaymentsCnyBn: [
      2.92437809594, 2.79823422771, 3.18233364234,
      3.06045064407, 2.58133517111,
    ],
    capexCnyBn: [
      0.24994708271, 0.09517241027, 0.2733117928,
      0.31834491555, 0.15700127943,
    ],
    performanceYearDps: [0.338, 0.42, 0.33, 0.33, 0.34],
  },
  normalizedStandalone: {
    attributableNetProfitCnyBn: 4.7,
    ownerEarningsCnyBn: 4.6,
  },
  transaction: {
    mainAcquiredStake: 0.90022,
    remainingAcquiredStake: 0.09978,
    mainConsiderationCnyBn: 7.7944245,
    remainingConsiderationCnyBn: 0.5055755,
    totalConsiderationCnyBn: 8.3,
    shareConsiderationCnyBn: 7.7647751,
    mainCashConsiderationCnyBn: 0.0296495,
    totalCashConsiderationCnyBn: 0.535225,
    latestIssuePrice: 5.06,
    originalAppraised100PctCnyBn: 8.343,
    latestAppraised100PctCnyBn: 8.365,
    xinChao2025RevenueCnyBn: 1.72664435281,
    xinChao2025AttributableNetProfitCnyBn: 0.05406319731,
    xinChao2025OperatingCashFlowCnyBn: 0.71248744827,
    xinChao2025LeaseCashPaymentsCnyBn: 0.46614453449,
    xinChao2025CapexCnyBn: 0.01552623953,
    proFormaGoodwillCnyBn: 4.66987622143,
    proFormaNetAssetsCnyBn: 23.60125370871,
  },
  scenarios: {
    bear: {
      label: "悲观：消费与互联网预算同步转弱，并购无协同",
      eps0: 0.29,
      years1To5Growth: -0.01,
      years6To10Growth: 0.01,
      dps0: 0.24,
      terminalPe: 10,
    },
    base: {
      label: "基准：独立利润正常化，协同仅兑现约一半",
      eps0: 0.31,
      years1To5Growth: 0.03,
      years6To10Growth: 0.02,
      dps0: 0.31,
      terminalPe: 12,
    },
    bull: {
      label: "乐观：并购整合成功，数智化提升填充率",
      eps0: 0.335,
      years1To5Growth: 0.06,
      years6To10Growth: 0.04,
      dps0: 0.34,
      terminalPe: 15,
    },
  },
  ownerEarningsDcf: {
    ownerEarningsPerShare0: 0.31,
    years1To5Growth: 0.03,
    years6To10Growth: 0.02,
    discountRate: 0.10,
    terminalGrowth: 0.02,
  },
};

function approxEqual(a, b, tolerance = 1e-8) {
  return Math.abs(a - b) <= tolerance;
}

function buildCashFlows(scenario, years) {
  let eps = scenario.eps0;
  let dps = scenario.dps0;
  const cashFlows = [];
  for (let year = 1; year <= years; year += 1) {
    const growth = year <= 5
      ? scenario.years1To5Growth
      : scenario.years6To10Growth;
    eps *= 1 + growth;
    dps *= 1 + growth;
    cashFlows.push(dps);
  }
  const terminalValue = eps * scenario.terminalPe;
  cashFlows[cashFlows.length - 1] += terminalValue;
  return { cashFlows, terminalEps: eps, terminalValue };
}

function presentValue(cashFlows, discountRate) {
  return cashFlows.reduce(
    (total, cashFlow, index) =>
      total + cashFlow / (1 + discountRate) ** (index + 1),
    0,
  );
}

function solveIrr(cashFlows, price) {
  let low = -0.99;
  let high = 1;
  for (let i = 0; i < 300; i += 1) {
    const mid = (low + high) / 2;
    if (presentValue(cashFlows, mid) > price) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

function ownerEarningsDcf() {
  const dcf = inputs.ownerEarningsDcf;
  let ownerEarnings = dcf.ownerEarningsPerShare0;
  let value = 0;
  for (let year = 1; year <= 10; year += 1) {
    const growth = year <= 5
      ? dcf.years1To5Growth
      : dcf.years6To10Growth;
    ownerEarnings *= 1 + growth;
    value += ownerEarnings / (1 + dcf.discountRate) ** year;
  }
  const terminalValue =
    (ownerEarnings * (1 + dcf.terminalGrowth)) /
    (dcf.discountRate - dcf.terminalGrowth);
  return value + terminalValue / (1 + dcf.discountRate) ** 10;
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

const calculatedMarketCapCnyBn =
  inputs.price * inputs.currentShares / 1e9;
const ttmNetProfitCnyBn =
  inputs.annual2025.attributableNetProfitCnyBn -
  inputs.h1_2025.attributableNetProfitCnyBn +
  inputs.h1_2026.attributableNetProfitCnyBn;
const ttmDeductNetProfitCnyBn =
  inputs.annual2025.deductNetProfitCnyBn -
  inputs.h1_2025.deductNetProfitCnyBn +
  inputs.h1_2026.deductNetProfitCnyBn;
const ttmEps = ttmNetProfitCnyBn * 1e9 / inputs.currentShares;
const ttmDeductEps = ttmDeductNetProfitCnyBn * 1e9 / inputs.currentShares;
const normalizedStandaloneEps =
  inputs.normalizedStandalone.attributableNetProfitCnyBn * 1e9 /
  inputs.currentShares;
const ownerEarnings2025CnyBn =
  inputs.annual2025.operatingCashFlowCnyBn -
  inputs.annual2025.leaseCashPaymentsCnyBn -
  inputs.annual2025.capexCnyBn;
const ownerEarningsH12026CnyBn =
  inputs.h1_2026.operatingCashFlowCnyBn -
  inputs.h1_2026.leaseCashPaymentsCnyBn -
  inputs.h1_2026.capexCnyBn;
const segmentRevenueBridge = sum(
  Object.values(inputs.h1_2026.segmentRevenueCnyBn),
);
const profitBridge =
  inputs.h1_2026.profitBeforeTaxCnyBn -
  inputs.h1_2026.incomeTaxCnyBn -
  inputs.h1_2026.minorityProfitCnyBn;

const newShares =
  inputs.transaction.shareConsiderationCnyBn * 1e9 /
  inputs.transaction.latestIssuePrice;
const postDealShares = inputs.currentShares + newShares;
const newSharesPctOfOld = newShares / inputs.currentShares;
const sellerPctOfEnlarged = newShares / postDealShares;
const acquiredXinChaoProfit =
  inputs.transaction.xinChao2025AttributableNetProfitCnyBn;
const noSynergyPostDealEps =
  (inputs.normalizedStandalone.attributableNetProfitCnyBn +
    acquiredXinChaoProfit) * 1e9 / postDealShares;
const epsNeutralProfitRequiredCnyBn =
  normalizedStandaloneEps * postDealShares / 1e9;
const synergyGapForEpsNeutralCnyBn =
  epsNeutralProfitRequiredCnyBn -
  inputs.normalizedStandalone.attributableNetProfitCnyBn -
  acquiredXinChaoProfit;
const xinChaoOwnerEarningsCnyBn =
  inputs.transaction.xinChao2025OperatingCashFlowCnyBn -
  inputs.transaction.xinChao2025LeaseCashPaymentsCnyBn -
  inputs.transaction.xinChao2025CapexCnyBn;
const historicalOwnerEarningsCnyBn =
  inputs.historical2021To2025.operatingCashFlowCnyBn.map(
    (operatingCashFlow, index) =>
      operatingCashFlow -
      inputs.historical2021To2025.leaseCashPaymentsCnyBn[index] -
      inputs.historical2021To2025.capexCnyBn[index],
  );
const historicalPerformanceYearDividendsCnyBn =
  inputs.historical2021To2025.performanceYearDps.map(
    (dps) => dps * inputs.currentShares / 1e9,
  );
const cumulativeOwnerEarningsCnyBn = sum(historicalOwnerEarningsCnyBn);
const cumulativePerformanceYearDividendsCnyBn =
  sum(historicalPerformanceYearDividendsCnyBn);
const postDealNoSynergyOwnerEarningsCnyBn =
  inputs.normalizedStandalone.ownerEarningsCnyBn +
  xinChaoOwnerEarningsCnyBn;
const postDealBaseOwnerEarningsCnyBn =
  postDealNoSynergyOwnerEarningsCnyBn + 0.2;
const postDealDividendCashNeededAt034CnyBn =
  postDealShares * 0.34 / 1e9;

if (
  Math.abs(calculatedMarketCapCnyBn - inputs.quotedMarketCapCnyBn) /
    inputs.quotedMarketCapCnyBn > 0.001
) {
  throw new Error("Price x shares market-cap bridge failed");
}
if (
  Math.abs(segmentRevenueBridge - inputs.h1_2026.revenueCnyBn) /
    inputs.h1_2026.revenueCnyBn > 0.000001
) {
  throw new Error("H1 2026 segment revenue bridge failed");
}
if (
  Math.abs(profitBridge - inputs.h1_2026.attributableNetProfitCnyBn) /
    inputs.h1_2026.attributableNetProfitCnyBn > 0.001
) {
  throw new Error("H1 2026 pre-tax to attributable profit bridge failed");
}
if (!approxEqual(newShares * inputs.transaction.latestIssuePrice / 1e9,
  inputs.transaction.shareConsiderationCnyBn, 1e-8)) {
  throw new Error("Transaction share consideration bridge failed");
}
if (!approxEqual(
  inputs.transaction.mainAcquiredStake +
    inputs.transaction.remainingAcquiredStake,
  1,
)) {
  throw new Error("Transaction acquired-stake bridge failed");
}
if (!approxEqual(
  inputs.transaction.mainConsiderationCnyBn +
    inputs.transaction.remainingConsiderationCnyBn,
  inputs.transaction.totalConsiderationCnyBn,
)) {
  throw new Error("Transaction total-consideration bridge failed");
}
if (!approxEqual(
  inputs.transaction.mainCashConsiderationCnyBn +
    inputs.transaction.remainingConsiderationCnyBn,
  inputs.transaction.totalCashConsiderationCnyBn,
)) {
  throw new Error("Transaction cash-consideration bridge failed");
}
if (Math.abs(
  cumulativeOwnerEarningsCnyBn /
    sum(inputs.historical2021To2025.attributableNetProfitCnyBn) - 1,
) > 0.05) {
  throw new Error("Five-year owner earnings and profit diverge by over 5%");
}

const scenarioResults = {};
for (const [key, scenario] of Object.entries(inputs.scenarios)) {
  scenarioResults[key] = {};
  for (const years of [5, 10]) {
    const built = buildCashFlows(scenario, years);
    scenarioResults[key][`${years}y`] = {
      irrAtCurrentPrice: solveIrr(built.cashFlows, inputs.price),
      cumulativeDividends:
        sum(built.cashFlows) - built.terminalValue,
      terminalEps: built.terminalEps,
      terminalValue: built.terminalValue,
      priceTiers: {
        p10: presentValue(built.cashFlows, 0.10),
        p12: presentValue(built.cashFlows, 0.12),
        p14_87: presentValue(built.cashFlows, 2 ** (1 / 5) - 1),
        p15: presentValue(built.cashFlows, 0.15),
        p17_46: presentValue(built.cashFlows, 0.1746),
      },
    };
  }
}

const crossCheckValue = ownerEarningsDcf();
const mainModelP10 = scenarioResults.base["10y"].priceTiers.p10;
const crossCheckDifference =
  Math.abs(mainModelP10 - crossCheckValue) / mainModelP10;
if (crossCheckDifference > 0.2) {
  throw new Error("Independent valuation cross-check differs by more than 20%");
}

const oldLines = {
  smallPositionLow: 3.5,
  smallPositionHigh: 3.8,
  normalPositionLow: 3.0,
  normalPositionHigh: 3.3,
};

const output = {
  inputs,
  epsAudit: {
    annual2025ReportedEps:
      inputs.annual2025.attributableNetProfitCnyBn * 1e9 /
      inputs.currentShares,
    ttmReportedEps: ttmEps,
    ttmDeductEps,
    normalizedStandaloneEps,
    postDealNoSynergyEps: noSynergyPostDealEps,
    forecastBasePostDealEps: inputs.scenarios.base.eps0,
  },
  invariants: {
    priceDividedByTtmReportedEps: inputs.price / ttmEps,
    priceDividedByTtmDeductEps: inputs.price / ttmDeductEps,
    priceDividedByNormalizedStandaloneEps:
      inputs.price / normalizedStandaloneEps,
    calculatedMarketCapCnyBn,
    quotedMarketCapCnyBn: inputs.quotedMarketCapCnyBn,
    segmentRevenueBridgeCnyBn: segmentRevenueBridge,
    profitBridgeCnyBn: profitBridge,
  },
  ownerEarningsBridge: {
    annual2025: {
      operatingCashFlowCnyBn: inputs.annual2025.operatingCashFlowCnyBn,
      lessLeaseCashPaymentsCnyBn:
        inputs.annual2025.leaseCashPaymentsCnyBn,
      lessCapexCnyBn: inputs.annual2025.capexCnyBn,
      ownerEarningsCnyBn: ownerEarnings2025CnyBn,
    },
    h1_2026: {
      operatingCashFlowCnyBn: inputs.h1_2026.operatingCashFlowCnyBn,
      lessLeaseCashPaymentsCnyBn:
        inputs.h1_2026.leaseCashPaymentsCnyBn,
      lessCapexCnyBn: inputs.h1_2026.capexCnyBn,
      ownerEarningsCnyBn: ownerEarningsH12026CnyBn,
    },
  },
  historicalQuality: {
    fiveYearRevenueCagr:
      (inputs.historical2021To2025.revenueCnyBn[4] /
        inputs.historical2021To2025.revenueCnyBn[0]) ** (1 / 4) - 1,
    cumulativeAttributableNetProfitCnyBn:
      sum(inputs.historical2021To2025.attributableNetProfitCnyBn),
    cumulativeDeductNetProfitCnyBn:
      sum(inputs.historical2021To2025.deductNetProfitCnyBn),
    cumulativeOperatingCashFlowCnyBn:
      sum(inputs.historical2021To2025.operatingCashFlowCnyBn),
    ocfToAttributableProfit:
      sum(inputs.historical2021To2025.operatingCashFlowCnyBn) /
      sum(inputs.historical2021To2025.attributableNetProfitCnyBn),
    annualOwnerEarningsCnyBn: historicalOwnerEarningsCnyBn,
    cumulativeOwnerEarningsCnyBn,
    cumulativeOwnerEarningsToAttributableProfit:
      cumulativeOwnerEarningsCnyBn /
      sum(inputs.historical2021To2025.attributableNetProfitCnyBn),
    performanceYearDps:
      inputs.historical2021To2025.performanceYearDps,
    annualPerformanceYearDividendsCnyBn:
      historicalPerformanceYearDividendsCnyBn,
    cumulativePerformanceYearDividendsCnyBn,
    cumulativeDividendPayoutVsOwnerEarnings:
      cumulativePerformanceYearDividendsCnyBn /
      cumulativeOwnerEarningsCnyBn,
    fiveYearAverageOwnerEarningsPerShare:
      cumulativeOwnerEarningsCnyBn * 1e9 /
      inputs.currentShares / 5,
  },
  transactionAudit: {
    newShares,
    postDealShares,
    newSharesPctOfOld,
    sellerPctOfEnlarged,
    totalConsiderationCnyBn: inputs.transaction.totalConsiderationCnyBn,
    discountToOriginalAppraisal:
      inputs.transaction.totalConsiderationCnyBn /
        inputs.transaction.originalAppraised100PctCnyBn - 1,
    discountToLatestAppraisal:
      inputs.transaction.totalConsiderationCnyBn /
        inputs.transaction.latestAppraised100PctCnyBn - 1,
    shareConsiderationMarketValueAtCurrentPriceCnyBn:
      newShares * inputs.price / 1e9,
    acquiredXinChaoProfitCnyBn: acquiredXinChaoProfit,
    purchasePriceToAcquired2025Profit:
      inputs.transaction.totalConsiderationCnyBn / acquiredXinChaoProfit,
    xinChaoOwnerEarnings2025CnyBn: xinChaoOwnerEarningsCnyBn,
    purchasePriceToAcquiredOwnerEarnings:
      inputs.transaction.totalConsiderationCnyBn /
      xinChaoOwnerEarningsCnyBn,
    epsDilutionBeforeSynergy:
      noSynergyPostDealEps / normalizedStandaloneEps - 1,
    synergyGapForEpsNeutralCnyBn,
    goodwillToProFormaNetAssets:
      inputs.transaction.proFormaGoodwillCnyBn /
      inputs.transaction.proFormaNetAssetsCnyBn,
  },
  dividendAudit: {
    mechanical2025Dps: inputs.annual2025.totalDps,
    mechanicalYieldAtCurrentPrice:
      inputs.annual2025.totalDps / inputs.price,
    payoutVsReportedProfit:
      inputs.annual2025.totalDps /
      (inputs.annual2025.attributableNetProfitCnyBn * 1e9 /
        inputs.currentShares),
    payoutVsNormalizedStandaloneEps:
      inputs.annual2025.totalDps / normalizedStandaloneEps,
    sustainableBaseDps: inputs.scenarios.base.dps0,
    sustainableBaseYieldAtCurrentPrice:
      inputs.scenarios.base.dps0 / inputs.price,
    postDealNoSynergyOwnerEarningsCnyBn,
    postDealNoSynergyOwnerEarningsPerShare:
      postDealNoSynergyOwnerEarningsCnyBn * 1e9 / postDealShares,
    postDealBaseOwnerEarningsCnyBn,
    postDealBaseOwnerEarningsPerShare:
      postDealBaseOwnerEarningsCnyBn * 1e9 / postDealShares,
    postDealDividendCashNeededAt034CnyBn,
    incrementalCashNeededToKeep034DpsCnyBn:
      postDealDividendCashNeededAt034CnyBn -
      inputs.annual2025.totalDps * inputs.currentShares / 1e9,
    cashGapAt034DpsBeforeSynergyCnyBn:
      postDealDividendCashNeededAt034CnyBn -
      postDealNoSynergyOwnerEarningsCnyBn,
    cashGapAt034DpsWithBaseSynergyCnyBn:
      postDealDividendCashNeededAt034CnyBn -
      postDealBaseOwnerEarningsCnyBn,
  },
  scenarioResults,
  independentCrossCheck: {
    method: "10-year owner-earnings DCF",
    valuePerShare: crossCheckValue,
    mainModelP10,
    absoluteDifferencePct: crossCheckDifference,
    passed20PctGate: crossCheckDifference <= 0.2,
  },
  frozenOldPriceLines: oldLines,
  versionDrift: {
    oldSmallPositionMidpoint:
      (oldLines.smallPositionLow + oldLines.smallPositionHigh) / 2,
    oldNormalPositionMidpoint:
      (oldLines.normalPositionLow + oldLines.normalPositionHigh) / 2,
    newBaseP12: scenarioResults.base["10y"].priceTiers.p12,
    newBaseP15: scenarioResults.base["10y"].priceTiers.p15,
  },
};

console.log(JSON.stringify(output, null, 2));
