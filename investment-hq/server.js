#!/usr/bin/env node
// 投资分析中心 - 零依赖本地服务器
// 用法: node server.js [端口]   默认端口 4280
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.argv[2] || process.env.PORT || 4280);
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = process.env.INVESTMENT_HQ_DATA_DIR
  ? path.resolve(process.env.INVESTMENT_HQ_DATA_DIR)
  : path.join(ROOT, 'data');
const DOCS_DIR = path.join(DATA_DIR, 'docs');
const STOCKS_DIR = path.join(DATA_DIR, 'stocks');
const PORTFOLIO_FILE = path.join(DATA_DIR, 'portfolio.json');
const GOAL_LEDGER_FILE = path.join(DATA_DIR, 'goal-ledger.json');
const SNAPSHOT_DIR = path.join(DATA_DIR, 'snapshots');
fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.md': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.pdf': 'application/pdf'
};

function send(res, code, body, type) {
  res.writeHead(code, { 'Content-Type': type || 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' });
  res.end(body);
}
const readJson = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const roundMoney = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const optionalNumber = value => {
  if (value === '' || value == null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};
function estimatedAnnualDividend(entry, quantity, fxRate, grossCny) {
  const normalizedDps = optionalNumber(entry?.normalizedDps);
  const taxRate = optionalNumber(entry?.dividendTaxRate) ?? 0;
  const dpsCurrency = String(entry?.dpsCurrency || 'CNY').toUpperCase();
  const dpsFx = dpsCurrency === 'HKD' ? optionalNumber(fxRate) : 1;
  if (normalizedDps != null && dpsFx != null && taxRate >= 0 && taxRate < 1) {
    return roundMoney(quantity * normalizedDps * dpsFx * (1 - taxRate));
  }
  const afterTaxYield = optionalNumber(entry?.afterTaxYield);
  return afterTaxYield != null && Number.isFinite(grossCny)
    ? roundMoney(grossCny * afterTaxYield)
    : null;
}
function writeJsonAtomic(file, value) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let d = ''; req.on('data', c => { d += c; if (d.length > 12e6) reject(new Error('body too large')); });
    req.on('end', () => { try { resolve(d ? JSON.parse(d) : {}); } catch (e) { reject(new Error('invalid json')); } });
  });
}

function normalizeSnapshotHoldings(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map((row, index) => {
    const name = String(row?.name || '').trim().slice(0, 30);
    const symbol = String(row?.symbol || '').trim().slice(0, 30);
    const quantity = row?.quantity === '' || row?.quantity == null ? null : Number(row.quantity);
    const costPrice = row?.costPrice === '' || row?.costPrice == null ? null : Number(row.costPrice);
    const currentPrice = row?.currentPrice === '' || row?.currentPrice == null ? null : Number(row.currentPrice);
    const marketValue = Number(row?.marketValue);
    const currency = String(row?.currency || (symbol.endsWith('.HK') ? 'HKD' : 'CNY')).toUpperCase();
    if (!name) throw new Error(`第${index + 1}行缺少公司名称`);
    if (!Number.isFinite(marketValue) || marketValue < 0) throw new Error(`${name}的市值无效`);
    if (!Number.isFinite(quantity) || quantity < 0) throw new Error(`${name}的持股数无效`);
    if (costPrice != null && (!Number.isFinite(costPrice) || costPrice < 0)) throw new Error(`${name}的成本价无效`);
    if (currentPrice != null && (!Number.isFinite(currentPrice) || currentPrice < 0)) throw new Error(`${name}的现价无效`);
    if (!['CNY', 'HKD'].includes(currency)) throw new Error(`${name}的币种仅支持CNY或HKD`);
    return { name, symbol, quantity: Number.isFinite(quantity) ? quantity : null, costPrice, currentPrice, marketValue: roundMoney(marketValue), currency };
  }).filter(row => row.marketValue > 0);
}

function snapshotStatistics(holdings, totalAssets, portfolio) {
  const sorted = [...holdings].sort((a, b) => b.marketValue - a.marketValue);
  const stockMarketValue = roundMoney(sorted.reduce((sum, row) => sum + row.marketValue, 0));
  const weights = sorted.map(row => totalAssets > 0 ? row.marketValue / totalAssets : 0);
  const formal = new Set(portfolio.concentrationPolicy?.formalNames || (portfolio.targetPortfolio || []).map(row => row.name));
  const target = new Set((portfolio.targetPortfolio || []).map(row => row.name));
  const dividendMap = new Map((portfolio.dividends?.perStock || []).map(row => [row.name, row]));
  let estimatedDividend = 0;
  const missingDividendNames = [];
  sorted.forEach(row => {
    const entry = dividendMap.get(row.name);
    const inferredFx = row.currency === 'HKD' && Number(row.quantity) > 0 && Number(row.currentPrice) > 0
      ? row.marketValue / (row.quantity * row.currentPrice)
      : 1;
    const amount = estimatedAnnualDividend(entry, row.quantity, inferredFx, row.marketValue);
    if (amount != null) estimatedDividend += amount;
    else missingDividendNames.push(row.name);
  });
  const maxHoldings = Number(portfolio.concentrationPolicy?.maxHoldings) || 7;
  return {
    holdingCount: sorted.length,
    maxHoldings,
    holdingLimitBreach: sorted.length > maxHoldings,
    stockMarketValue,
    stockWeight: totalAssets > 0 ? stockMarketValue / totalAssets : 0,
    cashWeight: totalAssets > 0 ? Math.max(0, totalAssets - stockMarketValue) / totalAssets : 0,
    top1Weight: weights[0] || 0,
    top3Weight: weights.slice(0, 3).reduce((sum, value) => sum + value, 0),
    hhi: weights.reduce((sum, value) => sum + value * value, 0),
    largestHolding: sorted[0]?.name || null,
    nonTargetNames: sorted.filter(row => !target.has(row.name)).map(row => row.name),
    outsideFormalPoolNames: sorted.filter(row => !formal.has(row.name)).map(row => row.name),
    targetCoverageCount: sorted.filter(row => formal.has(row.name)).length,
    estimatedAfterTaxDividend: roundMoney(estimatedDividend),
    missingDividendNames
  };
}

function saveSnapshotAttachment(date, name, dataUrl) {
  if (!dataUrl) return null;
  const match = String(dataUrl).match(/^data:(image\/png|image\/jpeg|image\/webp|application\/pdf);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new Error('附件仅支持PNG、JPG、WEBP或PDF');
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length > 8 * 1024 * 1024) throw new Error('附件不能超过8MB');
  const ext = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'application/pdf': '.pdf' }[match[1]];
  const safeName = String(name || '持仓快照').replace(/[^\w\u4e00-\u9fa5.-]+/g, '_').slice(0, 60).replace(/\.[^.]+$/, '');
  const file = `${date}-${safeName}${ext}`;
  fs.writeFileSync(path.join(SNAPSHOT_DIR, file), buffer);
  return { name: String(name || file).slice(0, 100), file, mime: match[1], size: buffer.length, localOnly: true };
}

function knownSecurity(name, symbol, portfolio) {
  const byHolding = (portfolio.holdings || []).find(row => row.name === name || (symbol && row.symbol === symbol));
  if (byHolding) return { name: byHolding.name, symbol: byHolding.symbol, currency: byHolding.currency };
  for (const file of fs.readdirSync(STOCKS_DIR).filter(f => f.endsWith('.json'))) {
    const stock = readJson(path.join(STOCKS_DIR, file));
    if (stock.name === name || (symbol && stock.symbol === symbol)) {
      return { name: stock.name, symbol: stock.symbol, currency: String(stock.symbol || '').endsWith('.HK') ? 'HKD' : 'CNY' };
    }
  }
  const target = (portfolio.targetPortfolio || []).find(row => row.name === name || (symbol && row.symbol === symbol));
  return target ? { name: target.name, symbol: target.symbol, currency: String(target.symbol || '').endsWith('.HK') ? 'HKD' : 'CNY' } : null;
}

function refreshExecutionStatus(portfolio) {
  const quantities = new Map((portfolio.holdings || []).map(row => [row.name, Number(row.quantity) || 0]));
  const holdingCount = [...quantities.values()].filter(value => value > 0).length;
  const maxHoldings = Number(portfolio.concentrationPolicy?.maxHoldings) || 7;
  const rows = portfolio.executionPlan?.rows || [];
  rows.forEach(row => {
    const finalQuantity = Number(row.expectedFinalQuantity);
    if (Number.isFinite(finalQuantity) && (quantities.get(row.name) || 0) >= finalQuantity) row.recordStatus = '已完成';
    else if (!quantities.has(row.name) && holdingCount >= maxHoldings) row.recordStatus = '席位锁定';
    else row.recordStatus = '待执行';
  });
  if (rows.length) portfolio.executionPlan.status = rows.every(row => row.recordStatus === '已完成') ? '已全部完成' : '待执行，未全部成交';
}

