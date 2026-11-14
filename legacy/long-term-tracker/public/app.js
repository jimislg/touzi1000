const state = { payload: null, range: "week", company: "moutai" };

const $ = selector => document.querySelector(selector);
const formatChange = value => `${value > 0 ? "+" : ""}${Number(value).toFixed(2)}%`;
const changeClass = value => value > 0 ? "positive" : value < 0 ? "negative" : "";
const formatPercent = value => `${(Number(value) * 100).toFixed(1)}%`;
const formatWan = value => `${(Number(value) / 10000).toFixed(1)}万`;
const formatMoney = value => `${Number(value).toLocaleString("zh-CN", { maximumFractionDigits: 0 })}`;
const formatYi = value => `${(Number(value) / 100000000).toFixed(1)}亿`;
const formatSignedYi = value => `${value >= 0 ? "+" : ""}${formatYi(value)}`;
const formatCollectedTime = value => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(date);
};
const PRACTICE_KEY = "munger.practice.v1";
// 继续沿用旧key，避免用户已经人工维护的价格在升级后丢失。
const CALIBRATED_BUY_POINTS_KEY = "munger.manual-buy-points.v1";
const CALIBRATED_BUY_POINTS_BACKUP_KEY = "munger.manual-buy-points.backups.v1";
const REVIEW_SYMBOLS = {
  cmb: "sh600036",
  moutai: "sh600519",
  fuyao: "sh600660",
  anta: "hk02020",
  gree: "sz000651",
  wanhua: "sh600309",
  popMart: "hk09992",
  tencent: "hk00700",
  catl: "sz300750",
  mindray: "sz300760"
};
const formatAuditValue = (value, metric) => {
  if (!Number.isFinite(value)) return "--";
  if (metric === "leverage" || metric === "dividendCover") return `${value.toFixed(value > 20 ? 0 : 1)}x`;
  return formatPercent(value);
};

function normalizeFlowMigration(flow) {
  const group = value => ({
    incremental: Number.isFinite(value?.incremental) ? value.incremental : 0,
    incrementalPct: Number.isFinite(value?.incrementalPct) ? value.incrementalPct : 0,
    ...(value || {})
  });
  return {
    netIncremental: Number.isFinite(flow?.netIncremental) ? flow.netIncremental : 0,
    netIncrementalPctGap: Number.isFinite(flow?.netIncrementalPctGap) ? flow.netIncrementalPctGap : 0,
    status: flow?.status || "资金流向待计算",
    caveat: flow?.caveat || "当前快照缺少资金流向数据，其他模块仍可正常使用。",
    ...(flow || {}),
    tech: group(flow?.tech),
    white: group(flow?.white)
  };
}

function setMeter(selector, value) {
  $(selector).style.width = `${Math.max(0, Math.min(100, value))}%`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
}

function todayKey(payload = state.payload) {
  return payload?.latest?.date || new Date().toISOString().slice(0, 10);
}

function loadPractice() {
  try {
    return {
      pool: [],
      daily: {},
      reviews: { weekly: {}, monthly: {}, quarterly: {} },
      thoughts: [],
      logFilter: "all",
      ...JSON.parse(localStorage.getItem(PRACTICE_KEY) || "{}")
    };
  } catch {
    return { pool: [], daily: {}, reviews: { weekly: {}, monthly: {}, quarterly: {} }, thoughts: [], logFilter: "all" };
  }
}

function savePractice(practice) {
  localStorage.setItem(PRACTICE_KEY, JSON.stringify(practice));
}

