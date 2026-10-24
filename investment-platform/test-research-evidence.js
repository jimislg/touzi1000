/* Research provenance, issuer coverage and approval separation. Synthetic account arithmetic only. */
const fs=require('fs'),path=require('path'),os=require('os'),assert=require('node:assert/strict')
const CORE=require('./public/investment-core'),{readSupplement}=require('./research-supplement')
const {revisionOf,mergePatch}=require('./config-service'),{reconcile}=require('../scripts/reconcile-research-account')
const root=path.resolve(__dirname,'..'),base=path.join(root,'research/20261024-evidence-completion')
let n=0;const check=(label,ok)=>{assert.ok(ok,label);n++;console.log('PASS '+label)}
const pack=readSupplement(path.join(__dirname,'public/research-supplement.json'))
check('exactly 34 issuer research records; 28 current, 6 historical',pack.records.length===34&&pack.records.filter(r=>r.scope==='主平台当前池').length===28&&pack.records.filter(r=>r.scope!=='主平台当前池').length===6)
const codeKey=s=>s.replace(/^(\d+)\.HK$/,(_,v)=>v.padStart(5,'0')+'.HK'),seen=new Set()
for(const r of pack.records){
 const full=JSON.parse(fs.readFileSync(path.join(base,'companies',r.id+'-20261024.json')))
 check(r.id+': eight supported dimensions, sources, named gaps and unapproved valuation',full.dimensions.length===8&&full.dimensions.every(d=>d.support&&d.counter)&&full.sources.length>0&&full.remainingGaps.length>0&&full.valuation.formalAllowed===false)
 for(const c of r.codes){check(r.id+': no ambiguous security mapping '+c,!seen.has(codeKey(c)));seen.add(codeKey(c))}
 check(r.id+': portable report exists',fs.existsSync(path.join(__dirname,'public',r.reportPath)))
 const sources=new Set(full.sources.map(s=>s.id))
 check(r.id+': financial metrics cite a known source',full.metrics.every(m=>!m.sourceId||sources.has(m.sourceId)))
 const cb=full.cashBridge
 if(Number.isFinite(cb.ocf)&&Number.isFinite(cb.totalCapex)&&cb.conservativeResidual!=null)check(r.id+': OCF less total cash capex ties',Math.abs(cb.ocf-cb.totalCapex-cb.conservativeResidual)<.000001)
 if(['cmb','pingan'].includes(r.id))check(r.id+': financial company does not claim OCF free cash',cb.conservativeResidual===null)
 check(r.id+': no approvals or personal records in public research',!('holdings'in r)&&!('trades'in r)&&!('accessKey'in r)&&!('executionApproval'in r))
}
// Independently discount the exported yearly economic cash flows, including terminal value only once.
const npv=(flows,r)=>flows.reduce((v,c,t)=>v+c/Math.pow(1+r,t),0)
for(const id of ['catl','popmart','china_mobile']){
 const v=JSON.parse(fs.readFileSync(path.join(base,'companies',id+'-20261024.json'))).valuation
 for(const [name,c] of Object.entries(v.cases)){
  let flows,irr
  if(id==='china_mobile'){flows=c.cashFlowsCNY;irr=c.irr}
  if(id==='catl'){flows=[-237.6,...c.years.map((y,i)=>y.dividend+(i===9?y.eps*c.exitPE:0))];irr=c.irr10At237_6;check(id+' '+name+': operating earnings reconcile to per-share income',Math.abs(c.parentNetIncome/c.shares100Million-c.epsYear1)<1e-8)}
  if(id==='popmart'){flows=[-v.priceHKD*v.fxCNYPerHKD,...c.annualRows.map((y,i)=>y.dividendNetCNY+(i===9?c.terminalEPSCNY*c.terminalPE:0))];irr=c.irrAfter20PctTax;check(id+' '+name+': ordinary shares rather than ADS are the EPS denominator',Math.abs(c.startRevenueCNYBillion*1e9*c.startAttributableNetMargin/c.shareCountAssumption-c.startEPSCNY)<1e-8)}
  check(id+' '+name+': ten annual cash flows and single terminal reproduce reported IRR',flows.length===11&&Math.abs(npv(flows,irr))<1e-5)
 }
}
check('all eight retrieved Q3 issuer financials are separately classified',pack.records.filter(r=>['financial','financial_mirror'].includes(r.q3Review.kind)).length===8)
check('Ping An Bank Q3 does not masquerade as Ping An group Q3',pack.records.find(r=>r.id==='pingan').q3Review.kind==='subsidiary')
check('operating updates are not labelled financial quarterly reports',['anta','miniso','cypc','crland'].every(id=>pack.records.find(r=>r.id===id).q3Review.kind==='operating'))
check('mirror source limitation remains visible',pack.records.find(r=>r.id==='yiwu').q3Review.kind==='financial_mirror'&&pack.records.find(r=>r.id==='yiwu').remainingGaps.some(g=>g.item.includes('一致性')))
const company={code:'0700.HK',grade:'A'},cfg={holdings:[],universe:[company],investable:10000,targetCapital:100000,_researchSupplement:pack}
const bare=JSON.parse(JSON.stringify(cfg));delete bare._researchSupplement
const summary=CORE.researchSummary(company,cfg)
check('read-only public study fills thesis and report link',summary.thesis.includes('微信')&&summary.reportPath==='/research/tencent.html'&&summary.supplementLabel.includes('未授予执行资格'))
check('research package cannot change formal research or investment approval',JSON.stringify(CORE.researchState(company))===JSON.stringify(CORE.researchState({...company,_researchSupplement:pack}))&&CORE.decisionBudget(cfg,{},company.code).approvedCNY===0)
check('presentation evidence is outside the real account revision',revisionOf(cfg)===revisionOf(bare))
check('ordinary saves neither persist presentation metadata nor change data revision by reading',!mergePatch(cfg,{})._researchSupplement)
assert.throws(()=>mergePatch(bare,{_researchSupplement:pack}),/只读/);n++;console.log('PASS client cannot save research package as account data')
const noPack=CORE.researchSummary(company,{_researchSupplement:{records:pack.records}})
check('malformed or missing research package preserves explicit unknowns',noPack.reportPath===null&&noPack.thesis.includes('未录入'))
const synthetic={_revision:'synthetic',holdings:[{code:'0700.HK',name:'Synthetic',market:'HK',shares:300,cost:10}],trades:[{code:'0700.HK',date:'2026-10-22',shares:100,price:10,amtCNY:800},{code:'0700.HK',date:'2026-10-22',shares:100,price:10,amtCNY:800}]},opening={snapshotDate:'2026-08-25',source:'synthetic',holdings:[{symbol:'700.HK',quantity:100}]}
const before=JSON.stringify(synthetic),r=reconcile(synthetic,opening)
check('same-looking fills remain duplicate candidates and are never deleted',r.matchedHoldings===1&&r.duplicateCandidates.length===1&&JSON.stringify(synthetic)===before)
check('share arithmetic does not certify FX, cash, trade IDs or side',!r.verifiedCashLedger&&!r.rows[0].cnyCostVerified&&r.missingBrokerTradeId===2&&r.missingStructuredSide===2)
check('research version is bound to the full evidence content digest',/^[a-f0-9]{64}$/.test(pack.evidenceDigest)&&pack.version.endsWith(pack.evidenceDigest.slice(0,12)))
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'research-source-'))
try{const f=path.join(dir,'bad.json');fs.writeFileSync(f,'{bad');check('unreadable package fails closed without breaking account reads',readSupplement(f).status==='unavailable');fs.writeFileSync(f,JSON.stringify({...pack,records:[{...pack.records[0],reportPath:'https://evil.invalid/'}]}));check('unsafe report path rejected',readSupplement(f).status==='unavailable');for(const [label,data] of [['empty research records',{...pack,records:[]}],['empty research version',{...pack,version:''}],['normalized duplicate HK code',{...pack,records:[{...pack.records[0],codes:['0700.HK','00700.HK']}]}]]){fs.writeFileSync(f,JSON.stringify(data));check(label+' fails closed',readSupplement(f).status==='unavailable')}}finally{fs.rmSync(dir,{recursive:true,force:true})}
console.log('Research evidence acceptance: '+n+' checks passed; no production or personal-data writes.')
