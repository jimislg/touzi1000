#!/usr/bin/env node

"use strict";

const inputs = {
  asOf: "2026-09-24 13:29:41 CST",
  price: 1233.95,
  dilutedShares: 1_250_081_601,
  quotedMarketCapCnyBn: 1542.538,
  annual2025: {
    revenueCnyBn: 168.83810251479,
    attributableNetProfitCnyBn: 82.32006710168,
    reportedEps: 65.66,
    operatingCashFlowCnyBn: 61.52220498935,
    depreciationAndAmortizationCnyBn:
      1.89333831191 + 0.05579732489 + 0.28961368299 + 0.02063773449,
    capexCnyBn: 3.12759491641,
    maintenanceCapexAssumptionCnyBn: 2.3,
    cashDividendCnyBn: 65.033,
  },
  historical2021To2025: {
    attributableNetProfitCnyBn: [
      52.43550662216, 62.71750372483, 74.73407214192,
      86.22807046565, 82.32006710168,
    ],
    operatingCashFlowCnyBn: [
      64.0286761, 36.6985958, 66.5932477, 92.4636922, 61.52220498935,
    ],
    capexCnyBn: [
      3.4087845, 5.3065464, 2.6197559, 4.6787121, 3.12759491641,
    ],
  },
  h1_2025: {
    revenueCnyBn: 89.38935441684,
    attributableNetProfitCnyBn: 45.4029622981,
  },
  h1_2026: {
    revenueCnyBn: 90.70326096448,
    profitBeforeTaxCnyBn: 61.43841917729,
    incomeTaxCnyBn: 15.40508861051,
    minorityProfitCnyBn: 1.51645014492,
    attributableNetProfitCnyBn: 44.51688042186,
    reportedEps: 35.57,
    segmentRevenueCnyBn: {
      moutaiLiquor: 77.72443792548,
      seriesLiquor: 12.93418651182,
      other: 0.04463652718,
    },
  },
  normalizedEps: 65.0,
  normalizedOwnerEarningsPerShare: 65.5,
  scenarios: {
    bear: {
      label: "悲观",
      eps0: 65.0,
      years1To5Growth: -0.01,
      years6To10Growth: 0.02,
      payoutRatio: 0.75,
      terminalPe: 15,
    },
    base: {
      label: "基准",
      eps0: 65.0,
      years1To5Growth: 0.045,
      years6To10Growth: 0.035,
      payoutRatio: 0.8,
      terminalPe: 19,
    },
    bull: {
      label: "乐观",
      eps0: 65.0,
      years1To5Growth: 0.06,
      years6To10Growth: 0.05,
      payoutRatio: 0.82,
      terminalPe: 22,
    },
  },
  ownerEarningsDcf: {
    years1To5Growth: 0.045,
    years6To10Growth: 0.035,
    discountRate: 0.1,
    terminalGrowth: 0.025,
  },
};

function approxEqual(a, b, tolerance = 1e-8) {
  return Math.abs(a - b) <= tolerance;
}

