/* 投资分析中心 前端 —— 零依赖 */
'use strict';

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));

const state = {
  data: null, stockFilter: '全部', docCategory: '全部', docQuery: '',
  quotes: { time: null, map: {} }, currentTab: 'goals',
  editing: false, addSel: ''
};

/* ---------- 工具 ---------- */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtWan = v => v == null ? '—' : `${(v / 10000).toLocaleString('zh-CN', { maximumFractionDigits: 1 })}万`;
const fmtPct = (v, d = 1) => v == null ? '—' : `${(v * 100).toFixed(d)}%`;
const fmtNum = (v, d = 2) => v == null ? '—' : Number(v).toLocaleString('zh-CN', { maximumFractionDigits: d, minimumFractionDigits: d });

function irrClass(v) { if (v == null) return ''; if (v >= 0.15) return 'high'; if (v >= 0.10) return 'mid'; return 'low'; }
function badgeGrade(g) { return `<span class="badge grade-${esc(g) || 'X'}">${esc(g) || '—'}类</span>`; }
function badgeConclusion(c) {
  const map = { '通过': 'pass', '存疑': 'doubt', '不通过': 'fail', '中性不适用': 'neutral', '中性': 'neutral' };
  return `<span class="badge ${map[c] || 'neutral'}">${esc(c || '—')}</span>`;
}

/* ---------- 行情 ---------- */
function qtSym(sym) {
  if (!sym) return null;
  const m = String(sym).match(/(\d{5,6})\.(SH|SZ|HK)/i) || String(sym).match(/\b(\d{4})\.(HK)\b/i);
  if (!m) return null;
  const [, code, suf] = m, s = suf.toUpperCase();
  return s === 'HK' ? 'hk' + code.padStart(5, '0') : (s === 'SH' ? 'sh' : 'sz') + code;
}
function lookupSymbol(name) {
  const st = (state.data?.stocks || []).find(s => s.name === name && s.symbol);
  if (st) return st.symbol;
  const h = (state.data?.portfolio?.holdings || []).find(x => x.name === name && x.symbol);
  if (h) return h.symbol;
  const t = (state.data?.portfolio?.targetPortfolio || []).find(x => x.name === name && x.symbol);
  return t ? t.symbol : null;
}
function liveQuote(nameOrSymbol) {
  const sym = lookupSymbol(nameOrSymbol) || nameOrSymbol;
  const q = state.quotes.map[qtSym(sym)];
  return q || null;
}
async function refreshQuotes(silent) {
  if (!state.data) return;
  const btn = $('#quoteBtn');
  if (!silent) btn.textContent = '⟳ 获取中…';
  const syms = [...new Set([
    ...state.data.stocks.map(s => s.symbol).filter(Boolean),
    ...state.data.portfolio.holdings.map(h => h.symbol).filter(Boolean),
    ...state.data.portfolio.targetPortfolio.map(t => lookupSymbol(t.name)).filter(Boolean)
  ])].map(qtSym).filter(Boolean);
  try {
    const res = await fetch(`/api/quotes?symbols=${encodeURIComponent(syms.join(','))}`);
    const j = await res.json();
    state.quotes = { time: j.time, map: j.quotes || {} };
    const t = new Date(Number(j.time)).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    btn.textContent = `⟳ 行情 ${t}`;
    renderTab(state.currentTab);
  } catch (e) {
    btn.textContent = '⟳ 更新行情（失败，点击重试）';
  }
}
function livePriceHtml(name, fallbackPrice, currency) {
  const q = liveQuote(name);
  if (q) {
    const chg = q.changePct != null ? ` <span style="color:${q.changePct >= 0 ? 'var(--accent)' : 'var(--green)'}">${q.changePct >= 0 ? '+' : ''}${(q.changePct * 100).toFixed(2)}%</span>` : '';
    return `<span class="live-price">● ${fmtNum(q.price)}${chg}</span> <span class="price-src">实时</span>`;
  }
  return fallbackPrice != null ? `${fmtNum(fallbackPrice)} <span class="price-src">${esc(currency || '')}·文档时点</span>` : '—';
}

