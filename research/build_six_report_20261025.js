// 六标的四步法研究草案 HTML 生成器
// 输入：research/six_valuation_20261025_results.json
// 输出：codex-产出/六标的四步法研究草案-20261025.html
// 说明：本页所有价格均为研究草案/敏感性参考，非正式经济价值、非正式H档、非下单指令。
const fs = require('fs');
const path = require('path');
const R = JSON.parse(fs.readFileSync(path.join(__dirname, 'six_valuation_20261025_results.json'), 'utf8'));

const qual = {
  '中移动H': {
    code: '00941.HK', localName: '中国移动（H）', grade: 'B', gradeNote: '好公司但回报不足以形成新增仓位',
    essence: '本质上是在买一张受监管、低增长但现金流极稳的准公用事业高股息票据。',
    axes: {
      demand: '需求轴：稳定但结构性下降。传统C端通信收入承压，算力/智能服务是增量但对冲有限。',
      profitPool: '利润池轴：电信主业稳定，非经常损益造成Q3表观波动；扣非后基本持平。',
      paradigm: '范式风险轴：低。受监管成熟行业，AI/算力是改良型机会，不是范式颠覆。'
    },
    dims: [
      ['护城河', 'A', '规模、频谱、网络与政企渠道极强；资本开支纪律可控'],
      ['客户需求持续性', 'B+', '通信是刚需，但ARPU受增值税和消费电子周期压制'],
      ['财务质量', 'A-', '经营现金流同比+15.1%，净利润现金含量174%'],
      ['盈利能力', 'B', 'ROE约7.5%，显著低于消费类公司，但稳定性高'],
      ['成长性', 'C+', '前三季收入-1.8%、归母-7.9%；算力贡献尚未形成主升'],
      ['管理层与治理', 'B+', '派息承诺70%+兑现良好；国企治理有稳健性但非股东极致导向'],
      ['资本配置', 'B', '资本开支同比收敛，现金回报取向明确'],
      ['抗风险', 'A-', '政策与监管风险低，现金流对价格战有缓冲']
    ],
    benchmark: '对茅台：质量更稳但成长和盈利能力显著不足；对电信直接同行（中电信/中联通）：盈利稳定性与股息率最强。',
    opposite: '最强反方：若把它按“衰退型公用事业”定价，长期增长可能接近0，股息率才是全部价值来源；一旦派息率或EBITDA率走弱，估值会继续下移。',
    audit: '估值审计门未全过；H10/H12等当前仅为敏感性草案。本报告结论不依赖档位：基准税后IRR已显著低于10%要求。',
    gate: '回报门未过',
    fourth: '不新增。不进入建仓序列；如已持有，仅作为股息型观察仓维持，不因价格便宜而提高仓位。',
    confidence: '高（结论方向）；中（具体情景数值）'
  },
  '宁德A': {
    code: '300750.SZ', localName: '宁德时代（A）', grade: 'A', gradeNote: '质量强，但盈利中枢下移与资本配置仍未闭合',
    essence: '本质上是在赌“全球动力+储能龙头的单位盈利能在产业链再分配中守住底线”。',
    axes: {
      demand: '需求轴：全球电动化与储能需求仍强，Q3出货260GWh、储能接近翻倍。',
      profitPool: '利润池轴：恶化。单位净利降至约0.072-0.082元/Wh，毛利率20.7%为近四年低位。',
      paradigm: '范式风险轴：中。车企自研电池、消费税与出口退税调整正在改变利润分配结构。'
    },
    dims: [
      ['护城河', 'A', '全球动力份额39.4%、海外33.7%，规模与研发优势明显'],
      ['客户需求持续性', 'A-', '全球需求真实且长期，但车企供应链去宁德化是中期威胁'],
      ['财务质量', 'B+', 'Q3经营现金流单季仅约14亿元；存货增加139.5亿元'],
      ['盈利能力', 'B', 'ROE仍高，但毛利率、单位盈利连续三季下滑'],
      ['成长性', 'A-', '收入+56.2%，但净利增速逐季放缓至14.5%'],
      ['管理层与治理', 'B+', '战略执行力强；200-400亿注销式回购是正面信号'],
      ['资本配置', 'B', '产能扩张仍在加大，短期现金流被压缩；回购部分对冲'],
      ['抗风险', 'B', '政策税负和产业链再分配是真实压力，非一次性事件可完全解释']
    ],
    benchmark: '对茅台：成长性更强，但盈利确定性和商业模式质量不如茅台。对最优直接竞争者（比亚迪电池、LGES等）：技术与份额仍领先，但单位盈利压力同样来自行业性利润池恶化。',
    opposite: '最强反方：摩根大通判断这不是单季扰动而是盈利中枢下移；理想、小米、小鹏推进自研/多供应商，长期8%盈利增长需要约16%增量资本回报支撑，目前没有充分证据。',
    audit: '审计门未过：正常化840亿利润需完成归母、稀释股本、所有者收益三重勾稽；12倍终值仅为当前证据下的有条件上限，不是正式经济价值。',
    gate: '审计门未过；回报门未过',
    fourth: '不新增。即便A类，当前模型基准税后IRR约8.99%仍低于10%回报要求；等待三季报后盈利中枢更清晰，或价格进入H12附近再复核。',
    confidence: '中高（质量判断）；中（长期盈利假设）'
  },
  '泡泡玛特': {
    code: '09992.HK', localName: '泡泡玛特', grade: 'B', gradeNote: 'IP平台化能力真实，但需求波动与利润率修复不确定',
    essence: '本质上是在买一个“能否从单一爆款IP过渡为多IP、多业态、全球化平台”的转化率期权。',
    axes: {
      demand: '需求轴：中国内地+47.3%仍强，海外-11.1%确认流量红利退潮。',
      profitPool: '利润池轴：中性偏弱。LABUBU收入-7.5%，海外经营利润率下行；平台多IP化尚在验证。',
      paradigm: '范式风险轴：中。潮玩从爆品驱动向会员/IP矩阵驱动切换，若切换失败则增长中枢明显下移。'
    },
    dims: [
      ['护城河', 'B+', 'IP矩阵、乐园、渠道和会员体系构成平台雏形'],
      ['客户需求持续性', 'B', '潮玩是情绪消费，单一IP周期性已被LABUBU回撤证实'],
      ['财务质量', 'A-', '账面现金充裕，2026H1净利率35%，中报质量仍优'],
      ['盈利能力', 'A-', '毛利率72.1%，H1净利率仍高'],
      ['成长性', 'B', 'H1收入+23.8%，但Q3第三方跟踪降幅-30%至-50%不等'],
      ['管理层与治理', 'B+', '20-50亿回购增强信心；管理层已承认“整理年”'],
      ['资本配置', 'B+', '大额回购是当下最有力的资本配置动作'],
      ['抗风险', 'B', 'IP风险可分散但不完全可控，海外本地化仍在调整']
    ],
    benchmark: '对茅台：品牌黏性、定价权和利润率稳定性明显不如茅台。对直接同业：规模、IP矩阵、全球化能力在中国潮玩第一，仍优于名创优品等渠道型对手。',
    opposite: '最强反方：Q3高盛/摩根大通/花旗跟踪降幅-30%到-50%，如果Q4不能验证边际改善，市场会按“爆款退潮”重定价；PB 6.6倍对ROE假设高度敏感。',
    audit: '审计门未过：Q3正式公告未发布，机构渠道数据不能作为事实。正常化95亿利润需待官方数据确认。',
    gate: '审计门未过；回报门条件性达标但依赖情景',
    fourth: '不新增。当前持有约4,400股、约占4.99%，已达B类正常上限；旧8,400股方案超过8%硬上限，不应继续自动执行。等待Q3/Q4官方数据后再复核条件单。',
    confidence: '中（需求方向）；中高（财务与治理）'
  },
  '老铺黄金': {
    code: '06181.HK', localName: '老铺黄金', grade: 'C', gradeNote: '商业模式尚未证明能脱离金价周期，质量门未过',
    essence: '本质上是在赌“高端古法金的品牌溢价能否在金价下行周期仍维持需求与毛利”。',
    axes: {
      demand: '需求轴：不稳定。金价上行期靠涨价预期抢购，下行期观望；2月提价透支Q2需求。',
      profitPool: '利润池轴：恶化。Q2单季净利5.1-7.6亿元，环比下滑超80%；首次公开折扣说明定价体系松动。',
      paradigm: '范式风险轴：中高。若消费叙事从“文化奢侈品”退回“黄金珠宝”，估值锚将被永久性下修。'
    },
    dims: [
      ['护城河', 'B', '45家顶级商场直营、品牌叙事和会员73万是真实优势，但二手市场几乎不承认溢价'],
      ['客户需求持续性', 'C+', '与金价强挂钩，尚未证明脱离周期'],
      ['财务质量', 'C+', '存货190.18亿、周转271天、速动比率0.39；2025年经营现金流曾-68.5亿'],
      ['盈利能力', 'B+', 'H1毛利率41.3%、净利率21.5%，但Q2已骤降'],
      ['成长性', 'B-', 'H1收入+60.3%，但Q2环比崩塌，Q4高基数压力大'],
      ['管理层与治理', 'B-', '零对冲囤货策略是主动的激进选择；首次打折说明定价纪律弱化'],
      ['资本配置', 'C+', '资本大量沉淀在库存与门店扩张，高位配售与现金分红同时存在'],
      ['抗风险', 'C', '金价+库存+流动性结构共同放大下行风险']
    ],
    benchmark: '对茅台：完全不具备同等品牌定价权与周期抗性。对最优直接竞争者周大福：周大福规模、品类标准与对冲能力更强；老铺只在单位效率和短期品牌势能上领先。',
    opposite: '最强反方：市场已经把“奢侈品故事”按“黄金珠宝商”定价；如果金价继续下行，首次折扣和190亿存货会同时侵蚀毛利率与资产负债表，而不是提供一个安全垫。',
    audit: '审计门未过：58亿正常化利润是主观假设，尚未完成与Q2实际坍塌口径的勾稽；本轮终值PE已按规则下调至基准7倍、悲观5倍，仍不能视为正式估值。',
    gate: '质量门未过；估值审计门未过',
    fourth: '不进入第四步。C类不进观察池，新增仓位为0。即便后续价格跌至H12附近，也只在质量证据改善后重审。',
    confidence: '高（不建仓方向）；低（长期品牌力）'
  },
  '江南布衣': {
    code: '03306.HK', localName: '江南布衣', grade: 'B', gradeNote: '质量稳健但增长上限清晰，且审计门未过',
    essence: '本质上是在买一张“高复购会员体系 + 极高派息 + 低增长”的稳态消费现金流。',
    axes: {
      demand: '需求轴：稳定。会员贡献零售额80%+、复购率40%+，增长靠同店与线上而非开店。',
      profitPool: '利润池轴：稳定。FY26毛利率66.6%、净利率16.5%，经营现金流+26.5%。',
      paradigm: '范式风险轴：低-中。设计师审美疲劳是长期风险，短期没有范式颠覆迹象。'
    },
    dims: [
      ['护城河', 'B+', '设计师品牌心智+会员切换成本；2118家门店几乎零净增仍实现双增'],
      ['客户需求持续性', 'B+', '高价值会员36万、人均年消费约1.44万元；但新客获取未经检验'],
      ['财务质量', 'A-', '净现金、现金流良好；存货周转166.3天小幅抬升'],
      ['盈利能力', 'A-', 'ROE 39.2%，净利率16.5%领先女装同行'],
      ['成长性', 'B', 'FY26收入+9%、净利+11.1%；增长中枢大概率个位数到低双位数'],
      ['管理层与治理', 'B+', '110%派息率显示现金回报取向；但也反映扩张趋于克制'],
      ['资本配置', 'B+', '门店克制、现金高派息；缺少大额成长型再投资'],
      ['抗风险', 'B+', '会员结构抗周期，但审美迁移是集中风险']
    ],
    benchmark: '对茅台：商业模式质量不如茅台，但现金流质量与派息风格更接近“小型收息股”。对最优直接竞争者比音勒芬：比音勒芬增长更快、毛利率更高；江南布衣胜在会员复购体系与利润稳定性。',
    opposite: '最强反方：110%派息含特别股息，不可外推；若核心客群年龄迁移或设计舆情重演，增长与估值可能同时受压。',
    audit: '审计门未过：10.5亿正常化利润需与FY26口径勾稽；常态派息率应按约75%测算，不能把110%或特别股息直接推入未来十年现金流。',
    gate: '审计门未过；回报门草案达标但依赖派息率假设',
    fourth: '暂不新增。草案十年加权CAGR约10.3%，接近但不足以在审计完成前给出建仓指令；完成审计后可考虑作为组合辅助型小仓候选。',
    confidence: '中高（质量与现金流）；中（十年派息假设）'
  },
  '东鹏A': {
    code: '605499.SH', localName: '东鹏饮料（A）', grade: 'A', gradeNote: '六只中质量与回报综合最优，但客户需求持续性仍需Q3验证',
    essence: '本质上是在买“渠道密度 + 平台化新品接力”能否把单品公司变成饮料平台公司。',
    axes: {
      demand: '需求轴：结构性增长。能量饮料见顶信号出现，但补水啦、茶饮、咖啡接力验证平台能力。',
      profitPool: '利润池轴：稳定偏强。毛利率48.36%、净利率23.0%，渠道利润机制形成正反馈。',
      paradigm: '范式风险轴：低-中。饮料行业格局稳固，最大风险是品类竞争加剧而非范式颠覆。'
    },
    dims: [
      ['护城河', 'A', '460万+终端、3700+经销商、70万+冰柜；渠道密度与利润分配机制难以复制'],
      ['客户需求持续性', 'B+', '能量饮料渗透率见顶、Q2华南仅+2.89%；新品类持续性尚未经完整周期验证'],
      ['财务质量', 'A', '净现金，2026H1经营现金流TTM 69.26亿（+43.2%）'],
      ['盈利能力', 'A', '2025年ROE 46.9%、ROIC 28.2%；H1仍维持高位'],
      ['成长性', 'A-', 'H1收入+15.9%，非能量饮料占比升至28.08%'],
      ['管理层与治理', 'B+', '渠道执行力极强；港股二次上市后治理更规范'],
      ['资本配置', 'B+', '产能扩张与新品投入节奏清晰，净现金下没有过度杠杆'],
      ['抗风险', 'A-', '渠道与现金储备提供缓冲；品类竞争是主要变量']
    ],
    benchmark: '对茅台：商业模式质量仍低一档，茅台是品牌定价权，东鹏是渠道效率与性价比。对最优直接竞争者农夫山泉：东鹏在能量饮料赛道份额第一、渠道下沉更强，但品牌溢价和品类广度不如农夫。',
    opposite: '最强反方：东鹏特饮2026H1只增长6.89%、Q2约+1.4%，大单品拐点可能比平台化成功更早到来；如果茶饮和补水啦增速回落，A类判断将被迫下调。',
    audit: '审计门未过：52亿正常化利润是假设，需等2026-10-29三季报完成归母、EPS、所有者收益勾稽；当前H10/H12仅为草案。',
    gate: '审计门未过；回报门草案通过',
    fourth: '暂不新增，等待三季报后优先复核。若Q3确认平台化增速、渠道效率和非能量饮料占比继续提升，它是六只中最有资格进入观察池并推进第四步的标的。东鹏H虽然模型回报更高，但A/H相对价格门槛失败（折价23.46%<25%），本轮不纳入。',
    confidence: '中高（质量与渠道）；中（十年增长假设）'
  }
};

