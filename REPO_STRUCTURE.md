# 仓库结构与命名说明（2026-11-11 整理）

> 本文件是仓库的**结构基线文档**。目的：把历次迭代留下的目录、文件和命名约定记录下来，
> 使以后任何一次调整都能先查到这里，再决定动哪里、为什么动、动过之后怎么回退。
>
> 整理原则：**只归类与改名，不删除任何文件**。所有移动均通过 `git mv` 完成，Git 保留完整重命名历史。
> 整理基线：`7f264db`（2026-11-10「投资平台总导航」），整理前锚点 tag：`pre-reorg-20261111`。

---

## 一、整理前基线（2026-11-11 体检数据）

| 指标 | 数值 |
|---|---|
| 跟踪文件 | 892 个（本地含未跟踪共 1,086 个） |
| 入库内容体积 | 122.6 MB |
| `.git` 历史体积 | 72 MB |
| 提交总数 | 120 |
| 初始提交 | `a13a049`，一次导入 681 文件 / 86 万行（历史包袱的根源） |
| 内容完全相同的文件 | 70 组 / 157 个文件 / 6.6 MB 冗余 |
| 体积大头 | `tmp/` 105.8 MB（占入库体积 86%） |

体检结论：仓库同时存在**一套主用系统 + 两套历史系统 + 一个小程序 + 一次性交付快照**，
且运行产物与历史备份混在平台目录内。本次据此做分层归类。

---

## 二、当前目录分层

| 层 | 目录 | 状态 | 说明 |
|---|---|---|---|
| 主用系统 | `investment-platform/` | 活跃 | 8307 投资平台；`config.json` 为唯一主数据，`public/investment-core.js` 为唯一 core 源 |
| 小程序 | `invest-miniprogram/` | 活跃 | core 由 web 端同步生成，两份应保持字节一致 |
| 研究数据 | `investment-hq/data/` | 活跃 | 个股研究库；`stocks/*.json`、`methodology.json` |
| 报告归档 | `codex-产出/` | 活跃 | 分析报告与 SOP；按「双写纪律」与外部知识库同步 |
| 交付快照 | `delivery-tests/`、`research/` | 冻结 | 2026-10 验收与研究快照，被交付清单和测试脚本引用 |
| 工具链 | `scripts/`、`.github/`、`ops/` | 活跃/冻结 | 测试、部署、研究脚本；CI 配置 |
| **证据层** | `evidence/` | 本次新建 | 研究原始 PDF 与工作底稿（**被脚本引用，不可随意改名**） |
| **归档层** | `archive/` | 本次新建 | 交付说明、配置备份、日志、第三方运行时、旧版草稿；只读保留 |
| **历史系统** | `legacy/long-term-tracker/` | 本次隔离 | 4173 端口「长期投资驾驶舱」，2026-10-23 后冻结但仍可运行 |

根目录只保留 6 份说明/配置文件：`README.md`、`REPO_STRUCTURE.md`、`COLLABORATION.md`、
`INVESTMENT_POLICY.md`、`运维手册.md`、`package.json`、`delivery-manifest.json`。

---

## 三、本次改动映射（249 次重命名）

完整的逐文件前后路径见 **`archive/REORG-MAP-20261111.json`**（机器可读，含 `from` / `to`）。
该文件记录 249 条逻辑移动；Git 本次提交识别为 248 条 rename，差异是旧 `README.md` ——
其内容完整保存在 `legacy/long-term-tracker/README.md`，但因根目录重建了同名新 README，
Git 显示为「根 README 修改 + legacy 新增」。分组摘要如下：

| 原位置 | 新位置 | 数量 | 命名规则 |
|---|---|---|---|
| `DELIVERY.md`、`RESEARCH_DELIVERY.md`、`SYSTEM_ONLY_DELIVERY.md` | `archive/delivery-202610/` | 3 | `名称-YYYYMMDD.md` |
| `investment-platform/config.json.backup*`（12 个） | `archive/config-backups/` | 12 | `config-YYYYMMDD-描述.json`；无日期的一个记为 `config-unlabeled.json` |
| `logs/` | `archive/logs/` | 2 | 保留原日志名 |
| `tmp/pdf-runtime/` | `archive/pdf-runtime/` | 183 | 第三方 PyMuPDF 运行时，冻结归档 |
| `tmp/pdfs/` | `evidence/pdfs/` | 24 | 研究原始 PDF，保持子目录结构 |
| `tmp/popmart-workbook/` | `evidence/popmart-workbook/` | 11 | 分析工作底稿 |
| 根 `server.js`、`backtest.js`、`public/`、`data/`、`reports/`、`README.md` | `legacy/long-term-tracker/` | 6 个路径 / 10 个文件 | 保持旧系统内部相对结构不变 |
| `codex-产出/` 内 3 个畸形文件名 | 见下 | 3 | 修正为可辨识名称 |