/* ---------- 迷你 Markdown 渲染 ---------- */
function inlineMd(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1');
}
function renderMd(md) {
  const lines = String(md || '').split('\n');
  const out = [];
  let inCode = false, listType = null, tableBuf = [];
  const flushList = () => { if (listType) { out.push(`</${listType}>`); listType = null; } };
  const flushTable = () => {
    if (!tableBuf.length) return;
    const rows = tableBuf.filter(r => !/^\s*\|?[\s:|-]+\|?\s*$/.test(r)).map(r =>
      r.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(c => c.trim()));
    if (rows.length) {
      out.push('<table><thead><tr>' + rows[0].map(h => `<th>${inlineMd(h)}</th>`).join('') + '</tr></thead><tbody>');
      for (let i = 1; i < rows.length; i++) out.push('<tr>' + rows[i].map(c => `<td>${inlineMd(c)}</td>`).join('') + '</tr>');
      out.push('</tbody></table>');
    }
    tableBuf = [];
  };
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (/^```/.test(line)) { flushList(); flushTable(); inCode = !inCode; out.push(inCode ? '<pre><code>' : '</code></pre>'); continue; }
    if (inCode) { out.push(esc(raw)); continue; }
    if (/^\s*\|/.test(line)) { flushList(); tableBuf.push(line); continue; }
    flushTable();
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { flushList(); out.push('<hr>'); continue; }
    const h = line.match(/^(#{1,4})\s+(.*)/);
    if (h) { flushList(); out.push(`<h${h[1].length}>${inlineMd(h[2])}</h${h[1].length}>`); continue; }
    if (/^\s*>\s?/.test(line)) { flushList(); out.push(`<blockquote>${inlineMd(line.replace(/^\s*>\s?/, ''))}</blockquote>`); continue; }
    const ul = line.match(/^\s*[-*]\s+(.*)/);
    if (ul) { if (listType !== 'ul') { flushList(); out.push('<ul>'); listType = 'ul'; } out.push(`<li>${inlineMd(ul[1])}</li>`); continue; }
    const ol = line.match(/^\s*\d+[.、]\s+(.*)/);
    if (ol) { if (listType !== 'ol') { flushList(); out.push('<ol>'); listType = 'ol'; } out.push(`<li>${inlineMd(ol[1])}</li>`); continue; }
    if (!line.trim()) { flushList(); continue; }
    flushList(); out.push(`<p>${inlineMd(line)}</p>`);
  }
  flushList(); flushTable();
  if (inCode) out.push('</code></pre>');
  return out.join('\n');
}

/* ---------- 弹层 ---------- */
function openModal(html) { $('#modalBody').innerHTML = html; $('#modalMask').classList.add('open'); document.body.style.overflow = 'hidden'; }
function closeModal() { $('#modalMask').classList.remove('open'); document.body.style.overflow = ''; }
$('#modalClose').addEventListener('click', closeModal);
$('#modalMask').addEventListener('click', e => { if (e.target === $('#modalMask')) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

/* ================= 目标总览 ================= */
function renderGoals() {
  const el = $('#tab-goals');
  const g = state.data.goals, pf = state.data.portfolio, dm = state.data.decisionMetrics;
  const totalDiv = dm.targetDividend;
  const baseReturn = dm.weightedReturn;
  const baseFive = dm.fiveYearMultiple;
  const baseTen = dm.tenYearMultiple;
  const alertClass = severity => severity === 'red' ? 'risk-red' : severity === 'amber' ? 'risk-amber' : 'risk-green';

  el.innerHTML = `
  <div class="card decision-cockpit">
    <h2>目标决策驾驶舱 <span class="tag">由股票报告与目标仓位自动计算，不再使用写死结论</span></h2>
    <div class="stat-row" style="margin-top:12px">
      <div class="stat"><div class="s-label">目标组合基准年化</div><div class="s-value ${baseReturn >= dm.required5 ? 'green' : 'red'}">${fmtPct(baseReturn, 2)}</div></div>
      <div class="stat"><div class="s-label">5年目标 / 当前路径</div><div class="s-value">2.00 / ${baseFive.toFixed(2)}倍</div></div>
      <div class="stat"><div class="s-label">10年目标 / 当前路径</div><div class="s-value">5.00 / ${baseTen.toFixed(2)}倍</div></div>
      <div class="stat"><div class="s-label">10年年化缺口</div><div class="s-value red">${fmtPct(dm.required10 - baseReturn, 2)}</div></div>
      <div class="stat"><div class="s-label">当前年税后股息</div><div class="s-value">${fmtWan(dm.currentDividend)}</div></div>
      <div class="stat"><div class="s-label">首轮交易后年税后股息</div><div class="s-value blue">${fmtWan(dm.postInitialDividend)}</div></div>
      <div class="stat"><div class="s-label">满目标仓年税后股息</div><div class="s-value green">${fmtWan(dm.targetDividend)}+</div></div>
    </div>
    <div class="goal-bridge">
      <span><b>当前报告时点</b>${fmtPct(baseReturn, 2)} → 10年${baseTen.toFixed(2)}倍</span>
      <span><b>全部按P15买入</b>15.00% → 10年4.05倍</span>
      <span><b>全部按P17.46买入</b>17.46% → 10年5.00倍</span>
    </div>
    <div class="honest" style="margin-top:12px"><b>核心判断：</b>当前组合质量可以，但当前报告价格下没有任何一只股票达到5年翻倍所需的14.87%基准回报。目标仓位是“最终上限”，不是现在必须买满的指令；硬目标只能靠更低买价、盈利超预期或新增真正高回报标的实现。</div>
  </div>

  <div class="section-title">系统预警</div>
  <div class="risk-grid">${dm.alerts.map(a => `<div class="risk-card ${alertClass(a.severity)}"><b>${esc(a.title)}</b><span>${esc(a.detail)}</span></div>`).join('')}</div>

  <div class="goal-cards">
    ${g.targets.map(t => `
    <div class="goal-card ${t.id === 'double5' ? 'g-accent' : t.id === 'dividend1m' ? 'g-green' : ''}">
      <div class="g-name">${esc(t.name)}</div>
      <div class="g-value">${t.targetValue ? fmtWan(t.targetValue) : '100万/年'}</div>
      <div class="g-req">${t.requiredAnnualReturn ? `需年化总回报 <b>${fmtPct(t.requiredAnnualReturn, 2)}</b>` : '需总资产先行增长'}</div>
      <div class="g-status">${esc(t.status)}</div>
      <div class="g-note">${esc(t.note)}</div>
    </div>`).join('')}
  </div>

  <div class="card">
    <h2>十年路线 <span class="tag">本金1000万 · ${esc(g.asOf)}</span></h2>
    <div class="card-sub">最新90%股票＋10%机会现金组合（基准年化约${fmtPct(baseReturn, 2)}）与目标所需回报的差距</div>
    <div class="timeline">
      <div class="timeline-bar">
        ${g.timeline.map((t, i) => `
        <div class="tl-marker" style="left:${[2, 52, 98][i]}%">
          <div class="tl-date">${esc(t.date)}</div><div class="tl-dot"></div>
        </div>`).join('')}
      </div>
      <div style="display:flex;justify-content:space-between;font-size:12.5px;color:var(--ink-2);margin-top:-22px">
        ${g.timeline.map(t => `<div style="max-width:31%">${esc(t.event)}</div>`).join('')}
      </div>
    </div>
    <div class="stat-row" style="margin-top:18px">
      <div class="stat"><div class="s-label">当前总资产</div><div class="s-value">${fmtWan(pf.totalAssets)}</div></div>
      <div class="stat"><div class="s-label">其中持仓市值</div><div class="s-value blue">${fmtWan(pf.stockMarketValue)}</div></div>
      <div class="stat"><div class="s-label">待部署现金</div><div class="s-value green">${fmtWan(pf.cash)}</div></div>
      <div class="stat"><div class="s-label">组合基准年化</div><div class="s-value">${fmtPct(baseReturn)}</div></div>
      <div class="stat"><div class="s-label">乐观情景年化</div><div class="s-value blue">${fmtPct(g.portfolioReturnScenarios.optimistic.annualReturn)}</div></div>
      <div class="stat"><div class="s-label">基准10年终值</div><div class="s-value">${fmtWan(pf.totalAssets * baseTen)}</div></div>
      <div class="stat"><div class="s-label">乐观10年终值</div><div class="s-value blue">${fmtWan(pf.totalAssets * g.portfolioReturnScenarios.optimistic.tenYearMultiple)}</div></div>
    </div>
  </div>

  <div class="grid-2">
    <div class="card">
      <h2>诚实结论 <span class="tag">来自文档推演，非收益承诺</span></h2>
      <div class="honest" style="margin-top:10px"><b>${esc(g.honestRestatement.conclusion)}</b></div>
      <p style="font-size:13.5px;margin:12px 0;color:var(--ink-2)">${esc(g.honestRestatement.quantification)}</p>
      <table>
        <thead><tr><th>情景</th><th class="num">年化</th><th class="num">5年</th><th class="num">10年</th></tr></thead>
        <tbody>
          <tr><td>目标要求</td><td class="num">14.87% / 17.46%</td><td class="num">2.00倍</td><td class="num">5.00倍</td></tr>
          <tr><td>组合基准（自动加权）</td><td class="num">${fmtPct(baseReturn)}</td><td class="num">${baseFive.toFixed(2)}倍</td><td class="num">${baseTen.toFixed(2)}倍</td></tr>
          <tr><td>组合乐观</td><td class="num">${fmtPct(g.portfolioReturnScenarios.optimistic.annualReturn)}</td><td class="num">${g.portfolioReturnScenarios.optimistic.fiveYearMultiple}倍</td><td class="num">${g.portfolioReturnScenarios.optimistic.tenYearMultiple}倍</td></tr>
          <tr><td>组合压力</td><td class="num">${fmtPct(g.portfolioReturnScenarios.pressure.annualReturn)}</td><td class="num">${g.portfolioReturnScenarios.pressure.fiveYearMultiple}倍</td><td class="num">${g.portfolioReturnScenarios.pressure.tenYearMultiple}倍</td></tr>
        </tbody>
      </table>
    </div>
    <div class="card">
      <h2>股息路线 <span class="tag">按目标仓位满仓估算 · 随「持仓与建仓」中的目标配置联动</span></h2>
      <div class="stat-row" style="margin-bottom:14px">
        <div class="stat"><div class="s-label">当前年税后股息</div><div class="s-value">${fmtWan(dm.currentDividend)}</div></div>
        <div class="stat"><div class="s-label">首轮交易后</div><div class="s-value blue">${fmtWan(dm.postInitialDividend)}</div></div>
        <div class="stat"><div class="s-label">满目标仓年税后股息</div><div class="s-value green">${fmtWan(totalDiv)}+</div></div>
        <div class="stat"><div class="s-label">目标</div><div class="s-value">100万/年</div></div>
        <div class="stat"><div class="s-label">满仓后缺口</div><div class="s-value red">${fmtWan(dm.dividendGap)}</div></div>
      </div>
      <div class="progress" title="当前估算 vs 目标"><div class="${totalDiv / 1000000 >= 0.5 ? 'good' : totalDiv / 1000000 >= 0.25 ? 'warn' : ''}" style="width:${Math.min(100, totalDiv / 10000).toFixed(1)}%"></div></div>
      <div class="note">达成路径：按终态税后股息率${fmtPct(pf.currentDividendBaseline.terminalYield, 2)}测算，年股息100万元需资产约${(pf.currentDividendBaseline.assetsNeeded / 10000).toFixed(0)}万元；正常安全线按120万元股息约需${(pf.currentDividendBaseline.assetsNeeded * 1.2 / 10000).toFixed(0)}万元。</div>
      <p style="font-size:13.5px;margin-top:12px;color:var(--ink-2)">${esc(g.honestRestatement.dividendPath)}</p>
      <table style="margin-top:8px">
        <thead><tr><th>公司</th><th class="num">目标仓位</th><th class="num">税后股息率</th><th class="num">年税后股息</th></tr></thead>
        <tbody>${pf.dividends.perStock.map(d => `
          <tr><td>${esc(d.name)}</td><td class="num">${fmtWan(d.targetValue)}</td><td class="num">${d.afterTaxYield != null ? fmtPct(d.afterTaxYield, 2) : '待补充'}</td><td class="num">${d.afterTaxYield != null ? fmtWan(d.targetValue * d.afterTaxYield) : '—'}</td></tr>`).join('')}
        </tbody>
      </table>
      ${pf.dividends.missingNote ? `<div class="note" style="color:var(--amber)">${esc(pf.dividends.missingNote)}</div>` : ''}
      <div class="note">${esc(pf.dividends.note || '')}</div>
    </div>
  </div>`;
}

/* ================= 持仓与建仓 ================= */
function tierRange(priceStr) {
  const s = String(priceStr);
  const nums = s.match(/[\d.]+/g);
  if (!nums || !nums.length) return null;
  const v = nums.map(Number);
  if (/^[≤<]/.test(s.trim())) return { min: -Infinity, max: v[0] };
  return { min: Math.min(...v), max: Math.max(...v), first: v[0] };
}

function renderPortfolio() {
  const el = $('#tab-portfolio');
  const pf = state.data.portfolio, ev = state.data.portfolioEvolution;
  const dm = state.data.decisionMetrics;
  const decisionByName = new Map((state.data.decisionMetrics?.targetRows || []).map(r => [r.name, r]));
  const heldByName = {};
  pf.holdings.forEach(h => heldByName[h.name] = h);
  const total = pf.totalAssets;

  /* ---- 目标配置（可编辑） ---- */
  const tp = pf.targetPortfolio;
  const sumW = tp.reduce((s, t) => s + t.weight, 0);
  const cashTarget = pf.opportunityCash || { weight: Math.max(0, 1 - sumW), targetValue: Math.max(0, total * (1 - sumW)), role: '机会预备' };
  const stockTargetWeight = 1 - cashTarget.weight;
  const availableStocks = state.data.stocks.filter(s => !s.autoParsed !== false && !tp.some(t => t.name === s.name));
  let targetRows;
  if (state.editing) {
    targetRows = tp.map((t, i) => {
      const held = heldByName[t.name];
      const cur = held ? held.marketValue : 0;
      return `<tr>
        <td><b>${esc(t.name)}</b></td>
        <td style="min-width:150px"><input type="text" data-i="${i}" class="edit-input" data-f="role" value="${esc(t.role)}" style="width:100%"></td>
        <td class="num">${fmtPct(t.weight, 1)}</td>
        <td class="num"><input type="number" data-i="${i}" class="edit-input num" data-f="targetValue" value="${Math.round(t.targetValue / 10000)}" min="0" step="5" style="width:80px"> 万</td>
        <td class="num">${cur ? fmtWan(cur) : '0'}</td>
        <td class="num">${fmtPct(cur / total, 1)}</td>
        <td class="num">${fmtWan(Math.max(0, t.targetValue - cur))}</td>
        <td><button class="del-btn" data-del="${esc(t.name)}" title="从目标组合删除">✕</button></td>
      </tr>`;
    }).join('');
  } else {
    targetRows = tp.map(t => {
      const held = heldByName[t.name];
      const cur = held ? held.marketValue : 0;
      const pct = cur / total;
      const decision = decisionByName.get(t.name);
      return `<tr>
      <td><b>${esc(t.name)}</b><div style="margin-top:4px">${decision ? badgeGrade(decision.grade) + ` <span class="chip">${esc(decision.returnLabel)}</span>` : ''}</div></td>
      <td>${esc(t.role)}</td>
      <td class="num" style="color:${decision?.limitBreach ? 'var(--accent)' : 'inherit'}"><b>${fmtPct(t.weight, 0)}</b>${decision ? `<div style="font-size:11px">报告上限 ${fmtPct(decision.effectiveHardLimit, 0)}${decision.limitBreach ? ' · 越限' : ''}</div>` : ''}</td>
      <td class="num">${fmtWan(t.targetValue)}</td>
      <td class="num">${cur ? fmtWan(cur) : '0'}</td>
      <td class="num">${fmtPct(pct, 1)}</td>
      <td style="min-width:130px"><div class="progress"><div class="${pct / t.weight >= 0.6 ? 'good' : pct / t.weight >= 0.3 ? 'warn' : ''}" style="width:${Math.min(100, pct / t.weight * 100).toFixed(1)}%"></div></div></td>
      <td class="num">${fmtWan(Math.max(0, t.targetValue - cur))}</td>
      </tr>`;
    }).join('');
  }
  const editBar = state.editing ? `
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:12px">
      <select id="addStockSel" class="edit-input" style="min-width:180px">
        <option value="">＋ 从研究库选择股票加入目标…</option>
        ${availableStocks.map(s => `<option value="${esc(s.name)}">${esc(s.name)}（${esc(s.grade || '?')}类）</option>`).join('')}
      </select>
      <input type="text" id="addCustomName" class="edit-input" placeholder="或输入自定义名称" style="width:160px">
      <button class="btn primary" id="savePortfolio">保存目标配置</button>
      <button class="btn" id="cancelEdit">取消</button>
      <span class="note" style="margin:0">股票权重合计 <b style="color:${Math.abs(sumW - stockTargetWeight) < 0.005 ? 'var(--green)' : 'var(--accent)'}">${fmtPct(sumW, 1)}</b> / 目标${fmtPct(stockTargetWeight, 0)}；另留${fmtPct(cashTarget.weight, 0)}机会现金</span>
    </div>` : `
    <div style="margin-top:12px"><button class="btn" id="startEdit">✎ 编辑目标配置（增删股票 / 调整目标金额）</button></div>`;

  /* ---- 持仓表 ---- */
  const holdingRows = pf.holdings.map(h => {
    const target = tp.find(t => t.name === h.name);
    const tw = target ? target.weight : 0;
    const q = liveQuote(h.name);
    return `<tr>
      <td><b>${esc(h.name)}</b><div style="font-size:11px;color:var(--ink-3)">${esc(h.symbol)}</div></td>
      <td class="num">${h.quantity.toLocaleString()}</td>
      <td class="num">${fmtNum(h.costPrice)} ${h.currency === 'HKD' ? '港元' : '元'}</td>
      <td class="num">${fmtNum(h.priceAtSnapshot)}</td>
      <td class="num">${q ? `<b style="color:var(--blue)">${fmtNum(q.price)}</b>${q.changePct != null ? `<br><span style="font-size:11px;color:${q.changePct >= 0 ? 'var(--accent)' : 'var(--green)'}">${q.changePct >= 0 ? '+' : ''}${(q.changePct * 100).toFixed(2)}%</span>` : ''}` : '—'}</td>
      <td class="num">${fmtWan(h.marketValue)}</td>
      <td class="num">${fmtPct(h.marketValue / total, 1)}</td>
      <td class="num">${tw ? fmtPct(tw, 0) : '—'}</td>
      <td>${esc(h.role)}</td>
    </tr>`;
  }).join('');

  /* ---- 建仓阶梯（含当前价与档位高亮） ---- */
  const ladders = pf.ladderPlans.map(p => {
    const q = liveQuote(p.name);
    const cur = q ? q.price : null;
    const tiers = p.tiers.map(t => {
      const r = tierRange(t.price);
      const active = cur != null && r && cur >= r.min && cur <= r.max;
      return `<tr class="${active ? 'tier-active' : ''}"><td><b>${esc(t.price)}</b>${active ? ' <span class="badge pass">当前档位</span>' : ''}</td><td>${esc(t.action)}</td><td class="num">${fmtWan(t.cumulative)}</td></tr>`;
    }).join('');
    return `
    <div class="card">
      <h2>${esc(p.name)} <span class="tag">目标 ${esc(p.target)} · ${esc(p.currency)}</span>
        <span class="tag" style="font-size:12.5px;color:var(--ink-2)">最新：${livePriceHtml(p.name, null, p.currency)}</span></h2>
      ${p.gate ? `<div class="honest" style="margin:8px 0;font-size:13px"><b>闸门：</b>${esc(p.gate)}</div>` : ''}
      <table>
        <thead><tr><th>触发价（${esc(p.currency)}）</th><th>动作</th><th class="num">累计市值上限</th></tr></thead>
        <tbody>${tiers}</tbody>
      </table>
      ${p.special ? `<div class="note">特殊规则：${esc(p.special)}</div>` : ''}
      <div class="note" style="color:var(--accent)">取消条件：${esc(p.cancel)}</div>
    </div>`;
  }).join('');

  const candidates = pf.candidates.map(c => {
    const q = liveQuote(c.name);
    return `
    <div class="card">
      <h2>${esc(c.name)} <span class="tag">最高目标 ${esc(c.maxTarget)}</span>
        <span class="tag" style="font-size:12.5px;color:var(--ink-2)">最新：${q ? `<span class="live-price">● ${fmtNum(q.price)}${q.changePct != null ? ` <span style="color:${q.changePct >= 0 ? 'var(--accent)' : 'var(--green)'}">${q.changePct >= 0 ? '+' : ''}${(q.changePct * 100).toFixed(2)}%</span>` : ''}</span>` : '—'}</span></h2>
      <div style="font-size:13px;color:var(--ink-2);margin:6px 0 10px">${esc(c.competes)}</div>
      ${c.gate ? `<div class="honest" style="margin:8px 0;font-size:13px"><b>闸门：</b>${esc(c.gate)}</div>` : ''}
      <table>
        <thead><tr><th>价格</th><th>金额与动作</th></tr></thead>
        <tbody>${c.tiers.map(t => `<tr><td><b>${esc(t.price)}</b></td><td>${esc(t.amount)}</td></tr>`).join('')}</tbody>
      </table>
      <div class="note" style="color:var(--accent)">取消条件：${esc(c.cancel)}</div>
    </div>`;
  }).join('');

  const watchlist = (pf.watchlist || []).map(w => `
    <div class="card">
      <h2>${esc(w.name)} <span class="tag">观察池</span></h2>
      <div style="font-size:13.5px;color:var(--ink-2);margin:6px 0 10px">${esc(w.status)}</div>
      <h3 style="font-size:13.5px;margin-bottom:6px">重返组合的条件（须同时满足）</h3>
      <ul class="check-list">${(w.reentryConditions || []).map(c => `<li>${esc(c)}</li>`).join('')}</ul>
      <div class="note">${esc(w.note || '')}</div>
    </div>`).join('');

  const timeline = ev ? ev.timeline.map(t => `
    <li><b>${esc(t.date)}</b> · ${esc(t.title)}<div style="color:var(--ink-2);font-size:13px">${esc(t.detail)}</div>
    <div style="font-size:11.5px;color:var(--ink-3)">来源：${esc(t.source)}</div></li>`).join('') : '';

  const unresolved = ev && ev.unresolved.length ? `
    <div class="card"><h2>待确认事项</h2><ul class="check-list" style="margin-top:8px">${ev.unresolved.map(u => `<li class="no">${esc(u)}</li>`).join('')}</ul></div>` : '';

  const executionRows = (pf.executionPlan?.rows || []).map(r => `<tr>
    <td><b>${esc(r.day)}</b></td><td><span class="badge ${r.side === '买入' ? 'pass' : 'doubt'}">${esc(r.side)}</span></td>
    <td><b>${esc(r.name)}</b></td><td class="num">${Number(r.quantity).toLocaleString()}</td><td class="num">${esc(r.limit)}</td>
    <td class="num">${fmtWan(r.estimatedCny)}</td><td>${esc(r.condition)}</td>
  </tr>`).join('');
  const deploymentRows = (pf.deploymentClock?.rows || []).map(r => `<tr>
    <td><b>${esc(r.stage)}</b></td>
    <td class="num">${r.stockWeight != null ? fmtPct(r.stockWeight, 1) : esc(r.stockWeightRange)}</td>
    <td class="num">${r.cashWeight != null ? fmtPct(r.cashWeight, 1) : esc(r.cashWeightRange)}</td>
    <td>${esc(r.action)}</td>
  </tr>`).join('');

  el.innerHTML = `
  <div class="card">
    <h2>当前持仓 <span class="tag">券商截图 ${esc(pf.snapshotDate)} · 总资产${fmtWan(total)} · 最新价来自行情按钮</span></h2>
    <div class="card-sub">${esc(pf.source)} · ${esc(pf.fxNote)}</div>
    <div class="table-scroll"><table>
      <thead><tr><th>公司</th><th class="num">持股数</th><th class="num">成本价</th><th class="num">截图价</th><th class="num">最新价</th><th class="num">市值</th><th class="num">占总资产</th><th class="num">目标权重</th><th>角色</th></tr></thead>
      <tbody>${holdingRows}</tbody>
    </table></div>
  </div>

  <div class="grid-2">
    <div class="card">
      <h2>首次建仓执行清单 <span class="tag">${esc(pf.executionPlan?.status || '')} · ${esc(pf.executionPlan?.tagline || '按最新执行卡分批')}</span></h2>
      <div class="table-scroll"><table>
        <thead><tr><th>时点</th><th>方向</th><th>公司</th><th class="num">数量</th><th class="num">限价</th><th class="num">估算人民币</th><th>条件</th></tr></thead>
        <tbody>${executionRows}</tbody>
      </table></div>
      <div class="stat-row" style="margin-top:12px">
        <div class="stat"><div class="s-label">预计买入</div><div class="s-value">${fmtWan(pf.executionPlan?.expectedBuyTotal)}</div></div>
        <div class="stat"><div class="s-label">净用现金</div><div class="s-value">${fmtWan(pf.executionPlan?.expectedNetCashUse)}</div></div>
        <div class="stat"><div class="s-label">完成后股票仓位</div><div class="s-value blue">${fmtPct(pf.executionPlan?.postStockWeight, 2)}</div></div>
      </div>
    </div>
    <div class="card">
      <h2>两年部署时钟 <span class="tag">防长期空仓，不是强制追价</span></h2>
      <table><thead><tr><th>阶段</th><th class="num">股票</th><th class="num">现金</th><th>动作</th></tr></thead><tbody>${deploymentRows}</tbody></table>
      <div class="note">${esc(pf.deploymentClock?.note || '')}</div>
    </div>
  </div>

  <div class="card">
    <h2>目标配置 vs 当前 <span class="tag">90%股票＋10%机会现金；目标仓位是上限，不是立即买满指令</span></h2>
    <div class="table-scroll"><table>
      <thead><tr><th>公司</th><th>定位</th><th class="num">目标权重</th><th class="num">目标市值</th><th class="num">当前市值</th><th class="num">当前占比</th>${state.editing ? '<th class="num">尚需投入</th><th></th>' : '<th>进度</th><th class="num">尚需投入</th>'}</tr></thead>
      <tbody>${targetRows}</tbody>
    </table></div>
    ${editBar}
    <div class="note"><b>非目标持仓处理计划：</b>${pf.exitPlan.map(e => `${esc(e.name)}（${fmtWan(e.marketValue)}）${esc(e.status)}`).join('；')}。</div>
  </div>

  <div class="card">
    <h2>目标组合风险约束校验 <span class="tag">目标组合本身是唯一执行口径</span></h2>
    <div class="card-sub">逐项校验目标权重是否超过公司分析给出的硬上限；机会现金为明确的10%目标，不再由超限仓位倒算。</div>
    <div class="table-scroll"><table>
      <thead><tr><th>公司</th><th>质量 / 回报</th><th class="num">目标权重</th><th class="num">校验后上限</th><th class="num">校验后金额</th><th>校验结果</th></tr></thead>
      <tbody>${dm.compliantRows.map(r => `<tr>
        <td><b>${esc(r.name)}</b></td><td>${badgeGrade(r.grade)} <span class="chip">${esc(r.returnLabel)}</span></td>
        <td class="num">${fmtPct(r.weight, 0)}</td><td class="num"><b>${fmtPct(r.recommendedWeight, 0)}</b></td><td class="num">${fmtWan(r.recommendedValue)}</td>
        <td>${r.weight > r.recommendedWeight ? `目标越限，需压降${fmtPct(r.weight - r.recommendedWeight, 0)}` : '目标未超过报告硬上限'}</td>
      </tr>`).join('')}
      <tr><td><b>机会现金</b></td><td><span class="chip">永久组合流动性</span></td><td class="num">${fmtPct(cashTarget.weight, 0)}</td><td class="num"><b>${fmtPct(cashTarget.weight, 0)}</b></td><td class="num">${fmtWan(cashTarget.targetValue)}</td><td>${esc(cashTarget.role)}</td></tr>
      </tbody>
    </table></div>
    <div class="honest" style="margin-top:12px"><b>不能自我欺骗：</b>若仅靠10%机会现金填补10年5倍的全部缺口，这部分需要年化约${fmtPct(dm.reserveRequiredReturn, 1)}，并不现实。真正可行的是更低买价、盈利兑现、股息复投和长期迭代，而不是把风险集中到单一公司。</div>
  </div>

  <div class="section-title">建仓阶梯（价格档是触发器，累计市值才是仓位上限）</div>
  <div class="note" style="margin:-6px 0 12px">执行阶梯以2026-08-30总账户执行总表为准；研究库的P10—P17.46价格用于估值复核。两者冲突时暂停交易，先用最新财报重算，不自行选更宽松口径。</div>
  <div class="grid-2">${ladders}</div>

  <div class="section-title">候选股交易卡（研究与交易分离，到价只查取消条件）</div>
  <div class="grid-2">${candidates}</div>

  ${watchlist ? `<div class="section-title">观察池</div><div class="grid-2">${watchlist}</div>` : ''}

  <div class="grid-2" style="margin-top:18px">
    <div class="card">
      <h2>组合决策演变</h2>
      ${timeline ? `<ul class="check-list" style="margin-top:8px">${timeline}</ul>` : '<div class="empty">加载中…</div>'}
    </div>
    <div>
      ${unresolved}
      <div class="card">
        <h2>必须执行的纪律</h2>
        <ul class="check-list" style="margin-top:8px">${pf.disciplines.map(d => `<li>${esc(d)}</li>`).join('')}</ul>
        <h3 style="font-size:14px;margin:16px 0 6px">价格到档时的标准操作</h3>
        <ol style="padding-left:20px;font-size:13.5px">${pf.standardOps.map(o => `<li style="margin-bottom:4px">${esc(o)}</li>`).join('')}</ol>
        <div class="note">${esc(pf.dailyLimit)}</div>
      </div>
    </div>
  </div>`;

  if (state.editing) {
    $('#cancelEdit').addEventListener('click', () => { state.editing = false; renderPortfolio(); });
    $$('.del-btn', el).forEach(b => b.addEventListener('click', () => {
      const name = b.dataset.del;
      if (!confirm(`从目标组合删除「${name}」？（不影响实际持仓与研究库）`)) return;
      pf.targetPortfolio = pf.targetPortfolio.filter(t => t.name !== name);
      renderPortfolio();
    }));
    $('#addStockSel').addEventListener('change', e => {
      const v = e.target.value; if (!v) return;
      const s = state.data.stocks.find(x => x.name === v);
      pf.targetPortfolio.push({ name: v, weight: 0, targetValue: 0, role: s?.position?.role || '自定义目标仓', pendingInvest: 0 });
      renderPortfolio();
    });
    $('#savePortfolio').addEventListener('click', async () => {
      const inputs = $$('.edit-input[data-f]', el);
      inputs.forEach(inp => {
        const i = Number(inp.dataset.i), f = inp.dataset.f;
        if (f === 'role') pf.targetPortfolio[i].role = inp.value.trim();
        if (f === 'targetValue') pf.targetPortfolio[i].targetValue = Number(inp.value) * 10000 || 0;
      });
      pf.targetPortfolio.forEach(t => {
        t.weight = t.targetValue / total;
        const held = heldByName[t.name];
        t.pendingInvest = Math.max(0, t.targetValue - (held ? held.marketValue : 0));
      });
      const sum = pf.targetPortfolio.reduce((s, t) => s + t.weight, 0);
      if (sum > stockTargetWeight + 0.002) return alert(`股票目标权重合计 ${(sum * 100).toFixed(1)}% 超过允许的 ${(stockTargetWeight * 100).toFixed(1)}%，需保留 ${(cashTarget.weight * 100).toFixed(0)}% 机会现金`);
      const btn = $('#savePortfolio'); btn.textContent = '保存中…'; btn.disabled = true;
      try {
        const res = await fetch('/api/portfolio', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ targetPortfolio: pf.targetPortfolio }) });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error || '保存失败');
        state.data.portfolio = j.portfolio;
        state.editing = false;
        renderPortfolio(); renderGoals();
      } catch (e) { alert('保存失败：' + e.message); btn.textContent = '保存目标配置'; btn.disabled = false; }
    });
  } else {
    $('#startEdit').addEventListener('click', () => { state.editing = true; renderPortfolio(); });
  }
}

/* ================= 研究库 ================= */
function priceBarHtml(s) {
  const p = s.prices || {};
  const { P10, P12, P15, P17 } = p;
  if (![P10, P12, P15, P17].some(v => v != null)) return '';
  const q = liveQuote(s.name);
  const cur = q ? q.price : s.currentPrice;
  const lo = Math.min(...[P10, P12, P15, P17].filter(v => v != null));
  const hi = Math.max(...[P10, P12, P15, P17].filter(v => v != null));
  const pos = v => hi === lo ? 50 : Math.max(2, Math.min(98, (v - lo) / (hi - lo) * 100));
  const markers = [['P17', P17, '#b03a2e'], ['P15', P15, '#9a6b0f'], ['P12', P12, '#1f5f8b'], ['P10', P10, '#8b95a7']]
    .filter(([, v]) => v != null);
  const curPos = cur != null ? pos(cur) : null;
  const status = cur != null && P17 != null && cur <= P17 ? ' <span class="badge pass">≤目标达成价</span>' : '';
  return `
  <div class="sc-pricebar">
    <div class="labels"><span>便宜 ${esc(p.currency || '')}</span><span>贵</span></div>
    <div style="position:relative;height:44px">
      <div class="progress" style="height:6px;margin-top:22px"></div>
      ${markers.map(([n, v, c]) => `<div style="position:absolute;left:${pos(v)}%;top:0;transform:translateX(-50%);font-size:10.5px;color:${c};font-weight:700;text-align:center;white-space:nowrap">${n}<div style="width:2px;height:8px;background:${c};margin:1px auto 2px"></div>${fmtNum(v, v >= 100 ? 0 : 1)}</div>`).join('')}
      ${curPos != null ? `<div style="position:absolute;left:${curPos}%;top:26px;transform:translateX(-50%);font-size:10.5px;font-weight:700;color:var(--ink);text-align:center;white-space:nowrap">▼现价 ${fmtNum(cur, cur >= 100 ? 0 : 1)}${q ? ' <span style="color:var(--blue)">·实时</span>' : ''}</div>` : ''}
    </div>
    <div class="labels" style="justify-content:flex-end;margin-top:0">${status}</div>
  </div>`;
}

function executionAction(s, current, calibration) {
  if (!Number.isFinite(current)) return '先更新行情';
  if (Number.isFinite(calibration) && current <= calibration) return '已到人工校准点：先查财报与取消条件';
  if (s.prices?.P17 != null && current <= s.prices.P17) return 'P17.46：可达目标仓上限';
  if (s.prices?.P15 != null && current <= s.prices.P15) return 'P15：可建至目标仓60%';
  if (s.prices?.P12 != null && current <= s.prices.P12) return 'P12：可首次建仓25%';
  if (s.prices?.P10 != null && current <= s.prices.P10) return 'P10：只适合持有，不急于新增';
  return '未到系统买点，继续等待';
}

function researchExecutionTable(stocks) {
  const calibrations = state.data.portfolio.manualCalibrations || {};
  return `<div class="card execution-table-card">
    <h2>股票池执行价格总表 <span class="tag">系统价格来自报告；“校准买入点”由你维护并保存到本机</span></h2>
    <div class="table-scroll"><table>
      <thead><tr><th>公司</th><th>质量 / 回报</th><th class="num">现价</th><th class="num">P12</th><th class="num">P15</th><th class="num">P17.46</th><th class="num">校准买入点</th><th>当前动作</th></tr></thead>
      <tbody>${stocks.map(s => {
        const q = liveQuote(s.name), current = q ? q.price : Number(s.currentPrice);
        const calibration = Number(calibrations[s.key]);
        return `<tr>
          <td><b>${esc(s.name)}</b><div style="font-size:11px;color:var(--ink-3)">${esc(s.symbol || '')}</div></td>
          <td>${badgeGrade(s.grade)} <span class="chip">${esc(s.gradeLabel)}</span><div style="font-size:11px;margin-top:4px">基准IRR ${fmtPct(s.scenarios?.base?.irr10y, 1)}</div></td>
          <td class="num">${Number.isFinite(current) ? fmtNum(current) : '—'}${q ? '<div class="price-src">实时</div>' : ''}</td>
          <td class="num">${s.prices?.P12 != null ? fmtNum(s.prices.P12) : '—'}</td>
          <td class="num">${s.prices?.P15 != null ? fmtNum(s.prices.P15) : '—'}</td>
          <td class="num">${s.prices?.P17 != null ? fmtNum(s.prices.P17) : '—'}</td>
          <td class="num"><input class="calibration-input" data-key="${esc(s.key)}" type="number" min="0" step="0.01" value="${Number.isFinite(calibration) ? calibration : ''}" placeholder="人工维护"></td>
          <td class="execution-action">${esc(executionAction(s, current, calibration))}</td>
        </tr>`;
      }).join('')}</tbody>
    </table></div>
    <div class="note" id="calibrationStatus">修改后按回车或移开输入框自动保存。人工校准点只覆盖你的执行提醒，不会篡改报告P12/P15/P17。</div>
  </div>`;
}

function renderResearch() {
  const el = $('#tab-research');
  const stocks = state.data.stocks || [];
  const grades = ['全部', 'A', 'B', 'C', 'D'];
  const counts = {}; grades.forEach(gd => counts[gd] = gd === '全部' ? stocks.length : stocks.filter(s => s.grade === gd).length);

  const list = stocks.filter(s => state.stockFilter === '全部' || s.grade === state.stockFilter);
  el.innerHTML = `
  <div class="card" style="padding:16px 20px">
    <div class="filter-bar" style="margin-bottom:0">
      ${grades.map(gd => `<button data-g="${gd}" class="${state.stockFilter === gd ? 'active' : ''}">${gd === '全部' ? '全部' : gd + '类'} (${counts[gd] || 0})</button>`).join('')}
      <span style="flex:1"></span>
      <span style="font-size:12.5px;color:var(--ink-3)">点击卡片查看完整两步法分析 · IRR为10年基准情景 · 价格标尺含实时价（点「更新行情」刷新）</span>
    </div>
  </div>
  ${researchExecutionTable(list)}
  <div class="stock-grid">${list.map(s => `
    <div class="stock-card" data-key="${esc(s.key)}">
      <div class="sc-head">
        <div>
          <div class="sc-name">${esc(s.name)} ${s.autoParsed ? '<span class="badge doubt">自动解析</span>' : ''}</div>
          <div class="sc-meta">${esc(s.symbol || '')} · ${esc(s.market || '')} · 分析于 ${esc(s.analysisDate)}</div>
          <div style="margin-top:6px">${badgeGrade(s.grade)} <span class="chip">${esc(s.gradeLabel || '未定标签')}</span></div>
        </div>
        <div class="sc-irr">
          <div class="v ${irrClass(s.scenarios?.base?.irr10y)}">${s.scenarios?.base?.irr10y != null ? fmtPct(s.scenarios.base.irr10y, 1) : '—'}</div>
          <div class="l">基准10年IRR</div>
        </div>
      </div>
      <div class="sc-type">${esc(s.companyType || '')} · ${livePriceHtml(s.name, s.currentPrice, s.prices?.currency)}</div>
      ${priceBarHtml(s)}
      <div class="sc-footer">
        ${s.position?.role ? `<span class="chip">角色：${esc(s.position.role)}</span>` : ''}
        ${s.moutaiReturn?.verdict ? `<span class="chip">vs茅台：${esc(s.moutaiReturn.verdict)}</span>` : ''}
      </div>
    </div>`).join('') || '<div class="empty card">暂无数据</div>'}
  </div>`;

  $$('.filter-bar button[data-g]', el).forEach(b => b.addEventListener('click', () => {
    state.stockFilter = b.dataset.g; renderResearch();
  }));
  $$('.calibration-input', el).forEach(input => {
    input.addEventListener('click', e => e.stopPropagation());
    input.addEventListener('change', async e => {
      const key = e.target.dataset.key;
      const value = e.target.value.trim();
      const status = $('#calibrationStatus');
      status.textContent = '保存中…';
      try {
        const res = await fetch('/api/calibrations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, value }) });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error || '保存失败');
        state.data.portfolio.manualCalibrations = j.manualCalibrations;
        status.textContent = `已保存 · ${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
        renderResearch();
      } catch (err) { status.textContent = `保存失败：${err.message}`; }
    });
  });
  $$('.stock-card', el).forEach(c => c.addEventListener('click', () => {
    const s = stocks.find(x => x.key === c.dataset.key);
    if (s) openStockModal(s);
  }));
}

