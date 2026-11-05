#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
唐朝估值法 · 核心计算器
=================================
输入: input.json
输出: 1) 终端 markdown 报告片段
      2) {outdir}/result.json  (供 priceband.py 绘图)
      3) {outdir}/priceband.svg (价格区间图)

用法:
    python3 calc.py input.json [--out outdir]

禁止心算。所有数字必须经此脚本产出。
"""
import json
import sys
import statistics
import argparse
from pathlib import Path

EPS = 1e-9

# ---------------------------------------------------------------- 方案定义
PLANS = [
    {
        "key": "normalize",
        "name": "A 正常化 3%（默认）",
        "rf": 0.030,
        "pe": 27.5,
        "desc": "当前国债收益率是异常值，不能当常态",
    },
    {
        "key": "original",
        "name": "B 书中原教旨",
        "rf": None,          # 运行时由 market.rf_10y 填充
        "pe": None,          # min(1/rf, 50)
        "desc": "严格照书，机械套用会给出极高容忍度",
    },
    {
        "key": "global",
        "name": "C 全球对照 5.1%",
        "rf": 0.051,
        "pe": 20.0,
        "desc": "资本可全球流动的下限参照",
    },
]

BUY_MULT = {"current": 0.70, "center": 0.60, "future": 0.50}
ANCHOR_NAMES = {
    "current": "锚A 当年",
    "center": "锚B 中枢",
    "future": "锚C 三年后",
}


# ---------------------------------------------------------------- 工具
def fnum(x, nd=0):
    """格式化数字，千分位"""
    if x is None:
        return "—"
    if nd == 0:
        return f"{round(x):,.0f}"
    return f"{x:,.{nd}f}"


def pct(x, nd=1, signed=True):
    if x is None:
        return "—"
    s = f"{x*100:+.{nd}f}%" if signed else f"{x*100:.{nd}f}%"
    return s


def safe_div(a, b):
    return a / b if b and abs(b) > EPS else None


# ---------------------------------------------------------------- 单季拆解
def _period_order(p):
    """'2026H1' -> (2026, 2)，保证 Q1 < H1 < Q3 < 年报"""
    order = {"Q1": 1, "H1": 2, "Q2": 2, "H2": 4, "Q3": 3, "Q4": 4, "": 4}.get(p[4:], 5)
    return (int(p[:4]), order)


def split_quarters(quarters):
    """从累计报表反推单季。只对同名季度做，不臆造。"""
    if not quarters:
        return []
    by_period = {q["period"]: q for q in quarters}
    rows = []
    for q in sorted(quarters, key=lambda x: _period_order(x["period"])):
        p = q["period"]
        rec = {"period": p, "kind": "cumulative", "np": q.get("np")}
        # 自带上年同期的单期（Q1–Q4），直接算同比
        if p.endswith(("Q1", "Q2", "Q3", "Q4")) and q.get("np_prev"):
            if q.get("np") is not None and q.get("np_prev"):
                rec["np_yoy"] = q["np"] / q["np_prev"] - 1
            if q.get("rev") is not None and q.get("rev_prev"):
                rec["rev_yoy"] = q["rev"] / q["rev_prev"] - 1
            rows.append(rec)
            continue

        # 港股/无单季披露：没有 Q1 可拆时，H1/H2 直接用 np_prev 算同比
        if p.endswith(("H1", "H2")) and q.get("np_prev") and p[:4] + "Q1" not in by_period:
            rec["np_yoy"] = q["np"] / q["np_prev"] - 1
            if q.get("rev") and q.get("rev_prev"):
                rec["rev_yoy"] = q["rev"] / q["rev_prev"] - 1
            rows.append(rec)
            continue

        # H1 = 需要 Q1 与上年 H1/Q1 反推 Q2
        if p.endswith("H1") and p[:4] + "Q1" in by_period:
            q1 = by_period[p[:4] + "Q1"]
            prev_h1 = by_period.get(str(int(p[:4]) - 1) + "H1")
            prev_q1 = by_period.get(str(int(p[:4]) - 1) + "Q1")
            if all(x is not None for x in [q.get("np"), q1.get("np"), prev_h1, prev_q1]):
                q2 = q["np"] - q1["np"]
                q2p = prev_h1["np"] - prev_q1["np"]
                rec2 = {
                    "period": p[:4] + "Q2",
                    "kind": "derived",
                    "np": q2,
                    "np_prev": q2p,
                    "np_yoy": q2 / q2p - 1,
                }
                if q.get("rev") and q1.get("rev") and prev_h1.get("rev") and prev_q1.get("rev"):
                    r2 = q["rev"] - q1["rev"]
                    r2p = prev_h1["rev"] - prev_q1["rev"]
                    rec2["rev_yoy"] = r2 / r2p - 1
                rows.append(rec2)
        rows.append(rec)
    return rows


# ---------------------------------------------------------------- 十年序列 + 衰减检测
def analyze_series(annual):
    if not annual:
        return {}, None
    s = sorted(annual, key=lambda x: x["year"])
    ys = [a["year"] for a in s]
    nps = [a["np"] for a in s]

    table = []
    for i, a in enumerate(s):
        g = (nps[i] / nps[i - 1] - 1) if i > 0 else None
        c3 = ((nps[i] / nps[i - 3]) ** (1 / 3) - 1) if i >= 3 else None
        table.append(
            {"year": a["year"], "np": nps[i], "yoy": g, "cagr3": c3}
        )

    def cagr(span):
        if len(nps) > span and nps[-1 - span] > 0:
            return (nps[-1] / nps[-1 - span]) ** (1 / span) - 1
        return None

    stats = {
        "n_years": len(nps),
        "cagr3": cagr(3),
        "cagr5": cagr(5),
        "cagr_all": cagr(len(nps) - 1),
        "mean5": statistics.mean(nps[-5:]) if len(nps) >= 5 else None,
        "median5": statistics.median(nps[-5:]) if len(nps) >= 5 else None,
        "mean_all": statistics.mean(nps),
        "median_all": statistics.median(nps),
    }

    # ---- 增速衰减检测 ----
    yoy = [t["yoy"] for t in table if t["yoy"] is not None]
    diag = {"flags": [], "type": "stable"}
    if len(yoy) >= 3:
        last3 = yoy[-3:]
        mono_down = all(last3[i] > last3[i + 1] for i in range(len(last3) - 1))
        swing = max(yoy[-5:]) - min(yoy[-5:]) if len(yoy) >= 5 else max(yoy) - min(yoy)
        if min(yoy) < 0:
            diag["flags"].append("已出现负增长（穿零）")
            diag["type"] = "decaying"
        if mono_down:
            diag["flags"].append("连续3年增速单调下行 → 增长收敛，禁用历史CAGR外推")
            diag["type"] = "decaying"
        if swing > 0.5:
            diag["flags"].append(f"近5年增速波动 {swing*100:.0f}pct（>50%）且无稳定趋势 → 趋近周期型")
            if diag["type"] == "stable":
                diag["type"] = "cyclical"
        if stats["cagr_all"] and stats["cagr3"] and stats["cagr_all"] - stats["cagr3"] > 0.10:
            diag["flags"].append(
                f"长期CAGR {stats['cagr_all']*100:.1f}% 与近3年 {stats['cagr3']*100:.1f}% 差 >10pct → 增速换挡，两锚都要算"
            )
    if not diag["flags"]:
        diag["flags"].append("无显著衰减信号")
    return {"table": table, "stats": stats}, diag


# ---------------------------------------------------------------- 三锚
def build_anchors(cfg, series, diag):
    """current / center / future 三锚。future 必须人工给。"""
    out = {}
    anchors = cfg.get("anchors", {}) or {}
    st = series.get("stats", {}) or {}
    ctype = cfg.get("type") or (diag or {}).get("type", "stable")

    # --- current：优先手填，否则由 H1 + H2 趋势推算
    cur = anchors.get("current")
    if cur and cur.get("value") is not None:
        out["current"] = {
            "low": cur.get("low", cur["value"]),
            "high": cur.get("high", cur["value"]),
            "note": cur.get("note", "手工输入"),
        }
    else:
        qs = cfg.get("quarters") or []
        h1s = [q for q in qs if q["period"].endswith("H1")]
        h1 = max(h1s, key=lambda x: _period_order(x["period"])) if h1s else None
        trend = cfg.get("h2_trend")
        if h1 and trend and h1.get("np") and h1.get("np_prev"):
            h2_prev = None
            yr = h1["period"][:4]
            ann = {a["year"]: a["np"] for a in (cfg.get("annual") or [])}
            if int(yr) - 1 in ann:
                h2_prev = ann[int(yr) - 1] - h1["np_prev"]
            if h2_prev:
                lo = h1["np"] + h2_prev * (1 + trend[0])
                hi = h1["np"] + h2_prev * (1 + trend[1])
                out["current"] = {
                    "low": lo,
                    "high": hi,
                    "note": f"H1实际{h1['np']:.0f} + H2按趋势{trend[0]*100:+.0f}%~{trend[1]*100:+.0f}%",
                }
    if "current" not in out and st.get("median5"):
        out["current"] = {"low": st["median5"], "high": st["median5"], "note": "缺失，退化为5年中位数"}

    # --- center：优先手填；周期型用全序列中位数，其余用 5 年中位数
    #     成长股必须手填「TTM 经调整」——5/10 年中位数对高速成长的公司严重滞后
    cen = anchors.get("center")
    if cen and cen.get("value") is not None:
        out["center"] = {
            "low": cen.get("low", cen["value"]),
            "high": cen.get("high", cen["value"]),
            "note": cen.get("note", "手工输入（成长股：TTM 经调整）"),
        }
    elif ctype == "cyclical" and st.get("median_all"):
        out["center"] = {"low": st["median_all"], "high": st["median_all"],
                         "note": "周期型 → 全序列中位数"}
    elif st.get("median5"):
        med = st["median5"]
        mean = st.get("mean5") or med
        out["center"] = {
            "low": min(med, mean),
            "high": max(med, mean),
            "note": f"5年中位数 {med:.0f} / 均值 {mean:.0f}",
        }

    # --- future：必须人工给
    fut = anchors.get("future")
    if fut and fut.get("value") is not None:
        out["future"] = {
            "low": fut.get("low", fut["value"]),
            "high": fut.get("high", fut["value"]),
            "note": fut.get("note", "手工推演"),
        }
    return out


# ---------------------------------------------------------------- 矩阵
def build_matrix(anchors, plans, shares, price, mcap, growth_ok=True, ctype="stable"):
    """
    增长率 < 12% 或判定为 decaying 时，禁用「当年 × 0.7」：
    书上"当年七折 == 三年后五折"的前提是隐含 12% 增长，低增长下当年七折会买贵。
    """
    rows = []
    for pl in plans:
        row = {"plan": pl, "cells": {}, "prices": []}
        for ak in ("current", "center", "future"):
            a = anchors.get(ak)
            if not a:
                continue
            mid = (a["low"] + a["high"]) / 2
            val = mid * pl["pe"] * BUY_MULT[ak]
            px = val / shares if shares else None
            disabled = (ak == "current" and not growth_ok)
            row["cells"][ak] = {
                "value": val,
                "price": px,
                "anchor": mid,
                "disabled": disabled,
            }
            if px and not disabled:
                row["prices"].append(px)
        if row["prices"]:
            row["lo"] = min(row["prices"])
            row["hi"] = max(row["prices"])
            row["width"] = row["hi"] / row["lo"] - 1 if row["lo"] > 0 else None
        rows.append(row)
    return rows


# ---------------------------------------------------------------- 四层价格
def dcf_value(np0, g1, years, g2, r, net_cash=0.0):
    """两阶段 DCF：前 years 年增 g1，之后永续 g2。"""
    if r <= g2:
        return None
    n, pv = np0, 0.0
    for i in range(1, years + 1):
        n *= (1 + g1)
        pv += n / (1 + r) ** i
    tv = n * (1 + g2) / (r - g2)
    return pv + tv / (1 + r) ** years + net_cash


def experience_line(peak_pe, discount=0.5, cap=25.0):
    """经验线 PE = min(峰值PE × discount, cap)。

    用户定稿（2026-10-25）：峰值打五折；若结果超过 cap（默认 25 倍），
    以 cap 为准；未超过则用实际值。cap 是硬顶，防止「历史很疯」被
    机械放大成「现在很便宜」。
    """
    if not peak_pe:
        return None
    raw = peak_pe * discount
    capped = raw > cap
    return {"raw": raw, "pe": min(raw, cap), "capped": capped,
            "cap": cap, "discount": discount, "peak_pe": peak_pe}


def build_four_tiers(cfg, price, shares, mcap, net_cash, dfx, dcur):
    """四层价格（纯 DCF）+ 经验线（辅助参考，单独返回，不参与任何计算）。

    返回 (tiers, aux)：
      tiers —— 只含 DCF 层（r=12%/10%/6% 等），是唯一的决策依据；
      aux   —— 经验线，v2.2 起降级为**辅助参考线**，只做展示与交叉阅读，
               不参与买入线、中枢、卖出线的任何取值，也不参与减仓线计算。
    """
    d = cfg.get("dcf") or {}
    np0 = d.get("np0")
    if not np0 or not shares:
        return None, None
    g1 = d.get("g1", 0.04)
    years = d.get("years", 5)
    g2 = d.get("g2", 0.02)
    rates = d.get("rates") or [0.12, 0.10, 0.06]

    tiers = []
    for r in rates:
        v = dcf_value(np0, g1, years, g2, r, net_cash)
        if v is None:
            continue
        tiers.append({
            "kind": "dcf", "rate": r, "value": v,
            "price": v * dfx / shares, "pe": v / np0,
        })

    ep = cfg.get("experience_pe") or {}
    el = experience_line(ep.get("peak_pe"),
                         ep.get("discount", 0.5),
                         ep.get("cap", 25.0))
    aux = None
    if el:
        v = np0 * el["pe"]
        aux = {
            "kind": "exp_pe", "rate": None, "auxiliary": True,
            "peak_pe": ep["peak_pe"], "peak_date": ep.get("peak_date"),
            "discount": el["discount"], "raw_pe": el["raw"],
            "cap": el["cap"], "capped": el["capped"], "epe": el["pe"],
            "value": v, "price": v * dfx / shares, "pe": el["pe"],
        }
    return tiers, aux


# ---------------------------------------------------------------- 主流程
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("input", help="input.json 路径")
    ap.add_argument("--out", default=None, help="输出目录（默认与 input 同目录）")
    ap.add_argument("--no-svg", action="store_true")
    args = ap.parse_args()

    ipath = Path(args.input).expanduser().resolve()
    cfg = json.loads(ipath.read_text(encoding="utf-8"))
    outdir = Path(args.out).expanduser().resolve() if args.out else ipath.parent
    outdir.mkdir(parents=True, exist_ok=True)

    mk = cfg.get("market", {})
    price = mk.get("price")
    shares = mk.get("shares")
    mcap = mk.get("mcap") or (price * shares if price and shares else None)
    net_cash = mk.get("net_cash") or 0.0
    rf10 = mk.get("rf_10y", 0.0165)
    dfx = mk.get("display_fx", 1.0)          # 展示币种换算（如 RMB→HKD）
    dcur = mk.get("display_cur", "元")

    # 填 B 方案
    plans = []
    for pl in PLANS:
        p = dict(pl)
        if p["key"] == "original":
            p["rf"] = rf10
            p["pe"] = min(1 / rf10 if rf10 else 50, 50)
        plans.append(p)

    series, diag = analyze_series(cfg.get("annual") or [])
    qrows = split_quarters(cfg.get("quarters") or [])
    anchors = build_anchors(cfg, series, diag)

    ctype = cfg.get("type") or (diag or {}).get("type", "stable")
    cagr3 = (series.get("stats") or {}).get("cagr3")
    growth_ok = True
    if ctype == "decaying":
        growth_ok = False
    elif cagr3 is not None and cagr3 < 0.12:
        growth_ok = False

    matrix = build_matrix(anchors, plans, shares, price, mcap, growth_ok, ctype)
    tiers, aux = build_four_tiers(cfg, price, shares, mcap, net_cash, dfx, dcur)
    np0 = (cfg.get("dcf") or {}).get("np0") or 0

    # 原式结论（提前算，供 result.json 与正文共用）
    base = next((r for r in matrix if r["plan"]["key"] == "normalize"), None)
    conclusion = {}
    if base and base.get("lo"):
        lo0, hi0 = base["lo"], base["hi"]
        w0 = base["width"]
        conclusion = {
            "plan": "A 正常化 3%",
            "lo": lo0 * dfx, "hi": hi0 * dfx, "width": w0,
            "price": price * dfx,
            "over_hi": price / hi0 - 1 if hi0 else None,
            "over_lo": price / lo0 - 1 if lo0 else None,
            "unstable": w0 is not None and w0 > 0.30,
            "in_band": lo0 <= price <= hi0 if price else None,
        }

    result = {
        "company": cfg.get("company"),
        "code": cfg.get("code"),
        "as_of": cfg.get("as_of"),
        "price": price * dfx,
        "shares": shares,
        "mcap": mcap,
        "display_cur": dcur,
        "anchors": anchors,
        "matrix": [
            {
                "plan": r["plan"]["name"],
                "pe": r["plan"]["pe"],
                "prices": {k: v["price"] * dfx for k, v in r["cells"].items() if not v.get("disabled")},
                "disabled": {k: v["price"] * dfx for k, v in r["cells"].items() if v.get("disabled")},
                "lo": (r.get("lo") or 0) * dfx,
                "hi": (r.get("hi") or 0) * dfx,
                "width": r.get("width"),
            }
            for r in matrix
        ],
        "conclusion": conclusion,
        "diagnosis": diag,
        "stats": series.get("stats"),
        "tiers": tiers,
        "auxiliary": aux,
    }
    (outdir / "result.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    # 图（提前生成，正文按章节顺序引用）
    svg = ladder = None
    if not args.no_svg:
        try:
            sys.path.insert(0, str(Path(__file__).parent))
            from priceband import render_auto, render_ladder
            svg = render_auto(result)
            (outdir / "priceband.svg").write_text(svg, encoding="utf-8")
            if tiers:
                ladder = render_ladder(result)
                (outdir / "ladder.svg").write_text(ladder, encoding="utf-8")
        except Exception as e:  # noqa: BLE001
            print(f"图生成失败：{e}", file=sys.stderr)
            svg = ladder = None

    # ---------- 输出 markdown ----------
    L = []
    A = L.append
    A(f"# {cfg.get('company','')}（{cfg.get('code','')}）· 唐朝估值法")
    A("")
    A("## 0. 披露日历")
    A("")
    d = cfg.get("disclosure", {}) or {}
    A(f"- 数据截止日：**{cfg.get('as_of','—')}**")
    A(f"- 最新已披露报告期：**{d.get('latest_period','—')}**")
    A(f"- 下一个披露节点：**{d.get('next_name','—')}，{d.get('next_date','—')}**")
    A(f"- 现价 {fnum(price*dfx,2)} {dcur}｜总股本 {fnum(shares,4)} 亿股｜市值 {fnum(mcap)} 亿人民币｜PE(TTM) {fnum(mk.get('pe_ttm'),2)}")
    A("")

    # 单季
    if qrows:
        A("## 1. 单季拆解（累计口径不算数）")
        A("")
        A("| 报告期 | 归母净利(亿) | 净利同比 | 收入同比 | 口径 |")
        A("|---|---|---|---|---|")
        for r in qrows:
            tag = "单季反推" if r["kind"] == "derived" else "披露"
            A(f"| {r['period']} | {fnum(r.get('np'),2)} | {pct(r.get('np_yoy'))} | {pct(r.get('rev_yoy'))} | {tag} |")
        A("")
        A("> 累计同比会掩盖拐点。看单季，不看累计。")
        A("")

    # 十年序列
    if series.get("table"):
        st = series["stats"]
        A("## 2. 十年序列与增速衰减检测")
        A("")
        A("| 年度 | 归母净利(亿) | YoY | 3年CAGR |")
        A("|---|---|---|---|")
        for t in series["table"]:
            A(f"| {t['year']} | {fnum(t['np'],2)} | {pct(t['yoy'])} | {pct(t['cagr3'])} |")
        A("")
        A(f"**CAGR 三档**：近3年 {pct(st.get('cagr3'))}｜近5年 {pct(st.get('cagr5'))}｜全序列 {pct(st.get('cagr_all'))}")
        A("")
        if diag:
            A(f"**判定类型**：`{diag['type']}`")
            for fl in diag["flags"]:
                A(f"- {fl}")
            A("")

    # 闸门
    g = cfg.get("gates") or {}
    if g:
        A("## 3. 四道闸门")
        A("")
        A("| 闸门 | 指标 | 实测 | 阈值 | 判定 |")
        A("|---|---|---|---|---|")
        checks = [
            ("利润为真", "收现比", g.get("cash_ratio"), "≥0.9", lambda v: v >= 0.9),
            ("利润为真", "净现比", g.get("ocf_to_np"), "≥0.8", lambda v: v >= 0.8),
            ("利润为真", "应收/营收", g.get("ar_to_rev"), "≤10%", lambda v: v <= 0.10),
            ("低资本投入", "资本开支/净利", g.get("capex_to_np"), "≤30%", lambda v: v <= 0.30),
        ]
        for gate, name, val, th, fn in checks:
            if val is None:
                A(f"| {gate} | {name} | — | {th} | 缺失 |")
                continue
            ok = fn(val)
            shown = f"{val*100:.1f}%" if name != "收现比" and name != "净现比" else f"{val:.2f}"
            A(f"| {gate} | {name} | {shown} | {th} | {'✅ 过' if ok else '❌ 不过'} |")
        A("")
        for k in ("gates_note_ocf", "gates_note_ar", "gates_note_capex"):
            if cfg.get(k):
                A(f"> {cfg[k]}")
                A("")
        A(f"- 能力圈四问：{g.get('circle_note', '待补')}")
        A(f"- 利润可持续：{g.get('sustainable_note', '见第2节衰减检测')}")
        A("")

    # 三锚
    if anchors:
        A("## 4. 三锚定利润中枢")
        A("")
        A("| 锚 | 口径 | 低 | 高 | 中枢 | 说明 |")
        A("|---|---|---|---|---|---|")
        for k in ("current", "center", "future"):
            a = anchors.get(k)
            if not a:
                continue
            mid = (a["low"] + a["high"]) / 2
            A(f"| {ANCHOR_NAMES[k]} | — | {fnum(a['low'])} | {fnum(a['high'])} | {fnum(mid)} | {a['note']} |")
        A("")

    # 估值全景（紧跟三锚：利润锚 → 价格轴，一张表看完）
    if tiers:
        NAMES = {0.12: "买入线", 0.15: "极严", 0.10: "中枢", 0.08: "乐观",
                 0.06: "卖出线", 0.07: "偏乐观"}
        ranked = []
        for t in tiers:
            nm = NAMES.get(round(t["rate"], 4), f"DCF {t['rate']:.0%}")
            ranked.append({"name": nm, "price": t["price"], "pe": t["pe"],
                           "value": t["value"], "who": f"DCF r={t['rate']:.0%}",
                           "aux": False, "t": t})
        if aux:
            ranked.append({"name": "经验线", "price": aux["price"], "pe": aux["pe"],
                           "value": aux["value"],
                           "who": (f"峰值 {aux['peak_pe']:.1f}× ×{aux['discount']:.0%}"
                                   f"{' → 封顶 ' + format(aux['cap'], '.0f') + '×' if aux.get('capped') else '（未触顶）'}"),
                           "aux": True, "t": aux})
        ranked.sort(key=lambda x: x["price"])

        A("## 5. 估值全景：利润锚 → 价格轴")
        A("")
        A(f"输入：np0={fnum((cfg.get('dcf') or {}).get('np0'))} 亿，"
          f"前 {(cfg.get('dcf') or {}).get('years',5)} 年增速 "
          f"{pct((cfg.get('dcf') or {}).get('g1',0.04),1)}，"
          f"永续 {pct((cfg.get('dcf') or {}).get('g2',0.02),1)}，"
          f"净现金 {fnum(net_cash)} 亿。**四层价格是唯一决策依据；经验线并列展示，不参与任何取值。**")
        A("")
        A(f"| 层次 | 性质 | 口径 | 估值（亿） | 每股（{dcur}） | 隐含 EV/净利 | 相对现价 |")
        A("|---|---|---|---|---|---|---|")
        for it in ranked:
            # 币种必须统一：price 是报表币种（人民币），it["price"] 已按 dfx 折算为展示币种
            pos = price * dfx / it["price"] - 1 if it.get("price") else None
            nature = "辅助参考" if it["aux"] else "决策层"
            nm = f"*{it['name']}*" if it["aux"] else f"**{it['name']}**"
            A(f"| {nm} | {nature} | {it['who']} | {fnum(it['value'])} | "
              f"{fnum(it['price'],1)} | {it['pe']:.1f}× | {pct(pos)} |")
        A(f"| 现价 | — | 市价 | {fnum(mcap)} | {fnum(price*dfx,1)} | "
          f"{f'{mcap/np0:.1f}×' if np0 else '—'} | — |")
        A("")
        if tiers:
            A("> 口径提示：决策层的「隐含 EV/净利」= 企业价值（含净现金）÷ np0；"
              "现价行的「市值/净利」已扣除净现金。二者之差即净现金贡献——"
              f"本例净现金 {fnum(net_cash)} 亿，占市值 "
              f"{pct(net_cash/mcap if mcap else None,1,False) if mcap else '—'}。")
            A("")

        # 现价在价格轴上的位置（只对决策层定位，经验线不参与）
        dec = [x for x in ranked if not x["aux"]]
        below = [x for x in dec if x["price"] <= price * dfx]
        above = [x for x in dec if x["price"] > price * dfx]
        if below and above:
            A(f"> **定位**：现价 {fnum(price*dfx,1)} {dcur} 落在「{below[-1]['name']} "
              f"{fnum(below[-1]['price'],1)}」与「{above[0]['name']} {fnum(above[0]['price'],1)}」之间——"
              f"第 {len(below)}/{len(dec)} 档（按决策层价格从低到高）。")
        elif not above:
            A(f"> **定位**：现价 {fnum(price*dfx,1)} {dcur} 已高于决策层最高档"
              f"「{below[-1]['name']} {fnum(below[-1]['price'],1)}」——进入减仓区。")
        else:
            A(f"> **定位**：现价 {fnum(price*dfx,1)} {dcur} 低于决策层最低档"
              f"「{above[0]['name']} {fnum(above[0]['price'],1)}」——处于买入区。")
        if aux:
            side = "上方" if aux["price"] > price * dfx else "下方"
            A(f"> 经验线 {fnum(aux['price'],1)} {dcur} 在现价{side}，仅作参考，不参与上面的档位判定。")
        A("")

        buy = next((t for t in tiers if t["kind"] == "dcf" and abs(t["rate"] - 0.12) < 1e-6), None)
        sell = next((t for t in tiers if t["kind"] == "dcf" and abs(t["rate"] - 0.06) < 1e-6), None)
        if buy and buy.get("price"):
            head = "现价高于买入线" if price * dfx > buy["price"] else "现价低于买入线"
            A(f"> **读法**：买入线 {fnum(buy['price'],1)} {dcur} → 现价 {fnum(price*dfx,1)} {dcur}，"
              f"{head} {pct(abs(price*dfx/buy['price']-1),1,signed=False)}。")
            A("")
        if sell and sell.get("price"):
            A(f"> **卖出（减仓）线 = {fnum(sell['price'],1)} {dcur}**，即 DCF(r=6%)。"
              "四层价格的取值只由 DCF 决定，不受任何外部参考线影响。")
            A("")

        if ladder:
            A("![估值全景：四层价格与经验线（参考）](ladder.svg)")
            A("")
            A("<details><summary>内联 SVG（Obsidian 可直接渲染）</summary>")
            A("")
            A(ladder)
            A("")
            A("</details>")
            A("")

        if aux:
            A("### 5.1 辅助经验线（只展示，不进公式）")
            A("")
            A("> 它回答「历史上市场最多愿意给它多少倍」，**不回答「它值多少」**。"
              "不参与买入线/中枢/卖出线，也不构成减仓触发条件——改它，估值结果一个数字都不变。")
            A("")
            A("| 项 | 值 |")
            A("|---|---|")
            A(f"| 峰值 PE | {aux['peak_pe']:.1f}×"
              f"{'（' + aux['peak_date'] + '）' if aux.get('peak_date') else ''} |")
            A(f"| × {aux['discount']:.0%} | {aux['raw_pe']:.1f}× |")
            A(f"| 25× 硬顶 | {'触顶 → 按 ' + format(aux['cap'],'.0f') + '× 计' if aux.get('capped') else '未触顶 → 按实际值'} |")
            A(f"| 经验线估值 | {fnum(aux['value'])} 亿 |")
            A(f"| 经验线股价 | **{fnum(aux['price'],1)} {dcur}**（{aux['pe']:.1f}×） |")
            if sell:
                gap = aux["price"] / sell["price"] - 1
                A(f"| 与 DCF(6%) 之差 | {pct(gap)}（仅陈述差异，不据此调整卖出线） |")
            A("")
            if aux.get("capped"):
                A(f"> **触顶**：峰值 {aux['peak_pe']:.1f}× 打五折为 {aux['raw_pe']:.1f}×，"
                  f"高于 25× 硬顶，故按 {aux['cap']:.0f}× 计——该股历史峰值本身已属极端。")
                A("")
            if buy and aux.get("value") and aux["value"] < buy["value"]:
                A(f"> ⚠️ **参考价值有限**：经验线 {fnum(aux['price'],1)} {dcur} 低于买入线 "
                  f"{fnum(buy['price'],1)} {dcur}，说明该股历史从未被显著高估，"
                  "「峰值腰斩」对它几乎没意义——忽略即可，它本来也不参与计算。")
                A("")

        A("---")
        A("")

    # 矩阵
    A("## 6. 三锚 × 三方案买点矩阵（旧口径·对照）")
    A("")
    A("> **口径说明**：本节是唐朝原式（合理 PE = 1÷无风险收益率，买点再打 5–6 折）。"
      "v2.0 起只作**历史对照**，不作决策依据——决策请看第 5 节估值全景。"
      "原因：原式的 1÷rf 漏掉股权风险溢价，靠「五折」倒补回来，两处误差互相抵消，"
      "买点碰巧接近合理，但「合理估值」与「卖点」双双偏离。")
    A("")
    A("| 方案 | 合理PE | 锚A 当年×0.7 | 锚B 中枢×0.6 | 锚C 三年后×0.5 | 区间宽度 |")
    A("|---|---|---|---|---|---|")
    for r in matrix:
        c = r["cells"]

        def cell(k):
            if k not in c:
                return "—"
            if c[k].get("disabled"):
                return f"~~{fnum(c[k]['price']*dfx)}~~ ⚠️"
            return fnum(c[k]["price"] * dfx)

        w = pct(r.get("width"), 0, signed=False)
        A(f"| {r['plan']['name']} | {r['plan']['pe']:.1f} | {cell('current')} | {cell('center')} | {cell('future')} | {w} |")
    A("")
    if not growth_ok:
        if ctype == "decaying":
            why = ("本标的已被判定为 `decaying`（增速单调下行/已穿零），"
                   "未来三年增速必然低于历史 CAGR，"
                   "此时「当年七折」隐含的 12% 增长假设不成立，会系统性买贵")
        else:
            why = (f"本标的近 3 年 CAGR={pct(cagr3,1,signed=False)} < 12%，"
                   "「当年七折」隐含的增长假设不成立")
        A("> ⚠️ **锚A「当年×0.7」已被禁用**（记为 ~~删除线~~）："
          "书上「当年七折」与「三年后五折」数学等价的前提是隐含 12% 以上增长；"
          + why + "。买点区间只由锚B、锚C 构成。")
        A("")

    # 结论（原式口径，已降为对照）
    if base and base.get("lo"):
        lo, hi = base["lo"], base["hi"]
        width = base["width"]
        over_hi = price / hi - 1 if hi else None
        over_lo = price / lo - 1 if lo else None
        A("## 7. 结论（原式口径·对照）")
        A("")
        A("> 本节按唐朝原式给出，属于第 6 节的延续。**最终结论以第 5 节估值全景（DCF 四层）为准。**")
        A("")
        A(f"**A 方案买点区间：{fnum(lo*dfx)} – {fnum(hi*dfx)} {dcur}**（宽 {pct(width,0,signed=False)}）")
        A("")
        if price > hi:
            A(f"现价 {fnum(price*dfx,2)} {dcur} → 高于区间上限 **{pct(over_hi)}**，高于下限 **{pct(over_lo)}**。")
        elif price < lo:
            A(f"现价 {fnum(price*dfx,2)} {dcur} → **低于区间下限 {pct(abs(price/lo-1),signed=False)}**，已在买点区内。")
        else:
            A(f"现价 {fnum(price*dfx,2)} {dcur} → **落在买点区间内**（距下沿 {pct(price/lo-1)}，距上沿 {pct(price/hi-1)}）。")
        A("")
        if conclusion.get("unstable"):
            A(f"> ⚠️ 三锚买点极差 {pct(width,0,signed=False)} > 30%，判定**估值不确定性过高**：只给区间，不给单一买点，结论不得表述为精确折价率。")
            A("")

    # 净现金调整
    if net_cash and price and shares and anchors.get("current"):
        cur = anchors.get("current")
        if cur:
            adj_mcap = mcap - net_cash
            np_mid = (cur["low"] + cur["high"]) / 2
            if adj_mcap > 0 and np_mid > 0:
                A("## 8. 净现金调整")
                A("")
                A(f"- 净现金 {fnum(net_cash)} 亿 → 经营性市值 {fnum(adj_mcap)} 亿")
                A(f"- 名义 PE {mcap/np_mid:.1f}× → 调整后 **{adj_mcap/np_mid:.1f}×**")
                A("")

    # 价格区间图（旧口径：三锚买点区间）
    if svg:
        A("## 9. 价格区间图（旧口径：三锚买点区间）")
        A("")
        A("![价格区间图](priceband.svg)")
        A("")
        A("<details><summary>内联 SVG（Obsidian 可直接渲染）</summary>")
        A("")
        A(svg)
        A("")
        A("</details>")
        A("")

    md = "\n".join(L)
    (outdir / "report_data.md").write_text(md, encoding="utf-8")
    print(md)
    print("\n" + "=" * 60)
    print(f"已写出：{outdir/'result.json'}")
    if svg:
        print(f"已写出：{outdir/'priceband.svg'}")
    print(f"已写出：{outdir/'report_data.md'}")


if __name__ == "__main__":
    main()
