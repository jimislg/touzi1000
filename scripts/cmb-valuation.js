const INPUTS = {
  price: 37.26,
  bookValuePerShare: 44.90,
  annualDividend: 2.016,
  years: 10
};

const SCENARIOS = {
  bear: { bookValueGrowth: 0.02, dividendGrowth: 0, exitPriceToBook: 0.65 },
  base: { bookValueGrowth: 0.06, dividendGrowth: 0.04, exitPriceToBook: 0.85 },
  bull: { bookValueGrowth: 0.08, dividendGrowth: 0.07, exitPriceToBook: 1.05 }
};

function presentValueAtRate(inputs, scenario, discountRate) {
  let value = 0;
  for (let year = 1; year <= inputs.years; year += 1) {
    const dividend = inputs.annualDividend * (1 + scenario.dividendGrowth) ** year;
    value += dividend / (1 + discountRate) ** year;
  }
  const terminalBookValue = inputs.bookValuePerShare
    * (1 + scenario.bookValueGrowth) ** inputs.years;
  const terminalPrice = terminalBookValue * scenario.exitPriceToBook;
  return value + terminalPrice / (1 + discountRate) ** inputs.years;
}

function impliedReturn(inputs, scenario) {
  let low = -0.9;
  let high = 0.5;
  for (let iteration = 0; iteration < 200; iteration += 1) {
    const middle = (low + high) / 2;
    if (presentValueAtRate(inputs, scenario, middle) > inputs.price) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
}

function round(value, digits = 4) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

const scenarioReturns = Object.fromEntries(Object.entries(SCENARIOS).map(([name, scenario]) => [
  name,
  {
    ...scenario,
    annualizedReturn: round(impliedReturn(INPUTS, scenario))
  }
]));

const baseScenario = SCENARIOS.base;
const reviewLines = [0.13, 3 ** (1 / 10) - 1, 0.10, 0.08].map(requiredReturn => ({
  requiredReturn: round(requiredReturn),
  price: round(presentValueAtRate(INPUTS, baseScenario, requiredReturn), 2)
}));

if (require.main === module) {
  console.log(JSON.stringify({ inputs: INPUTS, scenarioReturns, reviewLines }, null, 2));
}

module.exports = { INPUTS, SCENARIOS, impliedReturn, presentValueAtRate };
