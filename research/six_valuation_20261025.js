// v3.4 统一每股模型（研究草案，非正式经济价值或H档）
// P(r,n)=Σ DPS_t/(1+r)^t + 终值_n/(1+r)^n；终值_n=EPS_n×终值PE。
// 所有未来输入均为[假设]；权重为主观判断，不冒充统计概率。
// 2026-10-25复核：宁德时代总股本由42.60亿修正为46.27249686亿。
const fs = require('fs');
const fx = 0.8503; // HKDCNY，2026-10-23研究锚
const S = {
  '中移动H': {ccy:'HKD', price:77.10, shares:216.95890446, profit:1280, eps0:1280/216.95890446, toCny:true, tax:0.20, grade:'B', sc:{
    悲观:{y1Drop:-0.06,g:-0.01,payout:0.75,pe:8,w:0.25},
    基准:{y1Drop:-0.05,g:0.01,payout:0.76,pe:10,w:0.50},
    乐观:{y1Drop:-0.03,g:0.03,payout:0.78,pe:12,w:0.25}}},
  '宁德A': {ccy:'CNY', price:237.60, shares:46.27249686, profit:840, eps0:840/46.27249686, tax:0, grade:'A', sc:{
    悲观:{y1Drop:-0.25,g:0.03,payout:0.50,pe:10,w:0.30},
    基准:{y1Drop:-0.10,g:0.08,payout:0.50,pe:12,w:0.50},
    乐观:{y1Drop:0.00,g:0.12,payout:0.50,pe:18,w:0.20}}},
  '泡泡玛特': {ccy:'HKD', price:131.70, shares:13.31779203, profit:95, eps0:95/13.31779203, toCny:true, tax:0.20, grade:'B', sc:{
    悲观:{y1Drop:-0.15,g:0.03,payout:0.30,pe:10,w:0.30},
    基准:{y1Drop:0.08,g:0.10,payout:0.35,pe:15,w:0.50},
    乐观:{y1Drop:0.25,g:0.15,payout:0.40,pe:20,w:0.20}}},
  '老铺黄金': {ccy:'HKD', price:284.60, shares:1.767445, profit:58, eps0:58/1.767445, toCny:true, tax:0.20, grade:'C', sc:{
    悲观:{y1Drop:-0.40,g:0.00,payout:0.60,pe:5,w:0.35},
    基准:{y1Drop:-0.22,g:0.03,payout:0.65,pe:7,w:0.45},
    乐观:{y1Drop:-0.05,g:0.12,payout:0.70,pe:12,w:0.20}}},
  '江南布衣': {ccy:'HKD', price:22.18, shares:5.33285, profit:10.5, eps0:10.5/5.33285, toCny:true, tax:0.20, grade:'B', sc:{
    悲观:{y1Drop:-0.05,g:0.00,payout:0.75,pe:8,w:0.25},
    基准:{y1Drop:0.03,g:0.05,payout:0.75,pe:11,w:0.50},
    乐观:{y1Drop:0.08,g:0.08,payout:0.80,pe:13,w:0.25}}},
  '东鹏A': {ccy:'CNY', price:104.48, shares:7.34199310, profit:52, eps0:52/7.34199310, tax:0, grade:'A', sc:{
    悲观:{y1Drop:0.00,g:0.03,payout:0.80,pe:12,w:0.30},
    基准:{y1Drop:0.05,g:0.10,payout:0.80,pe:18,w:0.50},
    乐观:{y1Drop:0.10,g:0.15,payout:0.80,pe:22,w:0.20}}}
};
S['宁德H'] = {...S['宁德A'], ccy:'HKD', price:356.80, toCny:true, tax:0.20};
S['东鹏H'] = {...S['东鹏A'], ccy:'HKD', price:94.05, toCny:true, tax:0.20};

