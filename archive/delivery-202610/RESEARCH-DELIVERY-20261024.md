# 全股票池研究补全交付（2026-10-24）

主入口：`investment-platform/public/research/index.html`，包含34家公司补全清单、三季披露状态、估值影响和逐公司来源。中国移动H、宁德时代、泡泡玛特分别为独立完整重研，其余31家为逐公司证据刷新与旧估值因素复核。现金和模型仍有决定性缺项，不能称全部已核准或支持所有现价交易。

## 代码与数据边界

分支 `codex/research-completion-20261024`；本轮回滚点 `c86bc3a56d5a184a1daf669936061fed78585f80`。保留前轮安全修复的完整交付基线a13a049，manifest仍对这一共同起点逐文件对账。

- `/api/config`响应附带`_researchSupplement`只读研究资料，账户版本计算排除此展示字段，普通保存不能写入它。
- 网页公司研究和小程序观察页显示持有逻辑、反证、复核日、剩余项；网页可打开完整研究与清单。
- 正式研究、审计、策略、总账和批准均不自动补写。服务端预览必须让审计和执行批准同时引用`researchSupplementVersion`，新证据会阻断未重新审阅的旧批准；该版本确认本身不代替其他执行门槛。
- 研究包缺失/损坏时继续提供账户读取，但预览不能确认最新研究版本，执行失败关闭。不会因缺公司研究而把原账户写坏。
- `research-supplement.json`是公开公司资料。真实config、holdings、trades、cash、原策略、accessKey、小程序config/snapshot、HQ和旧研究产物均未改。
- `scripts/deploy-vultr.sh`代码白名单加入研究模块和公开HTML/JSON，默认干跑，仍需用户明确说发布及同提交CI。**本轮未发布生产。**

## 复现与验收

离线：`node scripts/test-offline.js`共15入口；`--with-http`共16入口。临时合成配置HTTP、网页交互与研究报告浏览器均不写生产。

浏览器：`node investment-platform/test-browser-safety.js`和`node investment-platform/test-research-browser.js`，传`PLAYWRIGHT_MODULE`及必要的`CHROME_EXECUTABLE`。原文日志、截图在`delivery-tests/research/`，后续GitHub Actions上传同提交验收证据。

研究页重新生成：`python3 scripts/build-research-completion.py`，纯本地读取公共输入、生成公司JSON/MD与公开HTML；不联网、不读写账户。使用随交付保留的公共source-receipts.json索引；不依赖忽略的原始PDF或私人目录。

`node scripts/verify-delivery.js`对齐全部变更与哈希。账户勾稽工具`scripts/reconcile-research-account.js`只读输入，输出强制private目录；私人勾稽结论未公开提交。详细证据边界见`research/20261024-evidence-completion/SOURCE_QA.md`。

上线后的验收需由落地侧再次核对真实持仓/交易数、配置revision，及两端显示的研究版本；代码发布不夹带服务器账户配置。

研究版本包含全部公司证据JSON与正文的SHA-256摘要；正文、来源或估值假设改变即产生新版本，原审计/批准对旧版本的确认失效。生成过程使用公共输入，可离线重复。

## 本机验收结果

- 离线与真实HTTP合成账户验收16/16入口通过；HTTP 11项。
- 研究证据238项通过，包含34家覆盖、现金算术、三份重研三情景IRR独立折现、来源引用和审批分离。
- 系统页面14项、研究报告页面12项浏览器检查通过；桌面与390px手机截图已人工查看。
- 公共输入离线重复生成105份结果逐字节不变；当前网站31证券与研究映射无遗漏。
- 账户勾稽只读，私人HTML/JSON不随public仓库提交。原文版权文件仅留本机，提交的是URL、页码及校验回执。
- 全套原文日志和截图：delivery-tests/research/。交付仍需同提交GitHub CI验收，未发布生产。
