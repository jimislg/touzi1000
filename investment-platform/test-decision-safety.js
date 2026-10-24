/* Independent arithmetic and adversarial cases. Synthetic data only; never reads personal config. */
const assert = require('node:assert/strict')
const core = require('./public/investment-core')
const { mergePatch, revisionOf, createConfigService } = require('./config-service')
const { createDecisionPreview } = require('./decision-preview')
const copy = x => JSON.parse(JSON.stringify(x))
const at = Date.parse('2026-10-24T10:00:00+08:00'), quoteTime = '20261024095900'
let count = 0
function check(name, value) { assert.ok(value, name); count++; console.log('PASS ' + name) }
function near(name, value, expected) { check(name, Number.isFinite(value) && Math.abs(value - expected) < 1e-8) }
function fixture() {
  const research={status:'done',version:'r1',source:'synthetic research',asOf:'2026-10-23'}
  const audit={status:'passed',version:'a1',researchVersion:'r1',source:'independent fixture',asOf:'2026-10-23'}
  const policy={status:'approved',version:'p1',seatKey:'s',denominator:'planningCapital',planningCapitalCNYFen:100000000,validFrom:'2026-10-23',validUntil:'2026-10-25',issuerMaxCNYFen:10000000,feeReserveCNYFen:10000,quoteMaxAgeMs:900000,tranches:[{id:'one',price:100,cumulativeCostCNYFen:8000000},{id:'two',price:80,cumulativeCostCNYFen:10000000}]}
  const approval={status:'approved',policyVersion:'p1',researchVersion:'r1',auditVersion:'a1',dataRevision:'d1',source:'synthetic authorization',approvedAt:'2026-10-23',validUntil:'2026-10-25'}
  const cfg={_sourceMode:'local',_syncStatus:'local',decisionDataRevision:'d1',targetCapital:1000000,investable:900000,holdings:[{code:'600000.SH',qt:'qa',market:'A',shares:500,cost:100,dps:0,dividendTaxRate:0.1,dividendTaxSource:'fixture'},{code:'600001.SH',qt:'qb',market:'A',shares:400,cost:100,dps:null}],universe:[{code:'600000.SH',qt:'qa',grade:'A',research,audit,executionPolicy:policy,executionApproval:approval},{code:'600001.SH',qt:'qb',grade:'A'}],seats:{list:[{key:'s',name:'shared',pct:10,members:['600000.SH','600001.SH']}]},budgetLedger:{status:'reconciled',dataRevision:'d1',source:'broker fixture',asOf:'2026-10-24T09:50:00+08:00',openingVerified:true,positionsVerified:true,cashFlowsVerified:true,cashVerified:true,cashAvailableCNYFen:90000000,reservedCashCNYFen:0,sellReleaseRule:'no-release',positions:[{code:'600000.SH',shares:500},{code:'600001.SH',shares:400}],issuers:{'600000.SH':{netInvestedCNYFen:5000000,reservedCNYFen:0},'600001.SH':{netInvestedCNYFen:4000000,reservedCNYFen:0}},seats:{s:{netInvestedCNYFen:9000000,reservedCNYFen:0}}}}
  return {cfg,quotes:{qa:{price:90,time:quoteTime},qb:{price:100,time:quoteTime}}}
}
const run=(f=fixture())=>core.decisionBudget(f.cfg,f.quotes,'600000.SH',{now:at})
const original=fixture(), before=JSON.stringify(original), good=run(original)
check('all independently verified gates can pass',good.status==='approved'&&good.blockers.length===0)
// Stage room30k, whole shared seat cost room10k, issuer risk55k, cash899900 => minimum10k.
near('shared seat consumes both companies: ceiling 10,000 not 30,000',good.approvedCNY,10000)
check('new money is integer cents',good.approvedCNYFen===1000000)
check('calculation leaves inputs unchanged',JSON.stringify(original)===before)
near('percentage points converted once: 17 to20 on10m is300k',core.positionRoom(17,20,10000000),300000)
near('stage exhausted produces zero even if price falls',(()=>{const f=fixture();f.cfg.budgetLedger.issuers['600000.SH'].netInvestedCNYFen=8000000;f.cfg.budgetLedger.seats.s.netInvestedCNYFen=12000000;return run(f).approvedCNY})(),0)
for(const [label,mutate] of [
 ['research absent',f=>delete f.cfg.universe[0].research],['partial research',f=>f.cfg.universe[0].research.status='partial'],['grade alone',f=>{delete f.cfg.universe[0].research;f.cfg.universe[0].plan='正式已批准'}],['audit absent',f=>delete f.cfg.universe[0].audit],['audit version mismatch',f=>f.cfg.universe[0].audit.researchVersion='r0'],['approval absent',f=>delete f.cfg.universe[0].executionApproval],['approval expired',f=>f.cfg.universe[0].executionApproval.validUntil='2026-10-22'],['policy expired',f=>f.cfg.universe[0].executionPolicy.validUntil='2026-10-22'],['approval stale data',f=>f.cfg.universe[0].executionApproval.dataRevision='d0'],['wrong denominator',f=>f.cfg.universe[0].executionPolicy.denominator='NAV'],['wrong planning capital',f=>f.cfg.targetCapital=2000000],['missing planning capital',f=>delete f.cfg.targetCapital],['no ledger',f=>delete f.cfg.budgetLedger],['cash not reconciled',f=>f.cfg.budgetLedger.cashVerified=false],['opening absent',f=>f.cfg.budgetLedger.openingVerified=false],['cash mismatch',f=>f.cfg.investable=800000],['shares mismatch',f=>f.cfg.holdings[0].shares=600],['other issuer missing',f=>delete f.cfg.budgetLedger.issuers['600001.SH']],['seat totals mismatch',f=>f.cfg.budgetLedger.seats.s.netInvestedCNYFen=0],['reservation mismatch',f=>f.cfg.budgetLedger.reservedCashCNYFen=500],['stale target quote',f=>f.quotes.qa.time='20261023150000'],['stale other quote',f=>f.quotes.qb.time='20261023150000'],['quote future',f=>f.quotes.qa.time='20261025100000'],['quote time missing',f=>delete f.quotes.qa.time],['invalid quote date',f=>f.quotes.qa.time='20260230095900'],['quote zero',f=>f.quotes.qa.price=0],['overflowing valuation',f=>f.quotes.qa.price=Number.MAX_VALUE],['fractional shares in both records',f=>{f.cfg.holdings[0].shares=1.2;f.cfg.budgetLedger.positions[0].shares=1.2}],['fallback snapshot',f=>{delete f.quotes.qa;f.cfg.universe[0].px=90}],['fractional cents',f=>f.cfg.universe[0].executionPolicy.issuerMaxCNYFen=1.2],['duplicate tranche ID',f=>f.cfg.universe[0].executionPolicy.tranches[1].id='one'],['increasing prices',f=>f.cfg.universe[0].executionPolicy.tranches[1].price=110],['descending cumulative cost',f=>f.cfg.universe[0].executionPolicy.tranches[1].cumulativeCostCNYFen=1],['policy above seat',f=>f.cfg.universe[0].executionPolicy.issuerMaxCNYFen=20000000],['duplicate seat',f=>f.cfg.seats.list.push(copy(f.cfg.seats.list[0]))],['edit invalidates approval',f=>f.cfg.decisionInputsChanged={fields:['cash']}],['future audit',f=>f.cfg.universe[0].audit.asOf='2026-10-25'],['future ledger',f=>f.cfg.budgetLedger.asOf='2026-10-25'],['invalid extra issuer',f=>f.cfg.budgetLedger.issuers.other={netInvestedCNYFen:NaN,reservedCNYFen:0}]
]) { const f=fixture();mutate(f);const d=run(f);check('fail closed: '+label,d.approvedCNY===0&&d.blockers.length>0) }
const missingRef=fixture();delete missingRef.quotes.qa;check('missing valuation does not invent full issuer or seat room',run(missingRef).researchRoomCNY===null&&run(missingRef).seatRoomCNY===null)
const reserved=fixture();reserved.cfg.budgetLedger.reservedCashCNYFen=500000;reserved.cfg.budgetLedger.issuers['600001.SH'].reservedCNYFen=500000;reserved.cfg.budgetLedger.seats.s.reservedCNYFen=500000
near('shared reservation deducted once from seat room',run(reserved).approvedCNY,5000)
const cash=fixture();cash.cfg.investable=1100;cash.cfg.budgetLedger.cashAvailableCNYFen=110000
near('fee reserve deducted from verified cash',run(cash).approvedCNY,1000)
// Convert the target issuer to an HK listing; historical cost and timestamped FX remain independent gates.
const hkCase=fixture();hkCase.cfg.holdings[0].code='0700.HK';hkCase.cfg.holdings[0].market='HK';hkCase.cfg.universe[0].code='0700.HK';hkCase.cfg.seats.list[0].members[0]='0700.HK';hkCase.cfg.budgetLedger.positions[0].code='0700.HK';hkCase.cfg.budgetLedger.issuers['0700.HK']=hkCase.cfg.budgetLedger.issuers['600000.SH'];delete hkCase.cfg.budgetLedger.issuers['600000.SH'];hkCase.cfg.holdings[0].costBasisStatus='verified';hkCase.cfg.holdings[0].settledCostCNYFen=5000000;hkCase.cfg.holdings[0].costBasisSource='broker';hkCase.quotes.whHKDCNY={price:.8,time:quoteTime}
const hkDecision=()=>core.decisionBudget(hkCase.cfg,hkCase.quotes,'0700.HK',{now:at})
near('verified HK fixture may pass with dated FX',hkDecision().approvedCNY,10000)
delete hkCase.quotes.whHKDCNY.time;check('HK FX without exchange time blocks',hkDecision().approvedCNY===0)
hkCase.quotes.whHKDCNY.time=quoteTime;delete hkCase.cfg.holdings[0].market;delete hkCase.cfg.holdings[0].costBasisSource;check('HK code cannot bypass cost proof by omitting market',hkDecision().approvedCNY===0)
const ah=fixture();ah.cfg.holdings[0].code='601318.SH';ah.cfg.holdings[0].shares=500;ah.cfg.universe[0].code='2318.HK';ah.cfg.seats.list[0].members[0]='2318.HK';ah.cfg.budgetLedger.positions[0].code='601318.SH';ah.cfg.budgetLedger.issuers['2318.HK']=ah.cfg.budgetLedger.issuers['600000.SH'];delete ah.cfg.budgetLedger.issuers['600000.SH'];ah.quotes.whHKDCNY={price:.8,time:quoteTime}
const combined=core.decisionBudget(ah.cfg,ah.quotes,'2318.HK',{now:at});near('A shares consume H listing issuer risk',combined.issuerValueCNY,45000);near('A shares also consume full shared seat',combined.seatValueCNY,85000)
const hk={code:'0700.HK',market:'HK',shares:100,cost:90,dps:5}
const v=core.holdingValue(hk,{price:100},0.8)
check('HK P/L missing without historical CNY cost',v.costCNY===null&&v.pl===null&&v.nativePl===1000)
const vh=core.holdingValue({...hk,costBasisStatus:'verified',settledCostCNYFen:900000,costBasisSource:'broker'},{price:100},0.8)
near('HK P/L includes actual historical FX:8000-9000',vh.pl,-1000)
check('missing A holding date has no assumed tax rate',core.taxRateOf({market:'A'},at).r===null)
check('known zero dividend is distinct from missing',core.dividendSummary(original.cfg,original.quotes,{gross:true}).value===null&&core.dividendSummary(original.cfg,original.quotes,{gross:true}).covered===1)
check('two-argument execution tiers never become returns',core.irrAt(90,[100,80,60])===null)
check('unaudited cashflow model absent',core.modelReturn(original.cfg.universe[0],90,at)===null)
// Independent closed-form terminal EPS and direct discounted cashflows; no call to modelFlows here.
const eps=.292,g=.03,pay=.95,exitPE=14,n=10,r=.12
const expected=Array.from({length:n},(_,i)=>eps*(1+g)**(i+1)*pay/(1+r)**(i+1)).reduce((a,b)=>a+b,0)+eps*(1+g)**n*exitPE/(1+r)**n
near('terminal EPS grows ten years once',core.priceAt(eps,g,pay,0,exitPE,r,n),expected)
near('priceAt and independent closed-form zero-growth IRR',core.irrOf(1,0,1,0,10,10,10),.1)
near('corrected original model IRR about7.917%',core.irrOf(eps,g,pay,0,exitPE,4.73,10),0.07917380141003838)
check('invalid finite model ranges return null',core.priceAt(1,.1,1.2,0,10,.1,10)===null&&core.irrOf(1,0,0,0,0,10,10)===null)
const dup={trades:[{date:'2026-10-24',code:'600000.SH',price:10,shares:100},{date:'2026-10-24',code:'600000.SH',price:10,shares:100}]}
check('duplicate candidates not deleted or marked completed',core.ledgerSummary(dup).duplicateCandidates.length===1&&core.tradeActivity(dup,'600000.SH',at).completedActionIds.length===0&&dup.trades.length===2)
const changed=mergePatch(original.cfg,{holdings:[{code:'600000.SH',shares:501}]})
check('normal save marks evidence stale without rewriting approval',changed.decisionInputsChanged&&changed.universe[0].executionApproval.dataRevision==='d1')
check('bounded provenance stores before and after',changed.changeHistory[0].changes.some(c=>c.path==='holdings.0.shares'&&c.before===500&&c.after===501))
for(const patch of [{targetCapital:1},{decisionDataRevision:'fake'},{budgetLedger:{}},{universe:[{code:'600000.SH',executionApproval:{status:'approved'}}]}]) { let rejected=false;try{mergePatch(original.cfg,patch)}catch(e){rejected=e.status===400}check('ordinary patch rejects protected keys '+Object.keys(patch)[0],rejected) }
const dp=mergePatch(original.cfg,{holdings:[{code:'600000.SH',dps:null}]});check('blank DPS remains unknown and unlocked',dp.holdings[0].dps===null&&!dp.holdings[0].dpsManual)
const dz=mergePatch(original.cfg,{holdings:[{code:'600000.SH',dps:0}]});check('explicit zero DPS remains manual zero',dz.holdings[0].dps===0&&dz.holdings[0].dpsManual)
const label=mergePatch(original.cfg,{universe:[{code:'600000.SH',bizTag:'测试标签'}]});check('business tag persists without altering planning capital',label.universe[0].bizTag==='测试标签'&&label.targetCapital===1000000)
;(async()=>{
 const f=fixture();f.cfg._revision=revisionOf(f.cfg)
 let reads=0,requested
 const service={read:async()=>{reads++;return copy(f.cfg)}}
 const preview=createDecisionPreview({configService:service,core,fetchQuotes:async symbols=>{requested=symbols;return {ok:true,quotes:f.quotes}},now:()=>at})
 const result=await preview({code:'600000.SH',revision:f.cfg._revision,approvedCNY:1e9})
 check('server recomputes and ignores client ceiling',result.readOnly&&result.decision.approvedCNY===10000&&reads===2&&requested.includes('qb'))
 check('receipt binds revision and expires in30seconds',result.revision===f.cfg._revision&&Date.parse(result.expiresAt)-at===30000)
 for(const [name,input,status] of [['missing version',{code:'600000.SH'},428],['stale version',{code:'600000.SH',revision:'b'.repeat(64)},409],['bad code',{code:'bad',revision:f.cfg._revision},400]]) {await assert.rejects(()=>preview(input),e=>e.status===status);check('server rejects '+name,true)}
 const offline=createDecisionPreview({configService:{read:async()=>({...copy(f.cfg),_syncStatus:'offline'})},core,fetchQuotes:async()=>({ok:true,quotes:f.quotes}),now:()=>at})
 check('offline config cannot approve', (await offline({code:'600000.SH',revision:f.cfg._revision})).decision.approvedCNY===0)
 const broken=createDecisionPreview({configService:service,core,fetchQuotes:async()=>{throw Error('timeout')},now:()=>at})
 check('quote outage returns visible blockers', (await broken({code:'600000.SH',revision:f.cfg._revision})).decision.blockers.length>0)
 let serial=0;const racing=createDecisionPreview({configService:{read:async()=>({...copy(f.cfg),_revision:++serial===1?f.cfg._revision:'c'.repeat(64)})},core,fetchQuotes:async()=>({ok:true,quotes:f.quotes}),now:()=>at})
 await assert.rejects(()=>racing({code:'600000.SH',revision:f.cfg._revision}),e=>e.status===409);check('config mutation while quotes loading cannot approve',true)
 // Local mode never touches cloud; an existing cloud journal is preserved and blocks writes.
 const files=new Map([['cfg',copy(f.cfg)]]),io={read:k=>{if(!files.has(k))throw Object.assign(Error(),{code:'ENOENT'});return copy(files.get(k))},write:(k,v)=>files.set(k,copy(v)),remove:k=>files.delete(k)}
 const local=createConfigService({file:'cfg',sourceMode:'local',io,store:{read:()=>{throw Error('cloud forbidden')}}})
 const first=await local.read();check('explicit VPS local source is truthful',first._sourceMode==='local'&&first._syncStatus==='local')
 const receipt=await local.save({cashYield:1},first._revision);check('local receipt has time revision and changed fields',receipt.sourceMode==='local'&&receipt.serverSavedAt&&receipt.changedFields.includes('cashYield')&&(await local.read()).decisionInputsChanged)
 files.set('cfg.pending',{baseRevision:revisionOf(f.cfg),cfg:copy(f.cfg)})
 const pending=createConfigService({file:'cfg',sourceMode:'local',io})
 check('old cloud journal survives local read',(await pending.read())._syncStatus==='local-pending-review'&&files.has('cfg.pending'))
 await assert.rejects(()=>pending.save({cashYield:2},receipt.revision),e=>e.status===409);check('pending journal blocks silent source switch',true)
 console.log('Decision safety: '+count+' checks passed')
})().catch(e=>{console.error(e);process.exitCode=1})