function epsAt(eps0, p, t) {
  let eps = eps0;
  for (let i=1; i<=t; i++) eps = i===1 ? eps0*(1+p.y1Drop) : eps*(1+p.g);
  return eps;
}
function pvAtRate(rate, eps0, p, n=10, tax=0, fxEnd=1) {
  let pv=0;
  for (let t=1; t<=n; t++) {
    const eps=epsAt(eps0,p,t);
    const fxFactor=1+(fxEnd-1)*(t/n);
    pv += eps*p.payout*(1-tax)*fxFactor/Math.pow(1+rate,t);
    if (t===n) pv += eps*p.pe*fxFactor/Math.pow(1+rate,t);
  }
  return pv;
}
function irr(priceCny, eps0, p, n=10, tax=0, fxEnd=1) {
  let lo=-0.90, hi=2.0;
  for (let i=0; i<240; i++) {
    const mid=(lo+hi)/2;
    if (pvAtRate(mid,eps0,p,n,tax,fxEnd)>priceCny) lo=mid; else hi=mid;
  }
  return (lo+hi)/2;
}
function wealthMultiple(priceCny, eps0, p, n, tax=0, fxEnd=1) {
  let wealth=0;
  for (let t=1; t<=n; t++) {
    const eps=epsAt(eps0,p,t);
    const fxFactor=1+(fxEnd-1)*(t/n);
    wealth += eps*p.payout*(1-tax)*fxFactor;
    if (t===n) wealth += eps*p.pe*fxFactor;
  }
  return wealth/priceCny;
}
function weightedWealth(s, priceCny, n, tax=0, fxEnd=1, bearPlus=0) {
  let total=0;
  for (const [name,p] of Object.entries(s.sc)) {
    let w=p.w;
    if (bearPlus && name==='悲观') w+=bearPlus;
    if (bearPlus && name==='基准') w-=bearPlus;
    total += w*wealthMultiple(priceCny,eps0Safe(s),p,n,tax,fxEnd);
  }
  return total;
}
function scenarioDetail(s, p, n) {
  let dividendPreTax=0, dividendAfterTax=0;
  for (let t=1; t<=n; t++) {
    const eps=epsAt(s.eps0,p,t);
    dividendPreTax += eps*p.payout;
    dividendAfterTax += eps*p.payout*(1-s.tax);
  }
  const terminalCny=epsAt(s.eps0,p,n)*p.pe;
  return {
    dividendPreTaxCny:num(dividendPreTax), dividendAfterTaxCny:num(dividendAfterTax),
    terminalCny:num(terminalCny), terminalLocal:num(localFromCny(s,terminalCny)),
    irrPreTax:pct(irr(s.toCny?s.price*fx:s.price,s.eps0,p,n,0,1)),
    irrAfterTax:pct(irr(s.toCny?s.price*fx:s.price,s.eps0,p,n,s.tax,1))
  };
}
function eps0Safe(s) { return s.eps0; }
function localFromCny(s,x) { return s.toCny ? x/fx : x; }
function pct(x) { return +(x*100).toFixed(2); }
function num(x) { return +x.toFixed(2); }

