# 全池估值与买点刷新：2026-10-24确认稿

用户明确要求全部34发行人新估值、新买点实际重算，输出完整清单待用户确认。主读物沿用独立HTML，模型JSON为可复现支持。未授权把建议写成原策略或执行批准；不修改真实config、HQ、snapshot或旧研究。

主导 equity-model-update + scenario-sensitivity-generator，model-audit-tieout/financial-source-of-truth支持。无Excel原模型，使用现有JSON经营模型作副本重建与HTML确认清单。34发行人=28当前+6历史，共37池内证券；CATL H另做价格对照，不新增股票池。

## 公司输入契约
每家公司一个 models/<id>.json，格式：
{
 "id":"...", "name":"...", "method":"eps/bank/finite_dcf/dividend_proxy/sotp",
 "inputCurrency":"CNY/HKD", "quality":"研究建议/条件观察/暂停新增",
 "epsBasis":"FY2026常态年基准，不把9M乘4/3直接当事实；第一笔年度现金在一年后",
 "cases":{"bear":{"eps0":1,"g1":0,"g2":0,"payout":0.3,"exitPE":10},"base":{...},"bull":{...}},
 "estimateBridge":[{"line":"收入/毛利/税/股数等","reportedAnchor":"...","normalization":"...","newAssumption":"...","sourceIds":["..."]}],
 "changes":[{"variable":"eps0/growth/payout/multiple/架构","old":"...","new":"...","reason":"...","sourceIds":["..."]}],
 "rationale":"每家公司不同的量价、利润率、资本、股本与终值逻辑；假设不冒充事实",
 "cashConstraint":"真实最新OCF-CAPEX-租赁/NCI等怎样限制分红/再投资；不能用净利替代现金",
 "pricedIn":"先按起始EPS比较现价；根模型随后统一计算隐含增长、收益率和价线",
 "downside":"最先失败的因素与损失途径", "activationConditions":["可检查的启用买点前提"],
 "invalidations":["证伪与重新估值触发"], "sources":[{"id":"...","title":"...","url":"https://...","period":"...","publishedAt":"...","location":"...","readStatus":"read/partial/prior_read"}],
 "missingEvidence":["未取得证据，明确估值作用"],"confidence":"中/低"
}
数字均为显式研究假设。eps：第t年EPS=eps0×(1+g1)^min(t,5)×(1+g2)^max(t−5,0)，第1年t=1。现金股息EPS×payout，年10终值EPS10×exitPE，只算一次；回购不另加。增量盈利须以量价/利润/税/稀释桥解释。增长不能只凭希望。
银行case用bps0,roe,payout,exitPB：期初BPS×ROE=EPS；税前DPS=EPS×payout；当期末BPS=期初BPS+EPS−DPS；十年终值期末BPS×exitPB。OCI/资本RWA缺项保留，不能套OCF。
有限路权 finite_dcf 用case annualCashPerShare 列表及residual=0；现金为明确假设的税前普通股分配，附期限/资本支出证据。收费期限未确认则不编实绩，使用保守有限分配敏感性，买点标条件/暂停。房地产资料不足时可dividend_proxy而非伪造NOI，10年现金+终值须明确不是NAV或全公司内在价值。
若用sotp/其他架构先与主线程沟通，不要无数字not_priced。材料缺口大则给条件研究估值+暂停新增，不强行包装正式买点。所有新价格由主线程统一引擎计算。

## 统一定价与税
十年现金流，贴现H10/H12/H15/H17.46；经济价值用现金/资本模型；A且风险无升级10%，B/C及周期/高杠杆/高范式12%，以中间案资本成本±1个百分点列敏感区间，三情景分开，不声称市场12个月目标价。首笔建议价待根线程按风险门槛与悲观压力约束确定，不用现价倒凑收益。
A股长期持有税0%，港股通个人普通现金股息20%，仅股息扣税、终值不再扣股息税。中国移动28%仅条件敏感性，不能替代用户已设20%。HKEX等HKD盈利不再二次FX。汇率由主线程提供独立最新带日期参考，交易成本与港股汇率压力由主线程统一列敏感性。
不改变grade、席位、目标本金、配比或自动批准。当前价只作比较，不强制所有公司有可启用的买点。

## 来源与文件范围
现有完整证据 research/20261024-evidence-completion/companies/<id>-20261024.json/.md、review-notes.json、baseline-public-inputs.json；原PDF/文本在该目录sources（禁止推送）。旧模型 ../touzi1000/research/20261019-all-pools/。需实际核对原文锚及关键资本桥，浏览最新官方源；来源取不到照实标，不编共识/通读。
只编辑本人负责 models/<id>.json 与同名.md解释（可选）；不改根代码、manifest、旧研究或他人文件。任务复杂按skill要求分工，独立回传并由主线程统一校验。