/* ============ 文档索引与自动解析 ============ */
function categorize(name) {
  if (name.includes('SOP') || name.includes('框架') || name.includes('批判性审阅') || name.includes('投资分析法')) return '方法论';
  if (name.includes('两步投资分析')) return '两步法深度分析';
  if (name.includes('1000万') || name.includes('建仓') || name.includes('执行卡') || name.includes('执行清单') || name.includes('价格表')) return '组合与建仓';
  if (name.includes('茅台')) return '茅台专题';
  if (name.includes('丹书') || name.includes('璟恒') || name.includes('岁寒')) return '私募与外部审计';
  if (name.includes('比较') || name.includes('对比') || name.includes('类比')) return '比较研究';
  if (name.includes('决策') || name.includes('审计') || name.includes('压力测试') || name.includes('复核') || name.includes('推演') || name.includes('倒算')) return '决策与审计';
  return '专题研究';
}
function scanDocs() {
  return fs.readdirSync(DOCS_DIR).filter(f => f.endsWith('.md')).map(f => {
    const m = f.match(/-(\d{8})\.md$/);
    const date = m ? `${m[1].slice(0,4)}-${m[1].slice(4,6)}-${m[1].slice(6,8)}` : null;
    return { file: f, title: f.replace(/-\d{8}\.md$/, ''), date, category: categorize(f), sizeKb: Math.round(fs.statSync(path.join(DOCS_DIR, f)).size / 102.4) / 10 };
  }).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

// 从两步法文档正文尽力提取草稿数据（标记 autoParsed，需人工核对）
// 仅当文件名严格形如「XX两步投资分析-YYYYMMDD.md」才视为个股报告，排除SOP等方法论文档
function parseDraftStock(file) {
  const nm = file.match(/^(.+?)两步投资分析-(\d{8})\.md$/);
  if (!nm || nm[1].length > 10 || /SOP|框架|最终版|方法/.test(nm[1])) return null;
  const name = nm[1];
  const text = fs.readFileSync(path.join(DOCS_DIR, file), 'utf8');
  const head = text.slice(0, 1500);
  const num = s => s == null ? null : Number(s);
  const grab = re => { const x = text.match(re); return x ? num(x[1]) : null; };
  const sym = head.match(/(\d{5,6})\.(SH|SZ|HK)/i);
  const grade = (() => { const g = text.match(/分\s*类[：:]\s*\**([ABCD])[+-类]/) || text.match(/属于([ABCD])类/); return g ? g[1] : null; })();
  const cur = grab(/当前价[格格]?[^0-9\n]{0,8}(\d{2,4}(?:\.\d+)?)/) || grab(/现价[：:]?\s*(\d{2,4}(?:\.\d+)?)/);
  const prices = {};
  for (const [id, pat] of [['P10', /P10[^0-9\n]{0,40}?(\d{1,4}(?:\.\d+)?)/], ['P12', /P12[^0-9\n]{0,40}?(\d{1,4}(?:\.\d+)?)/], ['P15', /P15[^0-9\n]{0,40}?(\d{1,4}(?:\.\d+)?)/], ['P17', /P17(?:\.46)?[^0-9\n]{0,40}?(\d{1,4}(?:\.\d+)?)/]]) {
    const v = grab(pat); if (v != null && v > 0.2 && v < 100000) prices[id] = v;
  }
  const irr = grab(/基准[^%\n]{0,50}?(?:IRR|年化)[^0-9\-%\n]{0,12}(\d{1,2}(?:\.\d+)?)\s*%/);
  if (!grade && !Object.keys(prices).length && irr == null) return null;
  const irrV = irr != null ? irr / 100 : null;
  const label = irrV == null ? null : irrV >= 0.1746 ? '目标达成型' : irrV >= 0.15 ? '接近目标型' : irrV >= 0.10 ? '组合辅助型' : '回报不合格';
  return {
    key: 'draft-' + name, name, symbol: sym ? sym[0] : null, market: sym ? (sym[2].toUpperCase() === 'HK' ? '港股' : 'A股') : null,
    companyType: null, analysisDate: `${nm[2].slice(0,4)}-${nm[2].slice(4,6)}-${nm[2].slice(6,8)}`,
    currentPrice: cur, priceNote: '自动解析，需人工核对',
    grade, gradeLabel: label, oneLiner: null, stage1Conclusion: null,
    dimensions: [], topFacts: [], topRisks: [], moutaiQuality: null, moutaiReturn: null,
    scenarios: irrV != null ? { base: { irr10y: irrV, irr5y: null, note: '自动解析的基准年化' } } : { base: { irr10y: null } },
    prices: { ...prices, currency: sym && sym[2].toUpperCase() === 'HK' ? '港元' : '元', note: '自动解析草稿，以原文为准' },
    position: null, buyAdvice: null, pauseConditions: [], exitConditions: [],
    mirrorTest: null, confidence: null, keyMonitor: [], docFile: file, autoParsed: true
  };
}

/* ============ 腾讯公开行情 ============ */
const quoteCache = { at: 0, data: {} };
function toQtSymbol(sym) {
  if (!sym) return null;
  const m = String(sym).match(/(\d{5,6})\.(SH|SZ|HK)/i) || String(sym).match(/\b(\d{4})\.(HK)\b/i);
  if (!m) return null;
  const [, code, suf] = m;
  const s = suf.toUpperCase();
  if (s === 'HK') return 'hk' + code.padStart(5, '0');
  return (s === 'SH' ? 'sh' : 'sz') + code;
}
async function fetchQuotes(symbols) {
  const need = symbols.filter(s => s && !quoteCache.data[s]);
  const now = Date.now();
  if (now - quoteCache.at < 30000 && need.length === 0) return { time: quoteCache.at, quotes: pick(quoteCache.data, symbols) };
  const uniq = [...new Set(need)];
  const out = {};
  for (let i = 0; i < uniq.length; i += 30) {
    const batch = uniq.slice(i, i + 30);
    const url = `http://qt.gtimg.cn/q=${batch.join(',')}`;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 6000);
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(timer);
      const buf = Buffer.from(await res.arrayBuffer());
      const text = buf.toString('latin1'); // 数字与分隔符为 ASCII，足够解析价格
      for (const q of text.split(';')) {
        const m = q.match(/v_(\w+)="([^"]*)"/);
        if (!m) continue;
        const f = m[2].split('~');
        const price = Number(f[3]), prev = Number(f[4]);
        if (price > 0) out[m[1]] = { symbol: m[1], price, prevClose: prev > 0 ? prev : null, changePct: prev > 0 ? (price / prev - 1) : null };
      }
    } catch (e) { /* 行情失败不阻塞站点 */ }
  }
  Object.assign(quoteCache.data, out);
  quoteCache.at = now;
  return { time: quoteCache.at, quotes: pick(quoteCache.data, symbols) };
}
const pick = (obj, keys) => Object.fromEntries(keys.filter(k => obj[k]).map(k => [k, obj[k]]));

function returnLabel(irr) {
  if (!Number.isFinite(irr)) return '无法定价';
  if (irr >= 0.1746) return '目标达成型';
  if (irr >= 0.15) return '接近目标型';
  if (irr >= 0.10) return '组合辅助型';
  return '回报不合格';
}

function executableReturnLabel(grade, irr) {
  if (grade === 'C' || grade === 'D') return '质量未过执行门';
  return returnLabel(irr);
}

function firstPercent(value) {
  const m = String(value || '').match(/(\d+(?:\.\d+)?)\s*%/);
  return m ? Number(m[1]) / 100 : null;
}

function monthLabel(months) {
  if (!Number.isFinite(months)) return null;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return `${years}年${rest ? `${rest}个月` : ''}`;
}

