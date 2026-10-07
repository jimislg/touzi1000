#!/usr/bin/env python3
# 生成预测基线快照（v3.4.1附录·每周预测复盘的对照基线）
# 数据源：watchlist快筛参数表 + 三个v3.4估值脚本情景 + 10-07回购校正 + config档位
import re, io, json, datetime

BASE = "/Users/jimislg/Documents/郎刚的芒格"
CFG = json.load(io.open(f"{BASE}/investment-platform/config.json", encoding="utf-8"))
UNI = {s["name"]: s for s in CFG["universe"]}
CODE = {s["code"]: s for s in CFG["universe"]}
HOLD = {h["name"]: h for h in CFG["holdings"]}

# 1) 快筛参数表
src = io.open(f"{BASE}/codex-产出/分析脚本/watchlist_screen_v34_20261006.py", encoding="utf-8").read()
pat = r'\("([^"]+)","([A-Z]{3})",([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*(-?[\d.]+),\s*([\d.]+)'
rows = {}
for m in re.finditer(pat, src):
    n, cur, px, eps, pay, g, xpe, tax = m.groups()
    key = re.sub(r'A$|-S$', '', n)
    rows[key] = dict(name=n, cur=cur, px=float(px), eps=float(eps), pay=float(pay),
                     g=float(g), exitPE=float(xpe), tax=float(tax))

# 2) 10-07回购校正（payout改纯现金）
for k, pay, tax in [("格力电器", 0.602, 0.0), ("恒瑞医药", 0.172, 0.0),
                    ("伊利股份", 0.8125, 0.0), ("携程集团", 0.0886, 0.20)]:
    if k in rows:
        rows[k]["pay"] = pay; rows[k]["tax"] = tax
        rows[k]["note"] = "payout改纯现金(10-07校正)"

# 3) 权威定稿情景（覆盖/补充）
AUTH = {
    "腾讯控股": dict(code="0700.HK", base="2026-10-06", px=428.20, cur="HKD", eps=29.6, pay=0.16, tax=0.20,
        scen="悲观g3/3·exit10x·w25% / 基准g9/7·exit14x·w50% / 乐观g13/10·exit18x·w25%",
        status="done", src="腾讯v3.4重估+独立审计校准(20261006)"),
    "中国平安A": dict(code="601318.SH", base="2026-10-06", px=53.29, cur="CNY", eps=8.364, pay=0.33, tax=0.0,
        scen="悲观g1/1·pay30%·exit4.5x·w25% / 基准g4/4·pay33%·exit=当前PE·w50% / 乐观g6/6·pay36%·exit7.5x·w25%",
        status="done", src="平安A/H零修复重估(20261006)"),
    "中国平安H": dict(code="2318.HK", base="2026-10-06", px=51.55, cur="HKD", eps=8.364, pay=0.33, tax=0.20,
        scen="同平安A（H股税后口径，双门槛未过→等待价格）",
        status="done", src="平安A/H零修复重估(20261006)"),
    "宇通客车": dict(code="600066.SH", base="2026-10-07", px=26.72, cur="CNY", eps=2.20, pay=0.65, tax=0.0,
        scen="g5/3·exit12.15x(零修复)；payout=50-70%情景中值65%（2026中期不分红，年度股息按0确认）",
        status="partial", src="宇通东阿v3.4零修复重估(20261007，档位草稿待确认)"),
    "东阿阿胶": dict(code="000423.SZ", base="2026-10-07", px=45.95, cur="CNY", eps=2.62, pay=0.85, tax=0.0,
        scen="g5/3·exit17.54x(零修复)；第四座勾稽桥未过→研究口径非正式定价",
        status="partial", src="宇通东阿v3.4零修复重估(20261007，档位草稿待确认)"),
}

