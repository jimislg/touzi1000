# 2026-10-24 研究补全：共同约束

用户要求把前轮检视缺失内容研究并补充进系统，列完成/待补清单；追加要求单独深入研究中国移动H，宁德时代、泡泡玛特必须重新研究，不直接照抄旧结论。当前只授权研究和本机代码/研究资料更新，不下单、不改现有持仓、现金、交易、原有策略或生产系统，不创建形式上的投资批准。

工作区 `/Users/langgang/Documents/ChatGPT/郎刚的芒格-分之/touzi1000-fix-20261024`，新分支 `codex/research-completion-20261024`。沿用既有HTML研究包形式。输出可公开的公司研究，不把个人流水、持仓金额、密钥或原始账户凭证提交GitHub（仓库为public）。

## 主导流程与来源
- 主导 thesis-tracker；模型/来源核对支持 model-audit-tieout、financial-source-of-truth；这些技能明确要求复杂任务可用独立工作流分解。请读取适用技能与必要来源规则。
- 日期北京时间2026-10-24，已收市，需验证正确证券和最近实际交易日，严禁把抓取时刻冒充报价时刻。
- 现主平台31证券=28发行人；历史HQ额外6家合计34发行人。31活动证券为集成范围；6历史公司附录，不恢复已排除的美的，不把旧池直接升级成新策略。
- 既有研究只作线索：`../touzi1000/research/20261019-all-pools/{companies,model-inputs.json,*-inputs.json}`；三家公司 `../touzi1000/research/20261018-three-companies/`；本仓库 `investment-hq/data/docs/` 和 `codex-产出/` 只读。已有材料10月19日以后仍需查最新一级公告。
- 从官方交易所/公司IR/巨潮实际打开并核对关键文件；官方数据缺2026时明确说，不能把2025当2026或虚构Q3。记录来源URL、文件标题、披露日、报告期、PDF页码/表格与读取状态。若官方文件仅本地有，核对文件出处和真实性，并说明未在线重新取到。
- 不把管理层目标当事实，不编共识、客户访谈或维护CAPEX拆分。

## 每家公司研究必须包含
1. 经营利润池和需求/利润池/范式三轴；8维质量框架逐项通过/存疑/不通过/中性，支持与最强反证。新的评级只为研究建议，不覆盖系统grade。
2. 最新财务收入、归母/扣非、OCF、总现金CAPEX、净现金/负债、股本、EPS，各自报告期和币种。年化/TTM/非GAAP/正常化分清；未核字段用null。
3. 现金桥：OCF减已披露全部CAPEX的保守现金剩余，维护/增长CAPEX未拆时明确未知。股息/回购不得重复计入收益。金融/保险不套OCF。
4. 独立于12%/17.46%门槛的三情景经营假设，EPS增长/派息/税/终值依据；不沿用价格档作为IRR。无证据的关键假设不能产正式买点，可给明确假设的研究敏感性。中国移动H做A/H价差、股息税与汇率敏感性；宁德区分动力/储能/单位经济与技术替代、投资损益；泡泡区分IP/地域/渠道/库存周转和可持续增长、回购稀释。
5. 明确持有逻辑、量化/可核的证伪与复核指标，阈值标“研究建议，未批准”；下一复核触发与日期，经营判断和证券价格判断分开。没有最新价格/估值/模型时不支持交易决定。
6. 旧结论对照：可保留/需修正/应撤回，逐项有证据。
7. 完成清单与剩余缺项，能补不留空，不能核不标done。研究完成不等于独立审计通过、政策审批或券商对账完成。

## 交付
各自 `companies/<id>-20261024.md` 与 `<id>-20261024.json`，原文/source证据可放 `sources/<id>/`。Markdown应完整可读含就近来源链接，约3000—6000中文字符（复杂可更多）。JSON：
{
 "id":"china_mobile", "name":"中国移动", "codes":["0941.HK","600941.SH"], "asOf":"2026-10-24",
 "companyThesisStatus":"intact/watch/untested...", "securityReadiness":"conditional/not_decision_grade...",
 "researchCompletion":"done/partial", "thesis":"...", "breakers":"...", "reviewBy":"2026-...", "reviewTrigger":"...",
 "gradeRecommendation":"...", "gradeRationale":"...", "dimensions":[{"id":1,"verdict":"...","support":"...","counter":"..."}],
 "metrics":[{"id":"revenue","value":null,"unit":"CNY亿元","period":"...","sourceId":"...","label":"fact_source_reported"}],
 "cashBridge":{"ocf":null,"totalCapex":null,"conservativeResidual":null,"maintenanceCapex":null,"basis":"..."},
 "valuation":{"type":"research_scenario","currency":"...","cases":{},"formalAllowed":false,"basis":"..."},
 "monitoring":[{"metric":"...","baseline":"...","trigger":"...","origin":"研究建议，未批准","nextSource":"..."}],
 "oldConclusionChanges":[{"old":"...","new":"...","reason":"...","sourceIds":["..."]}],
 "sources":[{"id":"...","title":"...","url":"...","publishedAt":"...","period":"...","location":"...","readStatus":"read/partial/unavailable","type":"official_filing"}],
 "completedItems":["..."],"remainingGaps":[{"item":"...","reason":"...","requiredEvidence":"...","canPublicResearchResolve":true}]
}
请不要编辑任何真实config、snapshot、核心代码、manifest或其他公司的文件。主线程统一集成、复核和HTML渲染；禁止把研究包标成独立审计/交易批准。