const order = ['中移动H', '宁德A', '宁德H', '泡泡玛特', '老铺黄金', '江南布衣', '东鹏A', '东鹏H'];
const names = ['中移动H', '宁德A', '泡泡玛特', '老铺黄金', '江南布衣', '东鹏A'];
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function pct(x) { return (x >= 0 ? '+' : '') + x.toFixed(2) + '%'; }
function scenarioRow(name, s) {
  const rows = Object.entries(s.scenarios).map(([k, v]) => `<tr><td>${k}</td><td>${(v.weight*100).toFixed(0)}%</td><td>${pct(v.y1Drop*100)}</td><td>${pct(v.g*100)}</td><td>${(v.payout*100).toFixed(0)}%</td><td>${v.terminalPE}x</td><td>${pct(v.irr10AfterTax)}</td><td>${pct(v.totalReturn10AfterTax)}</td><td>${v.detail10.dividendAfterTaxCny}</td><td>${v.detail10.terminalLocal} ${s.ccy}</td></tr>`).join('');
  return `<div class="tblwrap"><table><thead><tr><th>情景</th><th>权重</th><th>Y1变动</th><th>后续g</th><th>派息率</th><th>终值PE</th><th>十年税后IRR</th><th>十年总回报</th><th>十年累计税后股息(CNY/股)</th><th>第10年终值(${s.ccy}/股)</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
function thresholdRow(name, s) {
  const t = s.thresholdDraft;
  return `<div class="tblwrap"><table><thead><tr><th>H10</th><th>H12</th><th>H15</th><th>H17.46</th><th>当前价</th></tr></thead><tbody><tr><td>${t.H10}</td><td>${t.H12}</td><td>${t.H15}</td><td>${t['H17.46']}</td><td>${s.price} ${s.ccy}</td></tr></tbody></table></div>`;
}
function stressRow(name, s) {
  const st = s.stress10PreTax;
  const fx = s.fxRmbIrr10Base ? `<tr><td>汇率压力</td><td>HKD +10%: ${pct(s.fxRmbIrr10Base.hkdPlus10)}；不变: ${pct(s.fxRmbIrr10Base.stable)}；HKD -10%: ${pct(s.fxRmbIrr10Base.hkdMinus10)}</td></tr>` : '';
  return `<div class="tblwrap"><table><tbody><tr><td>PE -30%</td><td>${pct(st.peMinus30)}</td></tr><tr><td>EPS -20% 且 PE -30%</td><td>${pct(st.epsMinus20AndPeMinus30)}</td></tr><tr><td>联合压力（EPS-20%、g-3pct、派息-10pct、PE-30%）税前IRR</td><td>${pct(st.jointEps20Growth3Payout10Pe30)}</td></tr>${fx}</tbody></table></div>`;
}
function dimsTable(name) {
  const q = qual[name] || qual[name.replace('H', 'A')];
  const rows = q.dims.map(d => `<tr><td>${d[0]}</td><td>${d[1]}</td><td>${d[2]}</td></tr>`).join('');
  return `<div class="tblwrap"><table><thead><tr><th>维度</th><th>评级</th><th>依据</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
function companySection(name, idx) {
  const s = R.stocks[name] || R.stocks[name.replace('H', 'A')];
  const q = qual[name] || qual[name.replace('H', 'A')];
  const title = name === '宁德H' ? '宁德时代（H，03750.HK）' : name === '东鹏H' ? '东鹏饮料（H，09980.HK）' : `${q.localName}（${q.code}）`;
  const gradeBadge = name === '宁德H' ? 'A（跟随宁德A）' : name === '东鹏H' ? 'A（跟随东鹏A）' : q.grade;
  const note = name === '宁德H' ? '仅作为A/H双门槛校验，不单独建仓' : name === '东鹏H' ? '仅作为A/H双门槛校验，不单独建仓' : q.gradeNote;
  return `<section class="company" id="s${idx}"><h2>${idx}. ${title} — ${gradeBadge}</h2><p class="note">${esc(note)}</p><p class="essence">${esc(name === '宁德H' || name === '东鹏H' ? '上市主体与A股同源，本节只处理价格、税费与A/H门槛差异；经营判断见对应A股部分。' : q.essence)}</p>${name === '宁德H' || name === '东鹏H' ? '' : `<h3>第一步 · 细分市场三轴</h3><ul>${Object.values(q.axes).map(a=>`<li>${esc(a)}</li>`).join('')}</ul><h3>第二步 · 八维与质量双对标</h3>${dimsTable(name)}<p><strong>双对标：</strong>${esc(q.benchmark)}</p>`}<h3>第三步 · 情景与估值草案（非正式档位）</h3>${scenarioRow(name, s)}${thresholdRow(name, s)}${stressRow(name, s)}<p class="warn">草案状态：${esc(R.status)}。以上H10/H12/H15/H17.46只是按基准情景反算的十年要求回报门槛，不代表可下单价。</p>${name === '宁德H' || name === '东鹏H' ? '' : `<h3>最强反方</h3><p>${esc(q.opposite)}</p><h3>审计门与风险去重</h3><p>${esc(q.audit)}</p><h3>第四步方向</h3><p>${esc(q.fourth)}</p><p class="conf">置信度：${esc(q.confidence)}</p>`}</section>`;
}
const chartNames = ['中移动H', '宁德A', '泡泡玛特', '老铺黄金', '江南布衣', '东鹏A'];
const chartData = chartNames.map(n => R.stocks[n].weighted['10y'].equivalentCagr);

let html = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>六标的四步法研究草案 2026-10-25</title><script src="https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js"></script>
<style>
:root{--ink:#1a2233;--mut:#5a6478;--bg:#f6f7fa;--card:#ffffff;--line:#dfe3ea;--red:#c0392b;--green:#1e8e5a;--amber:#b7791f;--blue:#2b6cb0}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.65 -apple-system,"PingFang SC","Microsoft YaHei",sans-serif}
.wrap{max-width:1080px;margin:0 auto;padding:24px 16px 80px}
h1{font-size:26px;margin:0 0 4px}h2{font-size:21px;margin:36px 0 10px;border-left:4px solid var(--blue);padding-left:10px}h3{font-size:16px;margin:20px 0 8px;color:var(--mut)}
.meta{color:var(--mut);font-size:13px}
.banner{background:#fff7e6;border:1px solid #e6c78a;border-radius:10px;padding:12px 14px;margin:14px 0;font-size:14px}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin:18px 0}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px}
.card .g{font-size:22px;font-weight:700}.card .n{font-size:13px;color:var(--mut)}
.tblwrap{overflow-x:auto;margin:10px 0}table{border-collapse:collapse;width:100%;font-size:13px;background:var(--card)}
th,td{border:1px solid var(--line);padding:6px 9px;text-align:left;white-space:nowrap}th{background:#eef1f6}
.company{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:18px 20px;margin:18px 0}
.warn{background:#fdecea;border:1px solid #f0b8b0;border-radius:8px;padding:8px 12px;font-size:13px}
.essence{background:#eef4fb;border-left:3px solid var(--blue);padding:8px 12px;font-size:14px}
.note{color:var(--mut);font-size:13px;margin:2px 0 8px}.conf{color:var(--mut);font-size:13px}
ul{margin:6px 0 10px;padding-left:20px}li{margin:3px 0}
#chart{width:100%;height:380px;margin:12px 0}
.pos{color:var(--red)}.neg{color:var(--green)}
footer{margin-top:40px;font-size:12px;color:var(--mut);border-top:1px solid var(--line);padding-top:14px}
</style></head><body><div class="wrap">
<h1>六标的四步法研究草案</h1>
<div class="meta">编制日期：2026-10-25（周日）｜价格锚：2026-10-23收盘｜HKDCNY=${R.hkdcny}｜口径：v3.4三步个股+第四步组合</div>
<div class="banner"><strong>本页所有价格与档位均为“研究草案”，非正式经济价值、非正式H档、非下单指令。</strong> 估值审计门未全过；所有标的未经郎刚确认前不更新平台config、研究库JSON或条件单。</div>
<h2>0. 首屏结论</h2>
<div class="cards">
${names.map(n=>`<div class="card"><div class="n">${qual[n].code}</div><div class="g">${qual[n].grade}</div><div class="n">${R.stocks[n].weighted['10y'].equivalentCagr.toFixed(1)}% 十年加权CAGR（草案）</div></div>`).join('')}
</div>
<p>综合排序（质量×草案回报，仅供研究讨论，非建仓序列）：<strong>东鹏A ≈ 宁德A（质量强但回报门/审计门未过）&gt; 泡泡玛特 ≈ 江南布衣（B类，一个等Q3、一个等审计）&gt; 中移动H（回报不合格）&gt; 老铺黄金（C类，不进第四步）</strong>。宁德H、东鹏H仅作A/H门槛校验。</p>
<h2>1. 横向对比：十年加权等效CAGR（草案）</h2>
<div id="chart"></div>
<div class="tblwrap"><table><thead><tr><th>标的</th><th>代码</th><th>价格</th><th>质量</th><th>正常化EPS(CNY)</th><th>正常化PE</th><th>基准税后IRR(10y)</th><th>十年加权CAGR</th><th>联合压力税前IRR</th><th>方向</th></tr></thead><tbody>
${names.map(n=>{const s=R.stocks[n],q=qual[n];return `<tr><td>${q.localName}</td><td>${q.code}</td><td>${s.price} ${s.ccy}</td><td>${q.grade}</td><td>${s.normalEpsCny}</td><td>${s.normalPE}x</td><td>${pct(s.scenarios['基准'].irr10AfterTax)}</td><td>${pct(s.weighted['10y'].equivalentCagr)}</td><td>${pct(s.stress10PreTax.jointEps20Growth3Payout10Pe30)}</td><td>${{ '中移动H':'不新增','宁德A':'等待三季报后复核','泡泡玛特':'不新增，复核条件单','老铺黄金':'不进第四步','江南布衣':'审计后可审小仓','东鹏A':'10-29后优先复核' }[n]}</td></tr>`;}).join('')}
</tbody></table></div>
<p class="meta">注：加权CAGR=先加权情景期末财富再反推等效CAGR，主观权重；联合压力=正常化EPS-20%、长期g-3pct、派息率-10pct、终值PE-30%同时发生。</p>
<h2>2. A/H 双门槛（只用统一汇率0.8503计算）</h2>
<div class="tblwrap"><table><thead><tr><th>标的</th><th>A股价(CNY)</th><th>H股价(HKD)</th><th>H折A股CNY</th><th>相对折价</th><th>≥25%相对门槛</th><th>本轮处理</th></tr></thead><tbody>
${['中移动H','宁德H','东鹏H'].map(k=>{const a=R.ah[k];const pass=a.relative25?'通过':'失败';return `<tr><td>${k}</td><td>${a.aPrice}</td><td>${a.hPrice}</td><td>${(a.hPrice*R.hkdcny).toFixed(2)}</td><td>${pct(a.discount)}</td><td>${pass}</td><td>${k==='中移动H'?'H折价达标，但回报门不合格，仍不新增':k==='宁德H'?'H较A溢价，双门槛失败，不纳入':'折价23.46%不足25%，双门槛失败，不纳入'}</td></tr>`;}).join('')}
</tbody></table></div>
<p class="meta">折价扩大本身不是买入信号；A/H门槛失败时即便模型回报更高也不纳入建仓序列。</p>
<h2>3. 第四步组合约束（有条件触发，本轮大部分未触发）</h2>
<ul>
<li>现金池约659.8万元，现金占比约66.8%；十年至5000万所需CAGR约17.60%（四大师框架口径）。</li>
<li>B类首次1%-2%、正常3%-5%、硬上限8%；A类目标型硬上限15%、辅助型10%；C/D类仓位为0。</li>
<li>泡泡玛特当前约4,400股、约4.99%，已达B类正常上限；旧8,400股方案约9.52%，超过8%硬上限，不得继续自动执行。</li>
<li>招行约9.34%已超B类8%硬上限，需单独重审（不属于本页六标的范围，但约束联动）。</li>
<li>本页六个标的中，本轮没有任何一个同时满足“质量门+审计门+回报门+A/H门（如适用）”，因此不产生新的下单价或条件单。</li>
</ul>
<h2>4. 分标的研究</h2>
${order.map((n,i)=>companySection(n,i+1)).join('')}
<h2>5. 后续动作清单（需郎刚确认后才执行）</h2>
<ul>
<li>东鹏饮料2026-10-29三季报后重跑估值与审计门；</li>
<li>泡泡玛特正式Q3经营公告发布后重跑，并复核剩余条件单；</li>
<li>老铺黄金正式Q3/Q4经营数据发布后复核C类判断；</li>
<li>宁德时代补三重终值证据与长期8%增长验证；</li>
<li>所有正常化利润完成归母-稀释股本-EPS-所有者收益勾稽后，才讨论正式经济价值与正式H档；</li>
<li>本报告与估值脚本、结果JSON提交Git，并按“归档双写”纪律在确认后同步知识库。</li>
</ul>
<footer>数据来源与时点：行情与估值取2026-10-23收盘（westock行情口径）；中移动H、宁德A/H为2026-10-20三季报；泡泡玛特为2026-08-20中报+机构渠道跟踪（非官方）；老铺黄金为2026-08-25中报+2025年报；江南布衣为FY2026（截至2026-06-30）年报；东鹏为2026-07-31中报，三季报预约2026-10-29。机构预测与渠道调研均标注为非官方，不与公司披露同等处理。本页不构成投资建议。</footer>
</div>
<script>
const el=document.getElementById('chart');
if(el&&window.echarts){
 echarts.init(el).setOption({
  tooltip:{trigger:'axis'},
  grid:{left:60,right:30,bottom:50,top:40},
  xAxis:{type:'category',data:${JSON.stringify(chartNames)},axisLabel:{rotate:20}},
  yAxis:{type:'value',name:'十年加权CAGR(%)'},
  series:[{name:'十年加权CAGR(%)',type:'bar',data:${JSON.stringify(chartData)},itemStyle:{color:'#2b6cb0'},label:{show:true,position:'top',formatter:'{c}%'}}]
 });
}
</script></body></html>`;
const outPath = '/Users/jimislg/Documents/郎刚的芒格/codex-产出/六标的四步法研究草案-20261025.html';
fs.writeFileSync(outPath, html, 'utf8');
console.log('written:', outPath, html.length, 'bytes');
