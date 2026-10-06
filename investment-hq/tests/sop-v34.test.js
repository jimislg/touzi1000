'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { bootstrapPayload } = require('../server');

test('v3.4 组合回报先加权10年期末财富，再逆算CAGR', () => {
  const payload = bootstrapPayload();
  const dm = payload.decisionMetrics;
  const stockWealth = dm.targetRows.reduce((sum, row) =>
    sum + (Number.isFinite(row.baseIrr) ? row.weight * Math.pow(1 + row.baseIrr, 10) : 0), 0);
  const cashWealth = Number.isFinite(dm.cashReturn) ? dm.cashWeight * Math.pow(1 + dm.cashReturn, 10) : 0;
  const expected = Math.pow((stockWealth + cashWealth) / dm.coveredWeight, 1 / 10) - 1;
  assert.ok(Math.abs(dm.weightedReturn - expected) < 1e-12);

  const directIrrAverage = (dm.targetRows.reduce((sum, row) =>
    sum + (Number.isFinite(row.baseIrr) ? row.weight * row.baseIrr : 0), 0)
    + dm.cashWeight * dm.cashReturn) / dm.coveredWeight;
  assert.notEqual(dm.weightedReturn, directIrrAverage);
});

test('v3.4 股息以税前100万元为目标，税后到手另行披露', () => {
  const dm = bootstrapPayload().decisionMetrics;
  assert.equal(dm.targetDividend, dm.targetDividendPreTax);
  assert.equal(dm.currentDividend, dm.currentDividendPreTax);
  assert.ok(dm.targetDividendPreTax > dm.targetDividendAfterTax);
  assert.ok(dm.currentDividendPreTax > dm.currentDividendAfterTax);
  assert.equal(dm.dividendGap, Math.max(0, 1000000 - dm.targetDividendPreTax));
});

test('v3.4 仓位硬上限对B类不超过8%，A类不超过20%', () => {
  const rows = bootstrapPayload().decisionMetrics.targetRows;
  const moutai = rows.find(row => row.name === '贵州茅台');
  const cmb = rows.find(row => row.name === '招商银行');
  assert.equal(moutai.effectiveHardLimit, 0.20);
  assert.equal(cmb.effectiveHardLimit, 0.08);
  assert.equal(moutai.limitBreach, true);
  assert.equal(cmb.limitBreach, true);
});
