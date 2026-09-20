/* 研究快照独立于实时行情与成交账本，输入只影响本页情景。 */
window.CalibrationPage = (() => {
  'use strict';
  let data = null, loading = null, portfolio = null;
  const e = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pct = x => `${(x * 100).toFixed(1)}%`;
  const num = x => Number(x).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const q = id => document.getElementById(id);
  const calc = window.ReturnModel;

  function notices(currentPortfolio) {
    if (currentPortfolio) portfolio = currentPortfolio;
    for (const id of ['tab-goals', 'tab-portfolio', 'tab-research']) {
      const panel = q(id);
      if (!panel || panel.querySelector('.cal-notice')) continue;
      const note = document.createElement('div');
      note.className = 'cal-notice';
      note.innerHTML = '<a href="#calibration">查看 9月18日股票池校准与价格收益 →</a><br>32家公司最新结论、10家公司价格阶梯。9月20日已确认实操方案置顶；历史研究线与当前执行规则分开查看。';
      panel.prepend(note);
    }
    for (const id of ['tab-calibration', 'tab-portfolio']) PracticalPlan.mount(q(id), portfolio);
  }

  async function render() {
    const panel = q('tab-calibration');
    if (data) return;
    if (loading) return loading;
    panel.innerHTML = '<div class="card" role="status">正在载入股票池校准…</div>';
    loading = (async () => {
      try {
        const response = await fetch('/data/calibration-20260918.json', { cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        data = await response.json();
        build(panel);
      } catch (error) {
        data = null;
        panel.innerHTML = `<div class="card"><p role="alert">校准加载失败：${e(error.message)}</p><button id="cal-retry">重新加载</button></div>`;
        q('cal-retry').addEventListener('click', render);
      } finally { loading = null; }
    })();
    return loading;
  }

  function build(panel) {
    panel.innerHTML = `
      <div class="card cal-lead">
        <h2>股票池校准与价格收益 <span class="tag">研究快照 2026-09-18 / 19</span></h2>
        <p class="cal-note">行情与财务研究截止 ${e(data.asOf)}；${e(data.quoteLabel)}。32 家逐项校准，10 家重算模型（东鹏、农夫为初筛），其余 22 家不补造收益率。</p>
        <p><b>研究快照与执行规则分开：</b>当前已确认的实操方案见上方执行卡；下表保留9月18日研究证据与情景价格，不用保守价自动替代首笔门槛。</p>
        <p class="cal-note">本轮已确认更新网页。模型价格是研究复核线，不是成交记录或自动下单指令；持股数、现金和已确认建仓政策不会随本页情景输入改变。</p>
        <div class="cal-links">
          <button data-report="股票池校准研究报告-20260918.md">完整32家校准报告</button>
          <button data-report="个股价格与年化收益对照-20260919.md">逐股价格收益表</button>
          <button data-report="股票池核验与计算附件-20260918.md">来源与计算核验</button>
        </div>
      </div>
      <div class="card">
        <h2>买入价格，怎样改变回报？</h2>
        <p class="cal-note">固定经营假设，再比较买入价格。每年年末领取税后股息，期末出售；收益均为条件测算，无保证。低价若源于经营恶化，应先下修盈利。</p>
        <div class="cal-controls">
          <label for="cal-company">公司<select id="cal-company">${data.models.map((m, i) => `<option value="${i}" ${m.label === '腾讯控股' ? 'selected' : ''}>${e(m.label)}${m.preliminary ? '（初筛）' : ''}</option>`).join('')}</select></label>
          <label for="cal-scenario">经营情景<select id="cal-scenario"><option value="base">9月18日校准情景</option><option value="stress">校准情景再做压力测试</option><option value="eps26">腾讯：EPS降至26元</option><option value="original">安踏：8月27日原两步法</option></select></label>
          <label for="cal-price">买入价格 <span id="cal-currency"></span><input type="number" id="cal-price" min="0.01" step="0.01" inputmode="decimal"></label>
        </div>
        <label for="cal-range" class="cal-note">拖动调节买价，或点击下方价格档位</label>
        <input id="cal-range" type="range" class="cal-range" step="0.01">
        <div id="cal-assumptions" class="cal-assumptions"></div>
        <p id="cal-caution" class="cal-note"></p>
        <div id="cal-error" class="cal-error" role="alert"></div>
        <div class="cal-scroll" aria-live="polite"><table class="cal-results"><thead><tr><th>持有期</th><th class="num">年化IRR</th><th class="num">不复投年化</th><th class="num">期末财富倍数</th></tr></thead><tbody id="cal-result"></tbody></table></div>
        <p id="cal-direct-target" class="cal-note"></p>
        <details><summary>IRR与期末财富有什么区别？</summary><p class="cal-note">IRR计入每笔分红到账的时间，不要求实际按IRR复投。不复投年化将股息留作零收益现金，由期末股票价值加累计股息计算。五年翻倍对应14.87%，十年五倍对应17.46%；仅IRR达到这两个数字，不保证不复投财富达标。汇率固定1港元=0.86062元人民币；港股通股息税20%，A股按长期持有股息税0%；不计交易费用、价差和汇率变动。分红与增长尚未逐年验证资本需求约束，不能视为盈利承诺。</p></details>
        <p class="cal-note cal-stress">统一压力测试：起始盈利减10%、年增速下调3个百分点（最低0）、退出PE减20%，派息率不变。此为机械敏感性，不代表发生概率或最大损失。</p>
      </div>
      <div class="card">
        <h2>同一家公司，不同买入价</h2><p id="cal-ladder-label" class="cal-note"></p>
        <div class="cal-scroll"><table id="cal-price-table"><thead><tr><th>买入价</th><th class="num">5年IRR</th><th class="num">10年IRR</th><th class="num">5年不复投年化</th><th class="num">5年末财富</th></tr></thead><tbody id="cal-ladder"></tbody></table></div>
      </div>
      <div class="card">
        <h2>希望达到这档年化IRR，最多付多少？</h2><p class="cal-note">当前所选情景下的数学价格，不含额外安全折扣；仍须复核基本面。这与不复投的财富目标买价不同。</p>
        <div class="cal-scroll"><table id="cal-target-table"><thead><tr><th>目标年化IRR</th><th class="num">持有5年的买价</th><th class="num">持有10年的买价</th></tr></thead><tbody id="cal-targets"></tbody></table></div>
      </div>
      <div class="card">
        <h2>32家公司最新校准</h2><p class="cal-note">价格为9月18日快照。本表建议保留9月18日时点；9月20日执行顺序、首笔价格与预算以上方已确认方案为准。新线属于研究情景，不是自动订单。点击公司可看原始来源。</p>
        <div class="cal-scroll"><table class="cal-pool-table"><thead><tr><th>公司</th><th>角色</th><th class="num">快照价</th><th>财务与风险</th><th>校准建议</th></tr></thead><tbody>${data.pool.map(r => `<tr><th><a href="${e(r['来源'])}" target="_blank" rel="noopener noreferrer">${e(r['公司'])}</a></th><td>${e(r['角色'])}</td><td class="num">${num(r['价格'])}<br>${r['币种'] === 'HKD' ? '港元' : '元'}</td><td>${e(r['财务及风险'])}</td><td>${e(r['研究建议_非交易指令'])}</td></tr>`).join('')}</tbody></table></div>
      </div>`;
    panel.querySelectorAll('[data-report]').forEach(button => button.addEventListener('click', () => openDocModal(button.dataset.report)));
    q('cal-company').addEventListener('change', selectCompany);
    q('cal-scenario').addEventListener('change', update);
    q('cal-price').addEventListener('input', () => { syncRange(); update(); });
    q('cal-range').addEventListener('input', () => { q('cal-price').value = q('cal-range').value; update(); });
    q('cal-ladder').addEventListener('click', event => {
      const button = event.target.closest('[data-price]');
      if (!button) return;
      q('cal-price').value = button.dataset.price; syncRange(); update();
    });
    selectCompany();
    notices();
  }
  function selected() { return data.models[Number(q('cal-company').value)]; }
  function syncRange() {
    const price = Number(q('cal-price').value), range = q('cal-range');
    if (!(price > 0) || !Number.isFinite(price)) return;
    const model = selected();
    range.min = Math.min(...model.prices, price);
    range.max = Math.max(...model.prices, price);
    range.value = price;
  }
  function selectCompany() {
    const model = selected();
    q('cal-scenario').options[2].disabled = model.label !== '腾讯控股';
    if (q('cal-scenario').value === 'eps26' && model.label !== '腾讯控股') q('cal-scenario').value = 'base';
    q('cal-scenario').options[3].disabled = model.label !== '安踏体育';
    q('cal-scenario').value = model.label === '安踏体育' ? 'original' : 'base';
    q('cal-price').value = model.price;
    syncRange(); update();
  }
  function update() {
    const base = selected(), model = calc.scenario(base, q('cal-scenario').value);
    const price = Number(q('cal-price').value), currency = model.fx === 1 ? '人民币元' : '港元';
    q('cal-currency').textContent = `（${currency}）`;
    q('cal-assumptions').textContent = `EPS ${model.eps.toFixed(3)}元人民币 · 年增 ${pct(model.growth)} · 税前派息 ${pct(model.payout)} · 退出PE ${model.exitPE.toFixed(1)}倍`;
    q('cal-caution').textContent = (base.label === '安踏体育' ? '原两步法采用增长8%、退出17倍PE；9月校准情景改为7%、13倍PE，属于假设变化，不能解释为公司价值突然下降。' : '') + base.caution;
    const valid = price > 0 && Number.isFinite(price);
    q('cal-error').textContent = valid ? '' : '请输入大于零的有效买入价格。';
    q('cal-result').innerHTML = valid ? [5, 10].map(years => {
      const r = calc.result(model, price, years);
      return `<tr><th>${years}年</th><td class="num"><b>${pct(r.irr)}</b></td><td class="num">${pct(r.cagr)}</td><td class="num">${r.wealth.toFixed(2)}倍</td></tr>`;
    }).join('') : '<tr><td colspan="4">等待有效买入价</td></tr>';
    const five = calc.result(model, 1, 5), ten = calc.result(model, 1, 10);
    q('cal-direct-target').textContent = `股息不复投的目标买价：五年翻倍 ${num(five.terminalCash / 2)} ${currency}；十年五倍 ${num(ten.terminalCash / 5)} ${currency}。均未另减安全折扣。`;
    const label = q('cal-scenario').selectedOptions[0].textContent;
    q('cal-ladder-label').textContent = `${base.label} · ${label} · ${currency}；“快照”是9月18日价格，含分红回报不是单纯股价涨幅。`;
    q('cal-ladder').innerHTML = base.prices.map(p => {
      const a = calc.result(model, p, 5), b = calc.result(model, p, 10);
      return `<tr class="${p === base.price ? 'cal-current' : ''} ${p === price ? 'cal-picked' : ''}"><th><button class="cal-price-btn" data-price="${p}" aria-label="以${p}${currency}测算">${num(p)}</button>${p === base.price ? ' · 快照' : ''}</th><td class="num">${pct(a.irr)}</td><td class="num">${pct(b.irr)}</td><td class="num">${pct(a.cagr)}</td><td class="num">${a.wealth.toFixed(2)}倍</td></tr>`;
    }).join('');
    q('cal-targets').innerHTML = [.08, .10, .12, .15, 5 ** .1 - 1, .20].map(rate => `<tr><th>${(rate * 100).toFixed(2)}%</th><td class="num">${num(calc.presentValue(calc.flows(model, 5), rate))} ${currency}</td><td class="num">${num(calc.presentValue(calc.flows(model, 10), rate))} ${currency}</td></tr>`).join('');
  }
  return { render, notices };
})();
