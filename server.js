const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const {
  INPUTS: CMB_INPUTS,
  SCENARIOS: CMB_SCENARIOS,
  impliedReturn: cmbImpliedReturn,
  presentValueAtRate: cmbPresentValueAtRate
} = require("./scripts/cmb-valuation");

const PORT = Number(process.env.PORT || 4173);
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = path.join(ROOT, "data");
const HISTORY_FILE = path.join(DATA_DIR, "history.json");
const PORTFOLIO_FILE = path.join(DATA_DIR, "portfolio.json");

const ASSETS = {
  indices: [
    { symbol: "sh000688", name: "科创50", group: "tech" },
    { symbol: "sz399006", name: "创业板指", group: "tech" },
    { symbol: "sh000300", name: "沪深300", group: "broad" }
  ],
  tech: [
    { symbol: "sz300750", name: "宁德时代" },
    { symbol: "sh688981", name: "中芯国际" },
    { symbol: "sh688256", name: "寒武纪" },
    { symbol: "sz300308", name: "中际旭创" },
    { symbol: "sz300124", name: "汇川技术" }
  ],
  whiteHorse: [
    { symbol: "sh600519", name: "贵州茅台" },
    { symbol: "sh600036", name: "招商银行" },
    { symbol: "sz000651", name: "格力电器" },
    { symbol: "sh600660", name: "福耀玻璃" },
    { symbol: "sh600309", name: "万华化学" },
    { symbol: "hk02020", name: "安踏体育" },
    { symbol: "hk09992", name: "泡泡玛特" }
  ],
  research: [
    { symbol: "hk00700", name: "腾讯控股" },
    { symbol: "sz300760", name: "迈瑞医疗" },
    { symbol: "sh600066", name: "宇通客车" },
    { symbol: "sz002027", name: "分众传媒" },
    { symbol: "sz000423", name: "东阿阿胶" },
    { symbol: "sh601318", name: "中国平安" },
    { symbol: "sh600276", name: "恒瑞医药" },
    { symbol: "hk02015", name: "理想汽车" },
    { symbol: "sh600415", name: "小商品城" }
  ]
};

// 价格线来自截至2026-08-28完成的两步分析。它们是复核线，不是自动买入指令；
// 每次到价仍需先确认论文、财报和红线没有失效。
const INVESTMENT_POOL = [
  { symbol: "sh600519", name: "贵州茅台", quality: "A", role: "核心质量", targetWeight: .25, hardCap: .30, p12: 1200, p15: 950, p1746: 725, baseReturn: .09, thesisHealth: 8, annualDps: 51.80, risk: "批价、渠道库存与需求恢复", redLine: "批价持续倒挂且合同负债、现金流同步恶化" },
  { symbol: "hk00700", name: "腾讯控股", quality: "A", role: "核心成长", targetWeight: .12, hardCap: .15, p12: 420, p15: 315, p1746: 255, baseReturn: .111, thesisHealth: 8, annualDps: 5.30, dividendTax: .20, risk: "AI资本开支回报与监管", redLine: "核心业务现金流停滞且AI投入长期不能变现" },
  { symbol: "sh600660", name: "福耀玻璃", quality: "A-", role: "全球制造", targetWeight: .08, hardCap: .10, p12: 55, p15: 44, p1746: 37, baseReturn: .114, thesisHealth: 8, annualDps: 1.94, risk: "关税、海外成本与汽车周期", redLine: "海外ROIC连续下降且份额丢失" },
  { symbol: "sh600066", name: "宇通客车", quality: "A-", role: "全球制造", targetWeight: .08, hardCap: .10, p12: 28, p15: 23, p1746: 20, baseReturn: .112, thesisHealth: 7, annualDps: 2.50, risk: "出口政治风险与峰值利润", redLine: "出口失速且经营现金流连续弱于利润" },
  { symbol: "sh600415", name: "小商品城", quality: "A-", role: "平台现金流", targetWeight: .06, hardCap: .06, p12: 11.5, p15: 10.3, p1746: 9.2, baseReturn: .11, thesisHealth: 7, annualDps: .33, risk: "外贸景气与支付平台兑现", redLine: "主业现金流恶化且资本开支回报不达预期" },
  { symbol: "sh600036", name: "招商银行", quality: "B", role: "金融底仓", targetWeight: .09, hardCap: .10, p12: 35.7, p15: 29, p1746: 24.6, baseReturn: .105, thesisHealth: 7, annualDps: 2.10, risk: "净息差与零售资产质量", redLine: "不良生成、信用成本连续恶化并侵蚀ROE" },
  { symbol: "sz002027", name: "分众传媒", quality: "B+", role: "高股息传媒", targetWeight: .05, hardCap: .05, p12: 3.78, p15: 3.40, p1746: 3.00, baseReturn: .081, thesisHealth: 6, annualDps: .33, risk: "广告周期与客户集中", redLine: "点位价值下降且回款、现金转化持续恶化" },
  { symbol: "sh600276", name: "恒瑞医药", quality: "B+", role: "创新药成长", targetWeight: .05, hardCap: .05, p12: 38.5, p15: 33.8, p1746: 30.4, baseReturn: .073, thesisHealth: 7, annualDps: .20, risk: "研发失败、集采与国际化兑现", redLine: "核心管线失败且研发效率连续下降" },
  { symbol: "hk02020", name: "安踏体育", quality: "B", role: "品牌消费", targetWeight: .05, hardCap: .08, p12: 90.7, p15: 71.7, p1746: 59.6, baseReturn: .138, thesisHealth: 6, annualDps: 2.45, dividendTax: .20, risk: "品牌矩阵与库存折扣", redLine: "主品牌和FILA同时失速、库存周转持续恶化" },
  { symbol: "hk09992", name: "泡泡玛特", quality: "B", role: "IP消费", targetWeight: .05, hardCap: .08, p12: 141, p15: 110, p1746: 90, baseReturn: .109, thesisHealth: 6, annualDps: 2.38, dividendTax: .20, risk: "IP热度、估值与库存", redLine: "核心IP集中度升高同时复购和现金转化下降" },
  { symbol: "sh601318", name: "中国平安", quality: "B", role: "金融底仓", targetWeight: .08, hardCap: .10, p12: 52.7, p15: 42.7, p1746: 36.3, baseReturn: .105, thesisHealth: 7, annualDps: 2.55, risk: "投资端、地产敞口与代理人改革", redLine: "新业务价值与营运利润同时持续恶化" },
  { symbol: "sz000423", name: "东阿阿胶", quality: "B", role: "中药消费", targetWeight: .05, hardCap: .06, p12: 41, p15: 33.5, p1746: 28.6, baseReturn: .09, thesisHealth: 7, annualDps: 2.69, risk: "提价空间、驴皮成本与品类扩张", redLine: "提价不能转化为销量和现金流增长" },
  { symbol: "sz300750", name: "宁德时代", quality: "B", role: "先进制造", targetWeight: .08, hardCap: .10, p12: 295, p15: 232, p1746: 192, baseReturn: .09, thesisHealth: 7, annualDps: 5.00, risk: "技术迭代、产能周期与地缘政治", redLine: "份额、单位盈利与资本回报同步持续下降" },
  { symbol: "sz300760", name: "迈瑞医疗", quality: "B", role: "医疗器械", targetWeight: .05, hardCap: .06, p12: 121.9, p15: 97, p1746: 81, baseReturn: .08, thesisHealth: 6, annualDps: 5.00, risk: "国内招采与国际化增速", redLine: "国内外增长同时失速且应收持续恶化" },
  { symbol: "sh600309", name: "万华化学", quality: "B+", role: "周期增强", targetWeight: .03, hardCap: .06, p12: 53.2, p15: 46.9, p1746: 24.8, baseReturn: .08, thesisHealth: 5, annualDps: 1.25, risk: "化工价差、产能与资本开支", redLine: "新增产能回报低于资本成本且自由现金流持续为负" },
  { symbol: "sz000651", name: "格力电器", quality: "B+", role: "成熟现金牛", targetWeight: .03, hardCap: .06, p12: 32.7, p15: 28.8, p1746: 15, baseReturn: .06, thesisHealth: 5, annualDps: 3.00, risk: "空调需求、治理与第二曲线", redLine: "利润和现金流继续下滑且分红不可持续" },
  { symbol: "hk02015", name: "理想汽车", quality: "C", role: "观察验证", targetWeight: .03, hardCap: .05, p12: 43.84, p15: 38.41, p1746: 34.56, baseReturn: .10, thesisHealth: 4, annualDps: 0, risk: "车型周期、纯电转型与价格战", redLine: "毛利率、销量和自由现金流同步恶化", requiresValidation: true }
];

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function round(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function average(values) {
  const clean = values.filter(Number.isFinite);
  return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : 0;
}

function readHistory() {
  try {
    return JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8"));
  } catch {
    return [];
  }
}

function writeHistory(history) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(HISTORY_FILE, `${JSON.stringify(history, null, 2)}\n`);
}

function readPortfolio() {
  try {
    return JSON.parse(fs.readFileSync(PORTFOLIO_FILE, "utf8"));
  } catch {
    return null;
  }
}

