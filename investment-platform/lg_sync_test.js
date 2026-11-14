#!/usr/bin/env node
/* Investor workflow regression. Supersedes assertions that required proxy approvals or tier-derived forecasts. */
const assert=require('node:assert/strict'),runtime=require('./test-web-runtime'),core=require('./public/investment-core')
let passed=0
function check(name,value){assert.ok(value,name);passed++;console.log('PASS '+name)}
const cfg={_revision:'a'.repeat(64),_sourceMode:'local',_syncStatus:'local',targetCapital:10000000,investable:8300000,cash:8300000,cashYield:1,annualContribution:500000,holdings:[{code:'600000.SH',qt:'qa',name:'合成A',market:'A',grade:'A',shares:170000,cost:10,dps:0,buyDate:'2020-01-01'},{code:'0700.HK',qt:'qh',name:'合成港股',market:'HK',grade:'A',shares:0,cost:90,dps:null}],universe:[{code:'600000.SH',qt:'qa',name:'合成A',grade:'A',buyPrice:11,plan:'历史确认买入1700股',bizType:'品牌消费',bizTag:'测试 · 合成',tiers:[{label:'H10',price:11},{label:'H12',price:9},{label:'H15',price:8}],tierPct:[10,25,100]},{code:'0700.HK',qt:'qh',name:'合成港股',grade:'B',buyPrice:null,bizType:'平台零售',bizTag:'测试 · 港股'}],seats:{list:[{key:'s',name:'共用席位',pct:20,members:['600000.SH','0700.HK']}]},trades:[{date:new Date().toISOString().slice(0,10),code:'600000.SH',shares:100,price:10}]}
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
 check('price hit does not mean completed trade',el('sigBox').innerHTML.includes('已到价')&&!el('sigBox').innerHTML.includes('已触发·已执行'))
 check('recent trade shown as unverified action',el('sigBox').innerHTML.includes('未核实本档完成'))
 check('evidence gaps block rather than proxy approve',run('budgetCalc("600000.SH").approvedCNY')===0&&el('deployTable').innerHTML.includes('未核准'))
 check('read-only previews warn against aggregating shared cash',el('deployNote').textContent.includes('多项不得叠加'))
 check('no forecast from self assigned tiers',run('fwdIrrOf(CFG.holdings[0])')===null&&!el('dashCards').innerHTML.includes('现实路径'))
 check('HK cost computed from RMB cost basis, no pending tag',!el('posTable').innerHTML.includes('人民币成本待核'))
 check('risk room unit:17percent to20percent gives30万',el('posTable').innerHTML.includes('30.00 万'))
 run('posSort={k:"mv",dir:1};renderPos()');check('sorting retains original edit index',el('posTable').innerHTML.match(/<tbody><tr>[\s\S]*?data-h="(\d+)"/)[1]==='1')
 const capital=run('CFG.targetCapital');run('CFG.investable=8200000;markDirty()');check('cash edit leaves planning denominator unchanged',run('CFG.targetCapital')===capital)
 check('draft excludes protected policy and target capital',!('targetCapital' in JSON.parse(run('JSON.stringify(editablePatch())'))))
 check('draft persisted with expected revision',JSON.parse(storage.get('ip_pending_edit_v2')).expectedRevision===cfg._revision)
 await run('saveConfig()');check('one-click save posts immediately (郎刚11-14指令：点保存直接生效)',state.posts.length===1)
 run('CFG.investable=8100000;markDirty()');await run('saveConfig()');check('edit-then-save posts again without review gate',state.posts.length===2&&state.posts[1].investable===8100000)
 // Unknown result cannot be described as confirmed failure, and never retries automatically.
 run('CFG.investable=8200000;markDirty()');state.postFail=true;await run('saveConfig()');check('lost receipt keeps draft and marks result unverified',state.posts.length===3&&run('dirty')&&el('saveText').textContent.includes('待核实'));run('CFG.investable=8300000;dirty=false')
 const reloaded=runtime(cfg,quotes);reloaded.storage.set('ip_edit_mirror_v1',JSON.stringify({universe:{'0700.HK':{buyPrice:999,plan:'old'}}}));await reloaded.run('loadConfig()');check('old mirror cannot resurrect explicit null buyPrice',reloaded.run('CFG.universe[1].buyPrice===null'))
 reloaded.storage.set('ip_pending_edit_v2',JSON.stringify({expectedRevision:'b'.repeat(64),investable:1}));reloaded.run('restoreDraft()');check('stale revision draft cannot overwrite current state',reloaded.run('CFG.investable')===cfg.investable)
 run('dirty=false;fillCalcSel()');el('cSel').value='0';el('cEps').value='999';el('cSel').onchange();check('company switch clears operating assumptions',el('cEps').value==='')
 const snapshot=run('JSON.stringify(CFG)');run('runCalc()');check('empty assumptions are not zero model inputs',el('calcOut').textContent.includes('完整输入'))
 for(const [k,v]of Object.entries({cEps:1,cG:0,cPay:100,cTax:0,cX:10,cP:10}))el(k).value=String(v)
 run('runCalc()');check('readonly calculator computes valid independent scenario',el('calcOut').innerHTML.includes('10.00%')&&run('JSON.stringify(CFG)')===snapshot&&run('writeTier()')===false)
 run('CFG.investable=8100000')/*一键保存后显式锚定investable：情景期望值不再隐式依赖前序保存是否成功(郎刚11-14)*/;el('scenarioR').value='0';run('runScenario()');check('zero return still includes annual contributions',el('scenarioOut').textContent.includes('1,480.00'))
 el('scenarioR').value='-5';run('runScenario()');check('negative return still renders finite contribution scenario',!el('scenarioOut').textContent.includes('NaN')&&el('scenarioOut').textContent.includes('条件情景'))
 // Same pure domain results on web and mini program.
 global.wx={request(){}};const mini=require('../invest-miniprogram/utils/store');mini.state.CFG=structuredClone(cfg);mini.state.Q=structuredClone(quotes)
 check('mini shows maintained tiers without research pills',mini.watchModel().rows.length===2&&mini.watchModel().rows.every(x=>!x.research)&&mini.watchModel().rows[0].tiers.length===3)
 mini.state.CFG.holdings[1].shares=100
 check('mini HK cost computed from RMB basis, no pending note',mini.positionsModel().rows.find(x=>x.code==='0700.HK').cost==='0.9'&&mini.indexModel().plNote==='')
 check('mini missing quote is not waiting',(()=>{delete mini.state.Q.qa;delete mini.state.CFG.universe[0].px;const row=mini.watchModel().rows.find(x=>x.code==='600000.SH');return row.status==='报价缺失'&&!row.waiting})())
 check('mini tier pills show position caps as amounts (planning-capital based)',mini.watchModel().rows.every(x=>x.tiers.every(t=>t.amt===''||/^≤[0-9,.]+万$/.test(t.amt)))&&mini.seatsModel().seats[0].members[0].pills[0].amt.includes('万'))
 // 郎刚10-25晚：股票池罗列分类筛选（与观察页同源：全部/已到价/接近/等待/持仓/未持仓/退出观察）
 check('web signal pool has grouped filter buttons with counts',el('sigBox').innerHTML.includes('fbtnrow')&&/已到价\s*\d+/.test(el('sigBox').innerHTML)&&/接近\s*\d+/.test(el('sigBox').innerHTML)&&/等待\s*\d+/.test(el('sigBox').innerHTML))
 run('setSigFilter("trig")');check('web signal filter narrows rows to triggered only',(el('sigBox').innerHTML.match(/<tbody><tr><td>/g)||[]).length===run('CFG.universe.filter(u=>{const x=Q[u.qt];return x&&x.price>0&&u.buyPrice!=null&&x.price<=u.buyPrice}).length'))
 run('setPoolFilter("near")');check('web research pool has grouped status filter',el('poolFilterRow').innerHTML.includes('退出观察')&&/接近\s*\d+/.test(el('poolFilterRow').innerHTML))
 check('mini home watch exposes same filter groups as watch page',mini.watchModel({},'trig').rows.every(x=>x.trig)&&mini.watchModel({},'all').filters.length>=9&&mini.watchModel({},'all').filters.some(f=>f.label==='已到参考价'&&f.count===mini.watchModel({},'trig').rows.length))
 // 郎刚10-25晚：个股清单凡有持仓必带持仓金额（市值），方便与参考价对比
 run('setPoolFilter("all")')
 check('web research pool shows holding value on held rows',el('aTable').innerHTML.includes('170000股 · 170.0万'))
 check('web signal pool shows holding value on held rows',el('sigBox').innerHTML.includes('持 170.0万'))
 check('mini watch rows show holding value on held rows',(mini.state.Q.qa=structuredClone(quotes.qa),mini.watchModel().rows.find(x=>x.code==='600000.SH').mv==='170.0万'))
 // 郎刚11-01：股票池按距离买入价升序（溢价率=现价/买入价-1），已跌穿最前，未定价殿后
 check('stock pools sorted by distance to buy price',/（[低高][0-9.]+%）/.test(el('sigBox').innerHTML)&&(()=>{const ds=mini.watchModel().rows.map(x=>x.distancePct);const finite=ds.filter(d=>d!=null);return finite.every((d,i)=>i===0||finite[i-1]<=d)&&ds[ds.length-1]===null})())
 // 郎刚11-01：生意分类与价格状态两套筛选并行叠加（bizType结构化字段+网页biz chips+mini第三参）
 check('biz classification filters overlay price filters',el('sigBox').innerHTML.includes('setBizFilter')&&el('sigBox').innerHTML.includes('品牌消费')&&(()=>{const m=mini.watchModel({},'all','品牌消费');const bizCount=m.bizFilters.find(x=>x.key==='品牌消费');const nonAll=m.bizFilters.filter(x=>x.key!=='all').reduce((s,x)=>s+x.count,0);return m.rows.every(x=>x.bizType==='品牌消费')&&m.rows.length===bizCount.count&&bizCount.count>0&&nonAll===m.bizFilters.find(x=>x.key==='all').count})())
 // 郎刚11-04：持仓成本与行情解耦（GPT诊断报告落地）——缺行情时成本仍显示、覆盖计数明示；缺成本显示"成本待补录"而非混入行情缺失
 check('positions cost decoupled from quotes',(()=>{const savedQ=mini.state.Q;mini.state.Q={};const pm=mini.positionsModel();const a=pm.rows.find(x=>x.code==='600000.SH');const okNoQuote=a.px==='—'&&a.cost==='170.0'&&pm.costCov.includes('成本覆盖 2/2')&&pm.costCov.includes('行情覆盖 0/2');mini.state.CFG.holdings[0].cost=null;const missing=mini.positionsModel().rows.find(x=>x.code==='600000.SH').cost==='成本待补录';mini.state.CFG.holdings[0].cost=10;mini.state.Q=savedQ;return okNoQuote&&missing})())
 // Quote refresh and external changes remain atomic and draft protected (detailed races in test-refresh).
 run('dirty=false');state.cfg.investable=8000000;state.cfg._revision='b'.repeat(64);await run('refresh(false)');check('external config follows with matching complete quotes',run('CFG.investable')===8000000)
 run('CFG.investable=7999999;markDirty()');state.cfg.investable=7000000;await run('refresh(false)');check('unsaved draft protected from automatic follow',run('CFG.investable')===7999999)
 const old=run('Q'),last=run('lastFetch');delete state.quotes.whHKDCNY;await run('refresh(false)');check('incomplete quote group preserves prior group and date',run('Q')===old&&run('lastFetch')===last)
 check('cashflow return and execution price remain separate',core.irrAt(10,[11,9,8])===null)
 const cfgArr=structuredClone(cfg);cfgArr.universe[0].plan=['历史批示数组'];const rtArr=runtime(cfgArr,structuredClone(quotes));await rtArr.run('loadConfig()');const patchArr=JSON.parse(rtArr.run('JSON.stringify(editablePatch())'));check('历史数组型plan归一化为文本，不随每次保存带出非法patch',patchArr.universe[0].plan==='历史批示数组')
 console.log('Investor workflow: '+passed+' checks passed')
})().catch(e=>{console.error(e);process.exitCode=1})
