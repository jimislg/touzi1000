#!/usr/bin/env node
/* Investor workflow regression. Supersedes assertions that required proxy approvals or tier-derived forecasts. */
const assert=require('node:assert/strict'),runtime=require('./test-web-runtime'),core=require('./public/investment-core')
let passed=0
function check(name,value){assert.ok(value,name);passed++;console.log('PASS '+name)}
const cfg={_revision:'a'.repeat(64),_sourceMode:'local',_syncStatus:'local',targetCapital:10000000,investable:8300000,cash:8300000,cashYield:1,annualContribution:500000,holdings:[{code:'600000.SH',qt:'qa',name:'合成A',market:'A',grade:'A',shares:170000,cost:10,dps:0,buyDate:'2020-01-01'},{code:'0700.HK',qt:'qh',name:'合成港股',market:'HK',grade:'A',shares:0,cost:90,dps:null}],universe:[{code:'600000.SH',qt:'qa',name:'合成A',grade:'A',buyPrice:11,plan:'历史确认买入1700股',tiers:[{label:'H10',price:11},{label:'H12',price:9},{label:'H15',price:8}],tierPct:[10,25,100]},{code:'0700.HK',qt:'qh',name:'合成港股',grade:'B',buyPrice:null}],seats:{list:[{key:'s',name:'共用席位',pct:20,members:['600000.SH','0700.HK']}]},trades:[{date:new Date().toISOString().slice(0,10),code:'600000.SH',shares:100,price:10}]}
const quotes={qa:{price:10,time:'20261023150000'},qh:{price:100,time:'20261023160000'},whHKDCNY:{price:.8}}
;(async()=>{
 const rt=runtime(cfg,quotes),{run,el,state,storage}=rt
 await run('loadConfig();');await run('refresh(false)')
 check('VPS data source and actual quote date visible',el('qualityText').textContent.includes('VPS')&&el('qualityText').textContent.includes('2026-10-23'))
 check('all modules render',el('posTable').innerHTML.includes('合成A')&&el('aTable').innerHTML.includes('合成A')&&el('seatTable').innerHTML.includes('共用席位'))
 check('five workspaces expose today only on load',rt.workspaces.filter(x=>!x.hidden).length===1&&!rt.workspaces[0].hidden)
 run("showWorkspace('research')");check('workspace changes visibility and accessibility',!rt.workspaces[2].hidden&&rt.nav[2]['aria-current']==='page')
 check('maintained reference prices visible without research gating',el('aTable').innerHTML.includes('四档参考价与原始批示')&&el('aTable').innerHTML.includes('H10')&&!el('aTable').innerHTML.includes('研究未知')&&!el('aTable').innerHTML.includes('研究待核'))
 check('current shares displayed apart from folded historical plan',el('aTable').innerHTML.includes('170000股')&&el('aTable').innerHTML.includes('四档参考价与原始批示'))
 check('no stage percentages converted to money',!el('aTable').innerHTML.includes('累计可投'))
 check('legacy default ladder is not a 100percent issuer limit',run('uniCap(CFG.universe[0])')===20)
 check('price hit does not mean completed trade',el('sigBox').innerHTML.includes('已到价·待审核')&&!el('sigBox').innerHTML.includes('已触发·已执行'))
 check('recent trade shown as unverified action',el('sigBox').innerHTML.includes('未核实本档完成'))
 check('evidence gaps block rather than proxy approve',run('budgetCalc("600000.SH").approvedCNY')===0&&el('deployTable').innerHTML.includes('未核准'))
 check('read-only previews warn against aggregating shared cash',el('deployNote').textContent.includes('多项不得叠加'))
 check('no forecast from self assigned tiers',run('fwdIrrOf(CFG.holdings[0])')===null&&!el('dashCards').innerHTML.includes('现实路径'))
 check('unknown HK historical cost not rendered as zero profit',el('posTable').innerHTML.includes('人民币成本待核'))
 check('risk room unit:17percent to20percent gives30万',el('posTable').innerHTML.includes('30.00 万'))
 run('posSort={k:"mv",dir:1};renderPos()');check('sorting retains original edit index',el('posTable').innerHTML.match(/<tbody><tr>[\s\S]*?data-h="(\d+)"/)[1]==='1')
 const capital=run('CFG.targetCapital');run('CFG.investable=8200000;markDirty()');check('cash edit leaves planning denominator unchanged',run('CFG.targetCapital')===capital)
 check('draft excludes protected policy and target capital',!('targetCapital' in JSON.parse(run('JSON.stringify(editablePatch())'))))
 check('draft persisted with expected revision',JSON.parse(storage.get('ip_pending_edit_v2')).expectedRevision===cfg._revision)
 await run('saveConfig()');check('save opens review and issues no POST',state.posts.length===0&&!el('saveReview').hidden)
 run('CFG.investable=8100000;markDirty()');await run('confirmSave()');check('changed draft invalidates prior review',state.posts.length===0&&el('saveText').textContent.includes('重新预览'))
 // Unknown result cannot be described as confirmed failure, and never retries automatically.
 state.postFail=true;await run('saveConfig()');await run('confirmSave()');check('lost receipt keeps draft and marks result unverified',state.posts.length===1&&run('dirty')&&el('saveText').textContent.includes('待核实'))
 const reloaded=runtime(cfg,quotes);reloaded.storage.set('ip_edit_mirror_v1',JSON.stringify({universe:{'0700.HK':{buyPrice:999,plan:'old'}}}));await reloaded.run('loadConfig()');check('old mirror cannot resurrect explicit null buyPrice',reloaded.run('CFG.universe[1].buyPrice===null'))
 reloaded.storage.set('ip_pending_edit_v2',JSON.stringify({expectedRevision:'b'.repeat(64),investable:1}));reloaded.run('restoreDraft()');check('stale revision draft cannot overwrite current state',reloaded.run('CFG.investable')===cfg.investable)
 run('dirty=false;fillCalcSel()');el('cSel').value='0';el('cEps').value='999';el('cSel').onchange();check('company switch clears operating assumptions',el('cEps').value==='')
 const snapshot=run('JSON.stringify(CFG)');run('runCalc()');check('empty assumptions are not zero model inputs',el('calcOut').textContent.includes('完整输入'))
 for(const [k,v]of Object.entries({cEps:1,cG:0,cPay:100,cTax:0,cX:10,cP:10}))el(k).value=String(v)
 run('runCalc()');check('readonly calculator computes valid independent scenario',el('calcOut').innerHTML.includes('10.00%')&&run('JSON.stringify(CFG)')===snapshot&&run('writeTier()')===false)
 el('scenarioR').value='0';run('runScenario()');check('zero return still includes annual contributions',el('scenarioOut').textContent.includes('1,480.00'))
 el('scenarioR').value='-5';run('runScenario()');check('negative return still renders finite contribution scenario',!el('scenarioOut').textContent.includes('NaN')&&el('scenarioOut').textContent.includes('条件情景'))
 // Same pure domain results on web and mini program.
 global.wx={request(){}};const mini=require('../invest-miniprogram/utils/store');mini.state.CFG=structuredClone(cfg);mini.state.Q=structuredClone(quotes)
 check('mini shows maintained tiers without research pills',mini.watchModel().rows.length===2&&mini.watchModel().rows.every(x=>!x.research)&&mini.watchModel().rows[0].tiers.length===3)
 check('mini uses real missing P/L instead of zero',mini.positionsModel().costTotal==='—'&&mini.indexModel().pl==='—')
 check('mini missing quote is not waiting',(()=>{delete mini.state.Q.qa;delete mini.state.CFG.universe[0].px;const row=mini.watchModel().rows.find(x=>x.code==='600000.SH');return row.status==='报价缺失'&&!row.waiting})())
 check('mini tier pills show maintained position caps only',mini.watchModel().rows.every(x=>x.tiers.every(t=>t.amt===''||/^≤[0-9.]+%$/.test(t.amt))))
 // Quote refresh and external changes remain atomic and draft protected (detailed races in test-refresh).
 run('dirty=false');state.cfg.investable=8000000;state.cfg._revision='b'.repeat(64);await run('refresh(false)');check('external config follows with matching complete quotes',run('CFG.investable')===8000000)
 run('CFG.investable=7999999;markDirty()');state.cfg.investable=7000000;await run('refresh(false)');check('unsaved draft protected from automatic follow',run('CFG.investable')===7999999)
 const old=run('Q'),last=run('lastFetch');delete state.quotes.whHKDCNY;await run('refresh(false)');check('incomplete quote group preserves prior group and date',run('Q')===old&&run('lastFetch')===last)
 check('cashflow return and execution price remain separate',core.irrAt(10,[11,9,8])===null)
 console.log('Investor workflow: '+passed+' checks passed')
})().catch(e=>{console.error(e);process.exitCode=1})