function openStockModal(s) {
  const dimRows = (s.dimensions || []).map(d => `
    <tr><td style="white-space:nowrap"><b>${esc(d.name)}</b></td>
    <td>${badgeConclusion(d.conclusion)}</td>
    <td>${esc(d.evidence || '—')}</td>
    <td>${esc(d.counter || '—')}</td>
    <td>${esc(d.monitor || '—')}</td></tr>`).join('');

  const sc = s.scenarios || {};
  const priceRows = state.data.methodology.priceTiers.map(t => {
    const v = s.prices?.[t.id];
    const q = liveQuote(s.name);
    const cur = q ? q.price : s.currentPrice;
    const dist = (v != null && cur != null) ? (cur / v - 1) : null;
    return `<tr><td><b>${t.id}</b> ${esc(t.name)}</td><td>${esc(t.requirement)}</td><td class="num">${v != null ? fmtNum(v) : '—'}</td><td class="num">${dist != null ? (dist > 0 ? '+' : '') + fmtPct(dist, 1) : '—'}</td><td style="font-size:12.5px;color:var(--ink-3)">${esc(t.meaning)}</td></tr>`;
  }).join('');

  const autoBanner = s.autoParsed ? `<div class="honest" style="margin:10px 0"><b>自动解析草稿：</b>本卡片由文档标题和正文关键数字自动提取（${esc(s.analysisDate)}），四档价格与IRR可能有误，请点击底部链接核对原文；确认后可补全 data/stocks/ 下的标准JSON。</div>` : '';

  openModal(`
    <h2>${esc(s.name)} ${badgeGrade(s.grade)} <span class="chip">${esc(s.gradeLabel || '')}</span></h2>
    <div class="m-sub">${esc(s.symbol || '')} · ${esc(s.market || '')} · ${esc(s.companyType || '')} · 分析日期 ${esc(s.analysisDate)} · 现价 ${livePriceHtml(s.name, s.currentPrice, s.prices?.currency)}${s.priceNote ? '（' + esc(s.priceNote) + '）' : ''}</div>
    ${autoBanner}
    ${s.oneLiner ? `<p style="font-size:14px;margin:10px 0"><b>生意本质：</b>${esc(s.oneLiner)}</p>` : ''}
    ${s.stage1Conclusion ? `<div class="mirror" style="margin:10px 0">${esc(s.stage1Conclusion)}</div>` : ''}

    ${dimRows ? `<h3>八维分析</h3><div class="table-scroll"><table>
      <thead><tr><th>维度</th><th>结论</th><th>最强证据</th><th>最大反证</th><th>监控指标</th></tr></thead>
      <tbody>${dimRows}</tbody></table></div>` : ''}

    <div class="grid-2" style="gap:14px">
      <div><h3 style="margin-top:14px">三个最强事实</h3><ul style="padding-left:20px;font-size:13.5px">${(s.topFacts || []).map(f => `<li style="margin-bottom:5px">${esc(f)}</li>`).join('') || '<li>—</li>'}</ul></div>
      <div><h3 style="margin-top:14px">三个最大风险</h3><ul style="padding-left:20px;font-size:13.5px">${(s.topRisks || []).map(f => `<li style="margin-bottom:5px">${esc(f)}</li>`).join('') || '<li>—</li>'}</ul></div>
    </div>

    <h3>三情景与四档价格 <span class="tag">${esc(s.prices?.note || '')}</span></h3>
    <table>
      <thead><tr><th>情景</th><th class="num">5年IRR</th><th class="num">10年IRR</th><th>要点</th></tr></thead>
      <tbody>
        ${['pessimistic', 'base', 'optimistic'].map(k => `<tr><td><b>${{ pessimistic: '悲观', base: '基准', optimistic: '乐观' }[k]}</b></td><td class="num">${sc[k]?.irr5y != null ? fmtPct(sc[k].irr5y) : '—'}</td><td class="num">${sc[k]?.irr10y != null ? fmtPct(sc[k].irr10y) : '—'}</td><td>${esc(sc[k]?.note || '—')}</td></tr>`).join('')}
      </tbody>
    </table>
    <table style="margin-top:10px">
      <thead><tr><th>档位</th><th>要求</th><th class="num">价格（${esc(s.prices?.currency || '')}）</th><th class="num">现价距离</th><th>含义</th></tr></thead>
      <tbody>${priceRows}</tbody>
    </table>

    <div class="grid-2" style="gap:14px;margin-top:6px">
      <div class="card" style="margin:0;box-shadow:none;border:1px solid var(--line)">
        <h2 style="font-size:14px">仓位与建议</h2>
        <div class="kv" style="margin-top:8px">
          <span class="k">组合角色</span><span>${esc(s.position?.role || '—')}</span>
          <span class="k">首次仓位</span><span>${esc(s.position?.first || '—')}</span>
          <span class="k">正常上限</span><span>${esc(s.position?.normal || '—')}</span>
          <span class="k">硬上限</span><span>${esc(s.position?.hard || '—')}</span>
          <span class="k">空仓者</span><span>${esc(s.buyAdvice?.empty || '—')}</span>
          <span class="k">持仓者</span><span>${esc(s.buyAdvice?.holder || '—')}</span>
        </div>
      </div>
      <div class="card" style="margin:0;box-shadow:none;border:1px solid var(--line)">
        <h2 style="font-size:14px">茅台对标</h2>
        <div class="kv" style="margin-top:8px">
          <span class="k">质量对标</span><span>${esc(s.moutaiQuality?.verdict || '—')} ${esc(s.moutaiQuality?.summary || '')}</span>
          <span class="k">收益对标</span><span>${esc(s.moutaiReturn?.verdict || '—')} ${esc(s.moutaiReturn?.summary || '')}</span>
          <span class="k">数据置信</span><span>${esc(s.confidence?.data || '—')}</span>
          <span class="k">生意确定性</span><span>${esc(s.confidence?.business || '—')}</span>
          <span class="k">估值确定性</span><span>${esc(s.confidence?.valuation || '—')}</span>
        </div>
      </div>
    </div>

    ${(s.pauseConditions || []).length ? `<h3>暂停加仓条件</h3><ul style="padding-left:20px;font-size:13.5px">${s.pauseConditions.map(c => `<li style="margin-bottom:4px">${esc(c)}</li>`).join('')}</ul>` : ''}
    ${(s.exitConditions || []).length ? `<h3>退出条件</h3><ul style="padding-left:20px;font-size:13.5px;color:var(--accent)">${s.exitConditions.map(c => `<li style="margin-bottom:4px">${esc(c)}</li>`).join('')}</ul>` : ''}
    ${(s.keyMonitor || []).length ? `<h3>最早证伪指标</h3><ul style="padding-left:20px;font-size:13.5px">${s.keyMonitor.map(c => `<li style="margin-bottom:4px">${esc(c)}</li>`).join('')}</ul>` : ''}
    ${s.mirrorTest ? `<h3>镜子测试</h3><div class="mirror">${esc(s.mirrorTest)}</div>` : ''}
    <div class="note" style="margin-top:16px">完整报告：<a href="#" id="docLink">${esc(s.docFile || '')}</a></div>
  `);

  const link = $('#docLink');
  if (link && s.docFile) link.addEventListener('click', e => { e.preventDefault(); openDocModal(s.docFile); });
}

