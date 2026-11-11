const fs = require("node:fs");
const path = require("node:path");
const { ASSETS, average, fetchSeries, scoreDashboard } = require("./server");

const OUTPUT_FILE = path.join(__dirname, "data", "backtest.json");
const FETCH_DAYS = 1000;
const MIN_LOOKBACK = 30;
const HORIZONS = [5, 20];
const BROAD_INDEX_ASSETS = {
  indices: [
    { symbol: "sh000688", name: "科创50", group: "tech" },
    { symbol: "sz399006", name: "创业板指", group: "tech" }
  ],
  tech: [],
  whiteHorse: [
    { symbol: "sh000016", name: "上证50" },
    { symbol: "sh000300", name: "沪深300" }
  ]
};

function commonDates(grouped) {
  const allSeries = Object.values(grouped).flat();
  let dates = new Set(allSeries[0].rows.map(row => row.date));
  for (const series of allSeries.slice(1)) {
    const available = new Set(series.rows.map(row => row.date));
    dates = new Set([...dates].filter(date => available.has(date)));
  }
  return [...dates].sort();
}

function prepareSeries(grouped) {
  for (const series of Object.values(grouped).flat()) {
    series.indexByDate = new Map(series.rows.map((row, index) => [row.date, index]));
  }
}

function groupedThroughDate(grouped, date) {
  return Object.fromEntries(Object.entries(grouped).map(([group, seriesList]) => [
    group,
    seriesList.map(series => ({
      ...series,
      rows: series.rows.slice(0, series.indexByDate.get(date) + 1)
    }))
  ]));
}

function assetReturn(series, fromDate, toDate) {
  const start = series.rows[series.indexByDate.get(fromDate)]?.close;
  const end = series.rows[series.indexByDate.get(toDate)]?.close;
  return start && end ? ((end / start) - 1) * 100 : NaN;
}

function futureWhiteExcess(grouped, fromDate, toDate) {
  const techSet = [
    ...grouped.indices.filter(item => item.group === "tech"),
    ...grouped.tech
  ];
  return average(grouped.whiteHorse.map(item => assetReturn(item, fromDate, toDate)))
    - average(techSet.map(item => assetReturn(item, fromDate, toDate)));
}

function correlation(rows, xKey, yKey) {
  const xs = rows.map(row => row[xKey]);
  const ys = rows.map(row => row[yKey]);
  const xMean = average(xs);
  const yMean = average(ys);
  const numerator = xs.reduce((sum, x, index) => sum + (x - xMean) * (ys[index] - yMean), 0);
  const xVariance = xs.reduce((sum, x) => sum + (x - xMean) ** 2, 0);
  const yVariance = ys.reduce((sum, y) => sum + (y - yMean) ** 2, 0);
  return xVariance && yVariance ? numerator / Math.sqrt(xVariance * yVariance) : 0;
}

function summarizeRows(rows, horizon) {
  const key = `futureWhiteExcess${horizon}`;
  const buckets = [
    { label: "0-39", min: 0, max: 40 },
    { label: "40-59", min: 40, max: 60 },
    { label: "60-79", min: 60, max: 80 },
    { label: "80-100", min: 80, max: 101 }
  ];
  return {
    sampleCount: rows.length,
    meanWhiteExcess: average(rows.map(row => row[key])),
    reversalRate: average(rows.map(row => row[key] > 0 ? 1 : 0)),
    completionCorrelation: correlation(rows, "completion", key),
    buckets: buckets.map(bucket => {
      const matches = rows.filter(row => row.completion >= bucket.min && row.completion < bucket.max);
      return {
        label: bucket.label,
        count: matches.length,
        meanWhiteExcess: matches.length ? average(matches.map(row => row[key])) : null,
        reversalRate: matches.length ? average(matches.map(row => row[key] > 0 ? 1 : 0)) : null
      };
    })
  };
}

function roundDeep(value) {
  if (Array.isArray(value)) return value.map(roundDeep);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, roundDeep(item)]));
  }
  return typeof value === "number" ? Math.round(value * 1000) / 1000 : value;
}

async function fetchGrouped(assetsByGroup) {
  return Object.fromEntries(await Promise.all(
    Object.entries(assetsByGroup).map(async ([group, assets]) => [
      group,
      await Promise.all(assets.map(asset => fetchSeries(asset, FETCH_DAYS)))
    ])
  ));
}

function testUniverse(grouped) {
  prepareSeries(grouped);
  const dates = commonDates(grouped);
  const maxHorizon = Math.max(...HORIZONS);
  const rows = [];

  for (let index = MIN_LOOKBACK; index < dates.length - maxHorizon; index += 1) {
    const date = dates[index];
    const score = scoreDashboard(groupedThroughDate(grouped, date));
    const row = { date, completion: score.completion };
    for (const horizon of HORIZONS) {
      row[`futureWhiteExcess${horizon}`] = futureWhiteExcess(grouped, date, dates[index + horizon]);
    }
    rows.push(row);
  }

  const nonOverlapping20 = rows.filter((_, index) => index % 20 === 0);
  return {
    period: { from: rows[0]?.date, to: rows.at(-1)?.date },
    daily: Object.fromEntries(HORIZONS.map(horizon => [horizon, summarizeRows(rows, horizon)])),
    nonOverlapping20: Object.fromEntries(HORIZONS.map(horizon => [horizon, summarizeRows(nonOverlapping20, horizon)]))
  };
}

async function main() {
  const [currentBasket, broadIndices] = await Promise.all([
    fetchGrouped(ASSETS),
    fetchGrouped(BROAD_INDEX_ASSETS)
  ]);
  const result = roundDeep({
    generatedAt: new Date().toISOString(),
    methodology: {
      outcome: "Positive future white-horse excess means white horses outperformed technology",
      caveats: [
        "Daily observations overlap and are not statistically independent",
        "The current basket has survivorship and selection bias",
        "Broad indices reduce stock-selection bias but are imperfect style proxies",
        "The test evaluates association, not causal prediction"
      ]
    },
    universes: {
      currentBasket: {
        description: "Current dashboard stocks; closest to the portfolio but selection-biased",
        ...testUniverse(currentBasket)
      },
      broadIndices: {
        description: "STAR 50 plus ChiNext versus SSE 50 plus CSI 300",
        ...testUniverse(broadIndices)
      }
    }
  });

  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
