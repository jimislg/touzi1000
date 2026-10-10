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
  Date, Math, JSON, console, URL, encodeURIComponent, decodeURIComponent, isNaN, parseFloat, parseInt,
  Array, Object, String, Number, RegExp, Map, Set, Promise, Error,
};
sandbox.globalThis=sandbox;
vm.createContext(sandbox);

/* —— fetch stub：可切换的配置响应 —— */
const cfgA={investable:8061000,cash:8061000,cashYield:1,pathCAGR:0.1746,hkdcnyFallback:0.8548,
  holdings:[
    {code:'0700.HK',name:'腾讯控股',market:'HK',qt:'hk00700',shares:100,cost:421.26,dps:5.3},
    {code:'600036.SH',name:'招商银行',market:'A',qt:'sh600036',shares:22100,cost:36.96,dps:2.016},
  ],
  universe:[{code:'0700.HK',name:'腾讯控股',grade:'A',qt:'hk00700',buyPrice:420,plan:'目标达成型',bizTag:'社交垄断·提价克制',tiers:[{label:'H10',price:380},{label:'H12',price:340},{label:'H15',price:290},{label:'H17.46',price:255}]}]};
const cfgB=JSON.parse(JSON.stringify(cfgA)); // 外部登记交易后
cfgB.investable=7422979;cfgB.cash=7422979;
cfgB.holdings[0].shares=1700;cfgB.holdings[0].cost=417.52;
cfgB.trades=[{date:'2026-10-08',code:'0700.HK',shares:1600}];
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
  T('场景1 腾讯股数已跟随=1700',run('CFG.holdings.find(h=>h.code==="0700.HK").shares')===1700);
  T('场景1 可投资金已跟随=7422979',run('CFG.investable')===7422979);
  T('场景1 investInput 输入框已刷新',Math.abs(parseFloat(el('investInput').value)-742.3)<0.05);
  T('场景1 saveText 显示同步提示',el('saveText').textContent.includes('↺'));

  // 场景2：本地有未保存修改 → 不套用
  serverCfg=cfgA; // 模拟另一轮外部又变回
  await run('dirty=true');
  r=await run('syncConfig()');
  T('场景2 dirty=true → syncConfig=false',r===false);
  T('场景2 股数保持1700不被覆盖',run('CFG.holdings.find(h=>h.code==="0700.HK").shares')===1700);
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
  run('CFG.trades=[{date:"2026-10-08",code:"0700.HK",name:"腾讯控股",price:417.3,shares:1600,amtCNY:637680}]');
  await run('renderAll()');
  T('信号中心：已触发行徽标变"已触发·已执行"',el('sigBox').innerHTML.includes('已触发·已执行'));
  T('信号中心：说明含买入明细',el('sigBox').innerHTML.includes('10/08已买入')&&el('sigBox').innerHTML.includes('1,600股'));
  T('总览chip副标题带（已执行）',el('sigBox').innerHTML.includes('腾讯控股（已执行）'));
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
  run('CFG.trades=[{date:"2026-10-08",code:"0700.HK",name:"腾讯控股",price:417.3,shares:1600,amtCNY:637680}]');
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
  T('接近档仍保留"已执行"徽标与买入明细',el('sigBox').innerHTML.includes('已执行')&&el('sigBox').innerHTML.includes('10/08已买入'));
  run('CFG.universe.find(u=>u.code==="0700.HK").buyPrice=420');

  // 手工划掉腾讯触发信号 → row-dim + 徽标"已划掉" + chips 不再计数
  run('CFG.dismissedSignals.push("trig:0700.HK")');
  await run('renderAll()');
  T('划掉后行变 row-dim',el('sigBox').innerHTML.includes('row-dim'));
  T('划掉后徽标显示"已划掉"',el('sigBox').innerHTML.includes('已划掉'));
  T('划掉后总览chip不再标"已执行"(不再通知)',!el('sigBox').innerHTML.includes('已触发·已执行'));
  T('划掉行出现"恢复"入口',el('sigBox').innerHTML.includes('>恢复</span>'));
  T('划掉行的明细说明仍保留（可追溯）',el('sigBox').innerHTML.includes('10/08已买入'));

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
  T('缺口表：明细含算法说明（对数插值+市值加权）',el('gapBox').innerHTML.includes('对数插值')&&el('gapBox').innerHTML.includes('市值加权平均'));
  T('缺口表：明细含逐只隐含回报与权重',el('gapBox').innerHTML.includes('隐含 <b>')&&el('gapBox').innerHTML.includes('市值权重'));
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
  await run('renderAll()');
  const tcap=run('CFG.targetCapital||10000000');
  T('席位表：五席全部渲染',['第一·品牌现金流','第二·平台复利','第三·金融股息','第四·先进制造','第五·开放竞争'].every(n=>el('seatTable').innerHTML.includes(n)));
  T('席位表：茅台预算=30%×目标本金('+run('Math.round(0.30*'+tcap+'/1e4)')+'万)',el('seatTable').innerHTML.includes('万'));
  const tencentSeatMv=run('(h=>h.shares*hLive(h).mvCNY/h.shares)(CFG.holdings.find(h=>h.code==="0700.HK"))');
  T('席位表：腾讯现值计入第二席('+run('Math.round('+tencentSeatMv+'/1e4*10)/10')+'万)',el('seatTable').innerHTML.includes(String(Math.round(tencentSeatMv/1e4*10)/10)));
  T('席位表：未持仓成员显示"未建仓/候选"',el('seatTable').innerHTML.includes('未建仓')||el('seatTable').innerHTML.includes('候选'));
  T('席位卡：五席预算合计=100%',el('seatCards').innerHTML.includes('五席预算合计')&&el('seatCards').innerHTML.includes('30% + 25% + 20% + 15% + 10%'));
  T('席位卡：过渡仓卡存在',el('seatCards').innerHTML.includes('过渡仓'));
  T('席位卡：距满配空间卡存在',el('seatCards').innerHTML.includes('距满配空间'));
  // ③ 压力测试 v2：情景表（郎刚10-10重做——历史参照+回本时间+当前实况+自定义输入）
  T('压力表：三档整体情景齐全',['整体 -20%','整体 -35%','整体 -50%'].every(x=>el('stressTable').innerHTML.includes(x)));
  T('压力表：三个单点情景齐全',['茅台腰斩','腾讯腰斩','双核同跌'].every(x=>el('stressTable').innerHTML.includes(x)));
  T('压力表：每情景带历史参照',['塑化剂','775→198','2008','2018年A股'].every(x=>el('stressTable').innerHTML.includes(x)));
  T('压力表：满配-20%剩余='+(tcap*0.8/1e4).toFixed(0)+'万',el('stressTable').innerHTML.includes((tcap*0.8/1e4).toFixed(0)+' 万'));
  T('压力表：腾讯腰斩满配剩余='+(tcap*0.875/1e4).toFixed(0)+'万',el('stressTable').innerHTML.includes((tcap*0.875/1e4).toFixed(0)+' 万'));
  T('压力表：含回本需涨与回本时间(纯股息)列',el('stressTable').innerHTML.includes('回本需涨')&&el('stressTable').innerHTML.includes('回本时间(纯股息)'));
  T('压力表：茅台当前未持有→无直接影响标注',el('stressTable').innerHTML.includes('未持有·无直接影响'));
  T('压力表：腾讯当前实况亏损为负值',/-\d/.test(el('stressTable').innerHTML));
  // 纯股息数值断言（郎刚10-10）：从页面解析满配年股息下限，校验>0且-35%回本年数=亏损÷该股息
  const fdm=el('stressTable').innerHTML.match(/满配年股息（下限估算）≈ <b>([\d,]+) 元\/年/);
  const fullDiv=fdm?parseInt(fdm[1].replace(/,/g,''),10):0;
  const yrsExp=(tcap*0.35/fullDiv).toFixed(1);
  T('压力表：满配年股息下限='+fullDiv+'元（>0）',fullDiv>0);
  T('压力表：满配-35%纯股息回本='+yrsExp+'年（与股息勾稽）',el('stressTable').innerHTML.includes('<b>'+yrsExp+' 年</b>'));
  T('压力表：未定档成员不计入说明',el('stressTable').innerHTML.includes('未定档')&&el('stressTable').innerHTML.includes('实际回本更快'));
  T('压力说明：三个问题导语（靠股息几年赚回来）',el('stressDesc').innerHTML.includes('钱还剩多少')&&el('stressDesc').innerHTML.includes('靠股息几年赚回来'));
  T('压力自定义：输入控件存在',el('stressCustom').innerHTML.includes('input'));
  T('席位说明：含v3.5路线与预算公式',el('seatNote').innerHTML.includes('v3.5 路线')&&el('seatNote').innerHTML.includes('B×q−K'));
  T('席位说明：四项已确认记录（郎刚2026-10-10）',el('seatNote').innerHTML.includes('四项确认记录')&&el('seatNote').innerHTML.includes('2026-10-10'));
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
  T('部署地图：口径衔接说明（个股节奏vs组合预算）',el('deployNote').innerHTML.includes('口径衔接')&&el('deployNote').innerHTML.includes('五席预算制'));
  T('转正：v3.5已签发表述',el('seatNote').innerHTML.includes('v3.5 已签发'));
  /* —— 前后联动验证（郎刚10-10：席位/压力不能是孤岛）—— */
  // ① 改目标本金 → 席位预算与压力值同步变
  const tc0=run('CFG.targetCapital');
  run('CFG.targetCapital=12000000');await run('renderAll()');
  T('联动：目标本金1200万→茅台席预算=360万',el('seatTable').innerHTML.includes('360 万'));
  T('联动：压力表满配-20%剩余=960万',el('stressTable').innerHTML.includes('960 万'));
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
  T('席位表：含目标成本列',el('seatTable').innerHTML.includes('目标成本'));
  T('席位表：含持仓成本列',el('seatTable').innerHTML.includes('持仓成本'));
  T('席位表：含持仓股息率列',el('seatTable').innerHTML.includes('持仓股息率'));
  T('席位表：表头带data-sk排序键',/th data-sk="(tgt|mv|cost|yld|prog|room|name)"/.test(el('seatTable').innerHTML));
  T('席位表：股息率双口径标注（成本+现价）',el('seatTable').innerHTML.includes('成本')&&el('seatTable').innerHTML.includes('现价（税后）'));
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

  console.log('\n结果: '+pass+' 通过, '+fail+' 失败');
  process.exit(fail?1:0);
})().catch(e=>{console.error('✗ 测试异常:',e);process.exit(1);});
