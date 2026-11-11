# touzi1000 · 投资平台与研究仓库

个人投资工作平台（网页 + 微信小程序）、个股研究库与历史资料归档。
仓库为 **private**，主分支 `main`。

> 首次接触本仓库：先读 [`REPO_STRUCTURE.md`](./REPO_STRUCTURE.md)（结构与命名基线），
> 再读 [`codex-产出/投资平台总导航-20261110.md`](./codex-产出/投资平台总导航-20261110.md)（平台、数据、运维口径）。

## 目录速览

| 目录 | 用途 | 状态 |
|---|---|---|
| `investment-platform/` | 8307 主平台；`config.json` 为唯一主数据 | 活跃 |
| `invest-miniprogram/` | 微信小程序；core 由 web 端同步生成 | 活跃 |
| `investment-hq/` | 个股研究库（`data/stocks/*.json`） | 活跃 |
| `codex-产出/` | 分析报告、SOP、总导航 | 活跃，外部知识库双写 |
| `evidence/` | 研究原始 PDF 与工作底稿 | 只读保留，被脚本引用 |
| `archive/` | 交付说明、配置备份、日志、旧版草稿、第三方运行时 | 只读保留 |
| `legacy/long-term-tracker/` | 4173 旧驾驶舱系统 | 冻结，仍可运行 |
| `delivery-tests/`、`research/` | 2026-10 验收与研究快照 | 冻结，被交付清单引用 |
| `scripts/`、`.github/` | 测试、部署、CI | 路径即接口，改名需同步引用 |

## 常用命令

```bash
node ../scripts/test-offline.js          # 离线测试全套件（在 investment-platform/ 下用 npm test）
bash scripts/deploy-vultr.sh status      # 查看 VPS 部署状态
node scripts/verify-delivery.js          # 10-24 一次性交付验收（已与当前基线不兼容，见结构文档）
```

## 三条纪律

1. **不改路径**：`investment-platform/`、`invest-miniprogram/`、`investment-hq/`、
   `codex-产出/`、`research/20261024-evidence-completion/` 被测试与部署脚本硬编码，
   改名或移动前必须先同步改引用方。完整约束见 `REPO_STRUCTURE.md` 第四节。
2. **不删归档**：`archive/` 与 `evidence/` 是有意入库的历史记录，不加入 `.gitignore`。
3. **双写与同步**：报告定稿同轮双写知识库；web core 改动后运行
   `node invest-miniprogram/scripts/sync-core.js` 保持两端一致。

## 历史与回滚

2026-11-11 做过一次命名与归类整理（249 次 `git mv`，未删除任何文件）。
整理前锚点 tag `pre-reorg-20261111`，完整前后路径映射在
`archive/REORG-MAP-20261111.json`，决策理由与回滚方法见 `REPO_STRUCTURE.md`。
