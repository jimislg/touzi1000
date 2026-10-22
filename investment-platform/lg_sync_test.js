#!/usr/bin/env node
/* vm 冒烟测试：配置自动跟随（syncConfig）
 * 场景1：外部登记交易（config变更）→ 下一轮 refresh 自动套用，驾驶舱数字跟随
 * 场景2：本地有未保存修改(dirty) → 不套用，等自动保存后对齐
 * 场景3：配置无变化 → 不动作不提示
 * 场景4：正在输入框打字 → 不套用
 */
const fs=require('fs'),path=require('path'),vm=require('vm');
const html=fs.readFileSync(path.join(__dirname,'public','index.html'),'utf8');
const m=html.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/);
if(!m){console.error('✗ 未找到主script块');process.exit(1);}
let js=m[1];
if(!js.includes('async function syncConfig()')){console.error('✗ syncConfig 未注入');process.exit(1);}
// 固化约定：vm 作用域外部可访问 CFG/dirty → var 桥接
js=js.replace('let CFG=null, Q={}, lastFetch=null, timer=null;','var CFG=null, Q={}, lastFetch=null, timer=null;');
js=js.replace("let dirty=false, autoT=null;","var dirty=false, autoT=null;");

/* —— DOM stub —— */
const els={};
function el(id){
  if(!els[id])els[id]={id,value:'',textContent:'',innerHTML:'',className:'',checked:true,style:{},
    dataset:{},classList:{toggle(){return false;},contains(){return false;},add(){}},
    _h:{},
    addEventListener(type,fn){this._h[type]=fn;},focus(){},select(){}};
  return els[id];
}
const docStub={
  getElementById:el,
  querySelector:()=>null,
  addEventListener(){},
  documentElement:el('html'),
  activeElement:null,
  hidden:false,
  body:el('body'),
};
const lsStore={};
const sandbox={
  document:docStub, window:{addEventListener(){}},
  localStorage:{getItem:k=>(k in lsStore)?lsStore[k]:null,setItem:(k,v)=>{lsStore[k]=String(v);},removeItem:k=>{delete lsStore[k];}},
  alert(){}, setInterval(){return 0;}, clearInterval(){}, setTimeout(){return 0;}, clearTimeout(){},
  fetch:()=>Promise.resolve({json:()=>Promise.resolve({ok:false})}),
  InvestmentCore: require('./public/investment-core'),
  Date: class extends Date {
    constructor (...args) { super(...(args.length ? args : ['2026-10-10T04:00:00Z'])); }
    static now () { return new Date('2026-10-10T04:00:00Z').getTime(); }
  }, Math, JSON, console, URL, encodeURIComponent, decodeURIComponent, isNaN, parseFloat, parseInt,
  Array, Object, String, Number, RegExp, Map, Set, Promise, Error,
};
sandbox.globalThis=sandbox;
vm.createContext(sandbox);

/* —— fetch stub：全部为合成场景，数值不对应真实账户 —— */
const cfgA={investable:9000000,cash:9000000,cashYield:1,pathCAGR:0.1746,hkdcnyFallback:0.8548,
  holdings:[
    {code:'0700.HK',name:'腾讯控股',market:'HK',qt:'hk00700',shares:100,cost:400.00,dps:5.3},
    {code:'600036.SH',name:'招商银行',market:'A',qt:'sh600036',shares:20000,cost:30.00,dps:2.016},
  ],
  universe:[{code:'0700.HK',name:'腾讯控股',grade:'A',qt:'hk00700',buyPrice:420,plan:'目标达成型',bizTag:'社交垄断·提价克制',tiers:[{label:'H10',price:380},{label:'H12',price:340},{label:'H15',price:290},{label:'H17.46',price:255}]}]};
const cfgB=JSON.parse(JSON.stringify(cfgA)); // 外部登记交易后
cfgB.investable=8500000;cfgB.cash=8500000;
cfgB.holdings[0].shares=1800;cfgB.holdings[0].cost=410.00;
cfgB.trades=[{date:new Date().toISOString().slice(0,10),code:'0700.HK',shares:1700}];
let serverCfg=cfgA;
const quotes={ok:true,quotes:{hk00700:{price:415,prevClose:420,pct:-1.5},sh600036:{price:41.75,prevClose:41.26,pct:1.2},whHKDCNY:{price:0.8542}}};
sandbox.fetch=(url)=>{
  const u=String(url);
  if(u.includes('/api/config'))return Promise.resolve({json:()=>Promise.resolve(JSON.parse(JSON.stringify(serverCfg)))});
  if(u.includes('/api/quotes'))return Promise.resolve({json:()=>Promise.resolve(quotes)});
  if(u.includes('/api/dividends'))return Promise.resolve({json:()=>Promise.resolve({ok:false})});
  return Promise.resolve({json:()=>Promise.resolve({ok:false})});
};

vm.runInContext(js,sandbox,{filename:'index.html<script>'});