/* ================= 方法论 ================= */
function renderMethod() {
  const el = $('#tab-method');
  const m = state.data.methodology;
  el.innerHTML = `
  <div class="card">
    <h2>${esc(m.title)} <span class="tag">${esc(m.version)} · ${esc(m.asOf)}</span></h2>
    <p style="font-size:14px;color:var(--ink-2)">${esc(m.purpose)}</p>
    <div class="flow-row" style="margin-top:16px">
      ${m.flow.map(f => `<div class="flow-node"><div class="fn-step">${esc(f.step)}</div><div class="fn-name">${esc(f.name)}</div><ul>${f.items.map(i => `<li>${esc(i)}</li>`).join('')}</ul></div>`).join('')}
    </div>
  </div>

  <div class="card">
    <h2>第一步：好公司八维 <span class="tag">核心门槛：${esc(m.dimensionRoles['核心门槛'].join('、'))}｜条件维度：${esc(m.dimensionRoles['条件维度'].join('、'))}</span></h2>
    <table style="margin-top:10px">
      <thead><tr><th style="width:190px">维度</th><th>核心问题</th></tr></thead>
      <tbody>${m.dimensions.map(d => `<tr><td><b>${esc(d.name)}</b></td><td>${esc(d.core)}</td></tr>`).join('')}</tbody>
    </table>
    <table style="margin-top:14px">
      <thead><tr><th>分类</th><th>规则</th><th>后续动作</th></tr></thead>
      <tbody>${m.grades.map(g => `<tr><td>${badgeGrade(g.grade)} <b>${esc(g.name)}</b></td><td>${esc(g.rule)}</td><td>${esc(g.action)}</td></tr>`).join('')}</tbody>
    </table>
  </div>

  <div class="card">
    <h2>第二步：好价格 <span class="tag">只有A类和B类公司进入估值</span></h2>
    <div class="grid-2" style="gap:14px">
      <div>
        <h3 style="font-size:14px;margin-bottom:8px">四档价格（10年倒算）</h3>
        <table><thead><tr><th>档位</th><th>要求</th><th>含义</th></tr></thead>
        <tbody>${m.priceTiers.map(t => `<tr><td><b>${t.id}</b> ${esc(t.name)}</td><td>${esc(t.requirement)}</td><td>${esc(t.meaning)}</td></tr>`).join('')}</tbody></table>
        <h3 style="font-size:14px;margin:14px 0 8px">投资标签</h3>
        ${m.labels.map(l => `<div style="font-size:13px;margin-bottom:5px"><span class="chip" style="background:var(--blue-soft);color:var(--blue)">${esc(l.label)}</span>${esc(l.rule)}</div>`).join('')}
      </div>
      <div>
        <h3 style="font-size:14px;margin-bottom:8px">分型估值模型</h3>
        <table><thead><tr><th>公司类型</th><th>主模型</th><th>交叉验证</th></tr></thead>
        <tbody>${m.valuationModels.map(v => `<tr><td><b>${esc(v.type)}</b></td><td>${esc(v.main)}</td><td>${esc(v.cross)}</td></tr>`).join('')}</tbody></table>
        <h3 style="font-size:14px;margin:14px 0 8px">标签纪律</h3>
        <div>${m.tags.map(t => `<span class="chip">${esc(t)}</span>`).join('')}</div>
      </div>
    </div>
  </div>

  <div class="card">
    <h2>组合执行门</h2>
    <div class="grid-3" style="gap:14px">
      <div>
        <h3 style="font-size:14px;margin-bottom:8px">默认仓位上限</h3>
        <table><thead><tr><th>分类</th><th class="num">首次</th><th class="num">正常</th><th class="num">硬上限</th></tr></thead>
        <tbody>${m.positionLimits.map(p => `<tr><td>${esc(p.type)}</td><td class="num">${esc(p.first)}</td><td class="num">${esc(p.normal)}</td><td class="num">${esc(p.hard)}</td></tr>`).join('')}</tbody></table>
      </div>
      <div>
        <h3 style="font-size:14px;margin-bottom:8px">分档建仓（累计比例）</h3>
        <table><thead><tr><th>价格</th><th>累计达到目标仓位</th></tr></thead>
        <tbody>${m.ladderRule.map(l => `<tr><td><b>${esc(l.price)}</b></td><td>${esc(l.cumulative)}</td></tr>`).join('')}</tbody></table>
        <h3 style="font-size:14px;margin:14px 0 8px">必须卖出/退出</h3>
        <ul style="padding-left:18px;font-size:13px;color:var(--accent)">${m.sellRules.mustSell.map(r => `<li>${esc(r)}</li>`).join('')}</ul>
      </div>
      <div>
        <h3 style="font-size:14px;margin-bottom:8px">估值减仓审查</h3>
        <ul style="padding-left:18px;font-size:13px">${m.sellRules.reduceReview.map(r => `<li>${esc(r)}</li>`).join('')}</ul>
        <div class="note">${esc(m.sellRules.note)}</div>
        <h3 style="font-size:14px;margin:14px 0 8px">暂停加仓</h3>
        <ul style="padding-left:18px;font-size:13px">${m.pauseRules.map(r => `<li>${esc(r)}</li>`).join('')}</ul>
      </div>
    </div>
  </div>

  <div class="card">
    <h2>Agent 分析指令模板（完整版） <span class="tag">完整嵌入两步法SOP v3.0全部要求，复制给任意AI即可按标准模板输出</span></h2>
    <div class="prompt-box" style="margin-top:10px">
      <textarea id="agentPrompt" readonly>${esc(m.agentPrompt)}</textarea>
      <button class="copy-btn" id="copyPrompt">复制指令</button>
    </div>
    <div class="note">镜子测试模板：${esc(m.mirrorTestTemplate)}</div>
  </div>

  <div class="grid-2">
    <div class="card">
      <h2>十二条禁止事项</h2>
      <ul class="check-list" style="margin-top:8px">${m.forbidden.map(f => `<li class="no">${esc(f)}</li>`).join('')}</ul>
    </div>
    <div class="card">
      <h2>复盘与更新频率</h2>
      <table style="margin-top:8px"><thead><tr><th>触发</th><th>动作</th></tr></thead>
      <tbody>${m.updateFrequency.map(u => `<tr><td><b>${esc(u.trigger)}</b></td><td>${esc(u.action)}</td></tr>`).join('')}</tbody></table>
      <div class="note">每次更新保留旧版本，列出：事实变化、假设变化、结论变化。不得静默修改历史判断。</div>
    </div>
  </div>`;

  $('#copyPrompt').addEventListener('click', async e => {
    const ta = $('#agentPrompt');
    try { await navigator.clipboard.writeText(ta.value); } catch { ta.select(); document.execCommand('copy'); }
    e.target.textContent = '已复制 ✓'; setTimeout(() => e.target.textContent = '复制指令', 1600);
  });
}

