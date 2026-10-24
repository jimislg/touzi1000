/* 原网页脚本的交互回归；全部使用合成资料，不联网。 */
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert/strict')
const CORE = require('./public/investment-core')
let passed = 0
function check (name, ok) { assert.ok(ok, name); passed++; console.log('PASS ' + name) }
const elements = {}, listeners = {}, local = new Map()
const el = id => elements[id] || (elements[id] = { innerHTML: '', textContent: '', value: '', checked: false, style: {}, classList: { contains: () => false }, _h: {}, addEventListener (type, fn) { this._h[type] = fn } })
const context = vm.createContext({
  InvestmentCore: CORE, console, Date, location: {hash:''}, setTimeout: () => 0, clearTimeout () {}, setInterval: () => 0, clearInterval () {}, alert () {},
  document: { querySelectorAll: () => [], getElementById: el, activeElement: null, querySelector: () => null, documentElement: el('html'), addEventListener: (type, fn) => { listeners[type] = fn } },
  window: { addEventListener () {} }, localStorage: { getItem: k => local.get(k) || null, setItem: (k, v) => local.set(k, v), removeItem: k => local.delete(k) },
  fetch: () => { throw new Error('此测试禁止网络') }
})
const html = fs.readFileSync(path.join(__dirname, 'public/index.html'), 'utf8')
let code = html.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/)[1]
code = code.slice(0, code.indexOf('/* —— 启动 —— */'))
vm.runInContext(code, context)
const run = x => vm.runInContext(x, context)
run(`CFG={targetCapital:1000000,investable:800000,cashYield:1,hkdcnyFallback:0.8,holdings:[{code:'0700.HK',qt:'hk00700',name:'合成平台',market:'HK',shares:1000,cost:90,dps:5}],universe:[{code:'0700.HK',qt:'hk00700',name:'合成平台',grade:'A',px:100,dps:5,tiers:[{label:'T0·首档',price:100,cur:'HKD'},{label:'T1·下一档',price:80,cur:'HKD'}],tierPct:[3,6]}],seats:{list:[{key:'first',name:'第一·合成席位',pct:50,members:['0700.HK']},{key:'empty',name:'第二·空席位',pct:50,members:[]}]}};Q={hk00700:{price:95,time:'20261016160000'},whHKDCNY:{price:0.8}};wireInputs();renderSeats();`)
check('主表保留市值预算及证据四列', el('seatTable').innerHTML.includes('市值/预算') && el('seatTable').innerHTML.includes('成员与证据'))
check('当前市值与规划预算分开', el('seatTable').innerHTML.includes('7.60') && el('seatTable').innerHTML.includes('/ 50.00 万'))
check('历史档位保留在默认折叠记录', el('seatTable').innerHTML.includes('<details>') && el('seatTable').innerHTML.includes('T1·下一档'))
check('席位不可通过普通表格编辑政策', !el('seatTable').innerHTML.includes('data-k="pct"') && el('seatTable').innerHTML.includes('独立政策流程'))
run("changeSeatSort('room')")
check('参考空间排序可用', el('seatTable').innerHTML.indexOf('第二·空席位') < el('seatTable').innerHTML.indexOf('第一·合成席位'))
const original = run('JSON.stringify(CFG)')
run("chooseRiskPreset('combined');chooseRiskScope('planned')")
check('规划配置明确显示模型等分与假设', el('stressPanel').innerHTML.includes('同席成员等分假设') && el('stressPanel').innerHTML.includes('不是发生概率或市场预测'))
run("riskDraft={priceDrop:'20',dividendCut:'40',hkdDrop:'10'};applyRiskDraft()")
check('自定义参数独立应用', run('riskView.priceDrop===20&&riskView.dividendCut===40&&riskView.hkdDrop===10') && el('stressPanel').innerHTML.includes('普通每股股息减少 <b>40%'))
run("riskGoalDraft='10';applyRiskGoal()")
check('目标以用户输入的税后金额计算', run('riskView.incomeTargetCNY') === 100000 && el('stressPanel').innerHTML.includes('尚缺'))
run("riskGoalDraft='';applyRiskGoal()")
check('清空目标后不再呈现虚构缺口', run('riskView.incomeTargetCNY') === null && el('stressPanel').innerHTML.includes('未设目标'))
run("riskDraft.priceDrop='120';applyRiskDraft()")
check('非法跌幅不污染上次有效模型', run('riskView.priceDrop') === 20 && el('stressPanel').innerHTML.includes('role="alert"'))
run("riskGoalDraft='-1';applyRiskGoal()")
check('负收入目标被拒绝', run('riskView.incomeTargetCNY') === null && el('stressPanel').innerHTML.includes('请输入正数'))
check('所有试算操作都不修改持仓或席位配置', run('JSON.stringify(CFG)') === original && run('dirty') === false)
listeners.change({ target: { matches: () => true, closest: () => null, hasAttribute: key => key === 'data-ui-only' } })
check('试算输入不会触发自动保存投资配置', run('dirty') === false && !local.has('ip_pending_edit_v2'))
run("chooseRiskScope('current');chooseRiskPreset('income');delete CFG.holdings[0].dps;delete CFG.universe[0].dps;renderStress(true)")
check('缺DPS明确提示，不把年股息呈现成已知零', el('stressPanel').innerHTML.includes('数据不完整') && el('stressPanel').innerHTML.includes('待核实'))
check('已覆盖收入不会冒充完整结论', el('stressPanel').innerHTML.includes('已覆盖股息'))
check('没有抵亏年数或行情历史充当预测', !/(静态股息抵亏|历史上真实发生|十年一遇)/.test(el('stressPanel').innerHTML))
console.log('席位与压力视图交互全部通过: ' + passed)
