#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
唐朝估值法 · 价格区间图生成器
=================================
输入: calc.py 产出的 result.json
输出: SVG 字符串 / .svg 文件

设计约束（见 SKILL.md 第7节）：
- 横轴股价，自动定刻度
- 区间带 + 锚刻度 + 现价竖线
- 中性配色：区间蓝、现价红，不用红绿表达涨跌
- 标签自动避让重叠
- viewBox 固定宽度 680

单独使用:
    python3 priceband.py result.json > priceband.svg
"""
import json
import sys
from pathlib import Path

C_BAND = "#B5D4F4"
C_BAND_STROKE = "#378ADD"
C_PRICE = "#E24B4A"
C_EXP = "#C2410C"          # 经验线专用（琥珀棕），与蓝/红区分，不表达涨跌
W = 680

NAMES = {0.12: "买入线", 0.15: "极严", 0.10: "中枢", 0.08: "乐观",
         0.07: "偏乐观", 0.06: "卖出线"}

SHORT = {
    "current": "当年×0.7",
    "center": "中枢×0.6",
    "future": "三年后×0.5",
}


def _nice_step(span):
    raw = span / 6.0
    for s in (10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000):
        if raw <= s:
            return s
    return 10000


def _fmt(v):
    if abs(v) < 1000 and abs(v - round(v)) > 0.05:
        return f"{v:,.1f}"
    return f"{round(v):,}"


def render(result, plan_index=0):
    """渲染主图（默认 A 方案）"""
    mx = result["matrix"][plan_index]
    prices = {k: v for k, v in (mx.get("prices") or {}).items() if v}
    if not prices:
        return '<svg viewBox="0 0 680 40" xmlns="http://www.w3.org/2000/svg"></svg>'

    spot = result.get("price") or 0
    unit = result.get("display_cur") or "元"
    lo, hi = mx.get("lo"), mx.get("hi")
    anchors = result.get("anchors") or {}

    vals = list(prices.values()) + ([spot] if spot else [])
    vmin, vmax = min(vals), max(vals)
    pad = (vmax - vmin) * 0.12 if vmax > vmin else max(vmax * 0.1, 1)
    x0, x1 = vmin - pad, vmax + pad

    def X(v):
        return 62 + (v - x0) / (x1 - x0) * (W - 124)

    # ---- 标签分层避让 ----
    items = sorted(prices.items(), key=lambda kv: kv[1])
    MIN_GAP = 88
    layer_of = {}
    layers = []
    for key, v in items:
        px = X(v)
        for li, layer in enumerate(layers):
            if all(abs(px - p) >= MIN_GAP for p in layer):
                layer.append(px)
                layer_of[key] = li
                break
        else:
            layers.append([px])
            layer_of[key] = len(layers) - 1

    n_layers = max(1, len(layers))
    band_y, band_h = 104, 38
    label_y0 = 172
    LAYER_H = 34
    axis_y = label_y0 + (n_layers - 1) * LAYER_H + 34
    tick_y = axis_y + 20
    H = tick_y + 56

    out = []
    A = out.append
    A(f'<svg viewBox="0 0 {W} {H}" role="img" xmlns="http://www.w3.org/2000/svg" '
      f'style="font-family: var(--font-sans); width:100%;">')
    A(f"<title>{result.get('company','')} 唐朝法买点区间与现价</title>")
    A(f"<desc>{result.get('company','')} 在「{mx['plan']}」下买点区间 "
      f"{_fmt(lo)} 至 {_fmt(hi)} {unit}，现价 {_fmt(spot)} {unit}。</desc>")

    # ---- 现价 ----
    sx = X(spot)
    anchor_side = "middle"
    if sx > W - 90:
        anchor_side = "end"
    elif sx < 90:
        anchor_side = "start"
    A(f'<text x="{sx:.1f}" y="44" text-anchor="{anchor_side}" font-size="13" '
      f'font-weight="500" fill="{C_PRICE}">现价 {_fmt(spot)} {unit}</text>')
    A(f'<line x1="{sx:.1f}" y1="60" x2="{sx:.1f}" y2="{axis_y}" '
      f'stroke="{C_PRICE}" stroke-width="1.5" stroke-dasharray="5 4" />')

    # ---- 区间带 ----
    bx0, bx1 = X(lo), X(hi)
    A(f'<rect x="{bx0:.1f}" y="{band_y}" width="{max(bx1-bx0,2):.1f}" height="{band_h}" '
      f'rx="6" fill="{C_BAND}" fill-opacity="0.45" stroke="{C_BAND_STROKE}" '
      f'stroke-opacity="0.7" stroke-width="1" />')
    # 带标题默认放带上方；若与现价标注重叠则移入带内
    bmid = (bx0 + bx1) / 2
    if abs(X(spot) - bmid) < 120:
        ty, tav = band_y + 24, 13
    else:
        ty, tav = band_y - 12, 13
    A(f'<text x="{bmid:.1f}" y="{ty}" text-anchor="middle" font-size="{tav}" '
      f'font-weight="500" fill="var(--color-text-primary)">'
      f"买点区间 {_fmt(lo)} – {_fmt(hi)} {unit}</text>")

    # ---- 锚刻度 ----
    for key, v in items:
        px = X(v)
        A(f'<circle cx="{px:.1f}" cy="{band_y}" r="3.5" fill="{C_BAND_STROKE}" />')
        ly = label_y0 + layer_of[key] * LAYER_H
        A(f'<text x="{px:.1f}" y="{ly}" text-anchor="middle" font-size="12" '
          f'fill="var(--color-text-secondary)">{SHORT.get(key, key)}</text>')
        A(f'<text x="{px:.1f}" y="{ly+17}" text-anchor="middle" font-size="13" '
          f'font-weight="500" fill="var(--color-text-primary)">{_fmt(v)}</text>')

    # ---- 轴 ----
    A(f'<line x1="62" y1="{axis_y}" x2="{W-62}" y2="{axis_y}" '
      f'stroke="var(--color-border-secondary)" stroke-width="1" />')
    step = _nice_step(x1 - x0)
    tick = (int(x0 / step) + 1) * step
    ticks = []
    while tick < x1:
        ticks.append(tick)
        tick += step
    A('<g stroke="var(--color-border-secondary)" stroke-width="1">')
    for t in ticks:
        tx = X(t)
        A(f'<line x1="{tx:.1f}" y1="{axis_y}" x2="{tx:.1f}" y2="{axis_y+6}" />')
    A("</g>")
    A(f'<g font-size="11" fill="var(--color-text-tertiary)" text-anchor="middle">')
    for t in ticks:
        A(f'<text x="{X(t):.1f}" y="{tick_y}">{_fmt(t)}</text>')
    A("</g>")

    # ---- 底部锚值说明 ----
    dis = mx.get("disabled") or {}
    parts = []
    for k in ("current", "center", "future"):
        a = anchors.get(k)
        if a:
            mid = (a["low"] + a["high"]) / 2
            lbl = {"current": "当年", "center": "中枢", "future": "三年后"}[k]
            if k in dis:
                lbl += "（已禁用）"
            parts.append(f"{lbl} {_fmt(mid)} 亿")
    if parts:
        A(f'<text x="{W/2}" y="{H-20}" text-anchor="middle" font-size="12" '
          f'fill="var(--color-text-tertiary)">利润锚：{"　｜　".join(parts)}</text>')

    A("</svg>")
    return "\n".join(out)


def render_auto(result):
    """默认画 A 方案（matrix[0]）"""
    return render(result, 0)


def render_ladder(result):
    """四层价格（DCF，主）+ 经验线（辅助参考）的阶梯图（v2.2 主图）。

    横轴为股价；每个层次一条竖标记，上方或下方标注「名称 / PE / 价格」。
    经验线用琥珀色 + 虚线 + 空心点标出，明确表示它是**辅助参考线**，
    不参与四层价格取值，也不参与减仓判断。
    """
    tiers = result.get("tiers") or []
    aux = result.get("auxiliary")
    spot = result.get("price") or 0
    unit = result.get("display_cur") or "元"
    if not tiers or not spot:
        return '<svg viewBox="0 0 680 40" xmlns="http://www.w3.org/2000/svg"></svg>'

    items = []
    for t in tiers:
        p = t.get("price")
        if not p or t.get("kind") != "dcf":
            continue
        nm = NAMES.get(round(t["rate"], 4), f"DCF {t['rate']:.0%}")
        items.append({"name": nm, "price": p, "pe": t.get("pe"),
                      "col": C_BAND_STROKE, "aux": False})
    if aux and aux.get("price"):
        items.append({"name": "经验线", "price": aux["price"], "pe": aux.get("pe"),
                      "col": C_EXP, "aux": True})
    items.sort(key=lambda x: x["price"])

    vals = [i["price"] for i in items] + [spot]
    vmin, vmax = min(vals), max(vals)
    pad = (vmax - vmin) * 0.10 if vmax > vmin else max(vmax * 0.1, 1)
    x0, x1 = vmin - pad, vmax + pad

    def X(v):
        return 70 + (v - x0) / (x1 - x0) * (W - 140)

    # ---- 标签分层避让（最多 3 层）----
    MIN_GAP = 96
    layers = []
    for it in items:
        px = X(it["price"])
        for li, layer in enumerate(layers):
            if all(abs(px - q) >= MIN_GAP for q in layer):
                layer.append(px)
                it["layer"] = li
                break
        else:
            layers.append([px])
            it["layer"] = len(layers) - 1
    n_layers = max(1, len(layers))

    axis_y = 112
    rail_y = axis_y - 16
    tick_lbl_y = axis_y + 18
    label_y0 = axis_y + 46
    LAYER_H = 44
    last_label_y = label_y0 + (n_layers - 1) * LAYER_H + 19
    foot_y = last_label_y + 42
    H = foot_y + 16

    out, A = [], lambda s: out.append(s)
    A(f'<svg viewBox="0 0 {W} {H}" role="img" xmlns="http://www.w3.org/2000/svg" '
      f'style="font-family: var(--font-sans); width:100%;">')
    A(f"<title>{result.get('company','')} 四层价格与经验线</title>")
    A(f"<desc>{result.get('company','')}：买入线至卖出线，经验线以琥珀色标出，"
      f"现价 {_fmt(spot)} {unit}。</desc>")

    # ---- 轴与刻度 ----
    A(f'<line x1="70" y1="{axis_y}" x2="{W-70}" y2="{axis_y}" '
      f'stroke="var(--color-border-secondary)" stroke-width="1" />')
    step = _nice_step(x1 - x0)
    tick = (int(x0 / step) + 1) * step
    ticks = []
    while tick < x1:
        ticks.append(tick)
        tick += step
    for t in ticks:
        tx = X(t)
        A(f'<line x1="{tx:.1f}" y1="{axis_y}" x2="{tx:.1f}" y2="{axis_y+6}" '
          f'stroke="var(--color-border-secondary)" stroke-width="1" />')
    A(f'<g font-size="11" fill="var(--color-text-tertiary)" text-anchor="middle">')
    for t in ticks:
        A(f'<text x="{X(t):.1f}" y="{tick_lbl_y}">{_fmt(t)}</text>')
    A("</g>")

    # ---- 现价 ----
    sx = X(spot)
    A(f'<line x1="{sx:.1f}" y1="44" x2="{sx:.1f}" y2="{axis_y}" '
      f'stroke="{C_PRICE}" stroke-width="1.5" stroke-dasharray="5 4" />')
    A(f'<text x="{sx:.1f}" y="34" text-anchor="middle" font-size="13" '
      f'font-weight="600" fill="{C_PRICE}">现价 {_fmt(spot)} {unit}</text>')

    # ---- 各层标记 ----
    for it in items:
        px = X(it["price"])
        col = it["col"]
        if it["aux"]:
            # 辅助线：虚线 + 空心点，视觉上不与决策层并列
            A(f'<line x1="{px:.1f}" y1="{rail_y}" x2="{px:.1f}" y2="{axis_y+6}" '
              f'stroke="{col}" stroke-width="1.5" stroke-dasharray="4 3" '
              f'stroke-opacity="0.9" />')
            A(f'<circle cx="{px:.1f}" cy="{rail_y}" r="4" fill="none" '
              f'stroke="{col}" stroke-width="1.5" />')
        else:
            A(f'<line x1="{px:.1f}" y1="{rail_y}" x2="{px:.1f}" y2="{axis_y+6}" '
              f'stroke="{col}" stroke-width="2" stroke-opacity="0.85" />')
            A(f'<circle cx="{px:.1f}" cy="{rail_y}" r="4" fill="{col}" />')
        ly = label_y0 + it["layer"] * LAYER_H
        pe_txt = f" {it['pe']:.1f}×" if it["pe"] else ""
        name = it["name"] + ("（参考）" if it["aux"] else "")
        txt_col = col if it["aux"] else "var(--color-text-secondary)"
        val_col = col if it["aux"] else "var(--color-text-primary)"
        A(f'<text x="{px:.1f}" y="{ly}" text-anchor="middle" font-size="12" '
          f'fill="{txt_col}">{name}{pe_txt}</text>')
        A(f'<text x="{px:.1f}" y="{ly+19}" text-anchor="middle" font-size="14" '
          f'font-weight="600" fill="{val_col}">{_fmt(it["price"])}</text>')

    # ---- 底部：经验线口径（明确声明不参与计算）----
    if aux:
        if aux.get("capped"):
            note = (f"经验线（参考，不参与计算）= 峰值 {aux['peak_pe']:.1f}× ×50% → "
                    f"{aux['raw_pe']:.1f}× 触顶，按 25× 计")
        else:
            note = (f"经验线（参考，不参与计算）= 峰值 {aux['peak_pe']:.1f}× ×50% = "
                    f"{aux['raw_pe']:.1f}×（未触顶）")
        A(f'<text x="{W/2}" y="{foot_y}" text-anchor="middle" font-size="12" '
          f'fill="{C_EXP}">{note}</text>')
    A("</svg>")
    return "\n".join(out)


if __name__ == "__main__":
    p = Path(sys.argv[1] if len(sys.argv) > 1 else "result.json")
    data = json.loads(p.read_text(encoding="utf-8"))
    sys.stdout.write(render_auto(data))