/* ================= 文档库 ================= */
function renderDocs() {
  const el = $('#tab-docs');
  const idx = state.data.docsIndex;
  const cats = ['全部', ...new Set(idx.docs.map(d => d.category))];
  const q = state.docQuery.trim().toLowerCase();
  const list = idx.docs.filter(d =>
    (state.docCategory === '全部' || d.category === state.docCategory) &&
    (!q || d.title.toLowerCase().includes(q) || d.file.toLowerCase().includes(q)));

  el.innerHTML = `
  <div class="card" style="padding:16px 20px">
    <div style="display:flex;gap:14px;flex-wrap:wrap;align-items:center">
      <input class="search-input" id="docSearch" placeholder="搜索 ${idx.total} 篇文档…" value="${esc(state.docQuery)}">
      <div class="filter-bar" style="margin:0">
        ${cats.map(c => `<button data-c="${esc(c)}" class="${state.docCategory === c ? 'active' : ''}">${esc(c)}</button>`).join('')}
      </div>
      <button class="btn" id="showAddDoc" style="margin-left:auto">＋ 添加文档</button>
    </div>
    <div id="addDocForm" style="display:none;margin-top:14px;padding-top:14px;border-top:1px dashed var(--line)">
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:8px">
        <input class="edit-input" id="docTitle" placeholder="文档标题（如：中际旭创两步投资分析）" style="flex:1;min-width:220px">
        <input class="edit-input" id="docDate" placeholder="日期YYYYMMDD（如20260901）" style="width:190px">
      </div>
      <textarea class="edit-input" id="docContent" placeholder="粘贴 markdown 全文。两步投资分析文档会自动解析出研究库草稿卡片（分级/四档价格/IRR），其他文档进入对应类目。" style="width:100%;height:160px;font-size:13px;padding:10px"></textarea>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button class="btn primary" id="docAddSave">保存文档</button>
        <button class="btn" id="docAddCancel">取消</button>
        <span class="note" style="margin:0;align-self:center">保存为 data/docs/标题-日期.md；删除仅影响本站副本，不动原文档目录</span>
      </div>
    </div>
  </div>
  <div class="card">
    <ul class="doc-list">
      ${list.map(d => `<li data-file="${esc(d.file)}">
        <span class="chip" style="background:var(--blue-soft);color:var(--blue);white-space:nowrap">${esc(d.category)}</span>
        <span class="d-title">${esc(d.title)}</span>
        <span class="d-date">${esc(d.date || '')}</span>
        <span class="d-size">${d.sizeKb}KB</span>
        <button class="del-btn" data-delfile="${esc(d.file)}" title="删除本文档（仅本站副本）">✕</button>
      </li>`).join('') || '<div class="empty">无匹配文档</div>'}
    </ul>
  </div>`;

  const input = $('#docSearch');
  input.addEventListener('input', () => { state.docQuery = input.value; renderDocs(); const i2 = $('#docSearch'); i2.focus(); i2.setSelectionRange(i2.value.length, i2.value.length); });
  $$('.filter-bar button[data-c]', el).forEach(b => b.addEventListener('click', () => { state.docCategory = b.dataset.c; renderDocs(); }));
  $('#showAddDoc').addEventListener('click', () => { const f = $('#addDocForm'); f.style.display = f.style.display === 'none' ? 'block' : 'none'; });
  $('#docAddCancel').addEventListener('click', () => { $('#addDocForm').style.display = 'none'; });
  $('#docAddSave').addEventListener('click', async () => {
    const title = $('#docTitle').value.trim(), date = $('#docDate').value.trim(), content = $('#docContent').value;
    if (!title || !content.trim() || !/^\d{8}$/.test(date)) return alert('请填写标题、8位日期和正文内容');
    try {
      const res = await fetch('/api/docs/add', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, date, content }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || '失败');
      await reload();
      state.currentTab = 'docs'; renderTab('docs');
      alert(`已保存 ${j.file}${j.file.includes('两步投资分析') ? '\n研究库已生成自动解析草稿卡片，请前往核对。' : ''}`);
    } catch (e) { alert('保存失败：' + e.message); }
  });
  $$('.del-btn[data-delfile]', el).forEach(b => b.addEventListener('click', async e => {
    e.stopPropagation();
    if (!confirm(`删除文档「${b.dataset.delfile}」？仅删除本站副本，不影响原目录。`)) return;
    try {
      const res = await fetch('/api/docs/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file: b.dataset.delfile }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || '失败');
      await reload();
      renderTab('docs');
    } catch (e2) { alert('删除失败：' + e2.message); }
  }));
  $$('.doc-list li[data-file]', el).forEach(li => li.addEventListener('click', () => openDocModal(li.dataset.file)));
}

