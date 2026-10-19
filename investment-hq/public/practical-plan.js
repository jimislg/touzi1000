/* The private account policy is supplied by the local bootstrap, never bundled here. */
(function (root) {
  'use strict';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const wan = value => `${(value / 10000).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}万元`;
  function costCny(holding) {
    if (!holding) return 0;
    const fx = holding.currency === 'HKD'
      ? Number(holding.marketValue) / (Number(holding.quantity) * Number(holding.priceAtSnapshot)) : 1;
    return Number(holding.quantity) * Number(holding.costPrice) * fx;
  }
  function budget(portfolio, entry) {
    const plan = portfolio.practicalPlan;
    const baseline = new Set(plan.baselineLedgerIds || []);
    const trades = (portfolio.tradeLedger || []).filter(t => !baseline.has(t.id) && t.name === entry.name && t.side === '买入');
    const spent = trades.reduce((sum, t) => sum + Number(t.grossCny) + Number(t.fee || 0), 0);
    const holding = (portfolio.holdings || []).find(h => h.name === entry.name);
    const cost = costCny(holding);
    const values = [entry.budgetCny, entry.cumulativeCostCapCny, spent, cost, portfolio.cash];
    const valid = values.every(v => typeof v === 'number' && Number.isFinite(v) && v >= 0);
    const remaining = valid ? Math.max(0, Math.min(entry.budgetCny - spent, entry.cumulativeCostCapCny - cost, portfolio.cash)) : null;
    return { spent, cost, remaining };
  }
  function html(portfolio) {
    const plan = portfolio?.practicalPlan;
    if (!plan) return '';
    return `<h2>第一轮怎么做 <span class="tag">${escape(plan.confirmedOn)} 已确认</span></h2>
      <p><b>合理价格小额起步，更低价格或盈利兑现后再加仓。</b></p>
      <p class="cal-note">${escape(plan.status)}。策略预算不等于已下单；当前具体订单 ${portfolio.executionPlan?.rows?.length || 0} 笔。</p>
      <div class="cal-scroll"><table class="practical-table"><thead><tr><th>优先公司</th><th>买价上限</th><th>本轮新增上限</th><th>剩余可用上限</th><th>下单前核对</th></tr></thead><tbody>${plan.entries.map(entry => {
        const b = budget(portfolio, entry);
        return `<tr><th>${escape(entry.name)}</th><td>≤${escape(entry.priceLimit)}${entry.currency === 'HKD' ? '港元' : '元'}</td><td><b>${wan(entry.budgetCny)}</b><br><small>累计成本≤${wan(entry.cumulativeCostCapCny)}</small></td><td><b>${b.remaining === null ? '成本资料待核对' : wan(b.remaining)}</b></td><td>${escape(entry.gate)}</td></tr>`;
      }).join('')}</tbody></table></div>
      <p class="cal-note"><b>首轮合计最多${wan(plan.totalBudgetCny)}，单日首次新增不超过${wan(plan.dailyLimitCny)}，均为人民币、含费用。</b>${escape(plan.budgetRule)} 剩余额度同时受累计成本和现金约束；港股历史成本折算沿用持仓快照估计，实际结算需核对。</p>
      <details><summary>下一批与后续加仓</summary><ul>${plan.reserve.map(row => `<li><b>${escape(row.name)} ≤${escape(row.priceLimit)}${row.currency === 'HKD' ? '港元' : '元'}</b>：${escape(row.action)}</li>`).join('')}</ul><ul>${plan.rules.map(rule => `<li>${escape(rule)}</li>`).join('')}</ul></details>
      <p class="cal-note">策略确认 ${escape(plan.confirmedOn)} · 研究行情快照 ${escape(plan.quoteAsOf)} · 原持仓底稿 ${escape(plan.holdingsAsOf)}；本卡不宣称已完成此后新增公告核查。</p>
      <button class="btn" data-practical-report="${escape(plan.report)}">查看已确认实操建仓卡</button>`;
  }
  function mount(panel, portfolio) {
    if (!panel || !portfolio?.practicalPlan) return;
    let card = panel.querySelector('.practical-plan');
    if (!card) { card = document.createElement('section'); card.className = 'card practical-plan'; panel.prepend(card); }
    card.innerHTML = html(portfolio);
    card.querySelector('[data-practical-report]').addEventListener('click', event => openDocModal(event.currentTarget.dataset.practicalReport));
  }
  const api = { budget, html, mount };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PracticalPlan = api;
})(typeof window === 'undefined' ? globalThis : window);
