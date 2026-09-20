const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../public/return-model');
const data = require('../public/data/calibration-20260918.json');

test('安踏原两步法与较保守校准情景分开，原72港元十年IRR约15%', () => {
  const base = data.models.find(m => m.label === '安踏体育');
  const original = model.scenario(base, 'original');
  const before = JSON.stringify(base);
  assert.ok(Math.abs(model.result(original, 72, 10).irr - .149455) < .00001);
  assert.ok(Math.abs(model.result(base, 72, 10).irr - .11356) < .0001);
  assert.equal(JSON.stringify(base), before);
});

test('平价买入、盈利不增长、每年派息5%的年化IRR为5%，现金股息不复投回报更低', () => {
  const fixed = { eps: 10, growth: 0, payout: .5, tax: 0, exitPE: 10, fx: 1 };
  const result = model.result(fixed, 100, 5);
  assert.ok(Math.abs(result.irr - .05) < 1e-12);
  assert.equal(result.wealth, 1.25);
  assert.ok(result.cagr < result.irr);
  assert.equal(model.result(fixed, 0, 5), null);
  assert.equal(model.result(fixed, NaN, 5), null);
});

test('网页模型逐项复现已核验报告，且较低买价提高回报', () => {
  assert.equal(data.models.length, 10);
  assert.equal(data.pool.length, 32);
  assert.equal(data.models.reduce((sum, m) => sum + m.prices.length, 0), 80);
  for (const m of data.models) {
    assert.ok(Math.abs(model.result(m, m.price, 5).irr - m.irr5) < 1e-10, m.name);
    assert.ok(Math.abs(model.result(m, m.price, 10).irr - m.irr10) < 1e-10, m.name);
    assert.ok(Math.abs(model.result(m, m.target5Cash, 5).wealth - 2) < 1e-10, m.name);
    assert.ok(Math.abs(model.result(m, m.target10Cash, 10).wealth - 5) < 1e-10, m.name);
    let last = Infinity;
    for (const price of m.prices) {
      const r = model.result(m, price, 5);
      assert.ok(r.irr < last, m.name);
      last = r.irr;
      assert.ok(model.result(model.scenario(m, 'stress'), price, 5).irr < r.irr, m.name);
    }
  }
});

test('港股股息仅扣税一次；敏感性和计算不修改原始模型', () => {
  const tencent = data.models.find(m => m.label === '腾讯控股');
  const original = JSON.stringify(tencent);
  const firstDividend = model.flows(tencent, 5)[0];
  assert.ok(Math.abs(firstDividend - 29 * 1.09 * .126 / .86062) < 1e-12);
  assert.equal(model.scenario(tencent, 'eps26').eps, 26);
  model.scenario(tencent, 'stress');
  assert.equal(JSON.stringify(tencent), original);
});