async function openDocModal(file) {
  openModal(`<h2>${esc(file.replace(/-\d{8}\.md$/, ''))}</h2><div class="loading">加载中…</div>`);
  try {
    const res = await fetch(`/api/doc/${encodeURIComponent(file)}`);
    if (!res.ok) throw new Error(res.status);
    const md = await res.text();
    openModal(`<h2>${esc(file.replace(/-\d{8}\.md$/, ''))}</h2>
      <div class="m-sub">${esc(file)}</div>
      <div class="md-view">${renderMd(md)}</div>`);
  } catch (e) {
    openModal(`<h2>加载失败</h2><div class="empty">${esc(e.message)}</div>`);
  }
}

/* ================= 启动 ================= */
let methodology = null;
function renderTab(name) {
  if (name === 'goals') renderGoals();
  else if (name === 'portfolio') renderPortfolio();
  else if (name === 'research') renderResearch();
  else if (name === 'method') renderMethod();
  else if (name === 'docs') renderDocs();
}
async function reload() {
  const res = await fetch('/api/bootstrap');
  if (!res.ok) throw new Error('数据加载失败');
  state.data = await res.json();
  methodology = state.data.methodology;
  const q = state.quotes;
  state.quotes = { time: q.time, map: {} }; // 行情缓存与数据无关，但重渲染前先清空避免错配
  await refreshQuotes(true);
  $('#dataNote').textContent = `数据截止：持仓 ${state.data.portfolio.snapshotDate} · 两步法分析更新至2026-08-31 · 组合与执行方案更新至2026-08-31 · 目标90%股票＋10%机会现金 · 共 ${state.data.stocks.length} 只股票 / ${state.data.docsIndex.total} 篇文档`;
  $('#footerInfo').textContent = `投资分析中心 · ${state.data.stocks.length} 只股票研究库 · 数据生成于 ${new Date(state.data.generatedAt).toLocaleString('zh-CN')}`;
}
async function boot() {
  await reload();
  renderGoals(); renderPortfolio(); renderResearch(); renderMethod(); renderDocs();
  applyHash();
}