**畸形文件名的具体处理**（内容均与正式版不同，未覆盖、未删除）：

| 原名 | 新名 | 判定依据 |
|---|---|---|
| `最终版-两步投资分析法SOP-v3.0-20260827.mdINLoWc` | `archive/legacy-drafts/两步投资分析法SOP-v3.0-20260827-旧版草稿.md` | 与正式版内容不同，缺「已被 v3.2 复核替代」声明 |
| `tmp06e2xzj4.aigc-tmp` | `archive/legacy-drafts/观察池Gordon理论回报测算-20261017-副本.xlsx` | 实为 Excel 2007+，元信息标题为「观察池Gordon理论回报测算」 |
| `泡泡玛特上市以来销售数据库-20260830.xlsx.inspect.ndjson` | `codex-产出/泡泡玛特上市以来销售数据库-20260830-检视.ndjson` | 检视记录，改为标准 `.ndjson` |

**同步修改的 3 处引用**（归类后为保持可运行所必需）：

1. `scripts/extract_popmart_reports.py`：`tmp/pdfs/popmart-history` → `evidence/pdfs/popmart-history`
2. 根 `package.json`：`start` / `update` / `backtest` 指向 `legacy/long-term-tracker/`
3. `legacy/long-term-tracker/server.js`：`require("./scripts/cmb-valuation")` → `require("../../scripts/cmb-valuation")`

`.gitignore` 同时清洗：删除完全重复的一整段规则（`.DS_Store`、`*.pending`、`*.tmp-*` 各重复一次），
补上 `tmp/`、`logs/`、`config.json.backup*`、`*.aigc-tmp`，并注明 `archive/` 与 `evidence/`
**是有意入库的，不得加入忽略列表**。

---

## 四、明确未改动的部分及原因（重要）

以下路径被工具链硬编码或受交付协议保护，**本次一律保留原名原位**。以后若想改名，
必须先同步修改引用方，否则验收、测试或部署会中断。

| 路径 | 约束来源 |
|---|---|
| `investment-platform/` 全目录 | `scripts/test-offline.js` 列出 11 个测试套件路径；`scripts/deploy-vultr.sh` 列出部署文件白名单 |
| `invest-miniprogram/` 全目录 | `scripts/test-offline.js` 引用 `scripts/sync-core.js --check`、`verify.js`、`verify-network.js` |
| `investment-hq/`、`codex-产出/`、`.workbuddy/`、`investment-platform/config.json` | `scripts/verify-delivery.js` 明确列为 **protected data**，`codex-产出/` 另承担外部知识库「双写归档」约定 |
| `research/20261024-evidence-completion/` | `scripts/build-research-completion.py` 与 `investment-platform/test-research-evidence.js` 硬编码路径 |
| `delivery-tests/`、`delivery-manifest.json` | CI 工作流写入截图；交付清单按路径与 sha256 逐条校验 |
| `scripts/`、`.github/workflows/` | CI 与部署入口，路径即接口 |
| `codex-产出/周检/周检-2026-10-12.md` 等 | 被 `.workbuddy/memory/` 日志以文件名引用，改名会断链；日期格式差异暂保留并登记 |
| `INVESTMENT_POLICY.md` | 自述「400.99 万旧口径、不再作为执行依据」，但作为历史纪律原文保留 |

---

## 五、命名规范（自本次整理起生效）

1. **目录名**：新增目录统一小写英文 + 连字符（`archive/`、`evidence/`、`legacy/`）；
   历史目录 `codex-产出/`、`运维手册.md` 因外部双写与引用关系保留原样。
2. **日期**：统一 `YYYYMMDD`（如 `config-20261105-trades.json`）。现存 4 处 `YYYY-MM-DD`
   位于 `codex-产出/周检/` 与 `.workbuddy/memory/`，因引用关系暂留，后续统一时须同步改引用。
3. **配置备份**：归档备份一律放 `archive/config-backups/`，命名 `config-YYYYMMDD-描述.json`。
   例外：`scripts/deploy-vultr.sh` 在部署时仍会在 `investment-platform/` 生成本地安全备份
   `config.json.backup`（运行时行为，避免改动部署链路），它已被 `.gitignore` 的
   `config.json.backup*` 覆盖，不会入库；需要长期留档时才手工归档到 `archive/`。