function addMonths(dateText, months) {
  const [year, month, day] = String(dateText || '').split('-').map(Number);
  if (!year || !month || !Number.isFinite(months)) return null;
  const d = new Date(Date.UTC(year, month - 1 + months, day || 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function monthsBetween(startText, endText) {
  const [sy, sm] = String(startText || '').split('-').map(Number);
  const [ey, em] = String(endText || '').split('-').map(Number);
  if (![sy, sm, ey, em].every(Number.isFinite)) return null;
  return Math.max(0, (ey - sy) * 12 + em - sm);
}

function simulateDividendRunway({
  principal,
  startDate,
  startStockWeight,
  targetStockWeight,
  cashReturn,
  targetPortfolioReturn,
  deploymentMonths,
  terminalYield,
  nominalDividend,
  safetyDividend,
  milestones
}) {
  if (![principal, startStockWeight, targetStockWeight, cashReturn, targetPortfolioReturn, deploymentMonths, terminalYield].every(Number.isFinite)
      || principal <= 0 || targetStockWeight <= 0 || terminalYield <= 0 || deploymentMonths < 1) return null;
  const equityReturn = (targetPortfolioReturn - (1 - targetStockWeight) * cashReturn) / targetStockWeight;
  const nominalAssets = nominalDividend / terminalYield;
  const safetyAssets = safetyDividend / terminalYield;
  let assets = principal;
  let nominalMonths = null;
  let safetyMonths = null;
  const milestoneRows = (milestones || []).map(value => ({ value, months: null }));
  for (let month = 1; month <= 480; month += 1) {
    const progress = Math.min(1, month / deploymentMonths);
    const stockWeight = startStockWeight + (targetStockWeight - startStockWeight) * progress;
    const annualReturn = stockWeight * equityReturn + (1 - stockWeight) * cashReturn;
    assets *= Math.pow(1 + annualReturn, 1 / 12);
    milestoneRows.forEach(row => { if (row.months == null && assets >= row.value) row.months = month; });
    if (nominalMonths == null && assets >= nominalAssets) nominalMonths = month;
    if (safetyMonths == null && assets >= safetyAssets) safetyMonths = month;
    if (nominalMonths != null && safetyMonths != null && milestoneRows.every(row => row.months != null)) break;
  }
  return {
    equityReturn,
    targetPortfolioReturn,
    deploymentMonths,
    terminalYield,
    nominalAssets,
    safetyAssets,
    nominalMonths,
    safetyMonths,
    nominalDuration: monthLabel(nominalMonths),
    safetyDuration: monthLabel(safetyMonths),
    nominalDate: addMonths(startDate, nominalMonths),
    safetyDate: addMonths(startDate, safetyMonths),
    milestones: milestoneRows.map(row => ({ ...row, duration: monthLabel(row.months), date: addMonths(startDate, row.months) }))
  };
}

function buildDividendRunway(payload, portfolioReturn) {
  const spec = payload.goals?.dividendRunway;
  const pf = payload.portfolio;
  if (!spec || !pf) return null;
  const principal = Number(pf.totalAssets);
  const startStockWeight = Number(pf.stockMarketValue) / principal;
  const targetStockWeight = 1 - (Number(pf.opportunityCash?.weight) || 0.1);
  const cashReturn = Number(pf.opportunityCash?.baseAnnualReturn) || 0.015;
  const common = {
    principal,
    startDate: spec.startDate,
    startStockWeight,
    targetStockWeight,
    cashReturn,
    nominalDividend: Number(spec.nominalDividend) || 1000000,
    safetyDividend: Number(spec.safetyDividend) || 1200000,
    milestones: spec.milestones || []
  };
  const scenarios = (spec.scenarios || []).map(s => {
    const targetPortfolioReturn = s.usePortfolioBase ? portfolioReturn : Number(s.annualReturn);
    const result = simulateDividendRunway({
      ...common,
      targetPortfolioReturn,
      deploymentMonths: Number(s.deploymentMonths),
      terminalYield: Number(s.terminalYield)
    });
    return result ? { id: s.id, label: s.label, confidence: s.confidence, note: s.note, ...result } : null;
  }).filter(Boolean);
  return { ...common, scenarios, note: spec.note };
}

function simulateDividendAcceleration({
  principal,
  startDate,
  startStockWeight,
  targetStockWeight,
  cashReturn,
  accumulationReturn,
  accumulationYield,
  deploymentMonths,
  migrationStartAssets,
  migrationMonths,
  terminalReturn,
  terminalYield,
  nominalDividend,
  safetyDividend,
  nominalDividendGrowth = 0,
  safetyDividendGrowth = 0,
  monthlyContribution = 0,
  contributionStartMonth = 1,
  contributionEndMonth = 480,
  checkpointMonths = []
}) {
  const values = [principal, startStockWeight, targetStockWeight, cashReturn, accumulationReturn,
    accumulationYield, deploymentMonths, migrationStartAssets, migrationMonths, terminalReturn,
    terminalYield, nominalDividend, safetyDividend, nominalDividendGrowth, safetyDividendGrowth,
    monthlyContribution, contributionStartMonth, contributionEndMonth];
  if (!values.every(Number.isFinite) || principal <= 0 || targetStockWeight <= 0
      || deploymentMonths < 1 || migrationMonths < 1 || terminalYield <= 0 || monthlyContribution < 0
      || nominalDividendGrowth < 0 || safetyDividendGrowth < 0
      || contributionStartMonth < 1 || contributionEndMonth < contributionStartMonth) return null;
  const equityReturn = (accumulationReturn - (1 - targetStockWeight) * cashReturn) / targetStockWeight;
  const equityYield = accumulationYield / targetStockWeight;
  let assets = principal;
  let migrationStartMonth = null;
  let nominal = null;
  let safety = null;
  let cumulativeContribution = 0;
  const checkpointSet = new Set((checkpointMonths || []).map(Number).filter(Number.isFinite));
  const checkpoints = [];
  if (checkpointSet.has(0)) checkpoints.push({
    months: 0,
    assets,
    annualDividend: assets * startStockWeight * equityYield,
    annualYield: startStockWeight * equityYield,
    stockWeight: startStockWeight,
    cumulativeContribution,
    phase: 'baseline'
  });
  for (let month = 1; month <= 480; month += 1) {
    const deploymentProgress = Math.min(1, month / deploymentMonths);
    const stockWeight = startStockWeight + (targetStockWeight - startStockWeight) * deploymentProgress;
    let annualReturn = stockWeight * equityReturn + (1 - stockWeight) * cashReturn;
    let annualYield = stockWeight * equityYield;
    let phase = month <= deploymentMonths ? 'deploy' : 'accumulate';
    if (migrationStartMonth == null && month > deploymentMonths && assets >= migrationStartAssets) {
      migrationStartMonth = month;
    }
    if (migrationStartMonth != null) {
      const migrationProgress = Math.min(1, (month - migrationStartMonth + 1) / migrationMonths);
      annualReturn = accumulationReturn + (terminalReturn - accumulationReturn) * migrationProgress;
      annualYield = accumulationYield + (terminalYield - accumulationYield) * migrationProgress;
      phase = migrationProgress >= 1 ? 'income' : 'migrate';
    }
    assets *= Math.pow(1 + annualReturn, 1 / 12);
    const contributionThisMonth = month >= contributionStartMonth && month <= contributionEndMonth ? monthlyContribution : 0;
    assets += contributionThisMonth;
    cumulativeContribution += contributionThisMonth;
    const annualDividend = assets * annualYield;
    const nominalTargetDividend = nominalDividend * Math.pow(1 + nominalDividendGrowth, month / 12);
    const safetyTargetDividend = safetyDividend * Math.pow(1 + safetyDividendGrowth, month / 12);
    if (checkpointSet.has(month)) checkpoints.push({ months: month, assets, annualDividend, annualYield, stockWeight, cumulativeContribution, phase });
    if (!nominal && annualDividend >= nominalTargetDividend) nominal = {
      months: month, assets, annualDividend, targetDividend: nominalTargetDividend,
      annualYield, cumulativeContribution, phase
    };
    if (!safety && annualDividend >= safetyTargetDividend) {
      safety = {
        months: month, assets, annualDividend, targetDividend: safetyTargetDividend,
        annualYield, cumulativeContribution, phase
      };
      break;
    }
  }
  const decorate = row => row ? {
    ...row,
    duration: monthLabel(row.months),
    date: addMonths(startDate, row.months)
  } : null;
  return {
    accumulationReturn,
    accumulationYield,
    deploymentMonths,
    migrationStartAssets,
    migrationMonths,
    migrationStartMonth,
    migrationStartDate: addMonths(startDate, migrationStartMonth),
    terminalReturn,
    terminalYield,
    nominalDividendGrowth,
    safetyDividendGrowth,
    monthlyContribution,
    annualContribution: monthlyContribution * 12,
    contributionStartMonth,
    contributionEndMonth,
    checkpoints: checkpoints.map(row => ({ ...row, duration: monthLabel(row.months), date: addMonths(startDate, row.months) })),
    nominal: decorate(nominal),
    safety: decorate(safety)
  };
}

function simulateIncomeFirst({
  principal,
  startDate,
  startStockWeight,
  targetStockWeight,
  cashReturn,
  deploymentMonths,
  terminalReturn,
  terminalYield,
  nominalDividend,
  safetyDividend
}) {
  const equityReturn = (terminalReturn - (1 - targetStockWeight) * cashReturn) / targetStockWeight;
  const equityYield = terminalYield / targetStockWeight;
  let assets = principal;
  let nominal = null;
  let safety = null;
  for (let month = 1; month <= 480; month += 1) {
    const progress = Math.min(1, month / deploymentMonths);
    const stockWeight = startStockWeight + (targetStockWeight - startStockWeight) * progress;
    const annualReturn = stockWeight * equityReturn + (1 - stockWeight) * cashReturn;
    const annualYield = stockWeight * equityYield;
    assets *= Math.pow(1 + annualReturn, 1 / 12);
    const annualDividend = assets * annualYield;
    if (!nominal && annualDividend >= nominalDividend) nominal = { months: month, assets, annualDividend, annualYield, phase: 'income' };
    if (!safety && annualDividend >= safetyDividend) {
      safety = { months: month, assets, annualDividend, annualYield, phase: 'income' };
      break;
    }
  }
  const decorate = row => row ? { ...row, duration: monthLabel(row.months), date: addMonths(startDate, row.months) } : null;
  return { deploymentMonths, terminalReturn, terminalYield, nominal: decorate(nominal), safety: decorate(safety) };
}

function buildDividendAcceleration(payload, dividendRunway, underwritingReturn) {
  const spec = payload.goals?.dividendAcceleration;
  const pf = payload.portfolio;
  if (!spec || !pf) return null;
  const principal = Number(pf.totalAssets);
  const startStockWeight = Number(pf.stockMarketValue) / principal;
  const targetStockWeight = 1 - (Number(pf.opportunityCash?.weight) || 0.1);
  const cashReturn = Number(pf.opportunityCash?.baseAnnualReturn) || 0.015;
  const ledger = payload.goalLedger;
  const latestSnapshot = [...(ledger?.snapshots || [])].sort((a, b) => String(a.date).localeCompare(String(b.date))).at(-1);
  const trackingMonth = latestSnapshot ? monthsBetween(ledger.baselineDate, latestSnapshot.date) : null;
  const checkpointMonths = [...new Set([...(ledger?.checkpointMonths || []), trackingMonth].filter(Number.isFinite))].sort((a, b) => a - b);
  const common = {
    principal,
    startDate: spec.startDate,
    startStockWeight,
    targetStockWeight,
    cashReturn,
    nominalDividend: Number(spec.nominalDividend) || 1000000,
    safetyDividend: Number(spec.safetyDividend) || 1200000,
    checkpointMonths
  };
  const twoStage = simulateDividendAcceleration({ ...common, ...spec.twoStage });
  const underwrittenTwoStage = Number.isFinite(underwritingReturn)
    ? simulateDividendAcceleration({ ...common, ...spec.twoStage, accumulationReturn: underwritingReturn })
    : null;
  const incomeFirst = simulateIncomeFirst({ ...common, ...spec.incomeFirst });
  const current = dividendRunway?.scenarios?.find(row => row.id === 'base');
  const paths = [
    incomeFirst && { id: 'incomeFirst', label: '现在转高股息', confidence: '不推荐作为最快路径', ...incomeFirst },
    current && {
      id: 'currentHybrid',
      label: '当前混合路径',
      confidence: '旧基准',
      deploymentMonths: current.deploymentMonths,
      terminalReturn: current.targetPortfolioReturn,
      terminalYield: current.terminalYield,
      nominal: { months: current.nominalMonths, duration: current.nominalDuration, date: current.nominalDate, assets: current.nominalAssets },
      safety: { months: current.safetyMonths, duration: current.safetyDuration, date: current.safetyDate, assets: current.safetyAssets }
    },
    twoStage && { id: 'twoStage', label: '公司基准兑现路线', confidence: '上行执行线，非保守规划', ...twoStage },
    underwrittenTwoStage && { id: 'underwrittenTwoStage', label: '承保规划路线', confidence: '推荐保守规划基准', ...underwrittenTwoStage }
  ].filter(Boolean);
  const saving = current && underwrittenTwoStage ? {
    nominalMonths: current.nominalMonths - underwrittenTwoStage.nominal.months,
    safetyMonths: current.safetyMonths - underwrittenTwoStage.safety.months
  } : null;
  const companyBaseSaving = current && twoStage ? {
    nominalMonths: current.nominalMonths - twoStage.nominal.months,
    safetyMonths: current.safetyMonths - twoStage.safety.months
  } : null;
  const contributionConfig = spec.contributionSensitivity || {};
  const annualContributionValues = [...new Set((contributionConfig.annualContributions || [0]).map(Number)
    .filter(value => Number.isFinite(value) && value >= 0))].sort((a, b) => a - b);
  const contributionRows = Number.isFinite(underwritingReturn) && underwrittenTwoStage
    ? annualContributionValues.map(annualContribution => {
      const result = simulateDividendAcceleration({
        ...common,
        ...spec.twoStage,
        accumulationReturn: underwritingReturn,
        monthlyContribution: annualContribution / 12
      });
      return {
        annualContribution,
        monthlyContribution: annualContribution / 12,
        nominal: result.nominal,
        safety: result.safety,
        migrationStartMonth: result.migrationStartMonth,
        migrationStartDate: result.migrationStartDate,
        nominalMonthsSaved: underwrittenTwoStage.nominal.months - result.nominal.months,
        safetyMonthsSaved: underwrittenTwoStage.safety.months - result.safety.months
      };
    })
    : [];
  const solveContributionThreshold = (milestone, maxMonths, schedule = {}) => {
    if (!Number.isFinite(underwritingReturn) || !underwrittenTwoStage?.[milestone]) return null;
    if (underwrittenTwoStage[milestone].months <= maxMonths) return { annualContribution: 0, ...underwrittenTwoStage[milestone] };
    let lower = 0;
    let upper = Number(contributionConfig.searchCeiling) || 5000000;
    const simulate = annualContribution => simulateDividendAcceleration({
      ...common,
      ...spec.twoStage,
      accumulationReturn: underwritingReturn,
      monthlyContribution: annualContribution / 12,
      ...schedule
    });
    if (simulate(upper)?.[milestone]?.months > maxMonths) return null;
    for (let iteration = 0; iteration < 60; iteration += 1) {
      const middle = (lower + upper) / 2;
      if (simulate(middle)?.[milestone]?.months <= maxMonths) upper = middle;
      else lower = middle;
    }
    const annualContribution = Math.ceil(upper);
    const result = simulate(annualContribution);
    return {
      annualContribution,
      monthlyContribution: annualContribution / 12,
      maxMonths,
      contributionStartMonth: result.contributionStartMonth,
      contributionEndMonth: result.contributionEndMonth,
      migrationStartMonth: result.migrationStartMonth,
      migrationStartDate: result.migrationStartDate,
      ...result[milestone]
    };
  };
  const tenYearNominalThreshold = solveContributionThreshold('nominal', 120);
  const tenYearSafetyThreshold = solveContributionThreshold('safety', 120);
  const robustnessConfig = contributionConfig.robustness || {};
  const delayedStartMonths = Number(robustnessConfig.delayedStartMonths) || 12;
  const completionRate = Number(robustnessConfig.completionRate) || 0.8;
  const contributionYears = Number(robustnessConfig.contributionYears) || 5;
  const delayedSafetyThreshold = solveContributionThreshold('safety', 120, { contributionStartMonth: delayedStartMonths + 1 });
  const limitedYearsSafetyThreshold = solveContributionThreshold('safety', 120, { contributionEndMonth: contributionYears * 12 });
  const combinedPlannedAnnualContribution = delayedSafetyThreshold && completionRate > 0
    ? Math.ceil(delayedSafetyThreshold.annualContribution / completionRate)
    : null;
  return {
    startDate: spec.startDate,
    principal,
    startStockWeight,
    targetStockWeight,
    paths,
    saving,
    companyBaseSaving,
    contributionSensitivity: {
      status: contributionConfig.status || 'scenario-only',
      actualAnnualContribution: contributionConfig.actualAnnualContribution ?? null,
      rows: contributionRows,
      tenYearNominalThreshold,
      tenYearSafetyThreshold,
      robustness: {
        delayedStartMonths,
        completionRate,
        contributionYears,
        delayedSafetyThreshold,
        limitedYearsSafetyThreshold,
        combinedPlannedAnnualContribution,
        combinedRealizedAnnualContribution: combinedPlannedAnnualContribution == null ? null : combinedPlannedAnnualContribution * completionRate,
        combinedMonthlyPlannedContribution: combinedPlannedAnnualContribution == null ? null : combinedPlannedAnnualContribution / 12
      },
      note: contributionConfig.note || '新增本金按月末投入，始终使用正式七席承保回报与终态股息率；不把入金计作投资收益。'
    },
    phasePortfolios: spec.phasePortfolios || [],
    rules: spec.rules || [],
    note: spec.note
  };
}

function buildIncomePortfolioAudit(payload, dividendAcceleration) {
  const config = payload.goals?.dividendAcceleration?.incomePortfolio;
  const pf = payload.portfolio;
  if (!config || !pf || !Array.isArray(config.rows)) return null;
  const rows = config.rows.map(row => ({
    ...row,
    weight: Number(row.weight),
    assumedAfterTaxYield: Number(row.assumedAfterTaxYield),
    routineHaircut: Number(row.routineHaircut),
    severeHaircut: Number(row.severeHaircut)
  }));
  const stockWeight = rows.reduce((sum, row) => sum + row.weight, 0);
  const cashWeight = Number(config.cashWeight);
  const normalYield = rows.reduce((sum, row) => sum + row.weight * row.assumedAfterTaxYield, 0);
  const routineYield = rows.reduce((sum, row) => sum + row.weight * row.assumedAfterTaxYield * (1 - row.routineHaircut), 0);
  const severeYield = rows.reduce((sum, row) => sum + row.weight * row.assumedAfterTaxYield * (1 - row.severeHaircut), 0);
  const auditedRows = rows.map(row => {
    const weightedDividendYield = row.weight * row.assumedAfterTaxYield;
    return {
      ...row,
      weightedDividendYield,
      normalDividendContribution: normalYield > 0 ? weightedDividendYield / normalYield : null,
      routineWeightedYield: weightedDividendYield * (1 - row.routineHaircut),
      severeWeightedYield: weightedDividendYield * (1 - row.severeHaircut)
    };
  });
  const modelYield = Number(payload.goals?.dividendAcceleration?.twoStage?.terminalYield);
  const formalSafetyAssets = Number(pf.currentDividendBaseline?.safetyAssetsNeeded) || 1200000 / modelYield;
  const severeSafetyAssets = severeYield > 0 ? 1000000 / severeYield : null;
  const spec = payload.goals.dividendAcceleration;
  const formalPath = dividendAcceleration?.paths?.find(row => row.id === 'underwrittenTwoStage');
  const severeSafetyPath = formalPath && severeYield > 0 ? simulateDividendAcceleration({
    principal: Number(pf.totalAssets),
    startDate: spec.startDate,
    startStockWeight: Number(pf.stockMarketValue) / Number(pf.totalAssets),
    targetStockWeight: 1 - Number(pf.opportunityCash.weight),
    cashReturn: Number(pf.opportunityCash.baseAnnualReturn),
    accumulationReturn: formalPath.accumulationReturn,
    accumulationYield: Number(spec.twoStage.accumulationYield),
    deploymentMonths: Number(spec.twoStage.deploymentMonths),
    migrationStartAssets: Number(spec.twoStage.migrationStartAssets),
    migrationMonths: Number(spec.twoStage.migrationMonths),
    terminalReturn: Number(config.terminalReturnFloor),
    terminalYield: severeYield,
    nominalDividend: 1000000,
    safetyDividend: 1000000
  }) : null;
  const maxDividendContribution = auditedRows.reduce((max, row) => Math.max(max, row.normalDividendContribution || 0), 0);
  return {
    status: config.status || 'future-blueprint',
    maxHoldings: Number(config.maxHoldings) || 7,
    holdingCount: auditedRows.length,
    stockWeight,
    cashWeight,
    totalWeight: stockWeight + cashWeight,
    terminalReturnFloor: Number(config.terminalReturnFloor),
    modelYield,
    normalYield,
    routineYield,
    severeYield,
    maxDividendContribution,
    rows: auditedRows,
    nominalAssets: normalYield > 0 ? 1000000 / normalYield : null,
    routineSafetyAssets: routineYield > 0 ? 1000000 / routineYield : null,
    severeSafetyAssets,
    formalSafetyAssets,
    routineDividendAtFormalSafetyAssets: formalSafetyAssets * routineYield,
    severeDividendAtFormalSafetyAssets: formalSafetyAssets * severeYield,
    severeSafetyPath: severeSafetyPath?.safety || null,
    constraints: config.constraints || [],
    note: config.note || ''
  };
}

function simulateSpendingSustainability({
  startingAssets,
  annualReturn,
  dividendYield,
  startingAnnualSpend,
  inflation,
  years
}) {
  const values = [startingAssets, annualReturn, dividendYield, startingAnnualSpend, inflation, years];
  if (!values.every(Number.isFinite) || startingAssets <= 0 || annualReturn < -1
      || dividendYield <= 0 || startingAnnualSpend < 0 || inflation < 0 || years < 1) return null;
  let assets = startingAssets;
  let minDividendCoverage = assets * dividendYield / startingAnnualSpend;
  let firstDividendCoverageBreachMonth = minDividendCoverage < 1 ? 0 : null;
  let firstPrincipalBreachMonth = null;
  const annualSnapshots = [];
  const snapshotYears = new Set([1, 5, 10, 20, years]);
  for (let month = 1; month <= years * 12; month += 1) {
    assets *= Math.pow(1 + annualReturn, 1 / 12);
    const annualSpend = startingAnnualSpend * Math.pow(1 + inflation, month / 12);
    const annualDividend = assets * dividendYield;
    const dividendCoverage = annualSpend > 0 ? annualDividend / annualSpend : Infinity;
    minDividendCoverage = Math.min(minDividendCoverage, dividendCoverage);
    if (firstDividendCoverageBreachMonth == null && dividendCoverage < 1) firstDividendCoverageBreachMonth = month;
    assets -= annualSpend / 12;
    if (firstPrincipalBreachMonth == null && assets < startingAssets) firstPrincipalBreachMonth = month;
    if (month % 12 === 0 && snapshotYears.has(month / 12)) {
      annualSnapshots.push({
        year: month / 12,
        assets,
        realAssets: assets / Math.pow(1 + inflation, month / 12),
        annualSpend,
        annualDividend: assets * dividendYield,
        dividendCoverage: assets * dividendYield / annualSpend
      });
    }
    if (assets <= 0) break;
  }
  return {
    years,
    startingAssets,
    startingAnnualSpend,
    annualReturn,
    dividendYield,
    inflation,
    minDividendCoverage,
    firstDividendCoverageBreachMonth,
    firstPrincipalBreachMonth,
    endingAssets: assets,
    endingRealAssets: assets / Math.pow(1 + inflation, years),
    annualSnapshots
  };
}

function buildPurchasingPowerAudit(payload, dividendAcceleration, incomePortfolioAudit) {
  const config = payload.goals?.dividendAcceleration?.purchasingPower;
  const spec = payload.goals?.dividendAcceleration;
  const pf = payload.portfolio;
  const formalPath = dividendAcceleration?.paths?.find(row => row.id === 'underwrittenTwoStage');
  if (!config || !spec || !pf || !formalPath || !incomePortfolioAudit) return null;
  const baseAnnualIncome = Number(config.baseAnnualIncome) || 1000000;
  const routineBuffer = Number(config.routineBuffer) || 1.2;
  const planningInflation = Number(config.planningInflation);
  const inflationScenarios = [...new Set((config.inflationScenarios || [planningInflation]).map(Number)
    .filter(value => Number.isFinite(value) && value >= 0))].sort((a, b) => a - b);
  const common = {
    principal: Number(pf.totalAssets),
    startDate: spec.startDate,
    startStockWeight: Number(pf.stockMarketValue) / Number(pf.totalAssets),
    targetStockWeight: 1 - Number(pf.opportunityCash.weight),
    cashReturn: Number(pf.opportunityCash.baseAnnualReturn),
    accumulationReturn: formalPath.accumulationReturn,
    accumulationYield: Number(spec.twoStage.accumulationYield),
    deploymentMonths: Number(spec.twoStage.deploymentMonths),
    migrationStartAssets: Number(spec.twoStage.migrationStartAssets),
    migrationMonths: Number(spec.twoStage.migrationMonths),
    terminalReturn: Number(spec.incomePortfolio.terminalReturnFloor),
    terminalYield: Number(spec.twoStage.terminalYield)
  };
  const fixedRoutine = formalPath.safety;
  const rows = inflationScenarios.map(inflation => {
    const realPath = simulateDividendAcceleration({
      ...common,
      nominalDividend: baseAnnualIncome,
      safetyDividend: baseAnnualIncome * routineBuffer,
      nominalDividendGrowth: inflation,
      safetyDividendGrowth: inflation
    });
    const severePath = simulateDividendAcceleration({
      ...common,
      terminalYield: incomePortfolioAudit.severeYield,
      nominalDividend: baseAnnualIncome,
      safetyDividend: baseAnnualIncome * routineBuffer,
      nominalDividendGrowth: inflation,
      safetyDividendGrowth: inflation
    });
    const fixedSafetyInflationFactor = Math.pow(1 + inflation, fixedRoutine.months / 12);
    return {
      inflation,
      fixedRoutineNominalDividend: fixedRoutine.annualDividend,
      fixedRoutineRealDividend: fixedRoutine.annualDividend / fixedSafetyInflationFactor,
      realNominal: realPath?.nominal || null,
      realRoutineSafety: realPath?.safety || null,
      realSevereSafety: severePath?.safety || null
    };
  });
  const planning = rows.find(row => Math.abs(row.inflation - planningInflation) < 1e-12) || null;
  const contributionConfig = config.contributionSensitivity || {};
  const contributionValues = [...new Set((contributionConfig.annualContributions || [0]).map(Number)
    .filter(value => Number.isFinite(value) && value >= 0))].sort((a, b) => a - b);
  const runContributionPath = (annualContribution, severe = false, schedule = {}) => simulateDividendAcceleration({
    ...common,
    terminalYield: severe ? incomePortfolioAudit.severeYield : common.terminalYield,
    nominalDividend: baseAnnualIncome,
    safetyDividend: baseAnnualIncome * routineBuffer,
    nominalDividendGrowth: planningInflation,
    safetyDividendGrowth: planningInflation,
    monthlyContribution: annualContribution / 12,
    ...schedule
  });
  const contributionRows = contributionValues.map(annualContribution => {
    const routine = runContributionPath(annualContribution);
    const severe = runContributionPath(annualContribution, true);
    return {
      annualContribution,
      monthlyContribution: annualContribution / 12,
      realNominal: routine?.nominal || null,
      realRoutineSafety: routine?.safety || null,
      realSevereSafety: severe?.safety || null,
      routineMonthsSaved: planning?.realRoutineSafety && routine?.safety
        ? planning.realRoutineSafety.months - routine.safety.months : null,
      severeMonthsSaved: planning?.realSevereSafety && severe?.safety
        ? planning.realSevereSafety.months - severe.safety.months : null
    };
  });
  const solveContributionThreshold = (horizonYears, severe = false, schedule = {}) => {
    const maxMonths = horizonYears * 12;
    const zero = runContributionPath(0, severe, schedule)?.safety;
    if (zero?.months <= maxMonths) return { annualContribution: 0, monthlyContribution: 0, horizonYears, ...zero };
    let lower = 0;
    let upper = Number(contributionConfig.searchCeiling) || 5000000;
    const simulate = annualContribution => runContributionPath(annualContribution, severe, schedule);
    if (simulate(upper)?.safety?.months > maxMonths) return null;
    for (let iteration = 0; iteration < 60; iteration += 1) {
      const middle = (lower + upper) / 2;
      if (simulate(middle)?.safety?.months <= maxMonths) upper = middle;
      else lower = middle;
    }
    const annualContribution = Math.ceil(upper);
    const result = simulate(annualContribution);
    return {
      annualContribution,
      monthlyContribution: annualContribution / 12,
      horizonYears,
      maxMonths,
      contributionStartMonth: result.contributionStartMonth,
      contributionEndMonth: result.contributionEndMonth,
      ...result.safety
    };
  };
  const targetYears = [...new Set((contributionConfig.targetYears || [10, 15, 20]).map(Number)
    .filter(value => Number.isFinite(value) && value > 0))].sort((a, b) => a - b);
  const horizonThresholds = targetYears.map(horizonYears => ({
    horizonYears,
    routine: solveContributionThreshold(horizonYears),
    severe: solveContributionThreshold(horizonYears, true)
  }));
  const robustnessConfig = contributionConfig.robustness || {};
  const robustnessHorizonYears = Number(robustnessConfig.horizonYears) || 15;
  const delayedStartMonths = Number(robustnessConfig.delayedStartMonths) || 12;
  const completionRate = Number(robustnessConfig.completionRate) || 0.8;
  const contributionYears = Number(robustnessConfig.contributionYears) || 5;
  const delayedRoutineThreshold = solveContributionThreshold(robustnessHorizonYears, false, {
    contributionStartMonth: delayedStartMonths + 1
  });
  const limitedYearsRoutineThreshold = solveContributionThreshold(robustnessHorizonYears, false, {
    contributionEndMonth: contributionYears * 12
  });
  const combinedPlannedAnnualContribution = delayedRoutineThreshold && completionRate > 0
    ? Math.ceil(delayedRoutineThreshold.annualContribution / completionRate)
    : null;
  const projectionYears = Number(config.projectionYears) || 30;
  const severeTerminalReturn = Number(config.severeTerminalReturn) || 0.06;
  const routineStartSpend = planning?.realRoutineSafety
    ? baseAnnualIncome * Math.pow(1 + planningInflation, planning.realRoutineSafety.months / 12)
    : null;
  const severeStartSpend = planning?.realSevereSafety
    ? baseAnnualIncome * Math.pow(1 + planningInflation, planning.realSevereSafety.months / 12)
    : null;
  const postAchievement = planning?.realRoutineSafety && planning?.realSevereSafety ? {
    projectionYears,
    routine: simulateSpendingSustainability({
      startingAssets: planning.realRoutineSafety.assets,
      annualReturn: Number(spec.incomePortfolio.terminalReturnFloor),
      dividendYield: Number(spec.twoStage.terminalYield),
      startingAnnualSpend: routineStartSpend,
      inflation: planningInflation,
      years: projectionYears
    }),
    severe: simulateSpendingSustainability({
      startingAssets: planning.realSevereSafety.assets,
      annualReturn: severeTerminalReturn,
      dividendYield: incomePortfolioAudit.severeYield,
      startingAnnualSpend: severeStartSpend,
      inflation: planningInflation,
      years: projectionYears
    }),
    note: '投影把总回报视为含股息回报，并在每月复利后扣除支用；它检验数学覆盖，不替代逐公司分红能力。'
  } : null;
  return {
    status: config.status || 'planning-scenario',
    baseYear: Number(config.baseYear),
    baseAnnualIncome,
    planningInflation,
    routineBuffer,
    severeTerminalReturn,
    rows,
    planning,
    contributionSensitivity: {
      status: contributionConfig.status || 'scenario-only',
      actualAnnualContribution: contributionConfig.actualAnnualContribution ?? null,
      rows: contributionRows,
      horizonThresholds,
      robustness: {
        horizonYears: robustnessHorizonYears,
        delayedStartMonths,
        completionRate,
        contributionYears,
        delayedRoutineThreshold,
        limitedYearsRoutineThreshold,
        combinedPlannedAnnualContribution,
        combinedRealizedAnnualContribution: combinedPlannedAnnualContribution == null
          ? null : combinedPlannedAnnualContribution * completionRate
      },
      note: contributionConfig.note || '新增本金按月末投入并持续到目标；不把入金计作投资收益。'
    },
    postAchievement,
    dividendGrowthGate: {
      minimumNominalGrowth: planningInflation,
      evidenceYears: Number(config.dividendGrowthEvidenceYears) || 3,
      status: 'unverified',
      reason: '当前没有连续三年终态组合普通股息历史，不能假设股息增长已跑赢通胀。'
    },
    spendingPolicy: config.spendingPolicy || {},
    note: config.note || ''
  };
}

function buildGoalPathTracking(payload, dividendAcceleration) {
  const ledger = payload.goalLedger;
  if (!ledger) return null;
  const snapshots = [...(ledger.snapshots || [])].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const latest = snapshots.at(-1);
  const path = dividendAcceleration?.paths?.find(row => row.id === 'underwrittenTwoStage');
  if (!latest || !path) return { status: 'missing', severity: 'red', snapshots, rules: ledger.rules || [] };
  const elapsedMonths = monthsBetween(ledger.baselineDate, latest.date);
  const expected = path.checkpoints?.find(row => row.months === elapsedMonths) || null;
  const ranges = [...(ledger.deploymentRanges || [])].sort((a, b) => a.month - b.month);
  const activeRange = [...ranges].reverse().find(row => row.month <= elapsedMonths) || ranges[0] || null;
  const actualAssets = Number(latest.totalAssets);
  const actualStockWeight = Number.isFinite(Number(latest.stockWeight))
    ? Number(latest.stockWeight)
    : Number(latest.stockMarketValue) / actualAssets;
  const actualDividend = Number(latest.normalizedAfterTaxDividend);
  const assetGapPct = expected && Number.isFinite(actualAssets) ? actualAssets / expected.assets - 1 : null;
  const dividendGapPct = expected && Number.isFinite(actualDividend) && expected.annualDividend > 0
    ? actualDividend / expected.annualDividend - 1 : null;
  const deviations = [];
  if (elapsedMonths >= 3 && assetGapPct < -0.15) deviations.push({ severity: 'red', item: '资产路径', detail: `总资产比承保路径低${Math.abs(assetGapPct * 100).toFixed(1)}%` });
  else if (elapsedMonths >= 3 && assetGapPct < -0.05) deviations.push({ severity: 'amber', item: '资产路径', detail: `总资产比承保路径低${Math.abs(assetGapPct * 100).toFixed(1)}%` });
  if (activeRange && elapsedMonths >= activeRange.month && actualStockWeight < activeRange.minStockWeight - 1e-9) {
    deviations.push({ severity: 'amber', item: '部署进度', detail: `股票仓位${(actualStockWeight * 100).toFixed(1)}%，低于条件区间${(activeRange.minStockWeight * 100).toFixed(0)}%—${(activeRange.maxStockWeight * 100).toFixed(0)}%；只复核机会，不追价` });
  }
  if (activeRange && actualStockWeight > activeRange.maxStockWeight + 1e-9) {
    deviations.push({ severity: 'red', item: '部署进度', detail: `股票仓位${(actualStockWeight * 100).toFixed(1)}%超过当期条件上限${(activeRange.maxStockWeight * 100).toFixed(0)}%` });
  }
  if (elapsedMonths >= 3 && dividendGapPct < -0.15) deviations.push({ severity: 'amber', item: '普通股息', detail: `正常化股息比路径低${Math.abs(dividendGapPct * 100).toFixed(1)}%` });
  const thesisBreaches = latest.thesisBreaches || [];
  if (thesisBreaches.length >= 2) deviations.push({ severity: 'red', item: '投资论文', detail: `${thesisBreaches.length}项核心突破：${thesisBreaches.join('、')}` });
  else if (thesisBreaches.length === 1) deviations.push({ severity: 'amber', item: '投资论文', detail: thesisBreaches[0] });
  let rollingReturn = null;
  let rollingReturnMethod = null;
  if (elapsedMonths >= 36) {
    const prior = [...snapshots].reverse().find(row => monthsBetween(row.date, latest.date) >= 36);
    const priorIndex = prior ? snapshots.indexOf(prior) : -1;
    const periodSnapshots = priorIndex >= 0 ? snapshots.slice(priorIndex) : [];
    let linkedGrowth = 1;
    let linkedMonths = 0;
    let validGrowth = periodSnapshots.length >= 2;
    for (let index = 1; index < periodSnapshots.length && validGrowth; index += 1) {
      const start = Number(periodSnapshots[index - 1].totalAssets);
      const end = Number(periodSnapshots[index].totalAssets);
      const flow = Number(periodSnapshots[index].netExternalFlow) || 0;
      const span = monthsBetween(periodSnapshots[index - 1].date, periodSnapshots[index].date);
      const flowAdjustedEnd = end - flow;
      if (!(start > 0) || !(flowAdjustedEnd > 0) || !(span > 0)) validGrowth = false;
      else {
        linkedGrowth *= flowAdjustedEnd / start;
        linkedMonths += span;
      }
    }
    if (validGrowth && linkedMonths > 0) {
      rollingReturn = Math.pow(linkedGrowth, 12 / linkedMonths) - 1;
      rollingReturnMethod = '区间收益链结；每期净入金按期末发生处理';
    }
    if (rollingReturn != null && rollingReturn < 0.05 && thesisBreaches.length >= 2) deviations.push({ severity: 'red', item: '承保回报', detail: `滚动年化${(rollingReturn * 100).toFixed(2)}%，且论文已多项突破，应重做组合` });
    else if (rollingReturn != null && rollingReturn < 0.075) deviations.push({ severity: 'amber', item: '承保回报', detail: `滚动年化${(rollingReturn * 100).toFixed(2)}%，使用7%压力路径重算` });
  }
  const severity = deviations.some(row => row.severity === 'red') ? 'red' : deviations.length ? 'amber' : 'green';
  const nextCheckpoint = path.checkpoints?.find(row => row.months > elapsedMonths) || null;
  const checkpoints = (path.checkpoints || []).map(row => ({
    ...row,
    guardrailRange: [...ranges].reverse().find(range => range.month <= row.months) || null
  }));
  const cumulativeExternalFlow = snapshots.reduce((sum, row) => sum + (Number(row.netExternalFlow) || 0), 0);
  return {
    asOf: ledger.asOf,
    baselineDate: ledger.baselineDate,
    reviewFrequency: ledger.reviewFrequency,
    status: elapsedMonths === 0 ? '基线已建立' : severity === 'green' ? '路径正常' : severity === 'amber' ? '需复核' : '需重审',
    severity,
    elapsedMonths,
    latest,
    expected,
    activeRange,
    assetGapPct,
    dividendGapPct,
    rollingReturn,
    rollingReturnMethod,
    cumulativeExternalFlow,
    deviations,
    nextCheckpoint,
    checkpoints,
    nextReviewDate: addMonths(latest.date, 1),
    rules: ledger.rules || []
  };
}

function buildDecisionMetrics(payload) {
  const pf = payload.portfolio;
  const stocksByName = new Map(payload.stocks.map(s => [s.name, s]));
  const targetRows = (pf.targetPortfolio || []).map(t => {
    const stock = stocksByName.get(t.name);
    const explicitReturn = Number(t.baseAnnualReturn);
    const reportBaseIrr = Number(stock?.scenarios?.base?.irr10y);
    const pessimisticIrr = Number(stock?.scenarios?.pessimistic?.irr10y);
    const optimisticIrr = Number(stock?.scenarios?.optimistic?.irr10y);
    const baseIrr = Number.isFinite(explicitReturn) ? explicitReturn : reportBaseIrr;
    const grade = stock?.grade || t.qualityGrade || null;
    const scenarioWeights = grade === 'A'
      ? { pessimistic: 0.25, base: 0.60, optimistic: 0.15 }
      : { pessimistic: 0.40, base: 0.50, optimistic: 0.10 };
    const underwritingIrr = [pessimisticIrr, reportBaseIrr, optimisticIrr].every(Number.isFinite)
      ? pessimisticIrr * scenarioWeights.pessimistic
        + reportBaseIrr * scenarioWeights.base
        + optimisticIrr * scenarioWeights.optimistic
      : null;
    const reportHardLimit = firstPercent(stock?.position?.hard);
    const absoluteHardLimit = 0.25;
    const effectiveHardLimit = reportHardLimit == null ? absoluteHardLimit : Math.min(reportHardLimit, absoluteHardLimit);
    return {
      ...t,
      grade,
      baseIrr: Number.isFinite(baseIrr) ? baseIrr : null,
      pessimisticIrr: Number.isFinite(pessimisticIrr) ? pessimisticIrr : null,
      optimisticIrr: Number.isFinite(optimisticIrr) ? optimisticIrr : null,
      underwritingIrr,
      scenarioWeights,
      returnLabel: executableReturnLabel(grade, baseIrr),
      weightedContribution: Number.isFinite(baseIrr) ? t.weight * baseIrr : null,
      reportHardLimit,
      effectiveHardLimit,
      limitBreach: t.weight > effectiveHardLimit + 1e-9
    };
  });
  const cashWeight = Number(pf.opportunityCash?.weight) || 0;
  const cashReturn = Number(pf.opportunityCash?.baseAnnualReturn);
  const cashCoveredWeight = Number.isFinite(cashReturn) ? cashWeight : 0;
  const coveredWeight = targetRows.reduce((s, r) => s + (r.baseIrr == null ? 0 : r.weight), 0) + cashCoveredWeight;
  const weightedReturn = targetRows.reduce((s, r) => s + (r.weightedContribution || 0), 0)
    + (Number.isFinite(cashReturn) ? cashWeight * cashReturn : 0);
  const normalizedWeightedReturn = coveredWeight > 0 ? weightedReturn / coveredWeight : null;
  const underwritingCoveredWeight = targetRows.reduce((sum, row) =>
    sum + (Number.isFinite(row.underwritingIrr) ? row.weight : 0), 0) + cashCoveredWeight;
  const underwritingWeightedReturn = underwritingCoveredWeight > 0
    ? (targetRows.reduce((sum, row) => sum + (Number.isFinite(row.underwritingIrr) ? row.weight * row.underwritingIrr : 0), 0)
      + (Number.isFinite(cashReturn) ? cashWeight * cashReturn : 0)) / underwritingCoveredWeight
    : null;
  const required5 = Math.pow(2, 1 / 5) - 1;
  const required10 = Math.pow(5, 1 / 10) - 1;
  const executableStocks = payload.stocks.filter(s => s.grade === 'A' || s.grade === 'B');
  const executableIrrs = executableStocks.map(s => Number(s?.scenarios?.base?.irr10y)).filter(Number.isFinite);
  const maxBaseIrr = executableIrrs.length ? Math.max(...executableIrrs) : null;
  const hardTargetStocks = executableStocks.filter(s => Number(s?.scenarios?.base?.irr10y) >= required10).map(s => ({
    name: s.name,
    grade: s.grade,
    baseIrr: Number(s.scenarios.base.irr10y),
    hardLimit: firstPercent(s?.position?.hard)
  }));
  const compliantRows = targetRows.map(r => ({
    ...r,
    recommendedWeight: Math.min(r.weight, r.effectiveHardLimit),
    recommendedValue: pf.totalAssets * Math.min(r.weight, r.effectiveHardLimit)
  }));
  const compliantWeight = compliantRows.reduce((s, r) => s + r.recommendedWeight, 0);
  const reserveWeight = Math.max(cashWeight, 1 - compliantWeight);
  const compliantContribution = compliantRows.reduce((s, r) => s + (r.baseIrr == null ? 0 : r.recommendedWeight * r.baseIrr), 0);
  const reserveRequiredReturn = reserveWeight > 0 ? (required10 - compliantContribution) / reserveWeight : null;
  const calculatedTargetDividend = (pf.dividends?.perStock || []).reduce((sum, d) =>
    sum + (Number.isFinite(d.afterTaxYield) ? d.targetValue * d.afterTaxYield : 0), 0);
  const targetDividend = calculatedTargetDividend;
  const holdingByName = new Map((pf.holdings || []).map(h => [h.name, h]));
  const baselineCurrentDividend = Number(pf.currentDividendBaseline?.current);
  const currentDividend = Number.isFinite(baselineCurrentDividend) ? baselineCurrentDividend
    : (pf.dividends?.perStock || []).reduce((sum, d) => {
      const held = holdingByName.get(d.name);
      return sum + (held && Number.isFinite(d.afterTaxYield) ? held.marketValue * d.afterTaxYield : 0);
    }, 0);
  const postInitialDividend = optionalNumber(pf.currentDividendBaseline?.postInitialTrade);
  const postSeatReplacementDividend = optionalNumber(pf.currentDividendBaseline?.postSeatReplacement);
  const postTencentSecondTierDividend = optionalNumber(pf.currentDividendBaseline?.postTencentSecondTier);
  const postTriggeredDividend = optionalNumber(pf.currentDividendBaseline?.postTriggeredCandidate);
  const postPrimaryQueueDividend = optionalNumber(pf.currentDividendBaseline?.postPrimaryQueue);
  const dividendRunway = buildDividendRunway(payload, normalizedWeightedReturn);
  const dividendAcceleration = buildDividendAcceleration(payload, dividendRunway, underwritingWeightedReturn);
  const incomePortfolioAudit = buildIncomePortfolioAudit(payload, dividendAcceleration);
  const purchasingPowerAudit = buildPurchasingPowerAudit(payload, dividendAcceleration, incomePortfolioAudit);
  const goalPathTracking = buildGoalPathTracking(payload, dividendAcceleration);
  const alerts = [];
  const activeHoldingCount = (pf.holdings || []).filter(row => Number(row.quantity) > 0).length;
  const maxHoldings = Number(pf.concentrationPolicy?.maxHoldings) || 7;
  if (activeHoldingCount > maxHoldings) {
    alerts.push({ severity: 'red', title: '实际持仓超过七席上限', detail: `券商成交账本当前有${activeHoldingCount}只持仓，超过政策上限${maxHoldings}只。事实记录保留，但新增资金暂停；必须明确选择退出席位后再恢复执行。` });
  }
  if (normalizedWeightedReturn != null && normalizedWeightedReturn < required10) {
    alerts.push({ severity: 'red', title: '10年5倍存在结构性缺口', detail: `目标组合按报告基准IRR加权仅 ${(normalizedWeightedReturn * 100).toFixed(2)}%，低于所需 ${(required10 * 100).toFixed(2)}% ${(required10 - normalizedWeightedReturn > 0 ? '约' + ((required10 - normalizedWeightedReturn) * 100).toFixed(2) + '个百分点' : '')}。` });
  }
  if (!hardTargetStocks.length) {
    alerts.push({ severity: 'red', title: '当前没有可执行标的满足10年5倍硬目标', detail: `A/B类股票最高基准十年IRR为 ${maxBaseIrr == null ? '无法计算' : (maxBaseIrr * 100).toFixed(1) + '%'}，低于所需 ${(required10 * 100).toFixed(2)}%；不能靠重新分配旧价格下的仓位解决。` });
  } else {
    const hardCapacity = hardTargetStocks.reduce((s, x) => s + (x.hardLimit || 0), 0);
    const names = hardTargetStocks.map(x => `${x.name}${(x.baseIrr * 100).toFixed(1)}%（${x.grade}类，上限${x.hardLimit == null ? '待定' : (x.hardLimit * 100).toFixed(0) + '%'}）`).join('、');
    if (!hardTargetStocks.some(x => x.grade === 'A') || hardCapacity < 0.2) {
      alerts.push({ severity: 'amber', title: '有个别标的达到硬目标，但不足以支撑整个组合', detail: `${names}。高IRR来自基准假设且可承载仓位有限，不能据此把组合目标标记为可实现。` });
    }
  }
  targetRows.filter(r => r.limitBreach).forEach(r => alerts.push({ severity: 'red', title: `${r.name}目标仓位越过报告硬上限`, detail: `目标 ${(r.weight * 100).toFixed(0)}%，报告硬上限 ${(r.effectiveHardLimit * 100).toFixed(0)}%；超额部分只能是待批准条件仓，不能视为默认配置。` }));
  if ((pf.cash || 0) / (pf.totalAssets || 1) > 0.7) alerts.push({ severity: 'amber', title: '现金占比高，存在长期踏空风险', detail: `待部署现金约 ${((pf.cash || 0) / 10000).toFixed(1)}万元；应靠P12/P15/P17与基本面闸门分批投入，不靠主观等最低价。` });
  if (pf.executionPlan?.status?.includes('待执行')) alerts.push({ severity: 'amber', title: '首次建仓尚未执行', detail: `计划净使用现金约 ${(pf.executionPlan.expectedNetCashUse / 10000).toFixed(1)}万元；执行后股票仓约 ${(pf.executionPlan.postStockWeight * 100).toFixed(1)}%。执行以最新部署卡为准，万华当前暂不卖出。` });
  if (pf.deploymentQueue?.threeMonthGap > 0) {
    const covered = Number(pf.deploymentQueue.coverageRatio) >= 1;
    alerts.push({ severity: 'amber', title: covered ? '三个月部署队列已覆盖缺口，但仍依赖价格触发' : '七席内可执行队列尚未覆盖三个月缺口', detail: `首轮后至29%股票仓位还需约 ${(pf.deploymentQueue.threeMonthGap / 10000).toFixed(1)}万元；七席内条件金额约 ${(pf.deploymentQueue.primaryPotential / 10000).toFixed(1)}万元，覆盖 ${(pf.deploymentQueue.coverageRatio * 100).toFixed(0)}%。不为补缺口新增第8只或放宽买价。` });
  }
  const accelerated = dividendAcceleration?.paths?.find(s => s.id === 'underwrittenTwoStage');
  if (accelerated) alerts.push({ severity: 'amber', title: '名义100万元不是安全达标', detail: `当前${pf.targetPortfolio.length}只正式目标占位路径约${accelerated.nominal.duration}达到名义100万元，但约${accelerated.safety.duration}才达到120万元安全线；空缺席位通过后必须重新计算。` });
  if (accelerated) alerts.push({ severity: 'green', title: '最快的稳健路径不是现在追高股息', detail: `质量折扣后的承保路线约${accelerated.nominal.duration}达到名义线、约${accelerated.safety.duration}达到安全线；积累期承保年化${(accelerated.accumulationReturn * 100).toFixed(2)}%，不再把${(normalizedWeightedReturn * 100).toFixed(2)}%的公司基准机械加权当成保守承诺。` });
  if (incomePortfolioAudit?.holdingCount < incomePortfolioAudit?.maxHoldings) alerts.push({ severity: 'red', title: '终态收息席位尚未补齐', detail: `当前只识别${incomePortfolioAudit.holdingCount}只收入资产，第${incomePortfolioAudit.holdingCount + 1}席保持空缺并计入现金；宇通、宁德、康臣均不得自动补位。当前路径只是保守占位测算，不是完整终态验收。` });
  if (incomePortfolioAudit?.maxDividendContribution > 0.20) alerts.push({ severity: 'red', title: '终态股息集中度暂未通过', detail: `移除宇通后，最高单一公司普通股息贡献升至${(incomePortfolioAudit.maxDividendContribution * 100).toFixed(1)}%，超过20%上限；必须由合格第七席或重新配置解决，不能为通过审计而随意改权重。` });
  if (incomePortfolioAudit?.severeSafetyPath) alerts.push({ severity: 'amber', title: '120万元只覆盖日常减息，不覆盖复合严重压力', detail: `当前六席占位蓝图在统一减息15%后仍约${(incomePortfolioAudit.routineDividendAtFormalSafetyAssets / 10000).toFixed(1)}万元；按逐股严重削减假设，需资产约${(incomePortfolioAudit.severeSafetyAssets / 10000).toFixed(0)}万元、约${incomePortfolioAudit.severeSafetyPath.duration}后，才仍有100万元普通股息。` });
  if (purchasingPowerAudit?.planning?.realRoutineSafety) alerts.push({ severity: 'amber', title: '名义120万元不等于今天100万元购买力', detail: `按${(purchasingPowerAudit.planningInflation * 100).toFixed(0)}%规划通胀，固定120万元日常安全线届时只相当于${(purchasingPowerAudit.planning.fixedRoutineRealDividend / 10000).toFixed(1)}万元的${purchasingPowerAudit.baseYear}年购买力；若连20%缓冲也随通胀增长，约需${purchasingPowerAudit.planning.realRoutineSafety.duration}（${purchasingPowerAudit.planning.realRoutineSafety.date}）。` });
  const tenYearPowerContribution = purchasingPowerAudit?.contributionSensitivity?.horizonThresholds?.find(row => row.horizonYears === 10);
  if (tenYearPowerContribution?.routine) alerts.push({ severity: 'amber', title: '十年购买力安全线主要依赖外部现金流', detail: `在不提高${(accelerated.accumulationReturn * 100).toFixed(2)}%积累承保与${(incomePortfolioAudit.normalYield * 100).toFixed(3)}%终态股息率的条件下，十年达到2026年100万元购买力并保留20%缓冲，需持续净投入约${(tenYearPowerContribution.routine.annualContribution / 10000).toFixed(1)}万元/年；严重压力口径约需${(tenYearPowerContribution.severe.annualContribution / 10000).toFixed(1)}万元/年。实际能力尚未确认。` });
  if ((payload.portfolioEvolution?.unresolved || []).length) alerts.push({ severity: 'amber', title: '存在未统一的执行口径', detail: `仍有 ${payload.portfolioEvolution.unresolved.length} 项待确认；冲突未消除前，不应按旧价格表自动下单。` });
  if (reserveRequiredReturn != null && reserveRequiredReturn > 0.25) alerts.push({ severity: 'red', title: '仅靠预留机会仓无法填平目标缺口', detail: `按报告硬上限收缩后需预留 ${(reserveWeight * 100).toFixed(0)}%，但该预留仓需年化约 ${(reserveRequiredReturn * 100).toFixed(1)}% 才能把整体推到17.46%；这不是可接受的基准假设。` });
  return {
    required5,
    required10,
    weightedReturn: normalizedWeightedReturn,
    underwritingWeightedReturn,
    underwritingCoveredWeight,
    coveredWeight,
    cashWeight,
    cashReturn: Number.isFinite(cashReturn) ? cashReturn : null,
    currentStockWeight: (pf.stockMarketValue || 0) / (pf.totalAssets || 1),
    postInitialStockWeight: Number(pf.executionPlan?.postStockWeight) || null,
    fiveYearMultiple: normalizedWeightedReturn == null ? null : Math.pow(1 + normalizedWeightedReturn, 5),
    tenYearMultiple: normalizedWeightedReturn == null ? null : Math.pow(1 + normalizedWeightedReturn, 10),
    maxBaseIrr,
    hardTargetStocks,
    targetRows,
    compliantRows,
    compliantWeight,
    reserveWeight,
    reserveRequiredReturn,
    targetDividend,
    currentDividend,
    postInitialDividend,
    postSeatReplacementDividend,
    postTencentSecondTierDividend,
    postTriggeredDividend,
    postPrimaryQueueDividend,
    dividendGap: Math.max(0, 1000000 - targetDividend),
    dividendRunway,
    dividendAcceleration,
    incomePortfolioAudit,
    purchasingPowerAudit,
    goalPathTracking,
    alerts
  };
}

/* ============ 数据聚合 ============ */
function bootstrapPayload() {
  const stocks = [];
  for (const f of fs.readdirSync(STOCKS_DIR).filter(f => f.endsWith('.json')).sort()) {
    try { stocks.push(readJson(path.join(STOCKS_DIR, f))); } catch (e) { console.error(`跳过: ${f}`, e.message); }
  }
  const known = new Set(stocks.map(s => s.name));
  for (const d of scanDocs()) {
    if (d.category !== '两步法深度分析') continue;
    const draft = parseDraftStock(d.file);
    if (draft && !known.has(draft.name)) stocks.push(draft);
  }
  const order = { A: 0, B: 1, C: 2, D: 3 };
  stocks.sort((a, b) => (order[a.grade] ?? 9) - (order[b.grade] ?? 9) || (b.analysisDate || '').localeCompare(a.analysisDate || ''));
  const payload = { generatedAt: new Date().toISOString() };
  const keyMap = {
    'docs-index': 'docsIndex',
    'portfolio-evolution': 'portfolioEvolution',
    'goal-ledger': 'goalLedger',
    'portfolio-efficiency': 'portfolioEfficiency',
    'cash-deployment': 'cashDeployment',
    'goal-bottleneck': 'goalBottleneck',
    'income-warehouse': 'incomeWarehouse'
  };
  for (const name of ['goals', 'portfolio', 'methodology', 'portfolio-evolution', 'goal-ledger', 'portfolio-efficiency', 'cash-deployment', 'goal-bottleneck', 'income-warehouse']) {
    const p = path.join(DATA_DIR, `${name}.json`);
    if (fs.existsSync(p)) payload[keyMap[name] || name] = readJson(p);
  }
  payload.docsIndex = { total: 0, docs: scanDocs() };
  payload.docsIndex.total = payload.docsIndex.docs.length;
  payload.stocks = stocks;
  payload.stocks.forEach(s => {
    const irr = Number(s?.scenarios?.base?.irr10y);
    s.reportedGradeLabel = s.gradeLabel || null;
    s.gradeLabel = executableReturnLabel(s.grade, irr);
  });
  payload.decisionMetrics = buildDecisionMetrics(payload);
  return payload;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const pathname = decodeURIComponent(url.pathname);
  try {
    if (pathname === '/api/bootstrap') return send(res, 200, JSON.stringify(bootstrapPayload()));

    if (pathname === '/api/quotes') {
      const symbols = (url.searchParams.get('symbols') || '').split(',').map(s => s.trim()).filter(Boolean);
      return send(res, 200, JSON.stringify(await fetchQuotes(symbols)));
    }

    if (pathname === '/api/portfolio' && req.method === 'POST') {
      const body = await readBody(req);
      const pf = readJson(PORTFOLIO_FILE);
      if (!Array.isArray(body.targetPortfolio)) throw new Error('targetPortfolio required');
      const clean = body.targetPortfolio.map(t => ({
        name: String(t.name || '').slice(0, 30), weight: Number(t.weight) || 0,
        targetValue: Math.max(0, Number(t.targetValue) || 0),
        role: String(t.role || '').slice(0, 120), pendingInvest: Math.max(0, Number(t.pendingInvest) || 0),
        symbol: String(t.symbol || '').slice(0, 30),
        baseAnnualReturn: Number.isFinite(Number(t.baseAnnualReturn)) ? Number(t.baseAnnualReturn) : null,
        qualityGrade: String(t.qualityGrade || '').slice(0, 4)
      })).filter(t => t.name);
      const maxHoldings = Number(pf.concentrationPolicy?.maxHoldings) || 7;
      if (clean.length > maxHoldings) return send(res, 400, JSON.stringify({ error: `正式目标最多${maxHoldings}只；请先删除一个席位，再新增公司` }));
      const sum = clean.reduce((s, t) => s + t.weight, 0);
      const opportunityWeight = Number(pf.opportunityCash?.weight) || 0;
      const maxStockWeight = 1 - opportunityWeight;
      if (sum > maxStockWeight + 0.005) return send(res, 400, JSON.stringify({ error: `股票目标权重合计 ${(sum * 100).toFixed(1)}%，超过保留${(opportunityWeight * 100).toFixed(0)}%机会现金后的上限 ${(maxStockWeight * 100).toFixed(0)}%` }));
      pf.targetPortfolio = clean;
      if (pf.concentrationPolicy) pf.concentrationPolicy.formalNames = clean.map(row => row.name);
      // 同步股息表的目标仓位；非目标但仍真实持有的公司不能被删掉，否则卖出时股息无法扣减。
      const names = new Set(clean.map(t => t.name));
      const heldNames = new Set((pf.holdings || []).filter(row => Number(row.quantity) > 0).map(row => row.name));
      pf.dividends = pf.dividends || { perStock: [] };
      pf.dividends.perStock = pf.dividends.perStock.filter(d => names.has(d.name) || heldNames.has(d.name));
      for (const t of clean) {
        let d = pf.dividends.perStock.find(x => x.name === t.name);
        if (!d) { d = { name: t.name, targetValue: t.targetValue, dps: '待补充', afterTaxYield: null }; pf.dividends.perStock.push(d); }
        else d.targetValue = t.targetValue;
      }
      fs.writeFileSync(PORTFOLIO_FILE, JSON.stringify(pf, null, 2), 'utf8');
      return send(res, 200, JSON.stringify({ ok: true, portfolio: pf }));
    }

    if (pathname === '/api/calibrations' && req.method === 'POST') {
      const body = await readBody(req);
      const key = String(body.key || '').trim().slice(0, 80);
      if (!key) throw new Error('key required');
      const value = body.value === '' || body.value == null ? null : Number(body.value);
      if (value != null && (!Number.isFinite(value) || value <= 0 || value > 100000)) throw new Error('invalid calibration value');
      const pf = readJson(PORTFOLIO_FILE);
      pf.manualCalibrations = pf.manualCalibrations || {};
      if (value == null) delete pf.manualCalibrations[key];
      else pf.manualCalibrations[key] = value;
      fs.writeFileSync(PORTFOLIO_FILE, JSON.stringify(pf, null, 2), 'utf8');
      return send(res, 200, JSON.stringify({ ok: true, manualCalibrations: pf.manualCalibrations }));
    }

    if (pathname === '/api/trades' && req.method === 'POST') {
      const body = await readBody(req);
      const date = String(body.date || '').trim();
      const side = String(body.side || '').trim();
      const quantity = Number(body.quantity);
      const price = Number(body.price);
      const fee = Number(body.fee || 0);
      const requestedFx = Number(body.fxRate);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('成交日期必须为 YYYY-MM-DD');
      const shanghaiToday = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
      if (date > shanghaiToday) throw new Error('不能登记未来成交');
      if (!['买入', '卖出'].includes(side)) throw new Error('买卖方向无效');
      if (!Number.isInteger(quantity) || quantity <= 0) throw new Error('成交股数必须为正整数');
      if (!Number.isFinite(price) || price <= 0 || price > 100000) throw new Error('成交价无效');
      if (!Number.isFinite(fee) || fee < 0 || fee > 1000000) throw new Error('费用无效');
      if (body.confirmedExecuted !== true) throw new Error('只能登记券商已经真实成交的交易，请先勾选成交确认');

      const pf = readJson(PORTFOLIO_FILE);
      if (pf.snapshotDate && date < pf.snapshotDate) throw new Error(`成交日期不能早于当前持仓快照 ${pf.snapshotDate}`);
      const security = knownSecurity(String(body.name || '').trim(), String(body.symbol || '').trim(), pf);
      if (!security) throw new Error('只能登记持仓或研究库中的证券');
      const currency = String(body.currency || security.currency || '').toUpperCase();
      if (!['CNY', 'HKD'].includes(currency)) throw new Error('目前只支持 CNY 和 HKD');
      if (currency !== security.currency) throw new Error(`${security.name}的交易币种应为 ${security.currency}`);
      const fxRate = currency === 'CNY' ? 1 : requestedFx;
      if (!Number.isFinite(fxRate) || fxRate <= 0 || fxRate > 2) throw new Error('港股必须填写有效的港元兑人民币结算汇率');

      pf.tradeLedger = Array.isArray(pf.tradeLedger) ? pf.tradeLedger : [];
      const duplicateKey = [date, side, security.symbol, quantity, price.toFixed(4), fee.toFixed(2)].join('|');
      if (!body.confirmDuplicate && pf.tradeLedger.some(row => row.duplicateKey === duplicateKey)) {
        throw new Error('发现相同成交记录，已拒绝重复入账');
      }

      const grossCny = roundMoney(quantity * price * fxRate);
      const cashDelta = roundMoney(side === '买入' ? -(grossCny + fee) : grossCny - fee);
      if ((Number(pf.cash) || 0) + cashDelta < -0.01) throw new Error('可用现金不足');
      let holding = (pf.holdings || []).find(row => row.symbol === security.symbol || row.name === security.name);
      const oldQuantity = Number(holding?.quantity) || 0;
      if (side === '卖出' && quantity > oldQuantity) throw new Error(`卖出数量超过当前持有的 ${oldQuantity.toLocaleString()} 股`);
      const maxHoldings = Number(pf.concentrationPolicy?.maxHoldings) || 7;
      const activeHoldingCount = (pf.holdings || []).filter(row => Number(row.quantity) > 0).length;
      const policyBreach = side === '买入' && !holding && activeHoldingCount >= maxHoldings;
      if (policyBreach && body.acknowledgePolicyBreach !== true) {
        throw new Error(`当前已有${activeHoldingCount}只持仓，已满${maxHoldings}席；若券商确已成交，须明确确认政策违规后如实登记并标红`);
      }

      if (side === '买入') {
        if (!holding) {
          holding = { symbol: security.symbol, name: security.name, quantity: 0, costPrice: 0, currency, marketValue: 0, priceAtSnapshot: price, targetWeight: 0, role: policyBreach ? '政策例外：实际成交登记新增持仓' : '成交登记新增持仓' };
          pf.holdings.push(holding);
        }
        const localFee = fee / fxRate;
        holding.costPrice = roundMoney((oldQuantity * Number(holding.costPrice || 0) + quantity * price + localFee) / (oldQuantity + quantity));
        holding.quantity = oldQuantity + quantity;
      } else {
        holding.quantity = oldQuantity - quantity;
      }
      holding.currency = currency;
      holding.priceAtSnapshot = price;
      holding.marketValue = roundMoney(holding.quantity * price * fxRate);
      if (holding.quantity === 0) pf.holdings = pf.holdings.filter(row => row !== holding);

      pf.cash = roundMoney((Number(pf.cash) || 0) + cashDelta);
      pf.stockMarketValue = roundMoney((pf.holdings || []).reduce((sum, row) => sum + (Number(row.marketValue) || 0), 0));
      pf.totalAssets = roundMoney(pf.cash + pf.stockMarketValue);
      if (pf.concentrationPolicy) pf.concentrationPolicy.currentHoldingCount = (pf.holdings || []).filter(row => Number(row.quantity) > 0).length;
      const dividendEntry = (pf.dividends?.perStock || []).find(row => row.name === security.name);
      const explicitDividendAmount = optionalNumber(body.annualDividendAmount);
      const legacyDividendChange = optionalNumber(body.annualDividendChange);
      if (explicitDividendAmount != null && explicitDividendAmount < 0) throw new Error('股息绝对额不能为负数');
      const automaticDividendAmount = estimatedAnnualDividend(dividendEntry, quantity, fxRate, grossCny);
      const annualDividendChange = explicitDividendAmount != null
        ? roundMoney(explicitDividendAmount * (side === '买入' ? 1 : -1))
        : legacyDividendChange != null
          ? roundMoney(legacyDividendChange)
          : roundMoney((automaticDividendAmount || 0) * (side === '买入' ? 1 : -1));
      pf.currentDividendBaseline = pf.currentDividendBaseline || {};
      pf.currentDividendBaseline.current = roundMoney(Math.max(0, (Number(pf.currentDividendBaseline.current) || 0) + annualDividendChange));
      pf.snapshotDate = date;
      pf.source = `持仓已经本地成交登记更新至 ${date}；未成交持仓的市值仍沿用上次快照`;
      if (currency === 'HKD') pf.fxNote = `最近一笔港股成交按实际结算汇率 ${fxRate.toFixed(4)} 入账；其他港股市值仍按原快照折算`;
      const trade = {
        id: `${date.replaceAll('-', '')}-${String(pf.tradeLedger.length + 1).padStart(3, '0')}`,
        date, side, name: security.name, symbol: security.symbol, currency, quantity,
        price, fxRate, fee: roundMoney(fee), grossCny, cashDelta, annualDividendChange,
        resultingQuantity: holding.quantity, resultingCash: pf.cash,
        confirmedExecuted: true, policyBreach,
        note: String(body.note || '').trim().slice(0, 240), duplicateKey,
        recordedAt: new Date().toISOString()
      };
      pf.tradeLedger.push(trade);
      refreshExecutionStatus(pf);
      writeJsonAtomic(PORTFOLIO_FILE, pf);
      return send(res, 200, JSON.stringify({ ok: true, trade, portfolio: pf }));
    }

    if (pathname === '/api/goal-snapshot' && req.method === 'POST') {
      const body = await readBody(req);
      const date = String(body.date || '').trim();
      const pf = readJson(PORTFOLIO_FILE);
      const holdings = normalizeSnapshotHoldings(body.holdings);
      const uploadedStockMarketValue = holdings.reduce((sum, row) => sum + row.marketValue, 0);
      const stockMarketValue = holdings.length ? roundMoney(uploadedStockMarketValue) : Number(body.stockMarketValue);
      const cash = body.cash === '' || body.cash == null ? null : Number(body.cash);
      const totalAssets = Number.isFinite(Number(body.totalAssets)) && Number(body.totalAssets) > 0
        ? Number(body.totalAssets)
        : roundMoney(stockMarketValue + (Number.isFinite(cash) ? cash : 0));
      const normalizedAfterTaxDividend = Number(body.normalizedAfterTaxDividend);
      const ordinaryDividendTtm = body.ordinaryDividendTtm == null || body.ordinaryDividendTtm === '' ? null : Number(body.ordinaryDividendTtm);
      const netExternalFlow = body.netExternalFlow == null || body.netExternalFlow === '' ? 0 : Number(body.netExternalFlow);
      const thesisBreaches = Array.isArray(body.thesisBreaches)
        ? body.thesisBreaches.map(x => String(x).trim().slice(0, 120)).filter(Boolean).slice(0, 10)
        : String(body.thesisBreaches || '').split(/[\n；;]/).map(x => x.trim().slice(0, 120)).filter(Boolean).slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('日期必须为 YYYY-MM-DD');
      const shanghaiToday = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
      const ledger = readJson(GOAL_LEDGER_FILE);
      if (date < ledger.baselineDate) throw new Error('快照日期不能早于基线日');
      if (date > shanghaiToday) throw new Error('不能记录未来日期的快照');
      if (![totalAssets, stockMarketValue, normalizedAfterTaxDividend].every(Number.isFinite)
          || totalAssets <= 0 || stockMarketValue < 0 || stockMarketValue > totalAssets || normalizedAfterTaxDividend < 0) {
        throw new Error('资产、股票市值或股息数据无效');
      }
      if (ordinaryDividendTtm != null && (!Number.isFinite(ordinaryDividendTtm) || ordinaryDividendTtm < 0)) throw new Error('实收股息无效');
      if (!Number.isFinite(netExternalFlow) || Math.abs(netExternalFlow) > 100000000) throw new Error('本期净入金无效');
      const statistics = snapshotStatistics(holdings, totalAssets, pf);
      const attachment = saveSnapshotAttachment(date, body.attachmentName, body.attachmentDataUrl);
      const snapshot = {
        date,
        totalAssets,
        stockMarketValue,
        cash: totalAssets - stockMarketValue,
        stockWeight: stockMarketValue / totalAssets,
        normalizedAfterTaxDividend,
        ordinaryDividendTtm,
        netExternalFlow,
        holdings,
        statistics,
        attachment,
        thesisBreaches,
        note: String(body.note || '').trim().slice(0, 300)
      };
      const existing = (ledger.snapshots || []).findIndex(row => row.date === date);
      if (existing >= 0) ledger.snapshots[existing] = snapshot;
      else ledger.snapshots = [...(ledger.snapshots || []), snapshot];
      ledger.snapshots.sort((a, b) => String(a.date).localeCompare(String(b.date)));
      ledger.asOf = ledger.snapshots.at(-1).date;
      writeJsonAtomic(GOAL_LEDGER_FILE, ledger);
      if (holdings.length) {
        const priorByName = new Map((pf.holdings || []).map(row => [row.name, row]));
        const targetByName = new Map((pf.targetPortfolio || []).map(row => [row.name, row]));
        pf.holdings = holdings.map(row => {
          const prior = priorByName.get(row.name) || {};
          const target = targetByName.get(row.name);
          return {
            symbol: row.symbol || prior.symbol || '', name: row.name, quantity: row.quantity,
            costPrice: row.costPrice, currency: row.currency, marketValue: row.marketValue,
            priceAtSnapshot: row.currentPrice, targetWeight: Number(target?.weight) || 0,
            role: target?.role || prior.role || '月度持仓快照中的非目标持仓'
          };
        });
        pf.snapshotDate = date;
        pf.totalAssets = roundMoney(totalAssets);
        pf.stockMarketValue = roundMoney(stockMarketValue);
        pf.cash = roundMoney(totalAssets - stockMarketValue);
        pf.source = `月度持仓快照上传并同步至 ${date}`;
        if (pf.concentrationPolicy) pf.concentrationPolicy.currentHoldingCount = holdings.length;
        pf.currentDividendBaseline = pf.currentDividendBaseline || {};
        pf.currentDividendBaseline.current = roundMoney(normalizedAfterTaxDividend);
        refreshExecutionStatus(pf);
        writeJsonAtomic(PORTFOLIO_FILE, pf);
      }
      return send(res, 200, JSON.stringify({ ok: true, snapshot }));
    }

    if (pathname.startsWith('/api/snapshot-file/') && req.method === 'GET') {
      const file = path.basename(pathname.slice('/api/snapshot-file/'.length));
      const full = path.join(SNAPSHOT_DIR, file);
      if (!file || !fs.existsSync(full)) return send(res, 404, JSON.stringify({ error: '附件不存在' }));
      return send(res, 200, fs.readFileSync(full), MIME[path.extname(file).toLowerCase()] || 'application/octet-stream');
    }

    if (pathname === '/api/docs/add' && req.method === 'POST') {
      const body = await readBody(req);
      const title = String(body.title || '').trim().replace(/[\\/:*?"<>|]/g, '');
      const date = String(body.date || '').trim();
      const content = String(body.content || '');
      if (!title || !content.trim()) throw new Error('标题和内容不能为空');
      if (!/^\d{8}$/.test(date)) throw new Error('日期格式须为 YYYYMMDD');
      const file = `${title}-${date}.md`;
      fs.writeFileSync(path.join(DOCS_DIR, file), content, 'utf8');
      return send(res, 200, JSON.stringify({ ok: true, file }));
    }

    if (pathname === '/api/docs/delete' && req.method === 'POST') {
      const body = await readBody(req);
      const name = path.basename(String(body.file || ''));
      const file = path.join(DOCS_DIR, name);
      if (!file.startsWith(DOCS_DIR) || !fs.existsSync(file)) throw new Error('文件不存在');
      fs.unlinkSync(file);
      return send(res, 200, JSON.stringify({ ok: true }));
    }

    if (pathname.startsWith('/api/doc/')) {
      const name = path.basename(pathname.slice('/api/doc/'.length));
      const file = path.join(DOCS_DIR, name);
      if (!file.startsWith(DOCS_DIR) || !fs.existsSync(file)) return send(res, 404, JSON.stringify({ error: 'not found' }));
      return send(res, 200, fs.readFileSync(file, 'utf8'), 'text/plain; charset=utf-8');
    }

    // 静态文件
    let filePath = pathname === '/' ? '/index.html' : pathname;
    filePath = path.normalize(filePath).replace(/^(\.\.[\/\\])+/, '');
    const abs = path.join(PUBLIC_DIR, filePath);
    if (!abs.startsWith(PUBLIC_DIR) || !fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
      return send(res, 404, 'Not Found', 'text/plain; charset=utf-8');
    }
    send(res, 200, fs.readFileSync(abs), MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream');
  } catch (e) {
    send(res, 500, JSON.stringify({ error: e.message }));
  }
});

if (require.main === module) {
  server.listen(PORT, '127.0.0.1', () => {
    console.log(`投资分析中心: http://127.0.0.1:${PORT}/`);
    console.log(`数据文件: ${DATA_DIR}`);
  });
}

module.exports = {
  bootstrapPayload,
  buildDecisionMetrics,
  buildGoalPathTracking,
  buildIncomePortfolioAudit,
  buildPurchasingPowerAudit,
  simulateDividendAcceleration,
  simulateIncomeFirst,
  estimatedAnnualDividend
};