$$('#tabs button[data-tab]').forEach(b => b.addEventListener('click', () => {
  $$('#tabs button').forEach(x => x.classList.toggle('active', x === b));
  $$('.tab-panel').forEach(p => p.classList.toggle('active', p.id === `tab-${b.dataset.tab}`));
  state.currentTab = b.dataset.tab;
  history.replaceState(null, '', '#' + b.dataset.tab);
  window.scrollTo({ top: 0 });
}));
window.addEventListener('hashchange', () => { const m = location.hash.match(/^#(goals|portfolio|research|method|docs)$/); if (m) { state.currentTab = m[1]; renderTab(m[1]); $$('#tabs button').forEach(x => x.classList.toggle('active', x.dataset.tab === m[1])); $$('.tab-panel').forEach(p => p.classList.toggle('active', p.id === `tab-${m[1]}`)); } });
function applyHash() {
  const m = location.hash.match(/^#(goals|portfolio|research|method|docs)$/);
  if (!m) return;
  state.currentTab = m[1];
  $$('#tabs button').forEach(x => x.classList.toggle('active', x.dataset.tab === m[1]));
  $$('.tab-panel').forEach(p => p.classList.toggle('active', p.id === `tab-${m[1]}`));
}
$('#quoteBtn').addEventListener('click', () => refreshQuotes(false));

boot().catch(e => {
  document.body.innerHTML = `<div class="loading">初始化失败：${esc(e.message)}<br><br>请确认已运行 <code>node server.js</code></div>`;
});
