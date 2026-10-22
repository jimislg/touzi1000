# COLLABORATION.md — 多 Agent 协作协议（本仓库强制）

> 2026-10-18 复盘定稿（郎刚确认）。适用范围：**任何**交给外部 agent（GPT/Codex/其他）修改本仓库代码的场景。
> 背景：2026-10-18 GPT 交付落地时，因交接环节缺陷（验收入口错、对账无完成标准、踩坑知识未共享），工作区/暂存区混版未被发现，6套测试假失败，浪费一轮排查。本协议为治本方案。

## 一、角色边界

| 角色 | 职责 | 决策点 |
|---|---|---|
| 开发 agent（远端，如 GPT） | 功能开发 + **自带测试** + 按《交付协议》提交 | 无（不碰生产数据、不发发布） |
| 落地 agent（本地，如 WorkBuddy） | 验收 + 数据 + 云端 + 发布运维 | 发现问题即停，不得"带病发布" |
| 郎刚 | 决策 | 仅两处：确认策略 / 说"发布" |

## 二、交付协议（开发 agent 必须遵守）

交付分支必须包含三样，缺一即退回：

1. **delivery-manifest.json**：逐文件声明——新增/修改/删除、改动意图、**是否触碰数据或数据结构**（config.json / app_config / 迁移 SQL）。
2. **自测证据**：本仓库全套测试的**运行输出原文**（不是"已通过"三个字）。当前全套=9套，见下文 DoD。
3. **回滚点**：分支名 + 起点提交哈希。禁止在 main / 他人在用的工作分支上直接推。

硬规则：
- **测试与代码同交付**：新增功能必须带测试；改行为必须改断言。
- **数据安全守卫**：任何可能读写生产数据（云端 app_config、本地 config.json、归档目录）的脚本，默认 mock/干跑模式，写操作必须有显式开关（参照 `test-cloud-roundtrip.js` 的 `LG_MOCK_CLOUD=1` 模式）。无守卫的写脚本视为缺陷。
- **不动清单**：`codex-产出/`、`.workbuddy/`、`config.json`、`investment-hq/`、记忆/归档文件——开发 agent 不得删除或重写，最多在 manifest 里提议。

## 三、落地 SOP（落地 agent 逐项执行，顺序不可换）

1. **先跑对方全套测试**——落地验收的入口动作，先于任何人工判断。跑挂了先定位是代码问题还是交接问题，不准跳过。
2. **manifest 逐项对账**：`git diff <交付分支> -- <文件>` 逐文件核对，**完成标准=全部归零**。白名单/挑拣式落地时尤其如此（允许的偏差必须逐条写进提交说明）。
3. **三点核对 git 状态**：`git status`、`git diff`（工作区vs暂存区）、`git diff --cached`（暂存区vs HEAD）三点一致才算落地完成。`MM` 状态是异常信号，必须解释清楚，不许只看一边。
4. **数据安全检查**：manifest 中标记触碰数据的文件，逐一确认守卫生效；涉及 app_config 的同步必须走 `cloud-store.compareAndSwap`（先 read 取 expected，再 CAS），禁止无条件覆盖。
5. **本地全套测试 + 冒烟**：server 启动 + 首页/接口探活 + config 数据勾稽（trades 数、持仓 shares、universe 数与本地/云端一致）。
6. **DoD 四项**（发布前置条件，全齐才动手）：全测试绿 → 冒烟通过 → 数据勾稽一致 → git 已 push。
7. **发布**：平台 sites 发布（域名不变）+ 小程序 build/verify/upload 体验版 + 汇报勾稽结果。

## 四、DoD 全套测试清单（当前10套，395项）

```
node lg_sync_test.js            # 主回归 177
node test-cloud-adapter.js      # 5
LG_MOCK_CLOUD=1 node test-cloud-roundtrip.js  # 3（mock守卫，禁止裸跑旧版）
node test-config-service.js     # 23
node test-refresh.js            # 16
node test-seat-risk-ui.js       # 19
node test-server-api.js         # 10
node test-stress-model.js       # 78
node verify-integrity.js        # 33
node verify-config-data.js      # 32（数据完整性：档位/tierPct一致、汇率回退新鲜、trades勾稽）
```
新增/删除测试套件时必须同步更新本清单。

## 五、KNOWN-PITFALLS 已知坑（新 agent 必读，踩过的不再踩）

1. **测试夹具日期禁止硬编码**：信号"已执行"判定有3天过期窗口，夹具日期写死（如 2026-10-08）会在3天后永久挂掉。一律 `new Date().toISOString().slice(0,10)` 动态生成。10-11、10-18 两次踩坑。
2. **暂存区 ≠ 工作区**：`git checkout <branch> -- <path>` 同时更新两者，但后续任何 restore/混版操作会让二者分叉。落地后必须三点核对（见 SOP 第3步）。
3. **写生产云的脚本必须有守卫**：旧版 test-cloud-roundtrip 裸跑会 upsert 覆盖整个生产 app_config。写脚本默认 mock。
4. **TCB jsonb 限制**：不支持数组切片拼接（`[:1]||x||[2:]` 报 DATABASE_42804），指定位置插入用 `jsonb_insert(data,'{universe,2}',...)`；`jsonb_array_elements WITH ORDINALITY` 从1起算，jsonb_set 路径下标要 −1。
5. **云端 app_config 是单行 JSONB（key='config'）**：同步用 `cloud-store.compareAndSwap(local, expected)`，新版 cloud-store 拒绝无条件 write 是特性不是 bug。
6. **行情源**：gtimg 批量（一次请求30+只）；东财 push2 批量会触发封禁不可用。港股 gtimg 字段：PE=f39 / PB=f58 / DPS=f72；A股：PE=f39 / PB=f46 / 股息率=f64。
7. **小程序真机 403**：WAF 拦 MicroMessenger UA，数据链路必须走共享网关 mp-api.app.workbuddy.host + 行情直连 gtimg，勿直连平台域名。
8. **Excel/静态产物 recalc**：本机无 LibreOffice/formulas 引擎，xlsx 交付用静态快照（数值写死）+ AIGC 标识。
9. **tierPct 与 tiers 档数必须一致**：tiers 有 N 档则 tierPct 必须 N 个（标准四档 H10/H12/H15/H17.46 的锚 = [10,25,60,100]，方法论 ladderRule）。10-22 发现平安H残留第5档「股息打平」致 tierPct 错位、17只标的 tierPct 全空导致预算函数 L(硬上限)取不到。数据层无校验时静默出错——由 `verify-config-data.js` 兜底。
10. **bash BSD grep 对中文 pattern 假阴性**：macOS 自带 grep 遇中文字符串（含 `pattern` 含中文）会返回空（locale 问题）。搜中文一律用 Grep 工具或 `grep -a`，不要用裸 grep 判断"不存在"。

## 六、双纪律（郎刚定，最高优先级）

- 云端数据必须保持最新：本地改完 config，同一轮 CAS 同步云端并回读核对。
- 代码修改必须上传 git：每轮验证通过后 commit + push，不许只留本地。