4. **报告**：沿用 11-10 总导航约定 `{公司名}-YYYYMMDD-{方法}.md`，归档同轮双写知识库。
5. **扩展名**：文件扩展名必须反映真实格式（`.xlsx` / `.ndjson` / `.md`），
   禁止 `.aigc-tmp`、`.mdINLoWc`、`.xlsx.inspect.ndjson` 一类拼接式临时后缀。
6. **同名隔离**：不同系统的 `server.js` / `public/` / `package.json` 必须分处不同目录，
   不得再在仓库根目录并列出现。

---

## 六、容量与保留决策

**结论：当前没有容量顾虑，因此本次选择全部保留。**

GitHub 官方口径（2026-11 核对）：

| 项 | 限制 |
|---|---|
| 单文件 | > 50 MiB 推送时警告（仍可推送）；> 100 MiB 直接阻断；网页上传 ≤ 25 MiB |
| 仓库体积 | 建议 < 1 GB，强烈建议 < 5 GB；硬上限 100 GB |
| 套餐差异 | 仓库存储上限与免费/付费套餐无关；LFS 配额另计 |

本仓库当前约 200 MB（含历史），最大单文件 30 MB（`archive/pdf-runtime/.../libmupdf.dylib`），
距 1 GB 建议值约 5 倍余量，距 100 MiB 单文件阻断线尚有余量。

**因此**：本次未删除任何文件，重复内容、旧方法论报告、PDF 证据、历史日志全部保留。
需要留意的是两点：① 继续新增单个 > 30 MB 的 PDF 时，单文件 50 MiB 告警线会先到达；
② `git rm` 不会缩小 `.git` 的 72 MB 历史，若将来确需瘦身，须用 `git filter-repo` 重写历史，
会改变所有 commit SHA 并影响双分支，**属于需单独决策的高风险操作**。

---

## 七、已知遗留（本次未处理，供后续参考）

| 事项 | 现状 | 建议 |
|---|---|---|
| 交付验收脚本 | `scripts/verify-delivery.js` 以 10-24 `baseCommit` 逐条比对变更文件，之后 100+ 次提交必然被判为「未声明变更」；2026-11-11 实测运行抛 assertion 失败；Actions 亦无运行记录 | 单独决策：退役，或改造为只做 hash 校验与保护目录检查。本次整理未改动其逻辑 |
| 重复文档 | `codex-产出/` 与 `investment-hq/data/docs/` 有 47 组逐字相同 | 属「双写纪律」有意行为；可改为一处权威 + 引用清单，需先改协议 |
| 重复截图/日志 | `delivery-tests/` 与 `without-repricing/` 21 组 | 一次性验收产物，保留即可 |
| core 双份 | web 与小程序 `investment-core.js` 字节一致 | **不可删**；已有 `sync-core.js --check`，建议纳入 CI |
| 旧方法论 | 8 月「两步投资分析」31 份、v3.0–v3.2 系列 | 现行 SOP 为 v3.4 三步 + 四步法；建议后续加「历史版本」标识而非删除 |
| 死配置 | `publicConfig.json` 指向已删应用；`investment-platform/public/repricing/index.html` 属被否方案残留 | 11-10 总导航「遗留待办」已列，待单独确认 |
| `.DS_Store` | 仍被版本库跟踪（忽略规则对已跟踪文件无效） | 下次清理时 `git rm --cached`，文件本身保留 |

---

## 八、回滚与核对

- 整理前锚点：`git tag pre-reorg-20261111`（基于 `7f264db`）。
- 整体回退：`git revert <本次整理提交>`（保留后续提交历史，推荐）。
- 单文件回退：`git checkout pre-reorg-20261111 -- <原路径>`，原路径从
  `archive/REORG-MAP-20261111.json` 的 `from` 字段查。
- 逐条核对：`git diff --name-status -M pre-reorg-20261111 HEAD`。
- **回滚时须同步还原**第三节列出的 3 处引用修改，否则旧系统脚本会找不到文件。
- 全部 rename 均由 `git mv` 产生，`git log --follow <新路径>` 可追溯完整历史。

---

## 九、权威入口

| 用途 | 位置 |
|---|---|
| 平台/数据/运维口径 | `codex-产出/投资平台总导航-20261110.md` |
| 本仓库结构与命名 | 本文件 `REPO_STRUCTURE.md` |
| 多 Agent 协作强制协议 | `COLLABORATION.md` |
| 历史纪律原文 | `INVESTMENT_POLICY.md`（已非现行执行依据） |
| 平台主数据 | `investment-platform/config.json` |
| 核心计算逻辑 | `investment-platform/public/investment-core.js`（唯一源） |

*维护人：WorkBuddy。本文件在每次目录结构或命名约定变更后同轮更新。*