function loadCalibratedBuyPoints() {
  try {
    return JSON.parse(localStorage.getItem(CALIBRATED_BUY_POINTS_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveCalibratedBuyPoint(id, value) {
  const points = loadCalibratedBuyPoints();
  let backups = [];
  try {
    backups = JSON.parse(localStorage.getItem(CALIBRATED_BUY_POINTS_BACKUP_KEY) || "[]");
  } catch {
    backups = [];
  }
  backups.unshift({ savedAt: new Date().toISOString(), points: { ...points } });
  localStorage.setItem(CALIBRATED_BUY_POINTS_BACKUP_KEY, JSON.stringify(backups.slice(0, 20)));
  if (value === null) delete points[id];
  else points[id] = value;
  localStorage.setItem(CALIBRATED_BUY_POINTS_KEY, JSON.stringify(points));
}

function weekKey(dateText) {
  const date = new Date(`${dateText}T00:00:00+08:00`);
  const start = new Date(date.getFullYear(), 0, 1);
  const days = Math.floor((date - start) / 86400000);
  return `${date.getFullYear()}-W${String(Math.ceil((days + start.getDay() + 1) / 7)).padStart(2, "0")}`;
}

function monthKey(dateText) {
  return dateText.slice(0, 7);
}

function quarterKey(dateText) {
  const month = Number(dateText.slice(5, 7));
  return `${dateText.slice(0, 4)}-Q${Math.ceil(month / 3)}`;
}

function makeDecision(latest) {
  const flow = latest.flowMigration;
  if (flow?.netIncremental > 0 && flow.tech.incrementalPct > flow.white.incrementalPct) {
    return ["资金仍偏向科技", `近5日科技成交额代理比白马多增加约 ${formatSignedYi(flow.netIncremental)} / 日。白马还没有重新获得资金优势。`];
  }
  if (flow?.netIncremental < 0 && flow.white.incrementalPct > flow.tech.incrementalPct) {
    return ["资金开始回流白马", `近5日白马相对科技多增加约 ${formatSignedYi(Math.abs(flow.netIncremental))} / 日。需要连续观察，避免只是一两天反弹。`];
  }
  if (latest.reversalRisk >= 70) {
    return ["不追涨，等第一次回撤", "科技趋势仍强，但量价拥挤已升温。等回撤和盈利验证，比追赶当日强势更重要。"];
  }
  if (latest.continuation >= 65) {
    return ["趋势仍在，但仓位要慢", "科技的相对动量和宽度占优，更适合小仓观察，不适合一次性转换全部风格。"];
  }
  if (latest.continuation < 42 && latest.progress > 60) {
    return ["切换正在降温", "相对动量已减弱。观察白马能否连续10至20个交易日跑赢科技。"];
  }
  return ["等待方向确认", "当前没有足够强的单向证据，继续看相对动量与成交拥挤度的变化。"];
}

function renderSummary(latest) {
  const result = latest.completionResult;
  const flow = latest.flowMigration;
  if (flow) {
    const direction = flow.netIncremental >= 0 ? "从白马流向科技" : "从科技回流白马";
    const amount = flow.netIncremental >= 0 ? flow.netIncremental : Math.abs(flow.netIncremental);
    return `明确结论：近5日成交额代理显示，资金仍在${direction}，估算差额约 ${formatSignedYi(amount)} / 日。这个金额是成交额变化差，不是真实净流入。`;
  }
  const persistence = result.confirmationDays
    ? `已持续 ${result.confirmationDays} 个交易日。`
    : "尚未形成连续确认。";
  return `${result.decision} 3项完成条件中已满足 ${result.passedCount} 项，${persistence}`;
}

function renderCore(latest) {
  const flow = latest.flowMigration;
  const collectedTime = formatCollectedTime(latest.collectedAt);
  $("#dataDate").textContent = `行情 ${latest.date}${collectedTime ? ` · 采集 ${collectedTime}` : ""}`;
  $("#phase").textContent = flow.netIncremental >= 0 ? "资金仍在流向科技" : "资金开始回流白马";
  $("#signal").textContent = `历史${latest.observationCount}日 · 实采${latest.dataCoverage.observedCount}日`;
  $("#modelStatus").textContent = `调仓结束信号 ${latest.completionResult.resultScore}/100 · ${latest.completionResult.label}`;
  $("#progressValue").textContent = formatSignedYi(flow.netIncremental);
  $("#completionLabel").textContent = flow.netIncremental >= 0 ? "白马 → 科技 / 日" : "科技 → 白马 / 日";
  $("#progressGauge").style.setProperty("--score", Math.min(100, Math.abs(flow.netIncrementalPctGap) * 260));
  $("#intensityValue").textContent = Math.round(latest.progress);
  setMeter("#intensityMeter", latest.progress);
  $("#continuationValue").textContent = Math.round(latest.continuation);
  $("#riskValue").textContent = Math.round(latest.reversalRisk);
  setMeter("#continuationMeter", latest.continuation);
  setMeter("#riskMeter", latest.reversalRisk);
  $("#summary").textContent = renderSummary(latest);

  const [title, text] = makeDecision(latest);
  $("#decisionTitle").textContent = title;
  $("#decisionText").textContent = text;
  $("#flowStatus").textContent = flow.status;
  $("#flowText").textContent = `科技增量 ${formatSignedYi(flow.tech.incremental)}，白马增量 ${formatSignedYi(flow.white.incremental)}，两者相差 ${formatSignedYi(flow.netIncremental)} / 日。`;

  $("#techBreadth").textContent = `${latest.inputs.techBreadth}%`;
  $("#whiteBreadth").textContent = `${latest.inputs.whiteBreadth}%`;
  $("#volumeRatio").textContent = `${latest.inputs.techVolumeRatio.toFixed(2)}x`;

  $("#conditionList").innerHTML = `<li class="${flow.netIncremental >= 0 ? "failed" : "passed"}">
    <span>${flow.netIncremental >= 0 ? "未回流" : "已回流"}</span>核心结果：资金是否重新回到白马
  </li>` + Object.values(latest.completionResult.conditions).map(condition => `
    <li class="${condition.passed ? "passed" : "failed"}">
      <span>${condition.passed ? "已满足" : "未满足"}</span>${condition.label}
    </li>
  `).join("") + Object.entries(latest.completionResult.components).map(([key, value]) => {
    const labels = { saturation: "科技是否过热", deceleration: "科技是否减速", sellerExhaustion: "白马卖压是否减弱", persistence: "是否连续确认" };
    return `<li class="${value >= 60 ? "passed" : "failed"}"><span>${value ?? "--"}</span>${labels[key]}</li>`;
  }).join("");
}

function renderCommandCenter(system, latest) {
  if (!system) return;
  const collectedTime = formatCollectedTime(latest?.collectedAt);
  $("#dataDate").textContent = `行情 ${system.asOf}${collectedTime ? ` · 采集 ${collectedTime}` : ""}`;
  $("#systemStatus").textContent = `持仓${system.counts.holdings}只 · 股票池${system.stockPool.length}只 · 数据日${system.asOf}`;
  $("#fiveYearCagr").textContent = formatPercent(system.target.cagr5);
  $("#tenYearCagr").textContent = formatPercent(system.target.cagr10);
  $("#deployedCapital").textContent = formatWan(system.capital.invested);
  $("#deployedWeight").textContent = `占总投资本金 ${formatPercent(system.capital.investedWeight)}`;
  $("#dividendEstimate").textContent = formatWan(system.dividend.annualEstimate);
  $("#dividendProgress").textContent = `完成100万元目标 ${formatPercent(system.dividend.progress)}`;
  $("#alertCount").textContent = `${system.counts.critical}红 · ${system.counts.warning}黄`;
  $("#poolCount").textContent = `${system.counts.opportunity}个价格机会 · ${system.counts.watch}只候选`;
  const alerts = system.alerts.slice(0, 8);
  $("#alertBoard").innerHTML = alerts.map(item => `
    <article class="alert-row severity-${item.severity}">
      <div><span>${escapeHtml(item.category)}</span><strong>${escapeHtml(item.title)}</strong></div>
      <p>${escapeHtml(item.detail)}</p>
      <small>${escapeHtml(item.action)}</small>
    </article>
  `).join("") || '<p class="empty-log">当前没有触发预警。</p>';
  $("#priorityActions").innerHTML = system.priorityActions.map((item, index) => `
    <article><b>${index + 1}</b><div><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.action)}</p></div></article>
  `).join("");
}

function renderFlow(latest) {
  const flow = latest.flowMigration;
  $("#flowNet").textContent = `${flow.netIncremental >= 0 ? "+" : ""}${formatYi(flow.netIncremental)}`;
  $("#flowNet").className = changeClass(flow.netIncremental);
  $("#flowTech").textContent = `${flow.tech.incremental >= 0 ? "+" : ""}${formatYi(flow.tech.incremental)}`;
  $("#flowWhite").textContent = `${flow.white.incremental >= 0 ? "+" : ""}${formatYi(flow.white.incremental)}`;
  $("#flowTechPct").textContent = `较基准 ${formatChange(flow.tech.incrementalPct * 100)}`;
  $("#flowWhitePct").textContent = `较基准 ${formatChange(flow.white.incrementalPct * 100)}`;
  $("#flowGap").textContent = `${flow.netIncrementalPctGap >= 0 ? "+" : ""}${(flow.netIncrementalPctGap * 100).toFixed(1)} pct`;
  $("#flowCaveat").textContent = flow.caveat;
}

function renderEvidence(latest) {
  const suffix = state.range === "week" ? "5" : "20";
  const tech = latest.inputs[`tech${suffix}`];
  const white = latest.inputs[`white${suffix}`];
  const spread = tech - white;
  $("#techReturn").textContent = formatChange(tech);
  $("#whiteReturn").textContent = formatChange(white);
  $("#techReturn").className = changeClass(tech);
  $("#whiteReturn").className = changeClass(white);
  $("#relativeSpread").textContent = `${spread > 0 ? "+" : ""}${spread.toFixed(2)} 个百分点`;
  $("#relativeSpread").className = changeClass(spread);
  const scale = Math.max(8, Math.abs(tech), Math.abs(white));
  $("#techBar").style.width = `${Math.max(3, Math.abs(tech) / scale * 100)}%`;
  $("#whiteBar").style.width = `${Math.max(3, Math.abs(white) / scale * 100)}%`;
}

function renderPortfolio(portfolio) {
  if (!portfolio) {
    $("#goalSection").hidden = true;
    return;
  }
  $("#portfolioDate").textContent = `仓位快照 ${portfolio.snapshotDate}`;
  $("#requiredCagr").textContent = formatPercent(portfolio.requiredCagr);
  $("#portfolioTotal").textContent = formatWan(portfolio.totalAssets);
  $("#investedWeight").textContent = formatPercent(portfolio.investedWeight);
  $("#reserveWeight").textContent = formatPercent(portfolio.reserveWeight);
  $("#currentTotalAssets").textContent = `${formatWan(portfolio.currentTotalAssets)}`;
  $("#currentPnl").textContent = `${portfolio.currentUnrealizedPnl >= 0 ? "+" : ""}${formatMoney(portfolio.currentUnrealizedPnl)}`;
  $("#currentPnl").className = changeClass(portfolio.currentUnrealizedPnl);
  $("#currentPnlPct").textContent = `成本口径 ${formatPercent(portfolio.currentUnrealizedPnlPct || 0)}`;
  $("#largestPosition").textContent = `${portfolio.concentration.largest.name} ${formatPercent(portfolio.concentration.largest.totalWeight)}`;
  $("#largestPositionNote").textContent = `占股票仓 ${formatPercent(portfolio.concentration.largest.stockWeight)}`;
  $("#topTwoWeight").textContent = formatPercent(portfolio.concentration.topTwoTotalWeight);
  $("#topTwoNote").textContent = `占股票仓 ${formatPercent(portfolio.concentration.topTwoStockWeight)}`;

  const largest = portfolio.concentration.largest;
  const second = portfolio.holdings[1];
  const otherStocks = Math.max(0, portfolio.investedWeight - largest.totalWeight - second.totalWeight);
  const allocation = [
    { label: "备用金", value: portfolio.reserveWeight, className: "cash" },
    { label: largest.name, value: largest.totalWeight, className: "largest" },
    { label: second.name, value: second.totalWeight, className: "second" },
    { label: "其他股票", value: otherStocks, className: "other" }
  ];
  $("#allocationBar").innerHTML = allocation.map(item => `
    <i class="${item.className}" style="width:${item.value * 100}%" title="${item.label} ${formatPercent(item.value)}"></i>
  `).join("");
  $("#allocationLegend").innerHTML = allocation.map(item => `
    <span><i class="${item.className}"></i>${item.label} ${formatPercent(item.value)}</span>
  `).join("");

  const gap = portfolio.goalGap;
  if (gap) {
    $("#goalGapVerdict").textContent = gap.verdict;
    $("#stockBaseReturn").textContent = Number.isFinite(gap.stockBaseReturn) ? formatPercent(gap.stockBaseReturn) : "--";
    $("#currentPathMultiple").textContent = Number.isFinite(gap.currentPathMultiple) ? `${gap.currentPathMultiple.toFixed(2)}x` : "--";
    $("#requiredReserveReturn").textContent = Number.isFinite(gap.requiredReserveReturn) ? formatPercent(gap.requiredReserveReturn) : "--";
    $("#modeledWeight").textContent = formatPercent(gap.modeledWeight || 0);
    $("#goalGapPlainText").textContent = Number.isFinite(gap.currentPathMultiple)
      ? `按现有股票预计年化和备用金现金收益测算，${gap.years}年约到 ${gap.currentPathMultiple.toFixed(2)} 倍，距离${gap.targetMultiple}倍还差 ${gap.shortfallMultiple.toFixed(2)} 倍，约 ${formatWan(gap.shortfallValue)} 终值缺口。若备用金全部承担修复，未来${gap.years}年需要做到 ${formatPercent(gap.requiredReserveReturn)} 年化。`
      : "个股回报数据不足，暂时无法测算目标差距。";
    $("#goalContributionList").innerHTML = gap.rows.slice(0, 5).map(row => `
      <div>
        <span>${row.name}</span>
        <strong>${Number.isFinite(row.baseReturn) ? `预计年化 ${formatPercent(row.baseReturn)}` : "缺数据"}</strong>
        <small>按当前仓位每年拉动股票仓 ${Number.isFinite(row.contribution) ? formatPercent(row.contribution) : "--"}</small>
      </div>
    `).join("");
  }

  $("#deploymentRows").innerHTML = portfolio.deploymentScenarios.map(scenario => {
    const label = scenario.delayYears === 0
      ? "现在开始部署"
      : scenario.delayYears === 10 ? "10年始终保留现金" : `等待 ${scenario.delayYears} 年`;
    return `<div><span>${label}</span><strong>${formatPercent(scenario.requiredInvestedReturn)}</strong></div>`;
  }).join("");

  const threeYear = portfolio.deploymentScenarios.find(item => item.delayYears === 3);
  $("#goalJudgment").textContent = `备用金若以1.5%年化等待3年，其余时间投入部分需承担约 ${formatPercent(threeYear.requiredInvestedReturn)} 的年化回报要求。现金给了安全边际，也在累积目标压力。`;
  $("#holdingFxNote").textContent = portfolio.hkdToCnyAssumption
    ? `港股按 1港元=${portfolio.hkdToCnyAssumption.toFixed(4)}元估算`
    : "无外汇换算";
  $("#holdingActionSummary").textContent = `当前首要动作：${portfolio.actionSummary?.primary || "持有观察"}。风险审查 ${portfolio.actionSummary?.riskCount || 0} 项，承接候选 ${portfolio.actionSummary?.opportunityCount || 0} 项。`;
  $("#holdingTable").innerHTML = `
    <div class="holding-row holding-head">
      <span>公司</span><span>现价</span><span>成本</span><span>浮盈亏</span><span>仓位</span><span>动作</span>
    </div>
    ${portfolio.holdings.map(holding => `
      <div class="holding-row action-${holding.recommendation?.severity || "neutral"}">
        <strong>${holding.name}</strong>
        <span>${holding.currentPrice ? holding.currentPrice.toFixed(2) : "--"}${holding.priceCurrency === "HKD" ? "港元" : "元"}</span>
        <span>${holding.costPrice ? holding.costPrice.toFixed(2) : "--"}${holding.priceCurrency === "HKD" ? "港元" : "元"}</span>
        <span class="${changeClass(holding.unrealizedPnl || 0)}">${holding.unrealizedPnl >= 0 ? "+" : ""}${formatMoney(holding.unrealizedPnl || 0)} / ${formatPercent(holding.unrealizedPnlPct || 0)}</span>
        <span>${formatPercent(holding.totalWeight)}</span>
        <span class="holding-action"><strong>${holding.recommendation?.action || "持有观察"}</strong><small>${holding.recommendation?.reasons?.[0] || ""}</small></span>
      </div>
    `).join("")}
  `;

  $("#riskFactorList").innerHTML = portfolio.riskFactors.map(factor => `
    <article class="risk-factor-row">
      <div class="risk-factor-title">
        <span>${factor.label}</span>
        <strong>${formatPercent(factor.stockWeight)}</strong>
        <small>占总资产 ${formatPercent(factor.totalWeight)}</small>
      </div>
      <div class="risk-factor-body">
        <div class="factor-bar"><i style="width:${Math.min(100, factor.stockWeight * 100)}%"></i></div>
        <div class="factor-holdings">${factor.holdings.map(holding => `<span>${holding.name}</span>`).join("")}</div>
        <p>${factor.reason}</p>
        <ul>${factor.monitor.map(item => `<li>${item}</li>`).join("")}</ul>
      </div>
    </article>
  `).join("");
}

function renderCmbReview(review) {
  if (!review) {
    $("#cmbReviewSection").hidden = true;
    return;
  }
  $("#cmbReviewVerdict").textContent = review.verdict;
  $("#cmbReviewDate").textContent = `行情 ${review.quoteDate} · 基本面 ${review.fundamentalDate}`;
  $("#cmbPrice").textContent = `${review.price.toFixed(2)}元`;
  $("#cmbPb").textContent = `${review.priceToBook.toFixed(2)}x`;
  $("#cmbDividendYield").textContent = formatPercent(review.dividendYield);
  $("#cmbPortfolioWeight").textContent = formatPercent(review.portfolioWeight);
  $("#cmbScenarioList").innerHTML = [
    ["悲观", review.scenarioReturns.bear],
    ["中性", review.scenarioReturns.base],
    ["乐观", review.scenarioReturns.bull]
  ].map(([label, value]) => `
    <div><span>${label}</span><strong>${formatPercent(value)}</strong><i style="width:${Math.max(0, Math.min(100, value / .18 * 100))}%"></i></div>
  `).join("");
  $("#cmbPositiveEvidence").innerHTML = review.evidence.positive.map(item => `<li>${item}</li>`).join("");
  $("#cmbNegativeEvidence").innerHTML = review.evidence.negative.map(item => `<li>${item}</li>`).join("");
  $("#cmbReviewPrices").innerHTML = [
    ["13%回报", review.reviewPrices.thirteenPercent],
    ["17.46%目标", review.reviewPrices.goalReturn],
    ["10%回报", review.reviewPrices.tenPercent],
    ["8%回报", review.reviewPrices.eightPercent]
  ].map(([label, price]) => `<span>${label}<strong>${price.toFixed(1)}元</strong></span>`).join("");
}

function renderPopMartReview(review) {
  if (!review) {
    $("#popMartReviewSection").hidden = true;
    return;
  }
  $("#popMartReviewVerdict").textContent = review.verdict;
  $("#popMartReviewDate").textContent = `行情 ${review.quoteDate} · 最新经营更新 ${review.fundamentalDate}`;
  $("#popMartPrice").textContent = `${review.price.toFixed(2)}港元`;
  $("#popMartPe").textContent = `${review.trailingPe.toFixed(1)}x`;
  $("#popMartPortfolioWeight").textContent = formatPercent(review.portfolioWeight);
  $("#popMartStockWeight").textContent = formatPercent(review.stockWeight);
  $("#popMartScenarioList").innerHTML = Object.values(review.scenarios).map(scenario => `
    <div><span>${scenario.label}</span><strong>${formatPercent(scenario.annualReturn)}</strong><i style="width:${Math.max(0, Math.min(100, scenario.annualReturn / .22 * 100))}%"></i></div>
  `).join("");
  $("#popMartPositiveEvidence").innerHTML = review.evidence.positive.map(item => `<li>${item}</li>`).join("");
  $("#popMartNegativeEvidence").innerHTML = review.evidence.negative.map(item => `<li>${item}</li>`).join("");
  $("#popMartGoalPrices").innerHTML = Object.values(review.scenarios).map(scenario => `
    <span>${scenario.label}<strong>${scenario.goalPriceHkd.toFixed(0)}港元</strong></span>
  `).join("");
  $("#popMartFxNote").textContent = `PE和价格线按 ${review.exchangeRateDate} 汇率1港元=${review.exchangeRate.toFixed(4)}元人民币折算。`;
}

function renderMoutaiReview(review) {
  if (!review) {
    $("#moutaiReviewSection").hidden = true;
    return;
  }
  $("#moutaiReviewVerdict").textContent = review.verdict;
  $("#moutaiReviewDate").textContent = `行情 ${review.quoteDate} · 基本面 ${review.fundamentalDate}`;
  $("#moutaiPrice").textContent = `${review.price.toFixed(2)}元`;
  $("#moutaiPe").textContent = `${review.trailingPe.toFixed(1)}x`;
  $("#moutaiDividendYield").textContent = formatPercent(review.dividendYield);
  $("#moutaiRequiredGrowth").textContent = formatPercent(review.requiredEpsGrowth);
  $("#moutaiScenarioList").innerHTML = Object.values(review.scenarios).map(scenario => `
    <div><span>${scenario.label}</span><strong>${formatPercent(scenario.annualReturn)}</strong><i style="width:${Math.max(0, Math.min(100, scenario.annualReturn / .16 * 100))}%"></i></div>
  `).join("");
  $("#moutaiPositiveEvidence").innerHTML = review.evidence.positive.map(item => `<li>${item}</li>`).join("");
  $("#moutaiNegativeEvidence").innerHTML = review.evidence.negative.map(item => `<li>${item}</li>`).join("");
  $("#moutaiGoalPrices").innerHTML = Object.values(review.scenarios).map(scenario => `
    <span>${scenario.label}<strong>${scenario.goalPrice.toFixed(0)}元</strong></span>
  `).join("");
}

function normalizeCompanyReview(key, review) {
  const goalReturn = 5 ** (1 / 10) - 1;
  if (key === "cmb") {
    return {
      key,
      name: "招商银行",
      code: "600036",
      verdict: review.verdict,
      date: `行情 ${review.quoteDate} · 基本面 ${review.fundamentalDate}`,
      metrics: [
        ["股价", `${review.price.toFixed(2)}元`],
        ["市净率", `${review.priceToBook.toFixed(2)}x`],
        ["股息率", formatPercent(review.dividendYield)],
        ["总资产仓位", formatPercent(review.portfolioWeight)]
      ],
      scenarios: [
        { label: "悲观", annualReturn: review.scenarioReturns.bear },
        { label: "基准", annualReturn: review.scenarioReturns.base },
        { label: "乐观", annualReturn: review.scenarioReturns.bull }
      ],
      baseReturn: review.scenarioReturns.base,
      prices: [
        ["13%回报", review.reviewPrices.thirteenPercent, "元"],
        ["五倍目标", review.reviewPrices.goalReturn, "元"],
        ["10%回报", review.reviewPrices.tenPercent, "元"],
        ["8%回报", review.reviewPrices.eightPercent, "元"]
      ],
      evidence: review.evidence,
      calibration: review.calibration,
      scorecard: review.scorecard,
      qualityAudit: review.qualityAudit,
      goalReturn
    };
  }
  const currency = review.currency || (key === "popMart" ? "港元" : "元");
  const scenarios = Object.values(review.scenarios);
  const base = review.scenarios.base || scenarios[Math.floor(scenarios.length / 2)];
  const isPopMart = key === "popMart";
  const isMoutai = key === "moutai";
  return {
    key,
    name: review.name,
    code: review.code || (isPopMart ? "09992.HK" : "600519"),
    verdict: review.verdict,
    date: `行情 ${review.quoteDate} · 基本面 ${review.fundamentalDate}`,
    metrics: isPopMart ? [
      ["股价", `${review.price.toFixed(2)}港元`],
      ["静态PE", `${review.trailingPe.toFixed(1)}x`],
      ["市赚率", formatPercent(1 / review.trailingPe)],
      ["总资产仓位", formatPercent(review.portfolioWeight)],
    ] : isMoutai ? [
      ["股价", `${review.price.toFixed(2)}元`],
      ["静态PE", `${review.trailingPe.toFixed(1)}x`],
      ["市赚率", formatPercent(1 / review.trailingPe)],
      ["股息率", formatPercent(review.dividendYield)],
    ] : [
      ["股价", `${review.price.toFixed(2)}${currency}`],
      [review.metricLabel || "静态PE", `${review.trailingPe.toFixed(1)}x`],
      ["市赚率", formatPercent(1 / review.trailingPe)],
      ["股息率", formatPercent(review.dividendYield)],
    ],
    scenarios,
    baseReturn: base.annualReturn,
    prices: scenarios.map(item => [item.label, item.goalPriceHkd ?? item.goalPrice, currency]),
    evidence: review.evidence,
    calibration: review.calibration,
    scorecard: review.scorecard,
    qualityAudit: review.qualityAudit,
    goalReturn
  };
}

function renderCompanyResearch(reviews) {
  const preferredOrder = ["moutai", "cmb", "fuyao", "anta", "gree", "wanhua", "popMart", "tencent", "catl", "mindray"];
  const available = preferredOrder.filter(key => reviews?.[key]);
  if (!available.length) {
    $("#research").hidden = true;
    return;
  }
  if (!available.includes(state.company)) state.company = available[0];
  $("#companySwitch").innerHTML = available.map(key => {
    const item = normalizeCompanyReview(key, reviews[key]);
    return `<button type="button" role="tab" data-company="${key}" aria-selected="${key === state.company}">
      <strong>${item.name}</strong><small>${item.code}</small>
    </button>`;
  }).join("");

  const item = normalizeCompanyReview(state.company, reviews[state.company]);
  const attainment = Math.max(0, Math.min(100, item.baseReturn / item.goalReturn * 100));
  const gap = item.baseReturn - item.goalReturn;
  const maxReturn = Math.max(item.goalReturn, ...item.scenarios.map(scenario => Math.max(0, scenario.annualReturn)), 0.01);
  const calibration = item.calibration;
  const scorecard = item.scorecard;
  const audit = item.qualityAudit;
  const calibrationMetrics = calibration ? [
    ["评分/评级", calibration.score ? `${calibration.score}分 · ${calibration.rating}` : calibration.rating],
    ["安全边际", calibration.safety],
    ["三底状态", calibration.threeBottoms],
    ["ABC区域", calibration.zone]
  ] : [];
  $("#companyResearch").innerHTML = `
    <div class="research-topline">
      <div><span class="company-code">${item.code}</span><h3>${item.name}</h3><p>${item.date}</p></div>
      <strong class="research-verdict">${item.verdict}</strong>
    </div>
    <div class="research-grid primary-return-grid">
      <div class="return-panel">
        <div class="return-dial" style="--attainment:${attainment}">
          <div><strong>${formatPercent(item.baseReturn)}</strong><span>预计年化</span></div>
        </div>
        <div class="return-gap ${gap >= 0 ? "on-target" : "below-target"}">
          <span>距17.46%目标</span><strong>${formatChange(gap * 100)}</strong>
        </div>
      </div>
      <div class="research-main">
        <div class="research-metrics">${item.metrics.map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`).join("")}</div>
        <div class="target-track-wrap">
          <div class="target-labels"><span>预计年化 ${formatPercent(item.baseReturn)}</span><strong>五倍目标 ${formatPercent(item.goalReturn)}</strong></div>
          <div class="target-track"><i style="width:${Math.min(100, item.baseReturn / .16 * 100)}%"></i><b style="left:${item.goalReturn / .16 * 100}%"></b></div>
        </div>
      </div>
    </div>
    <div class="price-band"><span class="label">最高买入价：低于这些价格，才有机会达到对应年化</span><div>${item.prices.map(([label, price, unit]) => `<span>${label === "五倍目标" ? "17.46%目标" : label}<strong>${Number(price).toFixed(0)}${unit}</strong></span>`).join("")}</div></div>
    ${calibration ? `
      <div class="calibration-panel">
        <div>
          <span class="label">知识库校准</span>
          <strong>${calibration.positionRole}</strong>
          <p>${calibration.thesis}</p>
          <small>${calibration.source}</small>
        </div>
        <div class="calibration-metrics">${calibrationMetrics.map(([label, value]) => `<span><em>${label}</em><strong>${value}</strong></span>`).join("")}</div>
      </div>
    ` : ""}
    ${scorecard ? `
      <div class="scorecard-panel">
        <div class="scorecard-summary">
          <span class="label">投资决策模型</span>
          <strong>${scorecard.total}分 · ${scorecard.rating}</strong>
          <small>好公司 ${scorecard.companyScore}/70+调整项 · 好价格 ${scorecard.priceScore}/30+扣分项</small>
        </div>
        <div class="scorecard-grid">
          <div>
            <span class="label">好公司</span>
            ${scorecard.moatItems.map(row => `<p><span>${row.label}</span><strong>${row.score}/${row.max}</strong></p>`).join("")}
          </div>
          <div>
            <span class="label">好价格</span>
            ${scorecard.priceItems.map(row => `<p><span>${row.label}</span><strong>${row.score}/${row.max}</strong></p>`).join("")}
          </div>
          <div>
            <span class="label">主要扣分风险</span>
            ${scorecard.risks.map(text => `<p>${text}</p>`).join("")}
          </div>
        </div>
      </div>
    ` : ""}
    ${audit ? `
      <div class="quality-audit-panel">
        <div class="scorecard-summary">
          <span class="label">Terry Smith 财务质量审计</span>
          <strong>${audit.score}分 · ${audit.confidence}置信度</strong>
          <small>${audit.status}</small>
        </div>
        <div class="quality-table">
          <div class="quality-row quality-head">
            <span>指标</span><span>${audit.fiscalYear}</span><span>Fundsmith</span><span>结论</span><span>证据</span>
          </div>
          ${audit.rows.map(row => `
            <div class="quality-row">
              <strong>${row.label}</strong>
              <span>${row.display || formatAuditValue(row.value, row.metric)}</span>
              <span>${formatAuditValue(row.benchmark, row.metric)}</span>
              <span class="${row.comparison === "above" ? "positive" : row.comparison === "below" ? "negative" : ""}">${row.comparison === "above" ? "优于" : row.comparison === "below" ? "低于" : "待补"}</span>
              <span>${row.evidence}</span>
            </div>
          `).join("")}
        </div>
        <div class="audit-footer">
          <p>${audit.verdict}</p>
          <div>${audit.fiveYear.map(year => `<span>${year.year}<strong>${year.status}</strong></span>`).join("")}</div>
        </div>
        <small class="audit-source">基准：${audit.benchmark.source}，截至 ${audit.benchmark.asOf}。${audit.benchmark.notes.join(" ")}</small>
      </div>
    ` : ""}
    <div class="research-lower">
      <div class="scenario-chart">
        <span class="label">为什么是这个预计年化</span>
        ${item.scenarios.map(scenario => `
          <div class="scenario-row ${scenario.annualReturn < 0 ? "loss" : ""}">
            <span>${scenario.label}</span><div><i style="width:${Math.abs(scenario.annualReturn) / maxReturn * 100}%"></i></div><strong>${formatPercent(scenario.annualReturn)}</strong>
          </div>`).join("")}
      </div>
      <div class="evidence-board">
        <div class="evidence-positive"><span class="label">支持持有</span>${item.evidence.positive.map(text => `<p>${text}</p>`).join("")}</div>
        <div class="evidence-negative"><span class="label">限制加仓</span>${item.evidence.negative.map(text => `<p>${text}</p>`).join("")}</div>
      </div>
    </div>`;
}

function renderQuotes(container, quotes) {
  $(container).innerHTML = `
    <div class="quote-row quote-head">
      <span>标的</span><span>收盘</span><span>5日</span><span>20日</span>
    </div>` + quotes.map(quote => `
    <div class="quote-row">
      <strong>${quote.name}</strong>
      <span class="price">${Number(quote.close).toFixed(2)}</span>
      <span class="change ${changeClass(quote.week)}">${formatChange(quote.week)}</span>
      <span class="change ${changeClass(quote.month)}">${formatChange(quote.month)}</span>
    </div>
  `).join("");
}

function renderChart(history) {
  const el = $("#historyChart");
  if (history.length < 2) {
    el.innerHTML = '<div class="empty">已保存今日快照，累积两个交易日后显示趋势线。</div>';
    return;
  }
  const width = 1000;
  const height = 190;
  const points = (key) => history.map((item, index) => {
    const x = history.length === 1 ? 0 : index / (history.length - 1) * width;
    const y = height - (item[key] / 100 * height);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  el.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="调仓进度与反转风险走势">
      <line x1="0" y1="${height * .25}" x2="${width}" y2="${height * .25}" stroke="#e5e9ed" stroke-width="1"/>
      <line x1="0" y1="${height * .5}" x2="${width}" y2="${height * .5}" stroke="#e5e9ed" stroke-width="1"/>
      <line x1="0" y1="${height * .75}" x2="${width}" y2="${height * .75}" stroke="#e5e9ed" stroke-width="1"/>
      <polyline points="${points("completion")}" fill="none" stroke="#1769aa" stroke-width="4" vector-effect="non-scaling-stroke"/>
      <polyline points="${points("reversalRisk")}" fill="none" stroke="#c64b47" stroke-width="3" vector-effect="non-scaling-stroke"/>
    </svg>`;
}

function quoteMap(payload) {
  const latest = payload?.latest;
  return new Map([
    ...(latest?.quotes?.whiteHorse || []),
    ...(latest?.quotes?.tech || []),
    ...(latest?.quotes?.research || []),
    ...(latest?.quotes?.indices || [])
  ].map(quote => [quote.symbol, quote]));
}

function defaultStockPool(payload) {
  return (payload?.investmentSystem?.stockPool || []).map(item => ({
    ...item,
    id: item.symbol,
    system: true,
    note: item.action
  }));
}

function normalizeStockPoolItem(item, fallback = {}) {
  const id = item.id || item.symbol || fallback.id || fallback.symbol;
  return {
    ...fallback,
    ...item,
    id,
    symbol: item.symbol || fallback.symbol || id
  };
}

function mergedPracticePool(practice, payload) {
  const defaults = defaultStockPool(payload);
  const calibratedBuyPoints = loadCalibratedBuyPoints();
  const existingItems = (practice.pool || []).map(item => normalizeStockPoolItem(item));
  const byId = new Map(existingItems.map(item => [item.id || item.symbol, item]));
  defaults.forEach(item => {
    const existing = byId.get(item.id);
    const migratedManualPoint = existing?.manualBuyPoint || existing?.buyPointSource === "manual"
      ? existing?.buyPoint
      : null;
    byId.set(item.id, {
      ...existing,
      ...item,
      calibrationBuyPoint: calibratedBuyPoints[item.id] ?? existing?.calibrationBuyPoint ?? migratedManualPoint ?? null,
      currentPrice: item.currentPrice || existing?.currentPrice || null,
      quoteDate: item.quoteDate || existing?.quoteDate || null
    });
  });
  return [...byId.values()];
}

function renderStockPool(practice, payload) {
  const pool = mergedPracticePool(practice, payload);
  const groups = ["A", "B", "C", "自选"];
  const groupedRows = groups.map(group => ({
    group,
    items: pool.filter(item => {
      const quality = String(item.quality || "");
      return group === "自选" ? !/^[ABC]/.test(quality) : quality.startsWith(group);
    })
  })).filter(section => section.items.length);
  $("#stockPoolTable").innerHTML = `
    <div class="stock-pool-row stock-pool-head">
      <span>标的</span><span>质量</span><span>状态</span><span>现价</span><span>P12</span><span>P15</span><span>P17.46</span><span>校准买入点</span><span>距校准点</span><span>目标/上限</span><span>动作</span>
    </div>
    ${groupedRows.map(section => `
      <div class="stock-pool-group group-${section.group.toLowerCase()}"><strong>${section.group} 类公司</strong><span>${section.items.length}只</span></div>
      ${section.items.map(item => {
      const current = Number(item.currentPrice);
      const calibrationBuyPoint = Number(item.calibrationBuyPoint);
      const gap = Number.isFinite(current) && Number.isFinite(calibrationBuyPoint) && calibrationBuyPoint > 0 ? current / calibrationBuyPoint - 1 : null;
      const hit = gap !== null && gap <= 0;
      return `<div class="stock-pool-row ${hit ? "buy-hit" : ""}">
        <strong>${escapeHtml(item.name)}<small>${escapeHtml(item.symbol)}</small></strong>
        <span><b class="quality-pill">${escapeHtml(item.quality || "自选")}</b><small>${escapeHtml(item.role || "")}</small></span>
        <span>${item.type === "holding" ? `持仓 ${formatPercent(item.totalWeight || 0)}` : escapeHtml(item.thesisStatus || "候选")}</span>
        <span class="${hit ? "below-buy-point-price" : ""}">${Number.isFinite(current) ? current.toFixed(2) : "--"}</span>
        <span>${Number.isFinite(Number(item.p12)) ? Number(item.p12).toFixed(2) : "--"}</span>
        <span>${Number.isFinite(Number(item.p15)) ? Number(item.p15).toFixed(2) : "--"}</span>
        <span>${Number.isFinite(Number(item.p1746)) ? Number(item.p1746).toFixed(2) : "--"}</span>
        <span class="editable-buy-point" data-calibration-buy-point-id="${escapeHtml(item.id || item.symbol)}" title="双击维护你的校准买入点">${Number.isFinite(calibrationBuyPoint) && calibrationBuyPoint > 0 ? calibrationBuyPoint.toFixed(2) : "--"}</span>
        <span class="${hit ? "positive" : "negative"}">${gap === null ? "--" : formatChange(gap * 100)}</span>
        <span>${formatPercent(item.targetWeight || 0)} / ${formatPercent(item.hardCap || 0)}</span>
        <span class="pool-action"><strong>${escapeHtml(item.valuationState || "自选")}</strong><small>${escapeHtml(item.note || "")}</small></span>
      </div>`;
      }).join("")}
    `).join("")}
  `;
}

function renderPracticeAssets(portfolio) {
  if (!portfolio) return;
  const baseCapital = portfolio.totalAssets || 10000000;
  const warningLoss = baseCapital * 0.30;
  const currentAssets = portfolio.currentTotalAssets || portfolio.totalAssets;
  const drawdown = Math.min(0, (currentAssets - baseCapital) / baseCapital);
  const lossAmount = Math.max(0, baseCapital - currentAssets);
  const riskRoom = warningLoss - lossAmount;
  const gap = portfolio.goalGap;
  $("#practiceAssets").textContent = formatWan(currentAssets);
  const pathMultiple = Number(gap?.currentPathMultiple);
  $("#practiceGoalGap").textContent = Number.isFinite(pathMultiple) ? `当前约${pathMultiple.toFixed(2)}倍` : "当前路径待计算";
  $("#practiceGoalTarget").textContent = Number.isFinite(pathMultiple) ? `目标${portfolio.goal?.targetMultiple || 5}.00倍` : "等行情和组合数据加载完成";
  $("#practiceDrawdown").textContent = formatPercent(drawdown);
  $("#practiceDrawdown").className = drawdown < -0.15 ? "negative" : "";
  $("#practiceRiskRoom").textContent = `${formatWan(riskRoom)}空间`;
  $("#practiceRiskRoom").className = riskRoom < warningLoss * 0.25 ? "negative" : "";
  const levels = [
    { label: "亏损100万", amount: 1000000, action: "冻结新增交易，逐一复核投资论文" },
    { label: "亏损200万", amount: 2000000, action: "停止加仓，只允许降低集中度" },
    { label: "亏损300万", amount: 3000000, action: "触发完整组合与目标可行性复核" }
  ];
  $("#riskLadder").innerHTML = levels.map(level => {
    const passed = lossAmount >= level.amount;
    return `<div class="${passed ? "active" : ""}">
      <span>${level.label}</span><strong>${passed ? "已触发" : `剩余${formatWan(level.amount - lossAmount)}`}</strong><small>${level.action}</small>
    </div>`;
  }).join("");
}

function renderPracticeCalendar(practice, dateText) {
  const base = new Date(`${dateText.slice(0, 7)}-01T00:00:00+08:00`);
  const year = base.getFullYear();
  const month = base.getMonth();
  const firstDay = base.getDay();
  const days = new Date(year, month + 1, 0).getDate();
  $("#calendarTitle").textContent = `${year}年${month + 1}月记录`;
  const cells = [];
  for (let i = 0; i < firstDay; i += 1) cells.push("<div class=\"calendar-cell muted\"></div>");
  for (let day = 1; day <= days; day += 1) {
    const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const dots = [
      practice.daily[key] ? "daily" : "",
      practice.reviews?.weekly?.[weekKey(key)] ? "weekly" : "",
      practice.reviews?.monthly?.[monthKey(key)] ? "monthly" : "",
      practice.reviews?.quarterly?.[quarterKey(key)] ? "quarterly" : ""
    ].filter(Boolean).map(type => `<i class="dot ${type}"></i>`).join("");
    cells.push(`<div class="calendar-cell ${key === dateText ? "today" : ""}"><strong>${day}</strong><span>${dots}</span></div>`);
  }
  $("#practiceCalendar").innerHTML = `<div class="calendar-weekdays"><span>日</span><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span></div><div class="calendar-days">${cells.join("")}</div>`;
}

function dailyReportText(record, payload) {
  const checks = record.checks || {};
  const triggers = [
    checks.priceAlert ? "价格提醒" : "",
    checks.announcement ? "重大公告" : "",
    checks.riskLine ? "风险红线" : ""
  ].filter(Boolean);
  const conclusion = triggers.length ? `触发：${triggers.join("、")}。只进入既有规则检查，不生成新规则。` : "未触发价格、公告或风险红线；今日禁止交易判断。";
  const assets = payload?.portfolio?.currentTotalAssets ? formatWan(payload.portfolio.currentTotalAssets) : "--";
  const risks = payload?.investmentSystem?.counts;
  const alertText = risks ? `红色预警${risks.critical}项、黄色预警${risks.warning}项、价格机会${risks.opportunity}项` : "预警待加载";
  return `日报 ${record.date}：${conclusion} 当前总资产 ${assets}；系统状态：${alertText}；纪律项：${checks.noNewRule ? "已确认不生成新规则" : "未确认不生成新规则，需要补勾"}。${record.note ? `备注：${record.note}` : ""}`;
}

function renderDailyPractice(practice, payload) {
  const date = todayKey(payload);
  $("#practiceToday").textContent = `今日 ${date}`;
  const record = practice.daily[date];
  $("#dailyReport").textContent = record?.report || "今日还未生成日报。";
  const form = $("#dailyCheckForm");
  if (form) {
    ["priceAlert", "announcement", "riskLine", "noNewRule"].forEach(name => {
      form.elements[name].checked = Boolean(record?.checks?.[name]);
    });
    form.elements.note.value = record?.note || "";
  }
}

function practiceLogs(practice) {
  const daily = Object.values(practice.daily || {}).map(item => ({ kind: "daily", date: item.date, title: "日报", text: item.report }));
  const reviews = Object.entries(practice.reviews || {}).flatMap(([type, records]) => Object.values(records || {}).map(item => ({
    kind: "review",
    date: item.date,
    title: type === "weekly" ? "周复盘" : type === "monthly" ? "月复盘" : "季度复盘",
    text: item.text
  })));
  const thoughts = (practice.thoughts || []).map(item => ({ kind: "thought", date: item.date, title: `想法 · ${item.type}`, text: item.text }));
  return [...daily, ...reviews, ...thoughts].sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

function renderPracticeLog(practice) {
  const filter = practice.logFilter || "all";
  document.querySelectorAll("[data-log-filter]").forEach(button => button.classList.toggle("active", button.dataset.logFilter === filter));
  const rows = practiceLogs(practice).filter(item => filter === "all" || item.kind === filter);
  $("#practiceLog").innerHTML = rows.length ? rows.map(item => `
    <article>
      <div><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.date)}</span></div>
      <p>${escapeHtml(item.text)}</p>
    </article>
  `).join("") : "<p class=\"empty-log\">暂无记录。</p>";
}

function renderPractice(payload) {
  const practice = loadPractice();
  renderStockPool(practice, payload);
  renderPracticeAssets(payload.portfolio);
  renderDailyPractice(practice, payload);
  renderPracticeCalendar(practice, todayKey(payload));
  renderPracticeLog(practice);
}

function render(payload) {
  state.payload = payload;
  const latest = payload.latest;
  if (!latest) throw new Error("暂无数据快照");
  renderCommandCenter(payload.investmentSystem, latest);
  renderPortfolio(payload.portfolio);
  renderPractice(payload);
  renderCmbReview(payload.companyReviews?.cmb);
  renderPopMartReview(payload.companyReviews?.popMart);
  renderMoutaiReview(payload.companyReviews?.moutai);
  renderCompanyResearch(payload.companyReviews);
}

async function load() {
  const response = await fetch("/api/dashboard");
  if (!response.ok) throw new Error("数据读取失败");
  render(await response.json());
}

$("#companySwitch").addEventListener("click", event => {
  const button = event.target.closest("[data-company]");
  if (!button) return;
  state.company = button.dataset.company;
  renderCompanyResearch(state.payload.companyReviews);
});

$("#stockPoolForm").addEventListener("submit", event => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form).entries());
  const symbol = String(data.symbol || "").trim().toLowerCase();
  if (!/^(sh|sz|hk)\d{5,6}$/.test(symbol)) {
    form.elements.symbol.focus();
    return;
  }
  const practice = loadPractice();
  const item = {
    id: symbol,
    name: String(data.name || symbol).trim(),
    symbol,
    type: data.type || "watch",
    calibrationBuyPoint: data.buyPoint ? Number(data.buyPoint) : null,
    note: String(data.note || "").trim()
  };
  practice.pool = mergedPracticePool(practice, state.payload).filter(row => row.id !== item.id && row.symbol !== item.symbol);
  practice.pool.unshift(item);
  if (data.buyPoint) saveCalibratedBuyPoint(item.id, Number(data.buyPoint));
  savePractice(practice);
  form.reset();
  renderPractice(state.payload);
});