function buildCashFlows(scenario, years) {
  let eps = scenario.eps0;
  const cashFlows = [];
  for (let year = 1; year <= years; year += 1) {
    const growth = year <= 5
      ? scenario.years1To5Growth
      : scenario.years6To10Growth;
    eps *= 1 + growth;
    cashFlows.push(eps * scenario.payoutRatio);
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
  let high = 1.0;
  for (let i = 0; i < 300; i += 1) {
    const mid = (low + high) / 2;
    if (presentValue(cashFlows, mid) > price) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

function ownerEarningsDcf() {
  const dcf = inputs.ownerEarningsDcf;
  let ownerEarnings = inputs.normalizedOwnerEarningsPerShare;
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

function cagr(start, end, years) {
  return (end / start) ** (1 / years) - 1;
}

const ttmNetProfitCnyBn =
  inputs.annual2025.attributableNetProfitCnyBn +
  inputs.h1_2026.attributableNetProfitCnyBn -
  inputs.h1_2025.attributableNetProfitCnyBn;
const ttmEps = (ttmNetProfitCnyBn * 1e9) / inputs.dilutedShares;
const calculatedMarketCapCnyBn =
  (inputs.price * inputs.dilutedShares) / 1e9;
const marketPe = inputs.price / ttmEps;

const profitBridge =
  inputs.h1_2026.profitBeforeTaxCnyBn -
  inputs.h1_2026.incomeTaxCnyBn -
  inputs.h1_2026.minorityProfitCnyBn;
const segmentRevenueBridge = Object.values(
  inputs.h1_2026.segmentRevenueCnyBn,
).reduce((sum, value) => sum + value, 0);

if (!approxEqual(profitBridge, inputs.h1_2026.attributableNetProfitCnyBn)) {
  throw new Error("H1 2026 profit bridge failed");
}
if (!approxEqual(segmentRevenueBridge, inputs.h1_2026.revenueCnyBn)) {
  throw new Error("H1 2026 segment revenue bridge failed");
}
if (
  Math.abs(calculatedMarketCapCnyBn - inputs.quotedMarketCapCnyBn) /
    inputs.quotedMarketCapCnyBn >
  0.001
) {
  throw new Error("Price x shares market-cap bridge failed");
}

const scenarioResults = {};
for (const [key, scenario] of Object.entries(inputs.scenarios)) {
  scenarioResults[key] = {};
  for (const years of [5, 10]) {
    const { cashFlows, terminalEps, terminalValue } = buildCashFlows(
      scenario,
      years,
    );
    scenarioResults[key][`${years}y`] = {
      irrAtCurrentPrice: solveIrr(cashFlows, inputs.price),
      cumulativeDividends:
        cashFlows.reduce((sum, value) => sum + value, 0) - terminalValue,
      terminalEps,
      terminalValue,
      priceTiers: {
        p10: presentValue(cashFlows, 0.1),
        p12: presentValue(cashFlows, 0.12),
        p15: presentValue(cashFlows, 0.15),
        p17_46: presentValue(cashFlows, 0.1746),
      },
    };
  }
}

const base10 = scenarioResults.base["10y"].priceTiers;
const crossCheckValue = ownerEarningsDcf();
const crossCheckDifference = Math.abs(base10.p10 - crossCheckValue) / base10.p10;
if (crossCheckDifference > 0.2) {
  throw new Error("Independent valuation cross-check differs by more than 20%");
}

const oldQualityGateMidpoint = 1260;
const oldModel = {
  eps0: 65.0,
  years1To5Growth: 0.05,
  years6To10Growth: 0.05,
  payoutRatio: 0.8,
  terminalPe: 20,
};
const oldModelP12 = presentValue(buildCashFlows(oldModel, 10).cashFlows, 0.12);
const fiveYearDoubleRate = 2 ** (1 / 5) - 1;
const baseFiveYearCashFlows = buildCashFlows(inputs.scenarios.base, 5).cashFlows;
const newFiveYearTargetIrrPrice = presentValue(
  baseFiveYearCashFlows,
  fiveYearDoubleRate,
);
const newFiveYearDirectDoublePrice =
  baseFiveYearCashFlows.reduce((sum, cashFlow) => sum + cashFlow, 0) / 2;
const sum = (values) => values.reduce((total, value) => total + value, 0);
const fiveYearNetProfit = sum(
  inputs.historical2021To2025.attributableNetProfitCnyBn,
);
const fiveYearOperatingCashFlow = sum(
  inputs.historical2021To2025.operatingCashFlowCnyBn,
);
const fiveYearCapex = sum(inputs.historical2021To2025.capexCnyBn);

const output = {
  inputs,
  epsAudit: {
    annual2025Eps: inputs.annual2025.reportedEps,
    h1_2026Eps: inputs.h1_2026.reportedEps,
    ttmEps,
    normalizedEps: inputs.normalizedEps,
    forecast2026BaseEps: inputs.normalizedEps,
  },
  invariants: {
    priceDividedByTtmEps: marketPe,
    calculatedMarketCapCnyBn,
    quotedMarketCapCnyBn: inputs.quotedMarketCapCnyBn,
    segmentRevenueBridgeCnyBn: segmentRevenueBridge,
    profitBridgeCnyBn: profitBridge,
  },
  ownerEarningsBridge2025: {
    reportedAttributableNetProfitCnyBn:
      inputs.annual2025.attributableNetProfitCnyBn,
    reportedCapexOwnerEarningsCnyBn:
      inputs.annual2025.attributableNetProfitCnyBn +
      inputs.annual2025.depreciationAndAmortizationCnyBn -
      inputs.annual2025.capexCnyBn,
    maintenanceCapexOwnerEarningsCnyBn:
      inputs.annual2025.attributableNetProfitCnyBn +
      inputs.annual2025.depreciationAndAmortizationCnyBn -
      inputs.annual2025.maintenanceCapexAssumptionCnyBn,
  },
  historicalCagr2021To2025: {
    revenue: cagr(106.19015484376, 168.83810251479, 4),
    attributableNetProfit: cagr(52.43550662216, 82.32006710168, 4),
  },
  historicalCashConversion2021To2025: {
    cumulativeAttributableNetProfitCnyBn: fiveYearNetProfit,
    cumulativeOperatingCashFlowCnyBn: fiveYearOperatingCashFlow,
    cumulativeCapexCnyBn: fiveYearCapex,
    operatingCashFlowConversion: fiveYearOperatingCashFlow / fiveYearNetProfit,
    freeCashFlowConversion:
      (fiveYearOperatingCashFlow - fiveYearCapex) / fiveYearNetProfit,
  },
  scenarioResults,
  independentCrossCheck: {
    method: "10-year owner-earnings DCF",
    valuePerShare: crossCheckValue,
    mainModelP10: base10.p10,
    absoluteDifferencePct: crossCheckDifference,
    passed20PctGate: crossCheckDifference <= 0.2,
  },
  versionDrift: {
    oldQualityGateMidpoint,
    oldGateBaseIrrUnderNewModel: solveIrr(
      buildCashFlows(inputs.scenarios.base, 10).cashFlows,
      oldQualityGateMidpoint,
    ),
    oldAssumptionsMathematicalP12: oldModelP12,
    newBaseP12: base10.p12,
    labelCorrectionAmount: oldModelP12 - oldQualityGateMidpoint,
    assumptionUpdateAmount: base10.p12 - oldModelP12,
    totalChangeFromOldGate: base10.p12 - oldQualityGateMidpoint,
    newFiveYearTargetIrrPrice,
    newFiveYearDirectDoublePrice,
  },
};

console.log(JSON.stringify(output, null, 2));