function solveRequiredReturn(portfolio, deploymentDelayYears) {
  const { years, targetMultiple, cashYieldAssumption } = portfolio.goal;
  const stockWeight = portfolio.stockMarketValue / portfolio.totalAssets;
  const cashWeight = portfolio.reserveCash / portfolio.totalAssets;
  const delay = clamp(deploymentDelayYears, 0, years);
  const terminalMultiple = rate => (
    stockWeight * (1 + rate) ** years
    + cashWeight * (1 + cashYieldAssumption) ** delay * (1 + rate) ** (years - delay)
  );
  let low = -0.99;
  let high = 1;
  for (let iteration = 0; iteration < 100; iteration += 1) {
    const middle = (low + high) / 2;
    if (terminalMultiple(middle) < targetMultiple) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
}

function valueCurrencyMultiplier(holding, portfolio) {
  return holding.priceCurrency === "HKD" ? portfolio.hkdToCnyAssumption || 1 : 1;
}

function portfolioPayload(latestSnapshot = null) {
  const portfolio = readPortfolio();
  if (!portfolio) return null;
  const holdingsTotal = portfolio.holdings.reduce((sum, holding) => sum + holding.marketValue, 0);
  const enrichedHoldings = portfolio.holdings.map(holding => {
    const quote = latestSnapshot ? findQuote(latestSnapshot, holding.symbol) : null;
    const currentPrice = quote?.close || null;
    const multiplier = valueCurrencyMultiplier(holding, portfolio);
    const currentMarketValue = currentPrice
      ? currentPrice * holding.quantity * multiplier
      : holding.marketValue;
    const costValue = Number.isFinite(holding.costPrice)
      ? holding.costPrice * holding.quantity * multiplier
      : null;
    const unrealizedPnl = costValue === null ? null : currentMarketValue - costValue;
    const unrealizedPnlPct = costValue ? unrealizedPnl / costValue : null;
    return {
      ...holding,
      quoteDate: quote?.date || portfolio.snapshotDate,
      currentPrice,
      currentMarketValue,
      costValue,
      unrealizedPnl,
      unrealizedPnlPct
    };
  });
  const currentStockMarketValue = enrichedHoldings.reduce((sum, holding) => sum + holding.currentMarketValue, 0);
  const currentTotalAssets = portfolio.reserveCash + currentStockMarketValue;
  const holdings = enrichedHoldings
    .map(holding => ({
      ...holding,
      totalWeight: holding.currentMarketValue / currentTotalAssets,
      stockWeight: holding.currentMarketValue / currentStockMarketValue
    }))
    .sort((a, b) => b.currentMarketValue - a.currentMarketValue);
  const holdingsBySymbol = new Map(holdings.map(holding => [holding.symbol, holding]));
  const riskFactors = (portfolio.riskFactors || []).map(factor => {
    const exposedHoldings = factor.symbols
      .map(symbol => holdingsBySymbol.get(symbol))
      .filter(Boolean);
    const exposedValue = exposedHoldings.reduce((sum, holding) => sum + holding.currentMarketValue, 0);
    return {
      ...factor,
      exposedValue,
      totalWeight: exposedValue / currentTotalAssets,
      stockWeight: exposedValue / currentStockMarketValue,
      holdings: exposedHoldings.map(({ symbol, name }) => ({ symbol, name }))
    };
  }).sort((a, b) => b.stockWeight - a.stockWeight);
  const currentCostValue = holdings.reduce((sum, holding) => sum + (holding.costValue || 0), 0);
  const currentUnrealizedPnl = holdings.reduce((sum, holding) => sum + (holding.unrealizedPnl || 0), 0);
  const topTwo = holdings.slice(0, 2).reduce((sum, holding) => sum + holding.currentMarketValue, 0);
  const delays = [0, 1, 3, portfolio.goal.years];

  return {
    snapshotDate: portfolio.snapshotDate,
    source: portfolio.source,
    currency: portfolio.currency,
    totalAssets: portfolio.totalAssets,
    reserveCash: portfolio.reserveCash,
    stockMarketValue: portfolio.stockMarketValue,
    currentTotalAssets,
    currentStockMarketValue,
    currentUnrealizedPnl,
    currentUnrealizedPnlPct: currentCostValue ? currentUnrealizedPnl / currentCostValue : null,
    hkdToCnyAssumption: portfolio.hkdToCnyAssumption || null,
    investedWeight: portfolio.stockMarketValue / portfolio.totalAssets,
    reserveWeight: portfolio.reserveCash / portfolio.totalAssets,
    currentInvestedWeight: currentStockMarketValue / currentTotalAssets,
    currentReserveWeight: portfolio.reserveCash / currentTotalAssets,
    requiredCagr: portfolio.goal.targetMultiple ** (1 / portfolio.goal.years) - 1,
    cashYieldAssumption: portfolio.goal.cashYieldAssumption,
    goal: portfolio.goal,
    deploymentScenarios: delays.map(delayYears => ({
      delayYears,
      requiredInvestedReturn: solveRequiredReturn(portfolio, delayYears)
    })),
    concentration: {
      largest: holdings[0],
      topTwoTotalWeight: topTwo / currentTotalAssets,
      topTwoStockWeight: topTwo / currentStockMarketValue
    },
    riskFactors,
    holdings,
    validation: {
      holdingsMatchStockValue: Math.abs(holdingsTotal - portfolio.stockMarketValue) < 0.01,
      assetsReconcile: Math.abs(portfolio.stockMarketValue + portfolio.reserveCash - portfolio.totalAssets) < 0.01
    }
  };
}

function cmbReviewPayload(latestSnapshot, portfolio) {
  const quote = latestSnapshot?.quotes?.whiteHorse?.find(item => item.symbol === "sh600036");
  if (!quote || !portfolio) return null;
  const inputs = { ...CMB_INPUTS, price: quote.close };
  const scenarioReturns = Object.fromEntries(Object.entries(CMB_SCENARIOS).map(([name, scenario]) => [
    name,
    cmbImpliedReturn(inputs, scenario)
  ]));
  const holding = portfolio.holdings.find(item => item.symbol === "sh600036");
  let verdict = KNOWLEDGE_CALIBRATION.cmb.action;
  if (scenarioReturns.base < 0.08) verdict = "触发减仓审查";
  else if (scenarioReturns.base < 0.10) verdict = "持有并比较替代机会";
  else if (scenarioReturns.base >= 0.13) verdict = "估值有吸引力，但集中度限制加仓";

  return {
    symbol: "sh600036",
    name: "招商银行",
    quoteDate: quote.date,
    price: quote.close,
    fundamentalDate: "2026-03-31",
    bookValuePerShare: CMB_INPUTS.bookValuePerShare,
    annualDividend: CMB_INPUTS.annualDividend,
    priceToBook: quote.close / CMB_INPUTS.bookValuePerShare,
    dividendYield: CMB_INPUTS.annualDividend / quote.close,
    portfolioWeight: holding?.totalWeight || 0,
    stockWeight: holding?.stockWeight || 0,
    calibration: KNOWLEDGE_CALIBRATION.cmb,
    scorecard: scorecardFromConfig("cmb"),
    qualityAudit: qualityAuditForConfig("cmb"),
    verdict,
    scenarioReturns,
    reviewPrices: {
      thirteenPercent: cmbPresentValueAtRate(inputs, CMB_SCENARIOS.base, 0.13),
      goalReturn: cmbPresentValueAtRate(inputs, CMB_SCENARIOS.base, 5 ** (1 / 10) - 1),
      tenPercent: cmbPresentValueAtRate(inputs, CMB_SCENARIOS.base, 0.10),
      eightPercent: cmbPresentValueAtRate(inputs, CMB_SCENARIOS.base, 0.08)
    },
    evidence: {
      positive: ["财富管理手续费2026年一季度同比+25.42%", "核心一级资本充足率14.13%", "2025年分红仅占EPS约35%"],
      negative: ["净息差1.83%，同比下降8个基点", "零售贷款不良率升至1.14%", "关注率与逾期率均较年初上升"]
    }
  };
}

const POP_MART_REVIEW = {
  eps2025: 9.61,
  hkdToCny: 0.866538,
  hkdToCnyDate: "2026-06-21",
  fundamentalDate: "2026-05-12",
  scenarios: {
    break: { label: "热度断裂", firstGrowth: 0.20, secondGrowth: -0.30, laterGrowth: 0, terminalPe: 10 },
    cautious: { label: "保守", firstGrowth: 0.20, secondGrowth: 0, laterGrowth: 0.03, terminalPe: 13 },
    base: { label: "基准", firstGrowth: 0.45, secondGrowth: 0.08, laterGrowth: 0.06, terminalPe: 16 },
    bull: { label: "乐观", firstGrowth: 0.60, secondGrowth: 0.12, laterGrowth: 0.10, terminalPe: 22 }
  }
};

function popMartScenario(priceHkd, scenario) {
  let eps = POP_MART_REVIEW.eps2025;
  let dividends = 0;
  for (let year = 1; year <= 10; year += 1) {
    const growth = year === 1
      ? scenario.firstGrowth
      : year === 2 ? scenario.secondGrowth : scenario.laterGrowth;
    eps *= 1 + growth;
    dividends += eps * 0.25;
  }
  const proceedsCny = eps * scenario.terminalPe + dividends;
  const currentPriceCny = priceHkd * POP_MART_REVIEW.hkdToCny;
  return {
    annualReturn: (proceedsCny / currentPriceCny) ** (1 / 10) - 1,
    goalPriceHkd: proceedsCny / 5 / POP_MART_REVIEW.hkdToCny
  };
}

function popMartReviewPayload(latestSnapshot, portfolio) {
  const quote = latestSnapshot?.quotes?.whiteHorse?.find(item => item.symbol === "hk09992");
  if (!quote || !portfolio) return null;
  const holding = portfolio.holdings.find(item => item.symbol === "hk09992");
  const scenarios = Object.fromEntries(Object.entries(POP_MART_REVIEW.scenarios).map(([key, scenario]) => [
    key,
    { label: scenario.label, ...popMartScenario(quote.close, scenario) }
  ]));
  const trailingPe = quote.close * POP_MART_REVIEW.hkdToCny / POP_MART_REVIEW.eps2025;
  let verdict = "维持现有仓位，不加仓也不减仓";
  if (holding?.stockWeight > 0.25) verdict = "仓位过重，反弹时复核减仓";
  else if (scenarios.base.annualReturn >= 0.13 && holding?.stockWeight < 0.18) verdict = "高成长框架可持有，但不按深度价值加仓";
  else if (scenarios.base.annualReturn < 0.10) verdict = "回报不足，触发减仓审查";

  return {
    symbol: "hk09992",
    name: "泡泡玛特",
    quoteDate: quote.date,
    price: quote.close,
    fundamentalDate: POP_MART_REVIEW.fundamentalDate,
    exchangeRate: POP_MART_REVIEW.hkdToCny,
    exchangeRateDate: POP_MART_REVIEW.hkdToCnyDate,
    trailingPe,
    portfolioWeight: holding?.totalWeight || 0,
    stockWeight: holding?.stockWeight || 0,
    calibration: KNOWLEDGE_CALIBRATION.popMart,
    scorecard: scorecardFromConfig("popMart"),
    qualityAudit: qualityAuditForConfig("popMart"),
    verdict,
    scenarios,
    evidence: {
      positive: [
        "2025年收入371.2亿元、经调整净利润130.8亿元，分别同比增长184.7%和284.5%",
        "2026年一季度收入仍同比增长75%至80%，中国区增长100%至105%",
        "2025年末现金及现金等价物137.8亿元，资产负债表有扩张余地"
      ],
      negative: [
        "THE MONSTERS贡献2025年收入38.1%，毛绒产品占50.4%，单一IP与品类集中度高",
        "2025年末存货54.7亿元，同比增加259%，周转天数由102天升至123天",
        "经营现金流108.7亿元低于净利润130.1亿元，扩张期现金转化需要继续验证"
      ]
    }
  };
}

const MOUTAI_REVIEW = {
  eps2025: 65.66,
  annualDividend: 51.95,
  fundamentalDate: "2026-03-31",
  scenarios: {
    bear: { label: "极端压力", firstGrowth: -0.05, laterGrowth: 0, terminalPe: 12, payout: 0.80 },
    cautious: { label: "低速现金牛", firstGrowth: 0, laterGrowth: 0.03, terminalPe: 15, payout: 0.80 },
    base: { label: "现金牛基准", firstGrowth: 0.03, laterGrowth: 0.05, terminalPe: 18, payout: 0.78 },
    bull: { label: "增速回暖", firstGrowth: 0.06, laterGrowth: 0.07, terminalPe: 22, payout: 0.75 }
  }
};

function moutaiScenario(price, scenario) {
  let eps = MOUTAI_REVIEW.eps2025;
  let dividends = 0;
  for (let year = 1; year <= 10; year += 1) {
    eps *= 1 + (year === 1 ? scenario.firstGrowth : scenario.laterGrowth);
    dividends += eps * scenario.payout;
  }
  const proceeds = eps * scenario.terminalPe + dividends;
  return {
    annualReturn: (proceeds / price) ** (1 / 10) - 1,
    goalPrice: proceeds / 5
  };
}

function requiredMoutaiGrowth(price, terminalPe = 18, payout = 0.78) {
  const targetReturn = 5 ** (1 / 10) - 1;
  let low = -0.10;
  let high = 0.20;
  for (let iteration = 0; iteration < 100; iteration += 1) {
    const growth = (low + high) / 2;
    let eps = MOUTAI_REVIEW.eps2025;
    let dividends = 0;
    for (let year = 1; year <= 10; year += 1) {
      eps *= 1 + growth;
      dividends += eps * payout;
    }
    const annualReturn = ((eps * terminalPe + dividends) / price) ** (1 / 10) - 1;
    if (annualReturn < targetReturn) low = growth;
    else high = growth;
  }
  return (low + high) / 2;
}

function moutaiReviewPayload(latestSnapshot, portfolio) {
  const quote = latestSnapshot?.quotes?.whiteHorse?.find(item => item.symbol === "sh600519");
  if (!quote || !portfolio) return null;
  const holding = portfolio.holdings.find(item => item.symbol === "sh600519");
  const scenarios = Object.fromEntries(Object.entries(MOUTAI_REVIEW.scenarios).map(([key, scenario]) => [
    key,
    { label: scenario.label, ...moutaiScenario(quote.close, scenario) }
  ]));
  let verdict = "持有收息，等待更低价格";
  if (quote.close / MOUTAI_REVIEW.eps2025 < 15) verdict = "进入重仓审查区，但必须确认批价和利润没有失速";
  else if (quote.close / MOUTAI_REVIEW.eps2025 < 17) verdict = "进入加仓审查区，估值与股息保护开始同时出现";
  else if (quote.close / MOUTAI_REVIEW.eps2025 > 22) verdict = "持有为主，不按五倍目标加仓";

  return {
    symbol: "sh600519",
    name: "贵州茅台",
    quoteDate: quote.date,
    price: quote.close,
    fundamentalDate: MOUTAI_REVIEW.fundamentalDate,
    trailingPe: quote.close / MOUTAI_REVIEW.eps2025,
    dividendYield: MOUTAI_REVIEW.annualDividend / quote.close,
    portfolioWeight: holding?.totalWeight || 0,
    stockWeight: holding?.stockWeight || 0,
    requiredEpsGrowth: requiredMoutaiGrowth(quote.close),
    calibration: KNOWLEDGE_CALIBRATION.moutai,
    scorecard: scorecardFromConfig("moutai"),
    qualityAudit: qualityAuditForConfig("moutai"),
    verdict,
    scenarios,
    evidence: {
      positive: [
        "2025年茅台酒收入同比+0.39%，核心品牌仍保持韧性",
        "2026年一季度收入同比+6.54%，归母净利润同比+1.47%，没有出现利润断崖",
        "按2025年已宣派/拟派分红估算，静态股息率已具备现金牛属性"
      ],
      negative: [
        "2025年收入同比-1.21%、归母净利润同比-4.53%，增长框架已经从成长股切到现金牛",
        "2025年批发代理收入同比-12.05%，系列酒收入同比-9.76%，渠道和非飞天产品承压",
        "当前价格若要十年五倍，所需EPS增速显著高于低速现金牛定位"
      ]
    }
  };
}

const KNOWLEDGE_CALIBRATION = {
  cmb: {
    source: "sh600036_招商银行_20260530.md / 五股深度价值分析_20260601.md",
    score: 66,
    rating: "三星",
    safety: "★★★★★",
    zone: "A区",
    threeBottoms: "三底确认",
    positionRole: "高股息底仓",
    thesis: "PB破净、股息率高、资产质量强，最符合三底买入法；但净利润增速转负，需要等NIM和利润拐点。",
    action: "你已重仓，继续加仓优先级不高；以股息复投和PB/利润拐点复核为主。"
  },
  moutai: {
    source: "sh600519_贵州茅台_20260530.md / 五股深度价值分析_20260601.md",
    score: 83,
    rating: "三星",
    safety: "★★★★",
    zone: "A区边缘",
    threeBottoms: "业绩底+估值底，市场底未完全确认",
    positionRole: "品牌现金牛",
    thesis: "质量极高，PR低于1且PE历史分位低；核心矛盾不是贵，而是增速从成长股切到现金牛。",
    action: "可分批配置；PE 18倍以下更主动，PE 13-15倍才是重仓级机会。"
  },
  fuyao: {
    source: "五股深度价值分析_20260601.md",
    score: null,
    rating: "低配观察",
    safety: "★★★☆",
    zone: "B区偏下",
    threeBottoms: "估值底接近，业绩底未确认",
    positionRole: "全球制造龙头",
    thesis: "全球汽车玻璃护城河极深，但汽车周期下行中，当前不是深度低估。",
    action: "可小仓持有；PE 13倍以下或业绩底确认后再积极布局。"
  },
  anta: {
    source: "hk02020_安踏体育_20260531.md / 五股深度价值分析_20260601.md",
    score: 78,
    rating: "四星",
    safety: "★★★☆",
    zone: "B区偏下",
    threeBottoms: "业绩底+估值底确认，市场底接近",
    positionRole: "消费成长配置",
    thesis: "多品牌矩阵、现金流和ROE质量高，PE约14倍属于合理买入区；短板是主品牌增速放缓。",
    action: "持有，不因短期下跌卖出；若PE回到10-13倍区间可提高配置。"
  },
  popMart: {
    source: "hk09992_泡泡玛特_20260603.md / 五股深度价值分析_20260601.md",
    score: 72,
    rating: "三星，高成长特殊评估",
    safety: "★★",
    zone: "无法套用",
    threeBottoms: "三底未齐，传统深度价值框架不适用",
    positionRole: "高赔率高不确定性",
    thesis: "财务质量极致，但IP生命周期和零转换成本决定它不能按传统白马深度价值看。",
    action: "维持现有仓位，不加仓也不减仓；重点看LABUBU热度、海外增速和新品接续。"
  },
  tencent: {
    source: "hk00700_腾讯控股_20260614.md / 五股深度价值分析_20260601.md",
    score: 78,
    rating: "三星",
    safety: "★★★★",
    zone: "B区偏下 / A区边缘",
    threeBottoms: "估值底+业绩底确认，市场底接近",
    positionRole: "科技核心资产",
    thesis: "回购应视同分红；核心业务PE约13倍、综合股东回报3%-6%、AI期权未完全定价。",
    action: "420-440港元为主力仓，440-470港元可建底仓，470以上不追。"
  },
  mindray: {
    source: "sz300760_迈瑞医疗_20260531.md / 五股深度价值分析_20260601.md",
    score: 63,
    rating: "三星",
    safety: "★★★☆",
    zone: "B区偏下",
    threeBottoms: "估值底接近，业绩底需继续确认",
    positionRole: "医疗器械观察仓",
    thesis: "好公司遇到坏年景；现金流和全球化强，但PEG偏高、集采后复苏斜率不明。",
    action: "不是当前主动加仓首选；等120-130元，或连续2季营收正增长、毛利率回升后再加。"
  },
  wanhua: {
    source: "sh600309_万华化学_20260602.md",
    score: 50,
    rating: "建议规避",
    safety: "★★",
    zone: "观察池",
    threeBottoms: "周期底未确认",
    positionRole: "强周期观察",
    thesis: "技术之王不等于股东回报机器；石化拖累、资本开支和自由现金流为负是核心问题。",
    action: "不主动加仓；需ROE连续回升、资本开支收缩、PE低于15倍后再重估。"
  }
};

const SCORECARD_INPUTS = {
  cmb: {
    moat: { demand: 12, pricingPower: 6, switchingCost: 12, monopoly: 7, roe: 12, globalBonus: 0, diversificationPenalty: 0 },
    price: { peg: 16, dividend: 5, pePenalty: 0 },
    risks: ["息差下行会压低ROE中枢", "地产与零售信用风险仍是核心尾部风险", "你已重仓，配置风险大于估值风险"]
  },
  moutai: {
    moat: { demand: 13, pricingPower: 14, switchingCost: 8, monopoly: 10, roe: 15, globalBonus: 1, diversificationPenalty: -3 },
    price: { peg: 7, dividend: 4, pePenalty: -2 },
    risks: ["增长降速后不能继续给成长股估值", "批价与批发渠道承压会压低终值PE", "海外扩张不足，长期天花板主要取决于中国高端消费"]
  },
  fuyao: {
    moat: { demand: 11, pricingPower: 8, switchingCost: 12, monopoly: 8, roe: 11, globalBonus: 4, diversificationPenalty: 0 },
    price: { peg: 13, dividend: 4, pePenalty: 0 },
    risks: ["汽车周期、关税与海外本地化成本会放大利润波动", "资本开支和海外扩张要持续验证现金回报", "不是消费现金牛，不能只看股息率"]
  },
  anta: {
    moat: { demand: 12, pricingPower: 10, switchingCost: 8, monopoly: 7, roe: 13, globalBonus: 3, diversificationPenalty: -2 },
    price: { peg: 17, dividend: 3, pePenalty: 0 },
    risks: ["主品牌成熟后增速中枢可能下移", "亚玛芬整合和商誉会带来利润波动", "可选消费决定短期业绩受收入预期影响"]
  },
  wanhua: {
    moat: { demand: 9, pricingPower: 5, switchingCost: 7, monopoly: 8, roe: 8, globalBonus: 2, diversificationPenalty: -5 },
    price: { peg: 9, dividend: 2, pePenalty: 0 },
    risks: ["强周期价差未确认触底", "石化业务和资本开支压制自由现金流", "技术壁垒不等于稳定股东回报"]
  },
  popMart: {
    moat: { demand: 8, pricingPower: 10, switchingCost: 3, monopoly: 6, roe: 15, globalBonus: 5, diversificationPenalty: -8 },
    price: { peg: 14, dividend: 1, pePenalty: -3 },
    risks: ["IP生命周期和单一IP集中度是第一风险", "用户转换成本低，热度下降会很快反映到库存", "高成长股必须用现金转换和复购率持续验证"]
  },
  tencent: {
    moat: { demand: 14, pricingPower: 11, switchingCost: 14, monopoly: 9, roe: 12, globalBonus: 3, diversificationPenalty: -2 },
    price: { peg: 18, dividend: 3, pePenalty: 0 },
    risks: ["AI资本开支可能压缩回购和自由现金流", "监管、竞争和大股东减持压制估值", "470港元以上容易从好公司变成一般价格"]
  },
  mindray: {
    moat: { demand: 13, pricingPower: 8, switchingCost: 10, monopoly: 7, roe: 13, globalBonus: 4, diversificationPenalty: 0 },
    price: { peg: 9, dividend: 1, pePenalty: -2 },
    risks: ["集采和院内资本开支周期仍未完全出清", "PEG不便宜，分红保护弱", "需要连续两个季度验证营收和毛利率回升"]
  },
  catl: {
    moat: { demand: 14, pricingPower: 8, switchingCost: 11, monopoly: 8, roe: 12, globalBonus: 5, diversificationPenalty: -2 },
    price: { peg: 13, dividend: 1, pePenalty: -4 },
    risks: ["动力电池仍有价格竞争和资本开支压力", "储能增长能提高空间，但不能抵消所有周期波动", "当前估值若隐含长期高增长，必须用海外份额和现金流验证"]
  },
  gree: {
    moat: { demand: 10, pricingPower: 6, switchingCost: 5, monopoly: 7, roe: 11, globalBonus: 1, diversificationPenalty: -4 },
    price: { peg: 15, dividend: 5, pePenalty: 0 },
    risks: ["空调需求受地产和更新周期影响，需求永续不等于增长永续", "多元化长期未证明能创造高资本回报", "低PE和高股息只能提供下行保护，不能自动支撑十年五倍"]
  }
};

function scorecardFromConfig(key) {
  const config = SCORECARD_INPUTS[key];
  if (!config) return null;
  const moatItems = [
    ["客户需求永续性", config.moat.demand, 15],
    ["提价能力", config.moat.pricingPower, 15],
    ["转化/替换成本", config.moat.switchingCost, 15],
    ["垄断性格局", config.moat.monopoly, 10],
    ["ROE盈利能力", config.moat.roe, 15],
    ["全球化潜力", config.moat.globalBonus, 5],
    ["多元化风险", config.moat.diversificationPenalty, -10]
  ];
  const priceItems = [
    ["成长估值匹配度", config.price.peg, 25],
    ["股息率", config.price.dividend, 5],
    ["PE历史分位风险", config.price.pePenalty, -20]
  ];
  const companyScore = moatItems.reduce((sum, [, score]) => sum + score, 0);
  const priceScore = priceItems.reduce((sum, [, score]) => sum + score, 0);
  const total = clamp(companyScore + priceScore);
  const rating = total > 80 ? "五星" : total >= 60 ? "三星" : "建议规避";
  return {
    total,
    rating,
    companyScore,
    priceScore,
    moatItems: moatItems.map(([label, score, max]) => ({ label, score, max })),
    priceItems: priceItems.map(([label, score, max]) => ({ label, score, max })),
    risks: config.risks
  };
}

const FUNDSMITH_QUALITY_BENCHMARK = {
  asOf: "2025-12-31",
  source: "Fundsmith Equity Fund 2025 Annual Letter",
  metrics: {
    roce: 0.31,
    grossMargin: 0.62,
    operatingMargin: 0.28,
    cashConversion: 0.94,
    leverage: 29,
    dividendCover: null,
    fcfYield: 0.037
  },
  notes: [
    "Fundsmith披露的杠杆相关指标为利息覆盖倍数，非净负债/EBITDA。",
    "Fundsmith未在2025年年信中披露组合股息覆盖率，本系统将其作为公司侧审计项而非横向基准。"
  ]
};

const QUALITY_AUDIT_INPUTS = {
  moutai: {
    source: "贵州茅台2025年报 / 2026一季报",
    confidence: "高",
    status: "已接入2025核心指标，五年序列待结构化",
    fiscalYear: "2025",
    metrics: {
      roce: { value: null, label: "待算ROCE", evidence: "needs_source" },
      grossMargin: { value: 0.9123, evidence: "fact" },
      operatingMargin: { value: 114808950164.24 / 168838102514.79, evidence: "model_derived" },
      cashConversion: { value: 61522204989.35 / 82320067101.68, evidence: "model_derived" },
      leverage: { value: 114808950164.24 / 28734948.29, label: "净现金/利息覆盖极高", evidence: "model_derived" },
      dividendCover: { value: 82320067101.68 / 71153295260.53, evidence: "model_derived" },
      fcfYield: { value: null, label: "待算FCF收益率", evidence: "needs_source" }
    },
    fiveYear: [
      { year: "2021", status: "待补源" },
      { year: "2022", status: "待补源" },
      { year: "2023", status: "待补源" },
      { year: "2024", status: "待补源" },
      { year: "2025", status: "已接入" }
    ],
    verdict: "质量仍是顶级，但现金转换率和增长降速已经给估值上限戴上盖子。"
  },
  popMart: {
    source: "泡泡玛特2025年报 / 2026一季报更新",
    confidence: "高",
    status: "已接入2025核心指标，五年序列待结构化",
    fiscalYear: "2025",
    metrics: {
      roce: { value: null, label: "待算ROCE", evidence: "needs_source" },
      grossMargin: { value: 0.721, evidence: "fact" },
      operatingMargin: { value: 16890.5 / 37120.1, evidence: "model_derived" },
      cashConversion: { value: 10870 / 13012, evidence: "model_derived" },
      leverage: { value: null, label: "净现金", evidence: "fact" },
      dividendCover: { value: 13012 / (2.3817 * 1341.2), evidence: "model_derived" },
      fcfYield: { value: null, label: "待算FCF收益率", evidence: "needs_source" }
    },
    fiveYear: [
      { year: "2021", status: "待补源" },
      { year: "2022", status: "待补源" },
      { year: "2023", status: "待补源" },
      { year: "2024", status: "待补源" },
      { year: "2025", status: "已接入" }
    ],
    verdict: "盈利质量极强，但现金转换未达到Fundsmith组合水平，库存和IP周期仍是硬约束。"
  }
};

function compareMetric(value, benchmark, higherIsBetter = true) {
  if (!Number.isFinite(value) || !Number.isFinite(benchmark)) return "na";
  if (higherIsBetter) return value >= benchmark ? "above" : "below";
  return value <= benchmark ? "above" : "below";
}

function qualityAuditForConfig(key) {
  const audit = QUALITY_AUDIT_INPUTS[key];
  const metricLabels = {
    roce: "ROCE",
    grossMargin: "毛利率",
    operatingMargin: "营业利润率",
    cashConversion: "现金转换率",
    leverage: "利息覆盖/杠杆",
    dividendCover: "股息覆盖率",
    fcfYield: "自由现金流收益率"
  };
  const rows = Object.entries(metricLabels).map(([metric, label]) => {
    const input = audit?.metrics?.[metric] || { value: null, evidence: "needs_source" };
    const benchmark = FUNDSMITH_QUALITY_BENCHMARK.metrics[metric];
    return {
      metric,
      label,
      value: input.value,
      display: input.label || null,
      benchmark,
      comparison: compareMetric(input.value, benchmark),
      evidence: input.evidence || "needs_source"
    };
  });
  const comparable = rows.filter(row => row.comparison !== "na");
  const passCount = comparable.filter(row => row.comparison === "above").length;
  const dataCoverage = rows.filter(row => row.evidence !== "needs_source").length / rows.length;
  const score = Math.round((passCount / Math.max(1, comparable.length)) * 70 + dataCoverage * 30);
  return {
    benchmark: FUNDSMITH_QUALITY_BENCHMARK,
    source: audit?.source || "待接入公司年报",
    confidence: audit?.confidence || "低",
    status: audit?.status || "等待五年财务数据结构化",
    fiscalYear: audit?.fiscalYear || "待补",
    rows,
    fiveYear: audit?.fiveYear || ["2021", "2022", "2023", "2024", "2025"].map(year => ({ year, status: "待补源" })),
    score,
    verdict: audit?.verdict || "当前只能做定性评分，不能宣称完成Terry Smith五年审计。"
  };
}

const REVIEW_KEY_BY_SYMBOL = {
  sh600036: "cmb",
  hk09992: "popMart",
  sh600519: "moutai",
  sh600660: "fuyao",
  hk02020: "anta",
  sh600309: "wanhua",
  hk00700: "tencent",
  sz300760: "mindray",
  sz000651: "gree"
};

const ACTION_POLICY = {
  maxSingleStockWeight: 0.18,
  hardSingleStockWeight: 0.25,
  minimumBaseReturn: 0.08,
  goalReturn: 5 ** (1 / 10) - 1,
  addMargin: 0.015
};

function reviewBaseReturn(review) {
  if (!review) return null;
  if (review.scenarioReturns?.base) return review.scenarioReturns.base;
  if (review.scenarios?.base?.annualReturn) return review.scenarios.base.annualReturn;
  return null;
}

function actionForHolding(holding, review) {
  const score = review?.scorecard?.total ?? null;
  const baseReturn = reviewBaseReturn(review);
  const stockWeight = holding.stockWeight || 0;
  const pnlPct = holding.unrealizedPnlPct || 0;
  const reasons = [];
  let action = "持有观察";
  let severity = "neutral";

  if (!review) {
    return {
      action: "待补数据",
      severity: "watch",
      baseReturn,
      score,
      reasons: ["缺少统一估值与评分数据，不能给出动作建议"]
    };
  }

  if (stockWeight >= ACTION_POLICY.hardSingleStockWeight) {
    action = "集中度减仓审查";
    severity = "risk";
    reasons.push(`股票仓占比${round(stockWeight * 100, 1)}%，超过25%硬约束`);
  } else if (score !== null && score < 60) {
    action = "减仓审查";
    severity = "risk";
    reasons.push(`统一评分${score}分，低于60分规避线`);
  } else if (Number.isFinite(baseReturn) && baseReturn < ACTION_POLICY.minimumBaseReturn) {
    action = "不加仓，比较替代机会";
    severity = "watch";
    reasons.push(`基准十年年化${round(baseReturn * 100, 1)}%，低于8%最低持有线`);
  } else if (
    Number.isFinite(baseReturn)
    && baseReturn >= ACTION_POLICY.goalReturn + ACTION_POLICY.addMargin
    && score !== null
    && score >= 70
    && stockWeight < ACTION_POLICY.maxSingleStockWeight
  ) {
    action = "可作为备用金承接候选";
    severity = "opportunity";
    reasons.push(`基准年化${round(baseReturn * 100, 1)}%，超过十年五倍目标并留有缓冲`);
  } else if (Number.isFinite(baseReturn) && baseReturn >= ACTION_POLICY.goalReturn) {
    action = "持有，等待更好价格再加";
    severity = "neutral";
    reasons.push(`基准年化${round(baseReturn * 100, 1)}%，接近或达到十年五倍目标`);
  } else {
    reasons.push(Number.isFinite(baseReturn)
      ? `基准年化${round(baseReturn * 100, 1)}%，尚未达到十年五倍目标`
      : "基准回报缺失，不能做十年五倍判断");
  }

  if (pnlPct < -0.10 && score !== null && score >= 60) {
    reasons.push(`浮亏${round(pnlPct * 100, 1)}%，但评分未跌破规避线，不能只因亏损卖出`);
  }
  if (pnlPct > 0.25 && stockWeight > ACTION_POLICY.maxSingleStockWeight) {
    reasons.push("盈利且仓位偏高，反弹时优先检查是否压回目标权重");
  }
  if (score !== null) reasons.push(`统一评分${score}分`);

  return {
    action,
    severity,
    baseReturn,
    score,
    reasons: reasons.slice(0, 3)
  };
}

function solveRequiredReserveReturn(portfolio, stockReturn) {
  const years = portfolio.goal?.years || 10;
  const targetMultiple = portfolio.goal?.targetMultiple || 5;
  const target = portfolio.currentTotalAssets * targetMultiple;
  const stockTerminal = portfolio.currentStockMarketValue * (1 + stockReturn) ** years;
  if (portfolio.reserveCash <= 0) return null;
  const neededReserveTerminal = target - stockTerminal;
  if (neededReserveTerminal <= 0) return 0;
  return (neededReserveTerminal / portfolio.reserveCash) ** (1 / years) - 1;
}

function portfolioGoalGap(portfolio, companyReviews) {
  if (!portfolio) return null;
  const rows = portfolio.holdings.map(holding => {
    const key = REVIEW_KEY_BY_SYMBOL[holding.symbol];
    const review = key ? companyReviews[key] : null;
    const baseReturn = reviewBaseReturn(review);
    return {
      symbol: holding.symbol,
      name: holding.name,
      stockWeight: holding.stockWeight,
      totalWeight: holding.totalWeight,
      baseReturn,
      contribution: Number.isFinite(baseReturn) ? holding.stockWeight * baseReturn : 0,
      status: Number.isFinite(baseReturn) ? "modeled" : "missing"
    };
  });
  const modeledWeight = rows
    .filter(row => row.status === "modeled")
    .reduce((sum, row) => sum + row.stockWeight, 0);
  const stockBaseReturn = modeledWeight
    ? rows.reduce((sum, row) => sum + row.contribution, 0) / modeledWeight
    : null;
  const cashReturn = portfolio.cashYieldAssumption || 0.015;
  const goalReturn = portfolio.requiredCagr;
  const years = portfolio.goal?.years || 10;
  const targetMultiple = portfolio.goal?.targetMultiple || 5;
  const currentPathMultiple = Number.isFinite(stockBaseReturn)
    ? (
      portfolio.currentStockMarketValue * (1 + stockBaseReturn) ** years
      + portfolio.reserveCash * (1 + cashReturn) ** years
    ) / portfolio.currentTotalAssets
    : null;
  const requiredReserveReturn = Number.isFinite(stockBaseReturn)
    ? solveRequiredReserveReturn(portfolio, stockBaseReturn)
    : null;
  const gap = currentPathMultiple === null ? null : currentPathMultiple - targetMultiple;
  const shortfallMultiple = currentPathMultiple === null ? null : Math.max(0, targetMultiple - currentPathMultiple);
  const targetTerminalValue = portfolio.currentTotalAssets * targetMultiple;
  const projectedTerminalValue = Number.isFinite(stockBaseReturn)
    ? portfolio.currentStockMarketValue * (1 + stockBaseReturn) ** years
      + portfolio.reserveCash * (1 + cashReturn) ** years
    : null;
  const shortfallValue = projectedTerminalValue === null
    ? null
    : Math.max(0, targetTerminalValue - projectedTerminalValue);
  let verdict = "目标差距待建模";
  if (currentPathMultiple !== null) {
    if (currentPathMultiple >= targetMultiple) verdict = "当前路径达到目标，但仍需验证个股基本面";
    else if (requiredReserveReturn > goalReturn + .03) verdict = "目标压力很高，不能靠低收益资产或追涨补缺口";
    else if (requiredReserveReturn > goalReturn) verdict = "目标仍有缺口，备用金要承担主要修复任务";
    else verdict = "目标缺口可控，关键是按纪律部署备用金";
  }
  return {
    goalReturn,
    years,
    targetMultiple,
    stockBaseReturn,
    cashReturn,
    currentPathMultiple,
    gap,
    shortfallMultiple,
    targetTerminalValue,
    projectedTerminalValue,
    shortfallValue,
    requiredReserveReturn,
    modeledWeight,
    verdict,
    rows: rows.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
  };
}

function portfolioWithActions(portfolio, companyReviews) {
  if (!portfolio) return null;
  const holdings = portfolio.holdings.map(holding => {
    const key = REVIEW_KEY_BY_SYMBOL[holding.symbol];
    return {
      ...holding,
      reviewKey: key || null,
      recommendation: actionForHolding(holding, key ? companyReviews[key] : null)
    };
  });
  const riskActions = holdings.filter(holding => holding.recommendation.severity === "risk");
  const opportunities = holdings.filter(holding => holding.recommendation.severity === "opportunity");
  const watchActions = holdings.filter(holding => holding.recommendation.severity === "watch");
  return {
    ...portfolio,
    holdings,
    goalGap: portfolioGoalGap({ ...portfolio, holdings }, companyReviews),
    actionSummary: {
      riskCount: riskActions.length,
      opportunityCount: opportunities.length,
      watchCount: watchActions.length,
      primary: riskActions[0]?.recommendation.action
        ? `${riskActions[0].name}：${riskActions[0].recommendation.action}`
        : opportunities[0]?.recommendation.action
          ? `${opportunities[0].name}：${opportunities[0].recommendation.action}`
          : "当前以持有观察和价格纪律为主"
    }
  };
}

const SIMPLE_REVIEWS = {
  fuyao: {
    symbol: "sh600660",
    name: "福耀玻璃",
    code: "600660",
    eps: 3.57,
    dividend: 1.94,
    fundamentalDate: "2026-03-31",
    metricLabel: "2025静态PE",
    scenarios: {
      bear: { label: "周期压力", firstGrowth: -0.08, laterGrowth: 0.03, terminalPe: 13, payout: 0.50 },
      cautious: { label: "保守", firstGrowth: 0, laterGrowth: 0.06, terminalPe: 15, payout: 0.50 },
      base: { label: "小仓持有", firstGrowth: 0.03, laterGrowth: 0.06, terminalPe: 15, payout: 0.55 },
      bull: { label: "业绩底确认", firstGrowth: 0.08, laterGrowth: 0.09, terminalPe: 18, payout: 0.50 }
    },
    evidence: {
      positive: [
        "知识库定性：全球汽车玻璃龙头，护城河极深，全产业链与客户认证构成壁垒",
        "PE约15倍、股息率接近4%，估值底接近但不是深度低估",
        "智能汽车玻璃和海外份额提升仍能提供中长期增长弹性"
      ],
      negative: [
        "知识库明确指出汽车周期下行中，业绩底尚未确认",
        "历史极端底部约13倍PE，当前距深度买点仍有空间",
        "汇兑、关税和本地化成本会放大短期利润波动"
      ]
    }
  },
  wanhua: {
    symbol: "sh600309",
    name: "万华化学",
    code: "600309",
    eps: 3.99,
    dividend: 1.25,
    fundamentalDate: "2026-03-31",
    metricLabel: "2025静态PE",
    scenarios: {
      bear: { label: "价差下行", firstGrowth: -0.12, laterGrowth: 0.02, terminalPe: 11, payout: 0.32 },
      cautious: { label: "观察", firstGrowth: 0, laterGrowth: 0.03, terminalPe: 12, payout: 0.32 },
      base: { label: "周期修复", firstGrowth: 0.08, laterGrowth: 0.04, terminalPe: 14, payout: 0.32 },
      bull: { label: "ROE回升", firstGrowth: 0.15, laterGrowth: 0.07, terminalPe: 16, payout: 0.30 }
    },
    evidence: {
      positive: [
        "MDI全球第一，技术壁垒和成本优势仍然真实存在",
        "2026年一季度利润同比回升，可能是周期触底的早期信号",
        "若ROE连续回到15%以上、石化毛利率恢复，估值需要重新评估"
      ],
      negative: [
        "知识库评分50分，核心结论是建议规避而非低估买入",
        "石化业务低毛利、资本开支吞噬自由现金流，是结构性问题",
        "必须等ROE回升、资本开支下降、PE低于15倍三者至少满足两项"
      ]
    }
  },
  tencent: {
    symbol: "hk00700",
    name: "腾讯控股",
    code: "00700.HK",
    eps: 28.577,
    dividend: 5.30,
    hkdToCny: 0.917,
    fundamentalDate: "2026-03-31",
    metricLabel: "2025核心PE",
    scenarios: {
      bear: { label: "回购收缩", firstGrowth: 0.04, laterGrowth: 0.06, terminalPe: 14, payout: 0.24 },
      cautious: { label: "合理持有", firstGrowth: 0.08, laterGrowth: 0.08, terminalPe: 16, payout: 0.30 },
      base: { label: "回购复利", firstGrowth: 0.12, laterGrowth: 0.09, terminalPe: 18, payout: 0.38 },
      bull: { label: "AI兑现", firstGrowth: 0.15, laterGrowth: 0.11, terminalPe: 22, payout: 0.42 }
    },
    evidence: {
      positive: [
        "知识库核心校准：回购即分红，腾讯综合股东回报率应按现金股息+回购共同看",
        "核心业务PE约13倍，FCF DCF合理价约600港元，当前属于合理偏便宜",
        "微信生态、游戏、视频号广告和AI工具化共同支撑现金流增长"
      ],
      negative: [
        "AI资本开支可能压缩回购，知识库把这是不一次性买满的核心原因",
        "Prosus/Naspers减持、监管和字节竞争仍会压制估值中枢",
        "470港元以上不追，420-440港元才是主力仓区间"
      ]
    }
  },
  mindray: {
    symbol: "sz300760",
    name: "迈瑞医疗",
    code: "300760",
    eps: 6.71,
    dividend: 0.31,
    fundamentalDate: "2026-03-31",
    metricLabel: "2025静态PE",
    scenarios: {
      bear: { label: "趋势恶化", firstGrowth: -0.08, laterGrowth: 0.02, terminalPe: 16, payout: 0.08 },
      cautious: { label: "缓慢修复", firstGrowth: 0.03, laterGrowth: 0.05, terminalPe: 19, payout: 0.08 },
      base: { label: "复苏确认", firstGrowth: 0.07, laterGrowth: 0.08, terminalPe: 22, payout: 0.10 },
      bull: { label: "全球化加速", firstGrowth: 0.12, laterGrowth: 0.10, terminalPe: 26, payout: 0.12 }
    },
    evidence: {
      positive: [
        "知识库确认其仍是好公司：现金转换率高、全球化和研发壁垒强",
        "PE处于近年低位，若业绩低谷被证明一次性，估值修复空间大",
        "海外收入占比提升，可对冲国内集采周期"
      ],
      negative: [
        "知识库评分63分，好价格仅5/30，当前不是最佳击球点",
        "PEG偏高、分红极低，120-130元或复苏确认后再加更符合纪律",
        "集采和毛利率下降是否趋势化，是迈瑞最关键的未决问题"
      ]
    }
  },
  anta: {
    symbol: "hk02020",
    name: "安踏体育",
    code: "02020.HK",
    eps: 4.89,
    dividend: 2.45,
    hkdToCny: 0.923,
    fundamentalDate: "2025-12-31",
    metricLabel: "2025静态PE",
    scenarios: {
      bear: { label: "消费偏弱", firstGrowth: -0.05, laterGrowth: 0.04, terminalPe: 11, payout: 0.50 },
      cautious: { label: "合理持有", firstGrowth: 0.05, laterGrowth: 0.07, terminalPe: 13, payout: 0.50 },
      base: { label: "多品牌兑现", firstGrowth: 0.10, laterGrowth: 0.10, terminalPe: 16, payout: 0.50 },
      bull: { label: "高端户外加速", firstGrowth: 0.14, laterGrowth: 0.12, terminalPe: 19, payout: 0.48 }
    },
    evidence: {
      positive: [
        "知识库评分78分、四星：Terry Smith七项审计全部通过，财务质量属于消费品第一梯队",
        "PE约14倍、PR约0.64、PEG约1，属于合理买入区而非高估",
        "多品牌矩阵跑通，FILA、迪桑特、亚玛芬提供第二增长曲线"
      ],
      negative: [
        "主品牌安踏增速放缓，大众运动市场进入成熟阶段",
        "亚玛芬整合和商誉风险会带来利润表波动",
        "可选消费属性决定它仍受居民消费周期影响"
      ]
    }
  },
  catl: {
    symbol: "sz300750",
    name: "宁德时代",
    code: "300750",
    eps: 15.80,
    dividend: 2.20,
    fundamentalDate: "2025-12-31 待年报核验",
    metricLabel: "估算PE",
    scenarios: {
      bear: { label: "价格战延续", firstGrowth: -0.08, laterGrowth: 0.04, terminalPe: 16, payout: 0.12 },
      cautious: { label: "稳态龙头", firstGrowth: 0.04, laterGrowth: 0.07, terminalPe: 20, payout: 0.12 },
      base: { label: "全球化兑现", firstGrowth: 0.08, laterGrowth: 0.10, terminalPe: 24, payout: 0.12 },
      bull: { label: "储能加速", firstGrowth: 0.15, laterGrowth: 0.13, terminalPe: 28, payout: 0.10 }
    },
    evidence: {
      positive: [
        "动力电池和储能均属于长期电气化基础设施，需求持续性强于多数制造业",
        "全球份额、研发规模和客户认证构成壁垒，海外扩张提供第二增长曲线",
        "如果未来十年EPS能保持高个位数到低双位数增长，当前价格具备进入观察区的条件"
      ],
      negative: [
        "电池不是消费品牌，价格竞争会持续侵蚀单位盈利",
        "资本开支、技术路线变化和客户议价会压低长期ROCE确定性",
        "当前模型为待年报核验口径，不能替代完整五年财务质量审计"
      ]
    }
  },
  gree: {
    symbol: "sz000651",
    name: "格力电器",
    code: "000651",
    eps: 5.15,
    dividend: 2.40,
    fundamentalDate: "2025-12-31 待年报核验",
    metricLabel: "估算PE",
    scenarios: {
      bear: { label: "地产拖累", firstGrowth: -0.08, laterGrowth: -0.02, terminalPe: 6, payout: 0.45 },
      cautious: { label: "低速现金牛", firstGrowth: -0.02, laterGrowth: 0.01, terminalPe: 7, payout: 0.50 },
      base: { label: "稳态分红", firstGrowth: 0, laterGrowth: 0.02, terminalPe: 8, payout: 0.50 },
      bull: { label: "更新周期回暖", firstGrowth: 0.04, laterGrowth: 0.04, terminalPe: 10, payout: 0.48 }
    },
    evidence: {
      positive: [
        "当前估值低、股息保护较强，价格已反映相当多的增长悲观预期",
        "空调主业仍具规模、渠道和制造效率优势，现金流属性强于多数制造企业",
        "若更新需求回暖且分红稳定，作为小仓现金牛可以持有观察"
      ],
      negative: [
        "十年五倍的核心问题不是便宜，而是增长天花板低",
        "地产链、渠道库存和空调渗透率决定主业很难按成长股估值",
        "多元化和新能源等第二曲线尚未证明能显著抬高ROE和收入中枢"
      ]
    }
  }
};

function findQuote(latestSnapshot, symbol) {
  return Object.values(latestSnapshot?.quotes || {}).flat().find(item => item.symbol === symbol);
}

function simpleScenario(price, review, scenario) {
  let eps = review.eps;
  let dividends = 0;
  for (let year = 1; year <= 10; year += 1) {
    eps *= 1 + (year === 1 ? scenario.firstGrowth : scenario.laterGrowth);
    dividends += eps * scenario.payout;
  }
  const proceeds = eps * scenario.terminalPe + dividends;
  const currentPrice = review.hkdToCny ? price * review.hkdToCny : price;
  const goalPrice = proceeds / 5 / (review.hkdToCny || 1);
  return {
    annualReturn: (proceeds / currentPrice) ** (1 / 10) - 1,
    goalPrice
  };
}

function simpleReviewPayload(key, latestSnapshot, portfolio) {
  const review = SIMPLE_REVIEWS[key];
  const quote = findQuote(latestSnapshot, review.symbol);
  if (!quote || !portfolio) return null;
  const holding = portfolio.holdings.find(item => item.symbol === review.symbol);
  const scenarios = Object.fromEntries(Object.entries(review.scenarios).map(([scenarioKey, scenario]) => [
    scenarioKey,
    { label: scenario.label, ...simpleScenario(quote.close, review, scenario) }
  ]));
  const currentPrice = review.hkdToCny ? quote.close * review.hkdToCny : quote.close;
  const trailingPe = currentPrice / review.eps;
  const dividendYield = review.hkdToCny ? review.dividend / currentPrice : review.dividend / quote.close;
  let verdict = "进入观察池，等待价格或基本面确认";
  if (holding) verdict = "持有，按情景回报决定是否调仓";
  if (scenarios.base.annualReturn >= ACTION_POLICY.goalReturn) verdict = holding ? "持有，可作为再平衡承接方向" : "达到五倍目标，可小额分批";
  if (scenarios.base.annualReturn < 0.08) verdict = holding ? "持有但不加仓，比较替代机会" : "估值回报不足，继续等待";
  const calibration = KNOWLEDGE_CALIBRATION[key];
  if (calibration?.action) verdict = calibration.action;

  return {
    symbol: review.symbol,
    name: review.name,
    code: review.code,
    quoteDate: quote.date,
    price: quote.close,
    currency: review.hkdToCny ? "港元" : "元",
    fundamentalDate: review.fundamentalDate,
    metricLabel: review.metricLabel,
    trailingPe,
    dividendYield,
    portfolioWeight: holding?.totalWeight || 0,
    stockWeight: holding?.stockWeight || 0,
    calibration,
    scorecard: scorecardFromConfig(key),
    qualityAudit: qualityAuditForConfig(key),
    verdict,
    scenarios,
    evidence: review.evidence
  };
}

async function fetchSeries(asset, days = 90) {
  const url = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${asset.symbol},day,,,${days},qfq`;
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 StyleRotationMonitor/1.0" }
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      const block = payload?.data?.[asset.symbol];
      const rows = block?.qfqday || block?.day;
      if (!Array.isArray(rows) || rows.length < 21) throw new Error("data unavailable");
      return {
        ...asset,
        rows: rows.map(([date, open, close, high, low, volume]) => ({
          date,
          open: Number(open),
          close: Number(close),
          high: Number(high),
          low: Number(low),
          volume: Number(volume)
        }))
      };
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise(resolve => setTimeout(resolve, attempt * 300));
    }
  }
  throw new Error(`${asset.name} ${lastError?.message || "data unavailable"}`);
}

function returnFor(series, days) {
  const rows = series.rows;
  const start = rows[Math.max(0, rows.length - 1 - days)]?.close;
  const end = rows.at(-1)?.close;
  return start && end ? ((end / start) - 1) * 100 : 0;
}

function returnBetween(series, fromDaysAgo, toDaysAgo) {
  const rows = series.rows;
  const start = rows[Math.max(0, rows.length - 1 - fromDaysAgo)]?.close;
  const end = rows[Math.max(0, rows.length - 1 - toDaysAgo)]?.close;
  return start && end ? ((end / start) - 1) * 100 : 0;
}

function aboveMovingAverage(series, days = 20) {
  const closes = series.rows.slice(-days).map(row => row.close);
  return series.rows.at(-1).close > average(closes) ? 1 : 0;
}

function volumeRatio(series) {
  const volumes = series.rows.map(row => row.volume);
  const recent = average(volumes.slice(-5));
  const baseline = average(volumes.slice(-25, -5));
  return baseline ? recent / baseline : 1;
}

function turnoverProxyValue(series, row) {
  const currencyMultiplier = series.symbol.startsWith("hk") ? 0.866 : 1;
  const volumeMultiplier = 1;
  return row.close * row.volume * volumeMultiplier * currencyMultiplier;
}

function averageTurnoverProxy(series, rows) {
  return average(rows.map(row => turnoverProxyValue(series, row)));
}

function flowMigration(techSet, whiteSet) {
  const summarize = seriesList => {
    const rows = seriesList.map(series => {
      const recent = averageTurnoverProxy(series, series.rows.slice(-5));
      const baseline = averageTurnoverProxy(series, series.rows.slice(-25, -5));
      const incremental = recent - baseline;
      return {
        symbol: series.symbol,
        name: series.name,
        recent,
        baseline,
        incremental,
        incrementalPct: baseline ? incremental / baseline : 0
      };
    });
    return {
      recent: rows.reduce((sum, row) => sum + row.recent, 0),
      baseline: rows.reduce((sum, row) => sum + row.baseline, 0),
      incremental: rows.reduce((sum, row) => sum + row.incremental, 0),
      incrementalPct: rows.reduce((sum, row) => sum + row.baseline, 0)
        ? rows.reduce((sum, row) => sum + row.incremental, 0) / rows.reduce((sum, row) => sum + row.baseline, 0)
        : 0,
      leaders: rows
        .sort((a, b) => Math.abs(b.incremental) - Math.abs(a.incremental))
        .slice(0, 3)
    };
  };
  const tech = summarize(techSet);
  const white = summarize(whiteSet);
  const netIncremental = tech.incremental - white.incremental;
  let status = "未形成明显资金迁移";
  if (netIncremental > 0 && tech.incrementalPct > white.incrementalPct) status = "资金拥挤偏向科技";
  if (netIncremental < 0 && white.incrementalPct > tech.incrementalPct) status = "资金回流偏向白马";
  return {
    status,
    unit: "亿元/日成交额代理",
    caveat: "腾讯K线仅返回成交量，本指标用价格×成交量估算成交额；港股按港币兑人民币假设折算。它衡量成交拥挤方向，不等同于真实净流入。",
    tech,
    white,
    netIncremental,
    netIncrementalPctGap: tech.incrementalPct - white.incrementalPct
  };
}

function latestQuote(series) {
  const latest = series.rows.at(-1);
  return {
    symbol: series.symbol,
    name: series.name,
    date: latest.date,
    close: latest.close,
    day: round(returnFor(series, 1), 2),
    week: round(returnFor(series, 5), 2),
    month: round(returnFor(series, 20), 2),
    above20d: Boolean(aboveMovingAverage(series))
  };
}

async function quotePayload(symbols) {
  const cleanSymbols = [...new Set(symbols
    .map(symbol => String(symbol || "").trim().toLowerCase())
    .filter(symbol => /^(sh|sz|hk)\d{5,6}$/.test(symbol)))];
  const quotes = [];
  for (const symbol of cleanSymbols.slice(0, 20)) {
    try {
      const series = await fetchSeries({ symbol, name: symbol }, 30);
      quotes.push(latestQuote(series));
    } catch (error) {
      quotes.push({ symbol, name: symbol, error: error.message });
    }
  }
  return { quotes };
}

function scoreDashboard(seriesByGroup) {
  const techSet = [...seriesByGroup.indices.filter(item => item.group === "tech"), ...seriesByGroup.tech];
  const techStockSet = seriesByGroup.tech;
  const whiteSet = seriesByGroup.whiteHorse;

  const tech5 = average(techSet.map(item => returnFor(item, 5)));
  const tech20 = average(techSet.map(item => returnFor(item, 20)));
  const white5 = average(whiteSet.map(item => returnFor(item, 5)));
  const white20 = average(whiteSet.map(item => returnFor(item, 20)));
  const relative5 = tech5 - white5;
  const relative20 = tech20 - white20;
  const techPrior5 = average(techSet.map(item => returnBetween(item, 10, 5)));
  const whitePrior5 = average(whiteSet.map(item => returnBetween(item, 10, 5)));
  const relativePrior5 = techPrior5 - whitePrior5;
  const tech1 = average(techSet.map(item => returnFor(item, 1)));
  const white1 = average(whiteSet.map(item => returnFor(item, 1)));
  const techBreadth = average(techSet.map(item => aboveMovingAverage(item)));
  const whiteBreadth = average(whiteSet.map(item => aboveMovingAverage(item)));
  const breadthGap = techBreadth - whiteBreadth;
  const techVolume = average(seriesByGroup.indices.filter(item => item.group === "tech").map(volumeRatio));
  const acceleration = relative5 - relative20 / 4;

  const progress = clamp(40 + relative20 * 1.3 + relative5 * 0.65 + breadthGap * 18);
  const continuation = clamp(45 + relative5 * 1.4 + acceleration * 0.8 + breadthGap * 10);
  const reversalRisk = clamp(20 + Math.max(0, techVolume - 1) * 75 + Math.max(0, relative5 - 5) * 3.2 + techBreadth * 12);

  // Completion estimates whether the initial position migration is exhausted,
  // not whether the technology style itself is about to reverse.
  const saturation = clamp(35 + relative20 * 2.2 + breadthGap * 25 + Math.max(0, techVolume - 1) * 20);
  const deceleration = clamp(50 + (relativePrior5 - relative5) * 3.5);
  const dailyRelative = white1 - tech1;
  const averageDailyRelative = (white5 - tech5) / 5;
  const sellerExhaustion = clamp(50 + (dailyRelative - averageDailyRelative) * 8);
  const completion = clamp(saturation * 0.45 + deceleration * 0.35 + sellerExhaustion * 0.2);

  let phase = "初始调仓";
  if (completion >= 82) phase = "接近完成";
  else if (completion >= 65) phase = "调仓后段";
  else if (completion >= 42) phase = "调仓中段";

  let intensityPhase = "早期切换";
  if (progress >= 78 && reversalRisk >= 60) intensityPhase = "后段拥挤";
  else if (progress >= 65) intensityPhase = "中后段加速";
  else if (progress >= 45) intensityPhase = "中段扩散";

  let signal = "观察";
  if (continuation >= 68) signal = "趋势延续";
  if (reversalRisk >= 60) signal = "拥挤升温";
  if (continuation < 42 && reversalRisk > 55) signal = "反转预警";

  return {
    completion: round(completion),
    progress: round(progress),
    continuation: round(continuation),
    reversalRisk: round(reversalRisk),
    phase,
    intensityPhase,
    signal,
    confidence: "中",
    completionInputs: {
      saturation: round(saturation),
      deceleration: round(deceleration),
      sellerExhaustion: round(sellerExhaustion)
    },
    flowMigration: flowMigration(techStockSet, whiteSet),
    inputs: {
      tech5: round(tech5, 2),
      tech20: round(tech20, 2),
      white5: round(white5, 2),
      white20: round(white20, 2),
      relative5: round(relative5, 2),
      relative20: round(relative20, 2),
      relativePrior5: round(relativePrior5, 2),
      techBreadth: round(techBreadth * 100),
      whiteBreadth: round(whiteBreadth * 100),
      techVolumeRatio: round(techVolume, 2)
    }
  };
}

function commonTradingDates(grouped) {
  const allSeries = Object.values(grouped).flat();
  let dates = new Set(allSeries[0]?.rows.map(row => row.date) || []);
  for (const series of allSeries.slice(1)) {
    const available = new Set(series.rows.map(row => row.date));
    dates = new Set([...dates].filter(date => available.has(date)));
  }
  return [...dates].sort();
}

function groupedThroughDate(grouped, date) {
  return Object.fromEntries(Object.entries(grouped).map(([group, seriesList]) => [
    group,
    seriesList.map(series => {
      const endIndex = series.rows.findIndex(row => row.date === date);
      if (endIndex < 0) throw new Error(`${series.name} missing ${date}`);
      return { ...series, rows: series.rows.slice(0, endIndex + 1) };
    })
  ]));
}

function snapshotForDate(grouped, date, source, collectedAt = null) {
  const throughDate = groupedThroughDate(grouped, date);
  return {
    date,
    collectedAt,
    source,
    ...scoreDashboard(throughDate),
    quotes: {
      indices: throughDate.indices.map(latestQuote),
      tech: throughDate.tech.map(latestQuote),
      whiteHorse: throughDate.whiteHorse.map(latestQuote),
      research: (throughDate.research || []).map(latestQuote)
    }
  };
}

async function collectSnapshot() {
  const entries = Object.entries(ASSETS);
  const fetched = [];
  for (const [group, assets] of entries) {
    const series = [];
    for (const asset of assets) series.push(await fetchSeries(asset));
    fetched.push([group, series]);
  }
  const grouped = Object.fromEntries(fetched);
  const dates = commonTradingDates(grouped);
  const sourceDate = dates.at(-1);
  if (!sourceDate) throw new Error("No common trading date available");
  const collectedAt = new Date().toISOString();
  const snapshot = snapshotForDate(grouped, sourceDate, "observed", collectedAt);
  const backfillStart = Math.max(30, dates.length - 45);
  const reconstructed = dates.slice(backfillStart, -1)
    .map(date => snapshotForDate(grouped, date, "reconstructed", collectedAt));
  const history = readHistory();
  const byDate = new Map(history.map(item => [item.date, item]));
  for (const item of reconstructed) byDate.set(item.date, item);
  for (const item of history.filter(item => item.source !== "reconstructed")) {
    byDate.set(item.date, { ...item, source: item.source || "observed" });
  }
  byDate.set(snapshot.date, snapshot);
  const next = [...byDate.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-730);
  writeHistory(next);
  return snapshot;
}

function evaluateCompletionConditions(snapshot) {
  const inputs = snapshot?.inputs || {};
  return {
    relativeTurn: {
      label: "白马5日相对收益不再落后",
      passed: Number.isFinite(inputs.relative5) && inputs.relative5 <= 0
    },
    techDeceleration: {
      label: "科技超额动量较前5日减速",
      passed: Number.isFinite(inputs.relative5)
        && Number.isFinite(inputs.relativePrior5)
        && inputs.relative5 < inputs.relativePrior5
    },
    whiteBreadthRecovery: {
      label: "至少一半白马站上20日线",
      passed: Number.isFinite(inputs.whiteBreadth) && inputs.whiteBreadth >= 50
    }
  };
}

function deriveCompletionResult(history) {
  const evaluated = history.map(snapshot => {
    const conditions = evaluateCompletionConditions(snapshot);
    return {
      snapshot,
      conditions,
      passedCount: Object.values(conditions).filter(condition => condition.passed).length
    };
  });
  const current = evaluated.at(-1) || { conditions: evaluateCompletionConditions(null), passedCount: 0 };
  let confirmationDays = 0;
  for (let index = evaluated.length - 1; index >= 0; index -= 1) {
    if (evaluated[index].passedCount < 2) break;
    confirmationDays += 1;
  }

  const latestCompletion = Number.isFinite(current.snapshot?.completion) ? current.snapshot.completion : 0;
  const conditionScore = current.passedCount / 3 * 100;
  const persistenceScore = clamp(confirmationDays / 5 * 100);
  const resultScore = Math.round(latestCompletion * 0.55 + conditionScore * 0.25 + persistenceScore * 0.20);

  let label = "未完成";
  let decision = "不要把风格切换当作已经结束，白马仍未形成足够强的持续相对修复。";
  if (resultScore >= 75 && current.passedCount >= 2) {
    label = "后段确认";
    decision = "调仓接近尾声，但仍需等待持续性；不适合追科技，也不急于一次性抄白马。";
  }
  if (current.passedCount >= 2 && confirmationDays >= 3) {
    label = "初步完成";
    decision = "可以开始把白马和核心资产重新纳入买点观察，但仍用分批和价格纪律执行。";
  }
  if (current.passedCount === 3 && confirmationDays >= 5) {
    label = "基本完成";
    decision = "风格调仓从结果上基本完成，下一阶段重点从风格判断切回个股估值和业绩验证。";
  }

  return {
    label,
    decision,
    passedCount: current.passedCount,
    totalConditions: 3,
    confirmationDays,
    resultScore,
    visualScore: resultScore,
    components: {
      saturation: current.snapshot?.completionInputs?.saturation ?? null,
      deceleration: current.snapshot?.completionInputs?.deceleration ?? null,
      sellerExhaustion: current.snapshot?.completionInputs?.sellerExhaustion ?? null,
      persistence: Math.round(persistenceScore)
    },
    conditions: current.conditions
  };
}

let updatePromise = null;
async function update() {
  if (!updatePromise) {
    updatePromise = collectSnapshot().finally(() => { updatePromise = null; });
  }
  return updatePromise;
}

function investmentSystemPayload(latestSnapshot, portfolio) {
  if (!portfolio) return null;
  const holdingMap = new Map(portfolio.holdings.map(item => [item.symbol, item]));
  const cagr5 = (portfolio.goal?.fiveYearMultiple || 2) ** (1 / 5) - 1;
  const cagr10 = (portfolio.goal?.targetMultiple || 5) ** (1 / (portfolio.goal?.years || 10)) - 1;
  const stockPool = INVESTMENT_POOL.map(item => {
    const quote = latestSnapshot ? findQuote(latestSnapshot, item.symbol) : null;
    const holding = holdingMap.get(item.symbol) || null;
    const currentPrice = quote?.close || holding?.currentPrice || null;
    let valuationState = "待行情";
    let action = "等待行情";
    if (Number.isFinite(currentPrice)) {
      if (currentPrice <= item.p1746) {
        valuationState = "目标回报区";
        action = item.requiresValidation ? "价格到位，先过论文验证门" : "基本面未坏可分三笔建仓";
      } else if (currentPrice <= item.p15) {
        valuationState = "优秀价格";
        action = item.requiresValidation ? "先验证再建观察仓" : "可启动首笔并保留加仓空间";
      } else if (currentPrice <= item.p12) {
        valuationState = "合理买入区";
        action = holding ? "持有，按上限控制加仓" : "只建观察仓，不追满目标仓";
      } else {
        valuationState = "等待区";
        action = holding ? "持有不加，等待价格或利润" : "等待，不因怕错过而抬价";
      }
    }
    const totalWeight = holding?.totalWeight || 0;
    const thesisStatus = item.thesisHealth >= 7 ? "正常" : item.thesisHealth >= 5 ? "需复核" : "验证未完成";
    return {
      ...item,
      currentPrice,
      quoteDate: quote?.date || holding?.quoteDate || null,
      type: holding ? "holding" : "watch",
      quantity: holding?.quantity || 0,
      costPrice: holding?.costPrice || null,
      totalWeight,
      stockWeight: holding?.stockWeight || 0,
      gapToP12: Number.isFinite(currentPrice) ? currentPrice / item.p12 - 1 : null,
      valuationState,
      thesisStatus,
      action
    };
  });

  const annualDividendEstimate = stockPool.reduce((sum, item) => {
    if (!item.quantity || !item.annualDps) return sum;
    const fx = item.symbol.startsWith("hk") ? portfolio.hkdToCnyAssumption || 1 : 1;
    return sum + item.quantity * item.annualDps * fx * (1 - (item.dividendTax || 0));
  }, 0);
  const dividendTarget = portfolio.goal?.annualDividendTarget || 1000000;
  const alerts = [];
  const gap = portfolio.goalGap;
  if (gap && gap.currentPathMultiple < gap.targetMultiple) {
    alerts.push({ severity: "critical", category: "目标", title: "现有收益路径不足", detail: `按当前股票基准回报和现金1.5%测算，${gap.years}年约${gap.currentPathMultiple.toFixed(2)}倍，低于${gap.targetMultiple.toFixed(2)}倍目标。`, action: `剩余现金若承担修复，所需年化约${round(gap.requiredReserveReturn * 100, 1)}%；不能用低成长资产凑仓位。` });
  }
  if (portfolio.currentReserveWeight > .70) {
    alerts.push({ severity: "warning", category: "部署", title: "现金占比高但不构成立刻满仓理由", detail: `待配置资金约${round(portfolio.reserveCash / 10000, 1)}万元，占当前资产${round(portfolio.currentReserveWeight * 100, 1)}%。`, action: "只在价格线与论文门同时满足时分批部署；每月复核目标差距。" });
  }
  alerts.push({ severity: annualDividendEstimate / dividendTarget < .10 ? "warning" : "info", category: "股息", title: "被动股息目标仍有显著缺口", detail: `按已录入最近年度每股分红粗估，税后年股息约${round(annualDividendEstimate / 10000, 1)}万元，完成100万元目标的${round(annualDividendEstimate / dividendTarget * 100, 1)}%。`, action: "股息目标必须依靠本金持续部署、利润增长和分红增长，不能只追逐当前高股息率。" });

  stockPool.forEach(item => {
    if (item.totalWeight > item.hardCap) {
      alerts.push({ severity: "critical", category: "仓位", symbol: item.symbol, title: `${item.name}超过硬上限`, detail: `总资产仓位${round(item.totalWeight * 100, 1)}%，硬上限${round(item.hardCap * 100, 1)}%。`, action: "停止加仓并复核是否需要把超额仓位降回上限。" });
    }
    if (item.type === "holding" && item.thesisHealth <= 5) {
      alerts.push({ severity: "warning", category: "论文", symbol: item.symbol, title: `${item.name}不属于高确定性增长持仓`, detail: `${item.quality}级 · ${item.role}；当前关键风险：${item.risk}。`, action: `不因成本价决策；先检查红线：${item.redLine}` });
    }
    if (item.valuationState !== "等待区" && item.valuationState !== "待行情") {
      alerts.push({ severity: item.requiresValidation ? "warning" : "opportunity", category: "价格", symbol: item.symbol, title: `${item.name}进入${item.valuationState}`, detail: `现价${item.currentPrice.toFixed(2)}，P12/P15/P17.46价格线为${item.p12}/${item.p15}/${item.p1746}。`, action: item.action });
    }
  });
  const priority = { critical: 0, warning: 1, opportunity: 2, info: 3 };
  alerts.sort((a, b) => priority[a.severity] - priority[b.severity]);
  return {
    asOf: latestSnapshot?.date || portfolio.snapshotDate,
    target: { fiveYearMultiple: portfolio.goal?.fiveYearMultiple || 2, tenYearMultiple: portfolio.goal?.targetMultiple || 5, cagr5, cagr10, annualDividendTarget: dividendTarget },
    capital: { total: portfolio.currentTotalAssets, invested: portfolio.currentStockMarketValue, reserve: portfolio.reserveCash, investedWeight: portfolio.currentInvestedWeight },
    dividend: { annualEstimate: annualDividendEstimate, target: dividendTarget, progress: annualDividendEstimate / dividendTarget },
    counts: {
      holdings: stockPool.filter(item => item.type === "holding").length,
      watch: stockPool.filter(item => item.type === "watch").length,
      critical: alerts.filter(item => item.severity === "critical").length,
      warning: alerts.filter(item => item.severity === "warning").length,
      opportunity: alerts.filter(item => item.severity === "opportunity").length
    },
    alerts,
    priorityActions: alerts.slice(0, 5),
    stockPool
  };
}

function dashboardPayload() {
  const history = readHistory();
  const observationCount = history.length;
  const observedCount = history.filter(item => item.source !== "reconstructed").length;
  const reconstructedCount = history.filter(item => item.source === "reconstructed").length;
  let dataMaturity = "起步";
  if (observationCount >= 20) dataMaturity = "可观察";
  else if (observationCount >= 5) dataMaturity = "初步";

  const latestSnapshot = history.at(-1);
  const completionResult = deriveCompletionResult(history);
  const latest = latestSnapshot ? {
    ...latestSnapshot,
    dataMaturity,
    observationCount,
    dataCoverage: { observedCount, reconstructedCount },
    modelStatus: "旧百分比在个股与宽基回测中均未通过，已停用",
    completionResult
  } : null;
  const portfolioBase = portfolioPayload(latestSnapshot);
  const companyReviews = {
    cmb: cmbReviewPayload(latestSnapshot, portfolioBase),
    popMart: popMartReviewPayload(latestSnapshot, portfolioBase),
    moutai: moutaiReviewPayload(latestSnapshot, portfolioBase),
    fuyao: simpleReviewPayload("fuyao", latestSnapshot, portfolioBase),
    anta: simpleReviewPayload("anta", latestSnapshot, portfolioBase),
    gree: simpleReviewPayload("gree", latestSnapshot, portfolioBase),
    wanhua: simpleReviewPayload("wanhua", latestSnapshot, portfolioBase),
    tencent: simpleReviewPayload("tencent", latestSnapshot, portfolioBase),
    catl: simpleReviewPayload("catl", latestSnapshot, portfolioBase),
    mindray: simpleReviewPayload("mindray", latestSnapshot, portfolioBase)
  };
  const portfolio = portfolioWithActions(portfolioBase, companyReviews);
  const investmentSystem = investmentSystemPayload(latestSnapshot, portfolio);
  return {
    latest,
    portfolio,
    investmentSystem,
    companyReviews,
    history: history.map(({ date, completion, progress, continuation, reversalRisk, phase }) => ({
      date, completion, progress, continuation, reversalRisk, phase
    })),
    methodology: {
      version: "2.0",
      confirmation: {
        relativeTurn: "white-horse five-day return no longer trails technology",
        techDeceleration: "technology excess return slows versus prior five days",
        whiteBreadthRecovery: "at least half of white-horse stocks are above their 20-day averages",
        persistence: "two conditions for three days means preliminary; all three with a five-day signal streak means basically complete"
      },
      validation: "The retired percentage failed both the current-stock and broad-index robustness tests.",
      note: "当前结果只确认已经发生的动量、宽度和持续时间，不预测顶部。"
    }
  };
}

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

function serveStatic(req, res) {
  const requestPath = req.url === "/" ? "/index.html" : req.url.split("?")[0];
  const filePath = path.normalize(path.join(PUBLIC_DIR, requestPath));
  if (!filePath.startsWith(PUBLIC_DIR)) return sendJson(res, 403, { error: "Forbidden" });
  fs.readFile(filePath, (error, data) => {
    if (error) return sendJson(res, 404, { error: "Not found" });
    const ext = path.extname(filePath);
    const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml" };
    res.writeHead(200, {
      "Content-Type": `${types[ext] || "application/octet-stream"}; charset=utf-8`,
      "Cache-Control": "no-store"
    });
    res.end(data);
  });
}

function scheduleDailyUpdate() {
  const now = new Date();
  const chinaNow = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Shanghai" }));
  const next = new Date(chinaNow);
  next.setHours(17, 30, 0, 0);
  if (next <= chinaNow) next.setDate(next.getDate() + 1);
  const delay = next.getTime() - chinaNow.getTime();
  setTimeout(async () => {
    try { await update(); } catch (error) { console.error("Scheduled update failed:", error.message); }
    scheduleDailyUpdate();
  }, delay);
}

async function main() {
  if (process.argv.includes("--update-only")) {
    const snapshot = await update();
    console.log(`Updated ${snapshot.date}: progress ${snapshot.progress}`);
    return;
  }

  scheduleDailyUpdate();

  const server = http.createServer(async (req, res) => {
    if (req.url === "/api/dashboard" && req.method === "GET") return sendJson(res, 200, dashboardPayload());
    if (req.url.startsWith("/api/quotes") && req.method === "GET") {
      const url = new URL(req.url, `http://${req.headers.host || "127.0.0.1"}`);
      try {
        return sendJson(res, 200, await quotePayload((url.searchParams.get("symbols") || "").split(",")));
      } catch (error) {
        return sendJson(res, 502, { error: error.message });
      }
    }
    if (req.url.split("?")[0] === "/api/refresh" && req.method === "POST") {
      try {
        await update();
        return sendJson(res, 200, dashboardPayload());
      } catch (error) {
        return sendJson(res, 502, { error: error.message });
      }
    }
    serveStatic(req, res);
  });

  server.listen(PORT, "127.0.0.1", () => {
    console.log(`Style rotation monitor: http://127.0.0.1:${PORT}`);
  });

  update().catch(error => console.error("Initial update failed:", error.message));
}

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  ASSETS,
  average,
  deriveCompletionResult,
  fetchSeries,
  returnFor,
  scoreDashboard
};