const results={asOf:'2026-10-25',priceDate:'2026-10-23',hkdcny:fx,status:'研究草案；估值审计门未全过，非正式经济价值/H档/下单价',stocks:{}};
for (const [name,s] of Object.entries(S)) {
  const priceCny=s.toCny?s.price*fx:s.price;
  const out={ccy:s.ccy,price:s.price,priceCny:num(priceCny),sharesYi:s.shares,normalProfitYi:s.profit,normalEpsCny:num(s.eps0),normalPE:num(priceCny/s.eps0),grade:s.grade,scenarios:{},thresholdDraft:{},weighted:{}};
  const base=s.sc['基准'];
  for (const r of [0.10,0.12,0.15,0.1746]) {
    const key=r===0.1746?'H17.46':'H'+Math.round(r*100);
    out.thresholdDraft[key]=num(localFromCny(s,pvAtRate(r,s.eps0,base,10,0,1)));
  }
  for (const [scenario,p] of Object.entries(s.sc)) {
    out.scenarios[scenario]={
      weight:p.w,y1Drop:p.y1Drop,g:p.g,payout:p.payout,terminalPE:p.pe,
      irr10PreTax:pct(irr(priceCny,s.eps0,p,10,0,1)),
      irr10AfterTax:pct(irr(priceCny,s.eps0,p,10,s.tax,1)),
      totalReturn5AfterTax:pct(wealthMultiple(priceCny,s.eps0,p,5,s.tax,1)-1),
      totalReturn10AfterTax:pct(wealthMultiple(priceCny,s.eps0,p,10,s.tax,1)-1),
      detail5:scenarioDetail(s,p,5),detail10:scenarioDetail(s,p,10)
    };
  }
  for (const n of [5,10]) {
    const w=weightedWealth(s,priceCny,n,s.tax,1,0);
    const ws=weightedWealth(s,priceCny,n,s.tax,1,0.10);
    out.weighted[n+'y']={wealthMultiple:num(w),equivalentCagr:pct(Math.pow(w,1/n)-1),bearPlus10WealthMultiple:num(ws),bearPlus10EquivalentCagr:pct(Math.pow(ws,1/n)-1)};
  }
  if (s.toCny) {
    out.fxRmbIrr10Base={hkdPlus10:pct(irr(priceCny,s.eps0,base,10,s.tax,1.10)),stable:pct(irr(priceCny,s.eps0,base,10,s.tax,1)),hkdMinus10:pct(irr(priceCny,s.eps0,base,10,s.tax,0.90))};
  }
  const peOnly={...base,pe:base.pe*0.70};
  const epsAndPe={...base,pe:base.pe*0.70};
  const eps0Down=s.eps0*0.80;
  const joint={...base,g:Math.max(base.g-0.03,-0.05),payout:Math.max(base.payout-0.10,0),pe:base.pe*0.70};
  out.stress10PreTax={peMinus30:pct(irr(priceCny,s.eps0,peOnly,10,0,1)),epsMinus20AndPeMinus30:pct(irr(priceCny,eps0Down,epsAndPe,10,0,1)),jointEps20Growth3Payout10Pe30:pct(irr(priceCny,eps0Down,joint,10,0,1))};
  out.identity={marketCapLocalYi:num(s.price*s.shares),priceTimesShares:true};
  results.stocks[name]=out;
}
const ah={
  '中移动H':{aPrice:99.14,hPrice:77.10,discount:pct(1-(77.10*fx)/99.14),relative25:(1-(77.10*fx)/99.14)>=0.25},
  '宁德H':{aPrice:237.60,hPrice:356.80,discount:pct(1-(356.80*fx)/237.60),relative25:(1-(356.80*fx)/237.60)>=0.25},
  '东鹏H':{aPrice:104.48,hPrice:94.05,discount:pct(1-(94.05*fx)/104.48),relative25:(1-(94.05*fx)/104.48)>=0.25}
};
results.ah=ah;
const outPath='/Users/jimislg/Documents/郎刚的芒格/research/six_valuation_20261025_results.json';
fs.writeFileSync(outPath,JSON.stringify(results,null,2));
for (const [name,o] of Object.entries(results.stocks)) {
  console.log(`\n${name} | ${o.price} ${o.ccy} | 正常化EPS ${o.normalEpsCny}元 | 正常化PE ${o.normalPE}x`);
  console.log(`  基准IRR税前/税后 ${o.scenarios['基准'].irr10PreTax}%/${o.scenarios['基准'].irr10AfterTax}% | 悲观 ${o.scenarios['悲观'].irr10AfterTax}% | 乐观 ${o.scenarios['乐观'].irr10AfterTax}%`);
  console.log(`  草案门槛 ${JSON.stringify(o.thresholdDraft)} | 加权5/10年CAGR ${o.weighted['5y'].equivalentCagr}%/${o.weighted['10y'].equivalentCagr}%`);
  console.log(`  悲观权重+10pct后5/10年CAGR ${o.weighted['5y'].bearPlus10EquivalentCagr}%/${o.weighted['10y'].bearPlus10EquivalentCagr}% | 双压力 ${o.stress10PreTax.epsMinus20AndPeMinus30}% | 联合压力 ${o.stress10PreTax.jointEps20Growth3Payout10Pe30}%`);
  if (o.fxRmbIrr10Base) console.log('  人民币IRR汇率压力',o.fxRmbIrr10Base);
}
console.log('\nA/H折价',ah);
console.log('\nJSON:',outPath);