STD = ["H10", "H12", "H15", "H17.46"]
DRAFT_TIERS = {  # 草稿新档（10-07报告，待确认后写入config）
    "600066.SH": "26.1/22.7/18.6/15.9(草稿待确认)",
    "000423.SZ": "43.2/37.4/30.5/26.0(草稿待确认)",
}
def tiers_of(code):
    if code in DRAFT_TIERS:
        return DRAFT_TIERS[code]
    s = CODE.get(code)
    if s and s.get("tiers"):
        ps = [t.get("price") for t in s["tiers"] if t.get("label") in STD]
        if len(ps) == 4 and all(ps):
            return "/".join(f"{p:g}" for p in ps)
        ps = [t.get("price") for t in s["tiers"]][:4]
        if len(ps) == 4 and all(ps):
            return "/".join(f"{p:g}" for p in ps)
    return "—"

out = []
out.append("# 预测快照 · 2026基线（v3.4.1附录·每周预测复盘对照用）")
out.append("")
out.append("**建立**：2026-10-07　**用途**：每周对照新事实（财报/公告/分红/价格档位），错误归因四类：增长错／利润率错／资本投入漏／股数判断错。**不用股价涨跌证明研究正确。**")
out.append("**维护规则**：每份研究报告定稿时更新对应行；重大假设变更另起一行保留旧值（不删历史）。")
out.append("")
out.append("## 一、权威定稿情景（完整研究，researchStatus=done/partial）")
out.append("")
out.append("| 标的 | 代码 | 基准日 | 当时价 | EPS0(正常化) | payout | 税 | 情景与权重 | researchStatus | 四档H10/H12/H15/H17.46 | 来源 |")
out.append("|---|---|---|---|---|---|---|---|---|---|---|")
for k, v in AUTH.items():
    out.append(f"| {k} | {v['code']} | {v['base']} | {v['px']:g}{v['cur']} | {v['eps']:g} | {v['pay']:g} | {v['tax']:g} | {v['scen']} | {v['status']} | {tiers_of(v['code'])} | {v['src']} |")
out.append("")
out.append("## 二、快筛口径参数（20只，g/退出PE为快筛冻结值，待完整研究重建）")
out.append("")
out.append("| 标的 | 代码 | 当时价 | EPS0 | payout | g | 退出PE | 税 | 口径 | 四档 |")
out.append("|---|---|---|---|---|---|---|---|---|---|")
order = [n for n in ["招商银行", "泡泡玛特", "福耀玻璃", "安踏体育", "格力电器", "万华化学"] if n in rows]  # 持仓优先
order += [n for n in rows if n not in order]
for k in order:
    r = rows[k]
    u = UNI.get(k) or next((s for s in CFG["universe"] if k in s["name"] or s["name"] in k), None)
    code = u["code"] if u else "—"
    held = "★持仓" if k in HOLD else ""
    note = r.get("note", "快筛冻结" + ("·回购校正" if k in ("格力电器", "恒瑞医药", "伊利股份", "携程集团") else ""))
    out.append(f"| {r['name']}{held} | {code} | {r['px']:g} | {r['eps']:g} | {r['pay']:g} | {r['g']:g} | {r['exitPE']:g} | {r['tax']:g} | {note} | {tiers_of(code)} |")
out.append("")
out.append("## 三、每周复盘检查项（自动化周检执行）")
out.append("")
out.append("1. 分红对照：实际DPS（东财API）vs 快照payout×EPS0——偏差>15%记录")
out.append("2. 价格档位：现价相对四档位置变化（新触发哪档/跌破哪档）")
out.append("3. 新事实：财报、公告、回购注销股数变化（对应「股数判断错」归因）")
out.append("4. 组合层面：市值加权隐含IRR vs 17.46%（平台驾驶舱已算）")
out.append("")

path = f"{BASE}/codex-产出/预测快照-2026基线-20261007.md"
io.open(path, "w", encoding="utf-8").write("\n".join(out))
print("写入", path, f"权威{len(AUTH)}只+快筛{len(rows)}只")