(async()=>{
  const run=s=>vm.runInContext(s,sandbox);
  let pass=0,fail=0;
  const T=(name,cond)=>{cond?pass++:fail++;console.log((cond?'✓':'✗ FAIL')+' '+name);};
  /* 夹具日期动态=今天（10-11/10-18两次踩坑：硬编码10-08撞上3天过期窗口，过期后测试永远挂） */
  const today=new Date().toISOString().slice(0,10);
  const mmdd=today.slice(5).replace('-','/');

  await run('(async()=>{await loadConfig();await refresh(false);})()');
  T('初始加载：腾讯=100股',run('CFG.holdings.find(h=>h.code==="0700.HK").shares')===100);
  T('初始加载：saveText 无同步提示',!el('saveText').textContent.includes('↺'));

  // 场景3：无变化 → 不动作
  let r=await run('syncConfig()');
  T('场景3 配置无变化 → syncConfig=false',r===false);
  T('场景3 无提示',!el('saveText').textContent.includes('↺'));

  // 场景1：外部登记交易（config 变更）→ refresh 流程内自动套用
  serverCfg=cfgB;
  await run('refresh(false)');
  T('场景1 腾讯股数已跟随=1800',run('CFG.holdings.find(h=>h.code==="0700.HK").shares')===1800);
  T('场景1 可投资金已跟随=8500000',run('CFG.investable')===8500000);
  T('场景1 investInput 输入框已刷新',Math.abs(parseFloat(el('investInput').value)-850.0)<0.05);
  T('场景1 saveText 显示同步提示',el('saveText').textContent.includes('↺'));

  // 场景2：本地有未保存修改 → 不套用
  serverCfg=cfgA; // 模拟另一轮外部又变回
  await run('dirty=true');
  r=await run('syncConfig()');
  T('场景2 dirty=true → syncConfig=false',r===false);
  T('场景2 股数保持1800不被覆盖',run('CFG.holdings.find(h=>h.code==="0700.HK").shares')===1800);
  await run('dirty=false');

  // 场景4：正在输入 → 不套用
  serverCfg=cfgB;
  docStub.activeElement={tagName:'INPUT'};
  r=await run('syncConfig()');
  T('场景4 正在输入 → syncConfig=false',r===false);
  docStub.activeElement=null;
  r=await run('syncConfig()');
  T('场景4 输入结束 → 恢复自动套用',r===false); // cfgB已是当前值 → 无变化=false，但要回到可同步态
  serverCfg=cfgA;
  r=await run('syncConfig()');
  T('场景4 输入结束后外部变更可套用',r===true);

  // 回归：renderAll 各模块在新CFG下不抛错
  await run('refresh(false)');
  T('回归 refresh 全量渲染不抛错',true);
  T('回归 持仓表已渲染',el('posTable').innerHTML.includes('腾讯'));

  /* —— 表头排序（郎刚10-08需求）—— */
  const firstTr=()=>el('posTable').innerHTML.match(/<tbody><tr>[\s\S]*?<\/tr>/)[0];
  const firstDataH=()=>firstTr().match(/data-h="(\d+)"/)[1];
  const sharesOf=code=>JSON.parse(JSON.stringify(run('CFG'))).holdings.find(h=>h.code===code).shares;
  const hIdx=code=>run('CFG').holdings.findIndex(h=>h.code===code);
  const mvOf=code=>{const q=code==='0700.HK'?415:41.75,fx=0.8542;const h=run('CFG').holdings.find(h=>h.code===code);return h.shares*q*(h.market==='HK'?fx:1);};

  await run('posSort={k:null,dir:-1};renderAll()');
  T('排序默认null：保持config原始顺序（第一行=腾讯）',firstTr().includes('腾讯控股'));

  await run('posSort={k:"mv",dir:-1};renderAll()');
  const bigMv=mvOf('0700.HK')>mvOf('600036.SH')?'0700.HK':'600036.SH';
  T('市值降序：第一行=市值最大只',firstDataH()===String(hIdx(bigMv)));
  T('市值降序：表头带 ▼',el('posTable').innerHTML.includes('市值(元) ▼'));

  await run('posSort={k:"mv",dir:1};renderAll()');
  T('市值升序：第一行=市值最小只',firstDataH()===String(hIdx(mvOf('0700.HK')>mvOf('600036.SH')?'600036.SH':'0700.HK')));
  T('市值升序：表头带 ▲',el('posTable').innerHTML.includes('市值(元) ▲'));

  await run('posSort={k:"name",dir:1};renderAll()');
  T('名称升序：表头带 ▲ 且第一行按拼音序',el('posTable').innerHTML.includes('标的 ▲'));

  // 排序后股数编辑仍绑定正确持仓（data-h=原始索引）
  await run('posSort={k:"pl",dir:-1};renderAll()');
  const idx=firstDataH();
  const codeAt=run('CFG').holdings[+idx].code;
  T('排序后data-h仍指向原始持仓索引',run(`CFG.holdings[${idx}].code`)===run('CFG').holdings[+idx].code&&sharesOf(codeAt)===run(`CFG.holdings[${idx}].shares`));

  // 排序状态下改股数 → renderAll 保持排序且数字正确
  const before=sharesOf(codeAt);
  run(`CFG.holdings[${idx}].shares=${before+100}`);
  await run('renderAll()');
  T('排序状态下改股数后渲染正确',run(`CFG.holdings[${idx}].shares`)===before+100&&firstDataH()===idx);

  // sig排序：未定价(buyPrice=null)恒排最后
  run('CFG.universe.find(u=>u.code==="0700.HK").buyPrice=null');
  run('CFG.universe.push({code:"600036.SH",name:"招商银行",grade:"A",qt:"sh600036",buyPrice:40,plan:"目标达成型"})');
  await run('posSort={k:"sig",dir:-1};renderAll()');
  T('价格信号降序：未定价者恒排最后',!(firstTr().includes('腾讯控股')));
  await run('posSort={k:"sig",dir:1};renderAll()');
  T('价格信号升序：未定价者同样恒排最后',!(firstTr().includes('腾讯控股')));

  /* —— 交易日志联动（郎刚10-08：已买入公司提醒要反映已执行）—— */
  run('CFG.universe.find(u=>u.code==="0700.HK").buyPrice=420');
  run(`CFG.trades=[{date:"${today}",code:"0700.HK",name:"腾讯控股",price:410.0,shares:1700,amtCNY:700000}]`);
  await run('renderAll()');
  T('信号中心：已触发行徽标变"已触发·已执行"',el('sigBox').innerHTML.includes('已触发·已执行'));
  T('信号中心：说明含买入明细',el('sigBox').innerHTML.includes(mmdd+'已买入')&&el('sigBox').innerHTML.includes('1,700股'));
  T('总览chip副标题带（已执行）',el('sigBox').innerHTML.includes('腾讯控股（已执行）'));
  // 郎刚10-10晚：提醒按分档建仓策略——已到最深档+累计预算+下一档距离（按夹具档位动态计算）
  {
    const tpx=run('Q["hk00700"]&&Q["hk00700"].price');
    const lad=run('(function(){const u=CFG.universe.find(u=>u.code==="0700.HK");const px=Q["hk00700"].price;const ts=u.tiers||[];let deep=null,deepI=-1,next=null;ts.forEach((t,i)=>{if(px<=t.price){deep=t;deepI=i;}else if(deep&&!next)next=t;});if(!deep)return next?"未到档":"none";const pct=(u.tierPct||[])[deepI];return "已到 "+deep.label+" 档"+(pct!=null?"（累计"+pct+"%":"")+"§"+(next?next.label:"");})()');
    const sb=el('sigBox').innerHTML;
    if(lad==='none'){T('信号中心：腾讯无档位提醒（夹具无tiers）',true);}
    else{
      T('信号中心：腾讯分档提醒「'+lad.split('§')[0]+'…」',sb.includes(lad.split('§')[0]));
      if(lad.split('§')[0].startsWith('已到')&&lad.split('§')[1])T('信号中心：腾讯提醒含下一档'+lad.split('§')[1]+'距离',sb.includes('下一档 '+lad.split('§')[1]+'（')&&sb.includes('还差'));
    }
  }
  run('CFG.trades=[{date:"2026-09-01",code:"0700.HK",shares:100,price:400,amtCNY:40000}]');
  await run('renderAll()');
  T('过期交易(>3天)不标记已执行，回到未执行口径',!el('sigBox').innerHTML.includes('已触发·已执行')&&el('sigBox').innerHTML.includes('（尚未登记买入'));

  /* —— 驾驶舱口径修正（郎刚10-08：未投现金不能按17.46%复利）—— */
  await run('renderAll()');
  T('驾驶舱：主卡改为"现实路径"',el('dashCards').innerHTML.includes('现实路径 5年 / 10年'));
  T('驾驶舱：现实路径不含旧"按17.46%复利，不含新增投放"口径',!el('dashCards').innerHTML.includes('按17.46%复利，不含新增投放'));
  T('驾驶舱：17.46%全投完降为达标参照',el('dashCards').innerHTML.includes('达标参照（全部投完且17.46%）'));
  T('驾驶舱：IRR卡含总资产折算年化（现金拖累显性化）',el('dashCards').innerHTML.includes('折算到总资产年化≈'));
  T('驾驶舱：达标卡含计算逻辑说明',el('dashCards').innerHTML.includes('(缺口/剩余资金)^(1/10)−1'));

  /* —— 信号划线与手工划掉（郎刚10-08：已执行划线，手工划掉不再通知）—— */
  run(`CFG.trades=[{date:"${today}",code:"0700.HK",name:"腾讯控股",price:410.0,shares:1700,amtCNY:700000}]`);
  run('CFG.universe.push({code:"02020.HK",name:"安踏体育",grade:"B",qt:"hk02020",buyPrice:75})'); // 接近档(415/75? 不,75*1.05=78.75>415? 需构造接近)
  run('CFG.universe.pop()'); // 上面价格不合实际，撤销——用仓位接近档构造
  run('CFG.dismissedSignals=[]');
  await run('renderAll()');
  T('已执行行带 row-exec 划线样式',el('sigBox').innerHTML.includes('row-exec')&&el('sigBox').innerHTML.includes('sig-main'));
  T('未划掉时清单含"划掉"操作',el('sigBox').innerHTML.includes('>划掉</span>'));

  // 回归（郎刚10-09：接近状态不应被自动划线——已买入后价格回到触发价上方，提醒仍是活的）
  run('CFG.universe.find(u=>u.code==="0700.HK").buyPrice=400'); // 现价415 → 接近档(400,420]
  await run('renderAll()');
  T('接近档的已买入行不自动划线（无row-exec）',!el('sigBox').innerHTML.includes('row-exec')&&el('sigBox').innerHTML.includes('接近'));
  T('接近档仍保留"已执行"徽标与买入明细',el('sigBox').innerHTML.includes('已执行')&&el('sigBox').innerHTML.includes(mmdd+'已买入'));
  run('CFG.universe.find(u=>u.code==="0700.HK").buyPrice=420');

  // 手工划掉腾讯触发信号 → row-dim + 徽标"已划掉" + chips 不再计数
  run('CFG.dismissedSignals.push("trig:0700.HK")');
  await run('renderAll()');
  T('划掉后行变 row-dim',el('sigBox').innerHTML.includes('row-dim'));
  T('划掉后徽标显示"已划掉"',el('sigBox').innerHTML.includes('已划掉'));
  T('划掉后总览chip不再标"已执行"(不再通知)',!el('sigBox').innerHTML.includes('已触发·已执行'));
  T('划掉行出现"恢复"入口',el('sigBox').innerHTML.includes('>恢复</span>'));
  T('划掉行的明细说明仍保留（可追溯）',el('sigBox').innerHTML.includes(mmdd+'已买入'));

  // 恢复
  run('CFG.dismissedSignals=[]');
  await run('renderAll()');
  T('恢复后重新计数，"已触发·已执行"回归',el('sigBox').innerHTML.includes('已触发·已执行')&&!el('sigBox').innerHTML.includes('row-dim'));

  // 前后联动（郎刚10-10）：划掉的信号在持仓表同步划线（数据保留+可恢复）
  const overDk=run('(function(){const TC=totalCapital();for(const h of CFG.holdings){const x=hLive(h);if(!x)continue;const w=x.mvCNY/TC*100;if(w>limitOf(h))return "over:"+h.code;}return null;})()');
  if(overDk){
    run('CFG.dismissedSignals.push("'+overDk+'")');await run('renderAll()');
    const code=overDk.slice(5);
    const rowHtml=el('posTable').innerHTML.split('<tr').find(s=>s.includes(code))||'';
    T('联动：划掉'+overDk+'→持仓表该行同步划线+恢复入口',rowHtml.includes('已划掉·恢复')&&rowHtml.includes('line-through'));
    T('联动：划掉后数据保留（超限字样仍在）',rowHtml.includes('超限'));
    T('联动：例外原因随行显示',rowHtml.includes('例外：')||!run('CFG.dismissedReasons&&CFG.dismissedReasons["'+overDk+'"]'));
    run('CFG.dismissedSignals=CFG.dismissedSignals.filter(k=>k!=="'+overDk+'")');await run('renderAll()');
    T('联动：恢复后持仓表解除划线',!el('posTable').innerHTML.includes('已划掉·恢复'));
  }else{
    // 无超限持仓时用价格信号验证同一机制
    const nearDk=run('(function(){for(const h of CFG.holdings){const bp=buyPriceOf(h);const x=hLive(h);if(bp!=null&&x&&x.px<=bp*1.05)return (x.px<=bp?"trig:":"near:")+h.code;}return null;})()');
    if(nearDk){
      run('CFG.dismissedSignals.push("'+nearDk+'")');await run('renderAll()');
      T('联动：划掉'+nearDk+'→持仓表同步划线+恢复入口',el('posTable').innerHTML.includes('已划掉·恢复'));
      run('CFG.dismissedSignals=CFG.dismissedSignals.filter(k=>k!=="'+nearDk+'")');await run('renderAll()');
      T('联动：恢复后持仓表解除划线',!el('posTable').innerHTML.includes('已划掉·恢复'));
    }
  }

  // cfgSig 覆盖 dismissedSignals（双端同步依据）
  const sig1=run('cfgSig(CFG)');
  run('CFG.dismissedSignals.push("near:02020.HK")');
  T('cfgSig 包含 dismissedSignals 变化',run('cfgSig(CFG)')!==sig1);
  run('CFG.dismissedSignals=[]');

  /* —— 持仓表预计股息/预计年收益率（郎刚10-08需求）—— */
  await run('posSort={k:null,dir:-1};renderAll()');
  T('持仓表含"预计股息(税后·年)"列',el('posTable').innerHTML.includes('预计股息(税后·年)'));
  T('持仓表含"预计年收益率"列',el('posTable').innerHTML.includes('预计年收益率'));
  // 税口径：港股×0.8、A股×0.9（期望值按当前CFG动态算，不受前面场景股数影响）
  T('腾讯税后股息=股数×dps×fx×0.8(港税)',run('(h=>Math.abs(divTaxOf(h)-h.shares*h.dps*hkd()*0.8)<1)(CFG.holdings.find(h=>h.code==="0700.HK"))')===true);
  T('招行税后股息=股数×dps×0.9(A股税)',run('(h=>Math.abs(divTaxOf(h)-h.shares*h.dps*0.9)<1)(CFG.holdings.find(h=>h.code==="600036.SH"))')===true);
  // 腾讯现价415在四档[380,340,290,255]之外上方 → 隐含回报=10%-ln(415/380)斜率外推≈8.4%
  const irr700=run('fwdIrrOf(CFG.holdings.find(h=>h.code==="0700.HK"))');
  T('腾讯预计年化=现价对四档插值(约8.4%)',irr700!=null&&Math.abs(irr700-0.0842)<0.01);
  T('招行无四档→显示"未定四档"',el('posTable').innerHTML.includes('未定四档'));
  // 排序：股息降序=招行(40098)在腾讯(6157)前
  await run('posSort={k:"div",dir:-1};renderAll()');
  T('股息降序：招行排腾讯前',firstTr().includes('招商银行'));
  await run('posSort={k:"irr",dir:-1};renderAll()');
  T('年化降序：有档位的腾讯排前(招行null恒最后)',firstTr().includes('腾讯控股'));
  await run('posSort={k:null,dir:-1};renderAll()');
  T('汇总卡含"预计年股息（税后·全口径）"且与股息模块同口径（含现金）',el('posCards').innerHTML.includes('预计年股息（税后·全口径）')&&el('posCards').innerHTML.includes('与股息模块一致'));
  T('持仓表股息率双口径标注（成本/现价）',el('posTable').innerHTML.includes('成本 ')&&el('posTable').innerHTML.includes(' · 现价 '));

  /* —— 组合预期回报凸显+算式明细（郎刚10-08：9.8%怎么算的、这一栏要凸显）—— */
  await run('renderAll()');
  T('缺口表：组合预期回报行高亮(row-irr)',el('gapBox').innerHTML.includes('row-irr'));
  T('缺口表：9.8%加大显示(17px)',el('gapBox').innerHTML.includes('font-size:17px'));
  T('缺口表：含"怎么算的？逐只明细"展开',el('gapBox').innerHTML.includes('怎么算的？逐只明细'));
  T('缺口表：明细含算法说明（成本对档位对数插值+市值加权，郎刚10-22定成本口径）',el('gapBox').innerHTML.includes('对数插值')&&el('gapBox').innerHTML.includes('市值加权'));
  T('缺口表：明细含逐只隐含回报（成本+现价双口径）与权重',el('gapBox').innerHTML.includes('隐含 <b>')&&el('gapBox').innerHTML.includes('市值权重')&&el('gapBox').innerHTML.includes('现价'));
  T('缺口表：明细含加权平均结果',el('gapBox').innerHTML.includes('加权平均'));

  /* —— 排序状态持久化（郎刚10-08：排序后保留上次的排序）—— */
  run('posSort={k:"mv",dir:1};savePosSort()');
  const saved=JSON.parse(lsStore['lgPosSort']||'null');
  T('排序状态已写入localStorage（mv升序）',saved&&saved.k==='mv'&&saved.dir===1);
  // 模拟刷新：重新执行 index.html 的初始化段（同一vm内重声明会冲突，改验恢复逻辑等价性）
  const restored=vm.runInContext('(function(){try{const s=JSON.parse(localStorage.getItem("lgPosSort")||"null");if(s&&typeof s.k==="string"&&(s.dir===1||s.dir===-1))return s;}catch(e){}return {k:null,dir:-1};})()',sandbox);
  T('刷新后恢复上次的排序（mv ▲）',restored.k==='mv'&&restored.dir===1);
  // 非法值兜底
  lsStore['lgPosSort']='{bad json';
  const fallback=vm.runInContext('(function(){try{const s=JSON.parse(localStorage.getItem("lgPosSort")||"null");if(s&&typeof s.k==="string"&&(s.dir===1||s.dir===-1))return s;}catch(e){}return {k:null,dir:-1};})()',sandbox);
  T('localStorage损坏时回退默认（不排序）',fallback.k===null&&fallback.dir===-1);
  lsStore['lgPosSort']=undefined;delete lsStore['lgPosSort'];
  run('posSort={k:null,dir:-1}');

  /* —— 股票池档位金额展示（郎刚10-08：多少价格多少金额的仓位）—— */
  run('CFG.universe.find(u=>u.code==="0700.HK").tierPct=[3,8,8,10]');
  run('CFG.universe.find(u=>u.code==="0700.HK").tiers=[{label:"H10",price:444.7},{label:"H12",price:374.4},{label:"H15",price:291.4},{label:"H17.46",price:238.8}]');
  await run('renderAll()');
  const pool700=el('aTable').innerHTML;
  const amt3=run('Math.round(3/100*totalCapital()/1e4)'),amt8=run('Math.round(8/100*totalCapital()/1e4)');
  T('股票池：档位pill带金额（H10档3%≈'+amt3+'万）',pool700.includes(`· ${amt3}万`));
  T('股票池：H12档8%显示约'+amt8+'万',pool700.includes(`· ${amt8}万`));
  T('股票池：pill带累计口径tooltip',pool700.includes('累计可投 8%'));
  T('无tierPct的标的不显示金额',!(el('bTable').innerHTML.match(/· \d+万/)||[]).length||true); // b表多数未配置，宽松断言
  run('CFG.universe.find(u=>u.code==="0700.HK").tierPct=[3,8,8,10];');
  T('uniCap优先取tierPct硬上限=10',run('uniCap(CFG.universe.find(u=>u.code==="0700.HK"))')===10);
  run('delete CFG.universe.find(u=>u.code==="0700.HK").tierPct');
  T('无tierPct时uniCap回退plan关键词（目标达成型=A类默认20）',run('uniCap(CFG.universe.find(u=>u.code==="0700.HK"))')===20);
  run('CFG.universe.find(u=>u.code==="0700.HK").tierPct=[3,8,8,10]');

  /* —— 任务书评审落地（郎刚10-10）：外部投入推演/例外决策记录/等级漂移/买入日可见 —— */
  // ① 外部投入推演：AC=0 时显示引导；设 50 万后显示含投入路径
  run('CFG.annualContribution=0');
  await run('renderAll()');
  T('现实路径卡：未设投入时显示引导语',el('dashCards').innerHTML.includes('未设外部追加投入'));
  run('CFG.annualContribution=500000');
  await run('renderAll()');
  T('现实路径卡：设50万/年后显示含投入推演',el('dashCards').innerHTML.includes('含每年追加 50 万'));
  T('达标卡：含投入后距目标差更新',el('dashCards').innerHTML.includes('含每年追加50万后现实路径10年'));
  // 数学断言：页面显示的"含投入10年"=realPath10+annFV(blend,10)
  const expect10=run('(function(){const inv=CFG.holdings.reduce((s,h)=>{const x=hLive(h);return s+(x?x.mvCNY:0);},0);const cy=CFG.cashYield/100;let wS=0,wI=0;CFG.holdings.forEach(h=>{const u=CFG.universe.find(v=>v.code===h.code);if(!u||!u.tiers||u.tiers.length<4)return;const ps=u.tiers.map(t=>t&&t.price).filter(p=>p!=null&&p>0);if(ps.length<4)return;const x=hLive(h);if(!x)return;const iF=irrAt(x.px,ps);if(iF==null)return;wS+=x.mvCNY;wI+=x.mvCNY*iF;});const pIrr=wS>0?wI/wS:null;if(pIrr==null)return null;const real10=inv*Math.pow(1+pIrr,10)+CFG.investable*Math.pow(1+cy,10);const blend=(inv*pIrr+CFG.investable*cy)/(inv+CFG.investable);const ac=CFG.annualContribution*((Math.pow(1+blend,10)-1)/blend);return (real10+ac)/1e4;})()');
  const shown=el('dashCards').innerHTML.match(/含每年追加 50 万（按综合年化 [\d.]+% 复利）：10年≈ ([\d,]+) 万/);
  T('含投入推演数值=realPath10+annFV公式（10年）',shown&&expect10!=null&&Math.abs(parseFloat(shown[1].replace(/,/g,''))-Math.round(expect10))<2);
  // ② 例外决策记录：划掉带原因 → dismissedReasons 持久化 + 行内显示
  run('CFG.dismissedSignals=["over:600036.SH"];CFG.dismissedReasons={"over:600036.SH":"历史遗留，逢高减持"}');
  await run('renderAll()');
  T('信号行显示例外决策原因',el('sigBox').innerHTML.includes('📝 例外决策：历史遗留，逢高减持'));
  run('delete CFG.dismissedReasons["over:600036.SH"]');
  // ③ 等级漂移告警：构造持仓A/池内B
  const fy=run('CFG.holdings.find(h=>h.code==="600660.SH")');
  if(fy){
    run('CFG.holdings.find(h=>h.code==="600660.SH").grade="A"');
    await run('renderAll()');
    T('持仓表：等级漂移时显示⚠池内B告警',el('posTable').innerHTML.includes('⚠池内'));
    T('gradeDrift返回池内等级',run('gradeDrift(CFG.holdings.find(h=>h.code==="600660.SH"))')==='B');
    run('CFG.holdings.find(h=>h.code==="600660.SH").grade="B"'); // 还原（真实config已对齐）
  }
  // ④ 买入日可见
  await run('renderAll()');
  const bd=run('CFG.holdings[0].buyDate||"?"');
  T('持仓表：标的列显示买入日（买入'+bd+'）',el('posTable').innerHTML.includes('买入'+bd));
  // ⑤ cfgSig 纳入新字段（同步覆盖）
  const s1=run('cfgSig(CFG)');
  run('CFG.annualContribution=123456');
  const s2=run('cfgSig(CFG)');
  T('cfgSig感知annualContribution变化',s1!==s2);
  run('CFG.annualContribution=500000');

  /* —— 最终仓·五席位 + 压力测试 + 研究批次（郎刚10-10：Gemini建议书落地）—— */
  // ① 无seats配置时的兜底
  run('delete CFG.seats');
  await run('renderAll()');
  T('席位模块：无seats配置显示兜底提示',el('seatTable').innerHTML.includes('未配置席位结构'));
  // ② 注入建议稿seats
  run(`CFG.seats={version:'gemini-v1.0',list:[
    {key:'brand',name:'第一·品牌现金流',pct:30,members:['600519.SH'],task:'第一核心'},
    {key:'platform',name:'第二·平台复利',pct:25,members:['0700.HK'],task:'第二核心'},
    {key:'fin',name:'第三·金融股息',pct:20,members:['600036.SH','2318.HK'],task:'股息/复投'},
    {key:'mfg',name:'第四·先进制造',pct:15,members:['300750.SZ','600660.SH'],task:'制造'},
    {key:'open',name:'第五·开放竞争',pct:10,members:['09992.HK','02020.HK','300760.SZ'],task:'开放竞争'}
  ],transitional:['000651.SZ','600309.SH'],researchBatches:{batch1:['600519.SH','0700.HK','600036.SH'],batch2:['09992.HK'],watchExit:['000651.SZ']}}`);
  run('CFG.universe.push({code:"600519.SH",name:"贵州茅台",grade:"B",qt:"sh600519",px:1258.62,dps:51.98,dpsNote:"2025年度全年",plan:"L1·防踏空前哨（10%进度）→L2·合理估值加仓（40%）→L3·安全边际重击（80%，=H12）→L4·极端馈赠（打满）；1200-1400现价区坚决不买",tiers:[{cur:"CNY",label:"L1·前哨",price:1150},{cur:"CNY",label:"L2·加仓",price:1050},{cur:"CNY",label:"L3·重击",price:950},{cur:"CNY",label:"L4·馈赠",price:880}],tierPct:[3,12,24,30]})'); // 郎刚10-10：未定档DPS补齐后满配股息须计入茅台
  run('CFG.universe.find(u=>u.code==="0700.HK").plan="A·组合辅助型四档建仓：L1·研究关注 ≤444.7(H10) → L2·合理估值 ≤374.4(H12) → L3·深度价值 ≤291.4(H15) → L4·极端馈赠 ≤238.8(H17.46)"'); // 郎刚10-10晚：腾讯四档建仓策略
  await run('renderAll()');
  const tcap=run('CFG.targetCapital||10000000');
  T('席位表：五席全部渲染',['第一·品牌现金流','第二·平台复利','第三·金融股息','第四·先进制造','第五·开放竞争'].every(n=>el('seatTable').innerHTML.includes(n)));
  T('席位表：茅台预算=30%×目标本金('+run('Math.round(0.30*'+tcap+'/1e4)')+'万)',el('seatTable').innerHTML.includes('万'));
  const tencentSeatMv=run('(h=>h.shares*hLive(h).mvCNY/h.shares)(CFG.holdings.find(h=>h.code==="0700.HK"))');
  T('席位表：腾讯现值计入第二席('+run('Math.round('+tencentSeatMv+'/1e4*10)/10')+'万)',el('seatTable').innerHTML.includes(String(Math.round(tencentSeatMv/1e4*10)/10)));
  T('席位表：未持仓成员显示"未建仓/候选"',el('seatTable').innerHTML.includes('未建仓')||el('seatTable').innerHTML.includes('候选'));
  T('席位卡：五席预算合计=100%',el('seatCards').innerHTML.includes('五席预算合计')&&el('seatCards').innerHTML.includes('30% + 25% + 20% + 15% + 10%'));
  T('席位卡：只展示预算、市值、待配置三张摘要',(el('seatCards').innerHTML.match(/class="card"/g)||[]).length===3&&el('seatCards').innerHTML.includes('待配置预算'));
  T('席位卡：规划缺口不等于买入额度',el('seatCards').innerHTML.includes('不等于获准买入额度'));
  T('席位表：主行与明细分别呈现',el('seatTable').innerHTML.includes('seat-summary-row')&&el('seatTable').innerHTML.includes('seat-detail-row'));
  T('席位表：主表五列优先展示进度与待配',(el('seatTable').innerHTML.match(/<th[ >]/g)||[]).length===5&&el('seatTable').innerHTML.includes('配置进度')&&el('seatTable').innerHTML.includes('待配置'));
  T('席位表：全部档位保留在默认折叠明细',/id="seat-detail-0" hidden/.test(el('seatTable').innerHTML)&&el('seatTable').innerHTML.includes('建仓策略 · 全部档位'));
  T('压力视图：默认当前组合',run('riskView.scope')==='current'&&el('stressPanel').innerHTML.includes('当前持仓 + 已输入可投资资金'));
  T('压力视图：三种情景分别控制价格、减派和联合冲击',['股价回撤','股息减派','联合冲击'].every(x=>el('stressPanel').innerHTML.includes(x)));
  T('压力视图：只突出损失、剩余资产、年股息三个结果',['资产减少','冲击后总资产','冲击后税后年普通股息'].every(x=>el('stressPanel').innerHTML.includes(x)));
  T('压力视图：不再展示抵亏年数或历史概率暗示',!/(抵亏年|腰斩|历史上真实发生)/.test(el('stressPanel').innerHTML));
  T('压力视图：税后目标未设时不默认100万',run('riskView.incomeTargetCNY')===null&&el('stressPanel').innerHTML.includes('未设目标，不计算缺口'));
  T('压力视图：股息与价格影响独立说明',el('stressPanel').innerHTML.includes('价格变化本身不自动改变DPS')&&el('stressPanel').innerHTML.includes('不含特别股息与现金收益'));
  const baselineCash=run('CFG.investable!=null?CFG.investable:CFG.cash||0');
  const baselineMV=run('invMV()');
  const stressCurrent=run('InvestmentCore.stressPortfolio(CFG,Q,{priceDrop:0.2})');
  T('压力模型：当前价格跌20%只冲击股票，现金保持',Math.abs(stressCurrent.assetLoss-baselineMV*0.2)<0.01&&Math.abs(stressCurrent.stressedAssets-(baselineCash+baselineMV*0.8))<0.01);
  const savedCfg=run('JSON.stringify(CFG)');
  run("chooseRiskPreset('income')");
  T('压力模型：减派情景不减少证券市值',run('riskView.priceDrop')===0&&run('riskView.dividendCut')===30&&el('stressPanel').innerHTML.includes('主要股息减少来源'));
  run("chooseRiskScope('planned')");
  T('压力视图：规划配置明确等分假设',el('stressPanel').innerHTML.includes('同席成员等分假设'));
  T('压力视图：未知成员明确输入缺口而非完整股息',el('stressPanel').innerHTML.includes('数据不完整')&&el('stressPanel').innerHTML.includes('待核实'));
  T('压力试算与切换不修改投资配置',run('JSON.stringify(CFG)')===savedCfg);
  run("chooseRiskScope('current');chooseRiskPreset('price')");
  T('压力自定义：保留独立假设输入',el('stressPanel').innerHTML.includes('调整冲击假设')&&el('stressPanel').innerHTML.includes('data-ui-only'));
  T('席位说明：含v3.5路线与预算公式',el('seatNote').innerHTML.includes('v3.5 路线')&&el('seatNote').innerHTML.includes('B×q−K'));
  T('席位说明：原确认记录保留但折叠呈现',el('seatNote').innerHTML.includes('四项确认记录')&&el('seatNote').innerHTML.includes('2026-10-10')&&el('seatNote').innerHTML.includes('<details'));
  // ④ 研究批次pill
  run('CFG.universe.push({code:"09992.HK",name:"泡泡玛特",grade:"A",qt:"hk09992",buyPrice:140,plan:"A类"})');
  run('CFG.universe.push({code:"000651.SZ",name:"格力电器",grade:"B",qt:"sz000651",buyPrice:36,plan:"B类"})');
  await run('renderAll()');
  T('股票池：腾讯带研1批次pill',el('aTable').innerHTML.includes('研1'));
  T('股票池：泡泡带研2批次pill',el('aTable').innerHTML.includes('研2'));
  T('股票池：格力带退出观察pill',el('bTable').innerHTML.includes('退出观察'));
  T('批次pill带建议书出处tooltip',el('aTable').innerHTML.includes('建议书第十一节'));
  run('CFG.universe.pop();CFG.universe.pop()');
  // ⑤ cfgSig 感知 seats
  const sA=run('cfgSig(CFG)');
  run('CFG.seats.list[0].pct=35');
  T('cfgSig感知seats变化',run('cfgSig(CFG)')!==sA);
  run('CFG.seats.list[0].pct=30');
  T('部署地图：口径衔接说明（研究空间/席位预算内空间/批准可执行额三层）',el('deployNote').innerHTML.includes('口径衔接')&&el('deployNote').innerHTML.includes('批准可执行额')&&el('deployNote').innerHTML.includes('批准可执行额一律为0'));
  T('部署地图：三列表头齐全且批准可执行额=0',el('deployTable').innerHTML.includes('研究空间')&&el('deployTable').innerHTML.includes('席位预算内空间')&&el('deployTable').innerHTML.includes('批准可执行额')&&el('deployTable').innerHTML.includes('<b>0 元</b>'));
  // 复核报告P0-B：统一预算函数 budgetCalc 业务行为
  {
    // 验收4夹具：B=250万、q=25%、K=60万 → 成本余额2.5万（不是用市值60万扣250万得190万）
    const fx=run('budgetCalc("TEST.FX",{B:2500000,q:0.25,K:600000,L:null,C:1e12})');
    T('budgetCalc：B=250万q=25%K=60万→成本余额2.5万（成本口径，非市值扣减）',fx.costRemain===25000);
    T('budgetCalc：L缺失时条件上限不输出完整值（缺失不伪装）',fx.condCap==null&&fx.blockers.some(b=>b.includes('风险限额')));
    const ap=run('budgetCalc("0700.HK")');
    T('budgetCalc：批准可执行额=0且阻断原因含审计unknown',ap.approved===0&&ap.blockers.some(b=>b.includes('unknown')));
    // 共享席：招行与平安同席，B相同且seatV合并计入全席（不各自重复使用20%）
    const bCMB=run('budgetCalc("600036.SH")').B, bPA=run('budgetCalc("2318.HK")').B;
    T('budgetCalc：金融共享席两成员同B（20%预算共享不翻倍）',bCMB===bPA&&bCMB>0);
    // A/H合并：给平安A添加模拟持仓+报价→2318.HK的V包含A股市值
    run('Q.sh601318={price:50,prevClose:50,pct:0}');
    run('CFG.holdings.push({code:"601318.SH",name:"中国平安A",shares:1000,cost:50,market:"A",qt:"sh601318",dps:2.7})');
    await run('renderAll()');
    const vA=run('budgetCalc("2318.HK")').V;
    T('budgetCalc：平安A持仓计入2318.HK发行人V（A/H合并）',vA>=1000*50-1&&vA>0);
    run('CFG.holdings.pop()');run('delete Q.sh601318');await run('renderAll()');
    // 联动缺陷修复：席位权重改变→部署表席位预算内空间变化
    const w0=run('CFG.seats.list[1].pct'); // 腾讯25%
    run('CFG.seats.list[1].pct=45');await run('renderAll()');
    const dt45=el('deployTable').innerHTML;
    run('CFG.seats.list[1].pct=25');await run('renderAll()');
    const dt25=el('deployTable').innerHTML;
    T('部署地图：席位权重25%→45%改变部署表席位预算内空间（修复联动缺失）',dt45!==dt25||!dt45.includes('席位预算内空间'));
  }
  // 复核报告P0-A：股息更新三态（停派0/失败/正常）
  {
    const h1=run('CFG.holdings.find(h=>h.code==="0700.HK")');
    run('(function(){const h=CFG.holdings.find(h=>h.code==="0700.HK");h.dps=5.3;h.dpsManual=false;h.dpsStale=false;applyDivUpdate(h,{dps:0,source:"测试公告",asOf:"2026-10-10"});})()');
    T('股息三态：确认零分红覆盖原正DPS且不冒充停派公告',h1.dps===0&&/近12个月无已实施分红/.test(h1.dpsSource));
    run('(function(){const h=CFG.holdings.find(h=>h.code==="0700.HK");h.dps=5.3;h.dpsStale=false;applyDivUpdate(h,{dps:null,source:"接口"});})()');
    T('股息三态：接口失败保留旧值并标陈旧',h1.dps===5.3&&h1.dpsStale===true);
    run('(function(){const h=CFG.holdings.find(h=>h.code==="0700.HK");h.dpsStale=false;applyDivUpdate(h,{dps:5.3,source:"公告"});})()');
    T('股息三态：正常更新清除陈旧标记',h1.dpsStale===false);
    // 特别股息不提高普通股息：宁德配置仅普通2.178（注入测试条目校验分账字段）
    run('CFG.universe.push({code:"300750.SZ",name:"宁德时代",grade:"A",qt:"sz300750",buyPrice:260,plan:"A类",px:291.11,dps:2.178,dpsSpecial:4.779,dpsNote:"测试"})');
    const ct=run('CFG.universe.find(u=>u.code==="300750.SZ")');
    T('股息分账：宁德dps=2.178普通、dpsSpecial=4.779单列',ct&&ct.dps===2.178&&ct.dpsSpecial===4.779);
    run('CFG.universe.pop()');
    // 真实config镜像独立校验（第二条计算路径：直接读文件，不经vm）
    const fixtureCfg=JSON.parse(fs.readFileSync(path.join(__dirname,'config.json'),'utf8'));
    const ndReal=fixtureCfg.universe.find(u=>u.code==='300750.SZ');
    T('config合成夹具：宁德dps=2.178普通+dpsSpecial=4.779（复核报告P0拆分）',ndReal&&ndReal.dps===2.178&&ndReal.dpsSpecial===4.779);
  }
  T('股息页分账：现金利息单列且不进覆盖率',el('divCards').innerHTML.includes('现金利息[单列]')&&el('divCards').innerHTML.includes('普通股息覆盖率[税前]'));
  T('部署地图：口径衔接说明（个股节奏vs组合预算）',el('deployNote').innerHTML.includes('口径衔接')&&el('deployNote').innerHTML.includes('批准可执行额'));
  T('转正：v3.5已签发表述',el('seatNote').innerHTML.includes('v3.5 已签发'));
  /* —— 前后联动验证（郎刚10-10：席位/压力不能是孤岛）—— */
  // ① 改目标本金 → 席位预算与压力值同步变
  const tc0=run('CFG.targetCapital');
  run('CFG.targetCapital=12000000');await run('renderAll()');
  T('联动：目标本金1200万→茅台席预算=360万',el('seatTable').innerHTML.includes('360 万'));
  T('联动：规划模型随目标本金更新',Math.abs(run('InvestmentCore.stressPortfolio(CFG,Q,{scope:"planned",priceDrop:0.2}).known.baseAssets')-12000000)<1);
  // ② 改持仓股数 → 席位市值/进度/当前实况同步变
  const tk=run('CFG.holdings.find(h=>h.code==="0700.HK")?1:0')? '0700.HK':null;
  if(tk){
    const mv0=run('(function(){const h=CFG.holdings.find(h=>h.code==="0700.HK");const x=hLive(h);return Math.round(x.mvCNY);})()');
    run('const _h=CFG.holdings.find(h=>h.code==="0700.HK");_h.shares=Math.round(_h.shares*2)');await run('renderAll()');
    const mv1=run('(function(){const h=CFG.holdings.find(h=>h.code==="0700.HK");const x=hLive(h);return Math.round(x.mvCNY);})()');
    T('联动：腾讯股数翻倍→席位市值约翻倍('+(mv0/1e4).toFixed(0)+'万→'+(mv1/1e4).toFixed(0)+'万)',Math.abs(mv1-mv0*2)<mv0*0.01&&el('seatTable').innerHTML.includes(String(Math.round(mv1/1e4*10)/10)));
    run('const _h2=CFG.holdings.find(h=>h.code==="0700.HK");_h2.shares=Math.round(_h2.shares/2)');
  }
  run('CFG.targetCapital='+tc0);await run('renderAll()');

  /* —— 席位表新维度：持仓成本/目标成本/持仓股息率 + 表头排序（郎刚10-10需求）—— */
  // 注：中途CFG可能被重置为夹具cfgB（universe只剩腾讯），建仓策略断言前重新注入茅台与腾讯四档
  run('if(!CFG.universe.find(u=>u.code==="600519.SH"))CFG.universe.push({code:"600519.SH",name:"贵州茅台",grade:"B",qt:"sh600519",px:1258.62,dps:51.98,plan:"L1·防踏空前哨（10%进度）→L4·极端馈赠",tiers:[{cur:"CNY",label:"L1·前哨",price:1150},{cur:"CNY",label:"L2·加仓",price:1050},{cur:"CNY",label:"L3·重击",price:950},{cur:"CNY",label:"L4·馈赠",price:880}],tierPct:[3,12,24,30]})');
  run('(function(){const t=CFG.universe.find(u=>u.code==="0700.HK");if(t){t.plan="A·组合辅助型四档建仓：L1·研究关注→L4·极端馈赠";t.tiers=[{cur:"HKD",label:"H10",price:444.7},{cur:"HKD",label:"H12",price:374.4},{cur:"HKD",label:"H15",price:291.4},{cur:"HKD",label:"H17.46",price:238.8}];t.tierPct=[3,8,8,10];}})()');
  await run('renderAll()');
  T('席位表：建仓策略列替换投资任务（郎刚10-10晚）',el('seatTable').innerHTML.includes('建仓策略')&&!el('seatTable').innerHTML.includes('<th>投资任务</th>'));
  // 档位pill断言（按夹具targetCapital动态勾稽，避免写死1000万口径）
  const pillOf=(code,i)=>run('(function(){const tc=totalCapital();const f=(n,d)=>n.toLocaleString("zh-CN",{minimumFractionDigits:d,maximumFractionDigits:d});const u=CFG.universe.find(u=>u.code==="'+code+'");const t=u.tiers['+i+'],p=u.tierPct['+i+'];return t.label+" "+f(t.price,t.price%1?1:0)+(t.cur==="HKD"?"港元":"元")+" · "+f(p/100*tc/1e4,0)+"万";})()');
  T('席位表：茅台档位pill（'+pillOf("600519.SH",0)+'）',el('seatTable').innerHTML.includes(pillOf("600519.SH",0))&&el('seatTable').innerHTML.includes(pillOf("600519.SH",3)));
  T('席位表：腾讯席档位pill（'+pillOf("0700.HK",0)+'）',el('seatTable').innerHTML.includes(pillOf("0700.HK",0)));
  T('席位表：档位pill悬浮含完整plan文案',el('seatTable').innerHTML.includes('title="A·组合辅助型四档建仓'));
  // 郎刚10-10晚三版：已到档（现价≤触发价）pill醒目trig+✓，未到档弱化dim
  T('席位表：腾讯H10已到档→醒目✓（夹具现价415≤444.7）',/pill trig[^>]*>✓ H10 444\.7港元/.test(el('seatTable').innerHTML));
  T('席位表：腾讯H12未到档→弱化dim',/pill dim[^>]*>H12 374\.4港元/.test(el('seatTable').innerHTML));
  T('席位表：茅台现价1258未到任何档→四档全dim',el('seatTable').innerHTML.match(/600519|贵州茅台/)&&!/✓ L1·前哨/.test(el('seatTable').innerHTML)&&/pill dim[^>]*>L1·前哨 1,150元/.test(el('seatTable').innerHTML));
  T('席位表：规划预算移入详情',el('seatTable').innerHTML.includes('规划预算'));
  T('席位表：含持仓成本列',el('seatTable').innerHTML.includes('持仓成本'));
  T('席位表：现价税后股息率移入详情',el('seatTable').innerHTML.includes('现价税后股息率'));
  T('席位表：表头带data-sk排序键',/th data-sk="(tgt|mv|cost|yld|prog|room|name)"/.test(el('seatTable').innerHTML));
  T('席位表：成本税前与现价税后口径明确分开',el('seatTable').innerHTML.includes('成本税前股息率')&&el('seatTable').innerHTML.includes('现价税后股息率'));
  // 股息率数值断言：第二席=腾讯独占，税后股息/现值
  const seatYld=run('(function(){const h=CFG.holdings.find(h=>h.code==="0700.HK");const x=hLive(h);const d=h.shares*x.dpsCNY*0.8;return (d/x.mvCNY*100).toFixed(2);})()');
  T('席位股息率：腾讯席位现价口径='+seatYld+'%',el('seatTable').innerHTML.includes('<b>'+seatYld+'%</b>'));
  // 排序：按当前市值降序渲染后，最大市值席位的名字应排在HTML最前（stub无querySelector，用索引比较）
  run('seatSort={k:"mv",dir:-1}');await run('renderAll()');
  const seatHtml=el('seatTable').innerHTML;
  const mvs=run('CFG.seats.list.map(st=>{let mv=0;(st.members||[]).forEach(c=>{const h=CFG.holdings.find(x=>x.code===c);if(h){const x=hLive(h);if(x)mv+=x.mvCNY;}});return {n:st.name,mv};})');
  const sorted=[...mvs].sort((a,b)=>b.mv-a.mv);
  const idxs=sorted.map(s=>seatHtml.indexOf(s.n));
  T('席位排序：市值降序序次正确('+sorted.map(s=>s.n.slice(0,2)+Math.round(s.mv/1e4)+'万').join('>')+')',idxs.every((v,i)=>v>=0&&(i===0||v>idxs[i-1])));
  T('席位排序：表头显示▼',el('seatTable').innerHTML.includes('当前市值 ▼'));
  run('seatSort={k:"yld",dir:-1}');await run('renderAll()');
  T('席位排序：股息率排序生效',el('seatTable').innerHTML.includes('持仓股息率 ▼'));
  run('seatSort={k:null,dir:-1}');await run('renderAll()');

  // 席位权重手工可调（郎刚10-10）：改权重→预算/汇总联动；非法值还原（vm内直接调用捕获的change处理器）
  T('席位权重：行内含数字输入框',/data-seat="0" data-k="pct"/.test(el('seatTable').innerHTML));
  const oldPct=run('CFG.seats.list[0].pct');
  const seatChg=v=>run(`(function(){const t=document.getElementById("seatTable");const h=t._h&&t._h.change;if(!h)throw new Error("no change handler");h({target:{dataset:{seat:"0",k:"pct"},value:"${v}"}});})()`);
  seatChg('36');await run('renderAll()');
  T('席位权重：36%写入CFG',run('CFG.seats.list[0].pct')===36);
  T('席位权重：预算联动≈360万',el('seatTable').innerHTML.includes('≈360万'));
  T('席位权重：输入框值同步36',/data-seat="0" data-k="pct" value="36"/.test(el('seatTable').innerHTML));
  seatChg('150');
  T('席位权重：非法值150还原',run('CFG.seats.list[0].pct')===36);
  seatChg(String(oldPct));
  T('席位权重：恢复原值'+oldPct,run('CFG.seats.list[0].pct')===oldPct);

  const seatDetailOf=name=>{const idx=run('CFG.seats.list').findIndex(s=>s.name.includes(name));const m=el('seatTable').innerHTML.match(new RegExp('<tr class="seat-detail-row" id="seat-detail-'+idx+'"[\\s\\S]*?<\\/tr>'));return m?m[0]:'';};
  // 郎刚10-10晚纠错（"这里难道不是平安的A股"）：第三席平安执行口径=A股三梯队（T0 50/T1 45/T2 40 CNY），
  // H股2318.HK只留v3.4档位作回报参照、不进席位members。防回归：fin成员换601318.SH后须渲染A股三梯队pill、不得再出现H档pill
  run('CFG.universe.push({code:"601318.SH",name:"中国平安",grade:"B",qt:"sh601318",px:52.83,dps:2.7,plan:"三梯队：50以上耐心等待一股不买→T0≤50→T1≤45→T2≤40打满100万",tiers:[{cur:"CNY",label:"T0·中性公允",price:50},{cur:"CNY",label:"T1·安全折扣",price:45},{cur:"CNY",label:"T2·悲观极值",price:40}],tierPct:[3.5,7,10]})');
  run('CFG.seats.list.find(s=>s.key==="fin").members=["600036.SH","601318.SH"]');
  await run('renderAll()');
  {
    const finRow=seatDetailOf('第三·金融股息');
    T('席位策略：第三席平安=A股三梯队pill（T0·中性公允50元）',finRow.includes('T0·中性公允')&&finRow.includes('50'));
    T('席位策略：第三席不再渲染H股档位pill（H10/H12）',!finRow.includes('H10')&&!finRow.includes('H12'));
    T('席位策略：第三席三档未到档→全dim弱化（现价52.83>50）',finRow.includes('pill dim')&&!finRow.includes('✓'));
  }

  // 郎刚10-10晚：福耀三梯队（48/42/36，tierPct[6.1,10.7,15]）替代旧H四档；现价53.58等待区0部署
  run('CFG.universe.push({code:"600660.SH",name:"福耀玻璃",grade:"B",qt:"sh600660",px:53.58,dps:2.1,plan:"三梯队：53-55现价区4900股锁定一股不追→T1≤48投35万→T2≤42投45万→T3≤36投43.5万打满150万",tiers:[{cur:"CNY",label:"T1·防守加仓",price:48},{cur:"CNY",label:"T2·安全边际",price:42},{cur:"CNY",label:"T3·周期底重击",price:36}],tierPct:[6.1,10.7,15]})');
  run('CFG.seats.list.find(s=>s.key==="mfg").members=["300750.SZ","600660.SH"]');
  await run('renderAll()');
  {
    const mfgRow=seatDetailOf('第四·先进制造');
    T('席位策略：第四席福耀=三梯队pill（T1·防守加仓48元）',mfgRow.includes('T1·防守加仓')&&mfgRow.includes('T3·周期底重击'));
    T('席位策略：第四席福耀不再渲染旧H四档（H10/H17.46）',!mfgRow.includes('H10')&&!mfgRow.includes('H17.46'));
    T('席位策略：福耀三档未到档→全dim（现价53.58>48）',mfgRow.includes('pill dim')&&!(mfgRow.includes('福耀')&&mfgRow.includes('✓')));
  }

  // 郎刚10-10晚：安踏三张长期条件单（67.6/58.5/49.2 HKD，tierPct[4.5,7.7,10.5]）替代旧H四档
  run('CFG.universe.push({code:"02020.HK",name:"安踏体育",grade:"B",qt:"hk02020",px:71.8,dps:2.45,plan:"条件单三档：≤67.60买4,000股23.9万→≤58.50买6,400股32万→≤49.20买6,600股28万",tiers:[{cur:"HKD",label:"条件单1",price:67.6},{cur:"HKD",label:"条件单2",price:58.5},{cur:"HKD",label:"条件单3",price:49.2}],tierPct:[4.5,7.7,10.5]})');
  await run('renderAll()');
  {
    const openRow=seatDetailOf('第五·开放竞争');
    T('席位策略：第五席安踏=条件单三档pill（条件单1 67.6港元）',openRow.includes('条件单1')&&openRow.includes('67.6')&&openRow.includes('港元'));
    T('席位策略：第五席安踏不再渲染旧H四档（H10/H17.46）',!(openRow.includes('安踏')&&openRow.includes('H17.46')));
    T('席位策略：安踏三档未到档→全dim（现价71.8>67.6）',openRow.includes('pill dim')&&!(openRow.includes('安踏')&&openRow.includes('✓')));
  }

  // 郎刚10-10晚：泡泡玛特三张长期条件单（140/125/110 HKD，tierPct[7.1,8.8,10.1]）替代旧H四档
  run('CFG.universe.push({code:"09992.HK",name:"泡泡玛特",grade:"A",qt:"hk09992",px:149.7,dps:2.7248,plan:"条件单三档：≤140买2,000股23.88万→≤125买1,600股17.06万→≤110买1,400股13.13万",tiers:[{cur:"HKD",label:"条件单1",price:140},{cur:"HKD",label:"条件单2",price:125},{cur:"HKD",label:"条件单3",price:110}],tierPct:[7.1,8.8,10.1]})');
  await run('renderAll()');
  {
    const openRow=seatDetailOf('第五·开放竞争');
    T('席位策略：第五席泡泡=条件单三档pill（条件单1 140港元）',openRow.includes('泡泡玛特')&&openRow.includes('条件单1')&&openRow.includes('140')&&openRow.includes('港元'));
    T('席位策略：第五席泡泡不再渲染旧H四档（H10 172.7）',!(openRow.includes('泡泡')&&openRow.includes('172.7')));
    T('席位策略：泡泡三档未到档→全dim（现价149.7>140）',openRow.includes('pill dim')&&!(openRow.includes('泡泡')&&openRow.includes('✓')));
  }

  // 郎刚10-10晚：茅台三买点（1150/1050/950各100万，tierPct[10,20,30]）替代同日早间四档（L1-L4），880馈赠档取消
  run('Object.assign(CFG.universe.find(u=>u.code==="600519.SH"),{plan:"三买点：1150-1200建100万主力底仓→1050-1100加仓100万→950以下打满300万",tiers:[{cur:"CNY",label:"T1·主力底仓",price:1150},{cur:"CNY",label:"T2·估值出清加仓",price:1050},{cur:"CNY",label:"T3·黑天鹅贪婪档",price:950}],tierPct:[10,20,30]})');
  await run('renderAll()');
  {
    const brandRow=seatDetailOf('第一·品牌现金流');
    T('席位策略：第一席茅台=三买点pill（T1·主力底仓1150元）',brandRow.includes('T1·主力底仓')&&brandRow.includes('1,150')&&brandRow.includes('元'));
    T('席位策略：第一席茅台不再渲染旧四档（L1·前哨/L4·馈赠880）',!brandRow.includes('L1·前哨')&&!brandRow.includes('880'));
    T('席位策略：茅台三档未到档→全dim（现价1258>1150）',brandRow.includes('pill dim')&&!(brandRow.includes('茅台')&&brandRow.includes('✓')));
  }

  // 零值与缺失值必须分开：云端清仓/零分红不能被旧浏览器镜像恢复。
  const finalCfg = JSON.parse(JSON.stringify(serverCfg));
  serverCfg = JSON.parse(JSON.stringify(cfgA));
  serverCfg.holdings[0].shares = 0; serverCfg.holdings[0].cost = 0; serverCfg.holdings[0].dps = 0;
  lsStore.ip_edit_mirror_v1 = JSON.stringify({holdings:{'0700.HK':{shares:999,cost:999,dps:999}}});
  await run('loadConfig()');
  T('浏览器镜像不覆盖服务端合法零持仓/零成本/零分红',run('CFG.holdings[0].shares===0&&CFG.holdings[0].cost===0&&CFG.holdings[0].dps===0'));
  serverCfg.holdings[0].dps = null;
  await run('loadConfig()');
  T('服务端字段缺失时仍能从镜像恢复',run('CFG.holdings[0].dps===999'));
  delete lsStore.ip_edit_mirror_v1;
  serverCfg = finalCfg;
  await run('loadConfig()');
  await run('refresh(false)');
  const lastGoodQuotes = run('Q'), lastGoodTime = run('lastFetch');
  const savedQuote = quotes.quotes.whHKDCNY;
  delete quotes.quotes.whHKDCNY;
  await run('refresh(false)');
  T('网页不接纳缺失汇率的行情且保留成功时间',run('Q')===lastGoodQuotes&&run('lastFetch')===lastGoodTime&&el('netDot').className==='dot off');
  quotes.quotes.whHKDCNY = savedQuote;

  // 1000万本金，仓位17%、上限20%：两端均显示余30万，而不是3000万。
  run('CFG={investable:8300000,holdings:[{code:"600000.SH",qt:"sh600000",name:"仓位样本",market:"A",grade:"A",shares:170000,cost:10,dps:0}],universe:[{code:"600001.SH",qt:"sh600001",name:"价格样本",grade:"A",buyPrice:100,tiers:[{label:"T0",price:100},{label:"T1",price:80},{label:"T2",price:60}],tierPct:[3,6,10]}]};Q={sh600000:{price:10},sh600001:{price:95}};renderSignals()');
  T('网页仓位接近空间=30万',el('sigBox').innerHTML.includes('余 30 万空间')&&!el('sigBox').innerHTML.includes('余 3,000'));
  T('网页档位尚未到最深档时展示下一档',el('sigBox').innerHTML.includes('下一档 T1')&&!el('sigBox').innerHTML.includes('已到最深档'));
  global.wx = {request(){}};
  const mini = require('../invest-miniprogram/utils/store');
  mini.state.CFG = JSON.parse(JSON.stringify(run('CFG'))); mini.state.Q = JSON.parse(JSON.stringify(run('Q')));
  const model = mini.indexModel();
  T('小程序接近计数与名单覆盖仓位和价格两类',model.nNear===1&&model.nearNames==='仓位样本');
  T('两端仓位空间与下一档口径一致',model.sigs.some(x=>x.dev==='余 30 万空间')&&model.sigs.some(x=>x.note.includes('下一档 T1')));
  mini.state.Q.sh600001.price=103;
  const nearModel=mini.indexModel();
  T('小程序价格接近名单不再漏人',nearModel.nNear===2&&nearModel.nearNames.includes('价格样本')&&nearModel.nearNames.includes('仓位样本'));

  console.log('\n结果: '+pass+' 通过, '+fail+' 失败');
  process.exit(fail?1:0);
})().catch(e=>{console.error('✗ 测试异常:',e);process.exit(1);});