$("#stockPoolTable").addEventListener("click", event => {
  const button = event.target.closest("[data-remove-stock]");
  if (!button) return;
  const id = button.dataset.removeStock;
  const practice = loadPractice();
  practice.pool = (practice.pool || []).filter(item => (item.id || item.symbol) !== id);
  savePractice(practice);
  renderPractice(state.payload);
});

$("#stockPoolTable").addEventListener("dblclick", event => {
  const cell = event.target.closest("[data-calibration-buy-point-id]");
  if (!cell || cell.querySelector("input")) return;
  const id = cell.dataset.calibrationBuyPointId;
  const currentValue = cell.textContent.trim() === "--" ? "" : cell.textContent.trim();
  const input = document.createElement("input");
  input.type = "number";
  input.step = "0.01";
  input.min = "0";
  input.value = currentValue;
  input.className = "buy-point-input";
  cell.textContent = "";
  cell.appendChild(input);
  input.focus();
  input.select();

  let finished = false;
  const commit = () => {
    if (finished) return;
    finished = true;
    const nextValue = input.value === "" ? null : Number(input.value);
    if (nextValue !== null && (!Number.isFinite(nextValue) || nextValue <= 0)) {
      renderPractice(state.payload);
      return;
    }
    const practice = loadPractice();
    practice.pool = mergedPracticePool(practice, state.payload).map(item => (
      (item.id || item.symbol) === id ? { ...item, calibrationBuyPoint: nextValue } : item
    ));
    saveCalibratedBuyPoint(id, nextValue);
    savePractice(practice);
    renderPractice(state.payload);
  };
  const cancel = () => {
    if (finished) return;
    finished = true;
    renderPractice(state.payload);
  };

  input.addEventListener("blur", commit, { once: true });
  input.addEventListener("keydown", keyboardEvent => {
    if (keyboardEvent.key === "Enter") {
      keyboardEvent.preventDefault();
      commit();
    }
    if (keyboardEvent.key === "Escape") {
      keyboardEvent.preventDefault();
      cancel();
    }
  });
});

