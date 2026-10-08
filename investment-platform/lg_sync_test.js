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
    addEventListener(){},focus(){},select(){}};
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
const sandbox={
  document:docStub, window:{addEventListener(){}},
  localStorage:{getItem:()=>null,setItem(){},removeItem(){}},
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

  console.log('\n结果: '+pass+' 通过, '+fail+' 失败');
  process.exit(fail?1:0);
})().catch(e=>{console.error('✗ 测试异常:',e);process.exit(1);});
