const test = require('node:test');
const assert = require('node:assert/strict');
const plan = require('../public/practical-plan');

// Synthetic amounts; no private account data is stored in this fixture.
function fixture() {
  return {
    cash: 5000, practicalPlan: { baselineLedgerIds: ['old'] },
    holdings: [{ name: '示例', currency: 'CNY', quantity: 10, costPrice: 20 }],
    tradeLedger: [{ id: 'old', name: '示例', side: '买入', grossCny: 200, fee: 0 }]
  };
}
const entry = { name: '示例', budgetCny: 600, cumulativeCostCapCny: 1000 };
test('one-time budgets subtract buys and fees; sale does not restore allowance', () => {
  const pf = fixture();
  assert.equal(plan.budget(pf, entry).remaining, 600);
  pf.tradeLedger.push({ id: 'new', name: '示例', side: '买入', grossCny: 400, fee: 5 });
  assert.equal(plan.budget(pf, entry).remaining, 195);
  pf.tradeLedger.push({ id: 'sell', name: '示例', side: '卖出', grossCny: 400, fee: 5 });
  assert.equal(plan.budget(pf, entry).remaining, 195);
});
test('remaining allowance respects cost ceiling, cash, and overspend', () => {
  const pf = fixture();
  pf.holdings[0].costPrice = 95;
  assert.equal(plan.budget(pf, entry).remaining, 50);
  pf.cash = 30;
  assert.equal(plan.budget(pf, entry).remaining, 30);
  pf.tradeLedger.push({ id: 'new', name: '示例', side: '买入', grossCny: 610, fee: 0 });
  assert.equal(plan.budget(pf, entry).remaining, 0);
});
test('missing HK conversion data fails closed without mutating the account', () => {
  const pf = fixture();
  pf.holdings[0].currency = 'HKD';
  const before = JSON.stringify(pf);
  assert.equal(plan.budget(pf, entry).remaining, null);
  assert.equal(JSON.stringify(pf), before);
  pf.holdings[0].marketValue = 180;
  pf.holdings[0].priceAtSnapshot = 20;
  assert.equal(plan.budget(pf, entry).cost, 180);
});
