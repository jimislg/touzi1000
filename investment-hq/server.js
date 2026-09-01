#!/usr/bin/env node
// 投资分析中心 - 零依赖本地服务器
// 用法: node server.js [端口]   默认端口 4280
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.argv[2] || process.env.PORT || 4280);
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const DOCS_DIR = path.join(DATA_DIR, 'docs');
const STOCKS_DIR = path.join(DATA_DIR, 'stocks');
const PORTFOLIO_FILE = path.join(DATA_DIR, 'portfolio.json');
const GOAL_LEDGER_FILE = path.join(DATA_DIR, 'goal-ledger.json');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.md': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml', '.ico': 'image/x-icon'
};

function send(res, code, body, type) {
  res.writeHead(code, { 'Content-Type': type || 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' });
  res.end(body);
}
const readJson = p => JSON.parse(fs.readFileSync(p, 'utf8'));
function readBody(req) {
  return new Promise((resolve, reject) => {
    let d = ''; req.on('data', c => { d += c; if (d.length > 5e6) reject(new Error('body too large')); });
    req.on('end', () => { try { resolve(d ? JSON.parse(d) : {}); } catch (e) { reject(new Error('invalid json')); } });
  });
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
  checkpointMonths = []
}) {
  const values = [principal, startStockWeight, targetStockWeight, cashReturn, accumulationReturn,
    accumulationYield, deploymentMonths, migrationStartAssets, migrationMonths, terminalReturn,
    terminalYield, nominalDividend, safetyDividend];
  if (!values.every(Number.isFinite) || principal <= 0 || targetStockWeight <= 0
      || deploymentMonths < 1 || migrationMonths < 1 || terminalYield <= 0) return null;
  const equityReturn = (accumulationReturn - (1 - targetStockWeight) * cashReturn) / targetStockWeight;
  const equityYield = accumulationYield / targetStockWeight;
  let assets = principal;
  let migrationStartMonth = null;
  let nominal = null;
  let safety = null;
  const checkpointSet = new Set((checkpointMonths || []).map(Number).filter(Number.isFinite));
  const checkpoints = [];
  if (checkpointSet.has(0)) checkpoints.push({
    months: 0,
    assets,
    annualDividend: assets * startStockWeight * equityYield,
    annualYield: startStockWeight * equityYield,
    stockWeight: startStockWeight,
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
    const annualDividend = assets * annualYield;
    if (checkpointSet.has(month)) checkpoints.push({ months: month, assets, annualDividend, annualYield, stockWeight, phase });
    if (!nominal && annualDividend >= nominalDividend) nominal = { months: month, assets, annualDividend, annualYield, phase };
    if (!safety && annualDividend >= safetyDividend) {
      safety = { months: month, assets, annualDividend, annualYield, phase };
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
  return {
    startDate: spec.startDate,
    principal,
    startStockWeight,
    targetStockWeight,
    paths,
    saving,
    companyBaseSaving,
    phasePortfolios: spec.phasePortfolios || [],
    rules: spec.rules || [],
    note: spec.note
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
  if (elapsedMonths >= 36) {
    const prior = [...snapshots].reverse().find(row => monthsBetween(row.date, latest.date) >= 36);
    const span = prior ? monthsBetween(prior.date, latest.date) : null;
    if (prior && span > 0 && Number(prior.totalAssets) > 0) rollingReturn = Math.pow(actualAssets / Number(prior.totalAssets), 12 / span) - 1;
    if (rollingReturn != null && rollingReturn < 0.05 && thesisBreaches.length >= 2) deviations.push({ severity: 'red', item: '承保回报', detail: `滚动年化${(rollingReturn * 100).toFixed(2)}%，且论文已多项突破，应重做组合` });
    else if (rollingReturn != null && rollingReturn < 0.075) deviations.push({ severity: 'amber', item: '承保回报', detail: `滚动年化${(rollingReturn * 100).toFixed(2)}%，使用7%压力路径重算` });
  }
  const severity = deviations.some(row => row.severity === 'red') ? 'red' : deviations.length ? 'amber' : 'green';
  const nextCheckpoint = path.checkpoints?.find(row => row.months > elapsedMonths) || null;
  const checkpoints = (path.checkpoints || []).map(row => ({
    ...row,
    guardrailRange: [...ranges].reverse().find(range => range.month <= row.months) || null
  }));
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
  const postInitialDividend = Number(pf.currentDividendBaseline?.postInitialTrade);
  const postTriggeredDividend = Number(pf.currentDividendBaseline?.postTriggeredCandidate);
  const postPrimaryQueueDividend = Number(pf.currentDividendBaseline?.postPrimaryQueue);
  const dividendRunway = buildDividendRunway(payload, normalizedWeightedReturn);
  const dividendAcceleration = buildDividendAcceleration(payload, dividendRunway, underwritingWeightedReturn);
  const goalPathTracking = buildGoalPathTracking(payload, dividendAcceleration);
  const alerts = [];
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
  if (pf.deploymentQueue?.threeMonthGap > 0) alerts.push({ severity: 'amber', title: '三个月部署队列已覆盖缺口，但仍依赖价格触发', detail: `首轮后至29.2%股票仓位还需约 ${(pf.deploymentQueue.threeMonthGap / 10000).toFixed(1)}万元；主队列条件金额约 ${(pf.deploymentQueue.primaryPotential / 10000).toFixed(1)}万元，覆盖 ${(pf.deploymentQueue.coverageRatio * 100).toFixed(0)}%，未触发前仍是现金。` });
  const baseRunway = dividendRunway?.scenarios?.find(s => s.id === 'base');
  if (baseRunway) alerts.push({ severity: 'amber', title: '名义100万元不是安全达标', detail: `计入24个月部署拖累后，基准情景约${baseRunway.nominalDuration}达到名义100万元，但约${baseRunway.safetyDuration}才达到120万元安全线；后者用于承受约15%的组合股息削减。` });
  const accelerated = dividendAcceleration?.paths?.find(s => s.id === 'underwrittenTwoStage');
  if (accelerated) alerts.push({ severity: 'green', title: '最快的稳健路径不是现在追高股息', detail: `质量折扣后的承保路线约${accelerated.nominal.duration}达到名义线、约${accelerated.safety.duration}达到安全线；积累期承保年化${(accelerated.accumulationReturn * 100).toFixed(2)}%，不再把${(normalizedWeightedReturn * 100).toFixed(2)}%的公司基准机械加权当成保守承诺。` });
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
    postInitialDividend: Number.isFinite(postInitialDividend) ? postInitialDividend : null,
    postTriggeredDividend: Number.isFinite(postTriggeredDividend) ? postTriggeredDividend : null,
    postPrimaryQueueDividend: Number.isFinite(postPrimaryQueueDividend) ? postPrimaryQueueDividend : null,
    dividendGap: Math.max(0, 1000000 - targetDividend),
    dividendRunway,
    dividendAcceleration,
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
    'portfolio-efficiency': 'portfolioEfficiency'
  };
  for (const name of ['goals', 'portfolio', 'methodology', 'portfolio-evolution', 'goal-ledger', 'portfolio-efficiency']) {
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
      const sum = clean.reduce((s, t) => s + t.weight, 0);
      const opportunityWeight = Number(pf.opportunityCash?.weight) || 0;
      const maxStockWeight = 1 - opportunityWeight;
      if (sum > maxStockWeight + 0.005) return send(res, 400, JSON.stringify({ error: `股票目标权重合计 ${(sum * 100).toFixed(1)}%，超过保留${(opportunityWeight * 100).toFixed(0)}%机会现金后的上限 ${(maxStockWeight * 100).toFixed(0)}%` }));
      pf.targetPortfolio = clean;
      // 同步股息表的目标仓位
      const names = new Set(clean.map(t => t.name));
      pf.dividends = pf.dividends || { perStock: [] };
      pf.dividends.perStock = pf.dividends.perStock.filter(d => names.has(d.name) || clean.some(c => c.name === d.name));
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

    if (pathname === '/api/goal-snapshot' && req.method === 'POST') {
      const body = await readBody(req);
      const date = String(body.date || '').trim();
      const totalAssets = Number(body.totalAssets);
      const stockMarketValue = Number(body.stockMarketValue);
      const normalizedAfterTaxDividend = Number(body.normalizedAfterTaxDividend);
      const ordinaryDividendTtm = body.ordinaryDividendTtm == null || body.ordinaryDividendTtm === '' ? null : Number(body.ordinaryDividendTtm);
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
      const snapshot = {
        date,
        totalAssets,
        stockMarketValue,
        cash: totalAssets - stockMarketValue,
        stockWeight: stockMarketValue / totalAssets,
        normalizedAfterTaxDividend,
        ordinaryDividendTtm,
        thesisBreaches,
        note: String(body.note || '').trim().slice(0, 300)
      };
      const existing = (ledger.snapshots || []).findIndex(row => row.date === date);
      if (existing >= 0) ledger.snapshots[existing] = snapshot;
      else ledger.snapshots = [...(ledger.snapshots || []), snapshot];
      ledger.snapshots.sort((a, b) => String(a.date).localeCompare(String(b.date)));
      ledger.asOf = ledger.snapshots.at(-1).date;
      fs.writeFileSync(GOAL_LEDGER_FILE, JSON.stringify(ledger, null, 2), 'utf8');
      return send(res, 200, JSON.stringify({ ok: true, snapshot }));
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

server.listen(PORT, '127.0.0.1', () => {
  console.log(`投资分析中心: http://127.0.0.1:${PORT}/`);
  console.log(`数据文件: ${DATA_DIR}`);
});