$("#refreshPoolQuotes").addEventListener("click", async event => {
  const button = event.currentTarget;
  button.disabled = true;
  button.textContent = "更新中";
  try {
    const response = await fetch(`/api/refresh?t=${Date.now()}`, { method: "POST", cache: "no-store" });
    if (!response.ok) throw new Error("价格更新失败");
    render(await response.json());
    button.textContent = "股票池已更新";
  } finally {
    window.setTimeout(() => {
      button.disabled = false;
      button.textContent = "更新股票池价格";
    }, 900);
  }
});

$("#dailyCheckForm").addEventListener("submit", event => {
  event.preventDefault();
  const form = event.currentTarget;
  const date = todayKey();
  const practice = loadPractice();
  const record = {
    date,
    checks: {
      priceAlert: form.elements.priceAlert.checked,
      announcement: form.elements.announcement.checked,
      riskLine: form.elements.riskLine.checked,
      noNewRule: form.elements.noNewRule.checked
    },
    note: form.elements.note.value.trim(),
    createdAt: new Date().toISOString()
  };
  record.report = dailyReportText(record, state.payload);
  practice.daily[date] = record;
  savePractice(practice);
  renderPractice(state.payload);
});

document.querySelectorAll("[data-review-type]").forEach(button => {
  button.addEventListener("click", () => {
    const type = button.dataset.reviewType;
    const date = todayKey();
    const keys = { weekly: weekKey(date), monthly: monthKey(date), quarterly: quarterKey(date) };
    const titles = { weekly: "本周情绪记录已完成：只记录冲动来源，不调整策略。", monthly: "本月组合复盘已完成：允许检查仓位、股息、集中度和加仓规则。", quarterly: "本季度认知复盘已完成：允许修正模型，但必须保留原始理由。" };
    const practice = loadPractice();
    practice.reviews[type] = practice.reviews[type] || {};
    practice.reviews[type][keys[type]] = { date, period: keys[type], text: titles[type], createdAt: new Date().toISOString() };
    savePractice(practice);
    renderPractice(state.payload);
  });
});

$("#thoughtForm").addEventListener("submit", event => {
  event.preventDefault();
  const form = event.currentTarget;
  const practice = loadPractice();
  practice.thoughts.unshift({
    id: `${Date.now()}`,
    date: todayKey(),
    type: form.elements.type.value,
    text: form.elements.text.value.trim(),
    createdAt: new Date().toISOString()
  });
  savePractice(practice);
  form.reset();
  renderPractice(state.payload);
});

document.querySelectorAll("[data-log-filter]").forEach(button => {
  button.addEventListener("click", () => {
    const practice = loadPractice();
    practice.logFilter = button.dataset.logFilter;
    savePractice(practice);
    renderPracticeLog(practice);
  });
});

$("#refreshButton").addEventListener("click", async () => {
  const button = $("#refreshButton");
  const before = state.payload;
  const beforeFingerprint = before ? JSON.stringify({
    date: before.latest?.date,
    holdings: before.portfolio?.holdings?.map(item => [item.symbol, item.currentPrice]),
    pool: before.investmentSystem?.stockPool?.map(item => [item.symbol, item.currentPrice])
  }) : null;
  button.disabled = true;
  button.textContent = "更新中";
  $("#dataDate").textContent = "正在重新采集行情…";
  try {
    const response = await fetch(`/api/refresh?t=${Date.now()}`, { method: "POST", cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "更新失败");
    render(data);
    const latest = data.latest;
    const afterFingerprint = latest ? JSON.stringify({
      date: latest.date,
      holdings: data.portfolio?.holdings?.map(item => [item.symbol, item.currentPrice]),
      pool: data.investmentSystem?.stockPool?.map(item => [item.symbol, item.currentPrice])
    }) : null;
    const collectedTime = formatCollectedTime(latest?.collectedAt) || "刚刚";
    $("#dataDate").textContent = beforeFingerprint === afterFingerprint
      ? `已检查 ${collectedTime} · 行情暂无变化`
      : `已更新 ${collectedTime} · 行情 ${latest?.date || "--"}`;
  } catch (error) {
    $("#dataDate").textContent = `更新失败：${error.message}`;
  } finally {
    button.disabled = false;
    button.textContent = "立即更新";
  }
});

load().catch(error => {
  $("#dataDate").textContent = error.message;
  $("#alertBoard").textContent = "请检查服务是否已启动，或稍后重试。";
});
