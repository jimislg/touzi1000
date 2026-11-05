#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""precheck.py — 结论形成之前的强制前置闸（v3.4.9）

对应 2026-11-01 腾讯的三个真实错误，三者都不是算错，是"在错误层级上做决定"：

  1. class   分类不是判断，是计数。腾讯核心六维只存疑 1 个 -> 规则算出来是 A 类，
             我写成了 B 类，理由"第 5 维弱"。但 B 类要求"存疑 <=2"，A 类要求"<=1"，
             二者在 1 个存疑时同时成立 —— 我选 B 是因为它"看起来更严格"，
             而 B 类的仓位硬上限是 8%，于是"保守地降一档"变成"建议卖掉 40% 仓位"。
             方向上的保守，后果上的激进。

  2. inputs  决策输入缺失时，我用了默认值（零持仓），而默认值看起来和有依据的值一样。
             腾讯两版报告全按零持仓写，用户实持 12.8%、成本 404。

  3. fx      跨币种标的价格链：H 档终值(RMB) 漏除 FXR -> H12 从 464.43 错成 410.41。
             错误方向让差别变小、结论更看空，与当时先验一致，所以没被查出来。

用法：
  python3 precheck.py class --d 2=pass,3=pass,5=unsure,6=pass,7=pass,8=pass \
      --moat pass --fin pass --veto no --claim A

  python3 precheck.py inputs --total 1000 --holding 128 --cost 404 --px 383.6 \
      --cash 600 --fx 0.875 --ccy HKD

  python3 precheck.py fx --fx 0.850,0.875,0.900 \
      --a 312.45,303.52,295.09 --b 478.09,464.43,451.52 --irr 0.1245,0.1245,0.1245

退出码：0 = PASS；1 = FAIL（不得进入报告写作）。
"""
import sys
import argparse

CORE = [2, 3, 5, 6, 7, 8]
COND = [1, 4]
VERDICTS = ("pass", "unsure", "fail", "na")
CN = {"pass": "过", "unsure": "存疑", "fail": "不通过", "na": "中性不适用"}


def _bad(msg):
    print(f"  ✗ {msg}")
    return 1


def cmd_class(a):
    print("【precheck · class】分类必须数出来，不得判出来")
    core = {}
    for item in a.d.split(","):
        k, v = item.split("=")
        k, v = int(k), v.strip()
        if v not in VERDICTS:
            return _bad(f"维度 {k} 的判定 '{v}' 非法，只接受 {VERDICTS}")
        core[k] = v
    missing = [d for d in CORE if d not in core]
    if missing:
        return _bad(f"核心维度 {missing} 未给判定。核心六维必须逐个判，缺一个就不许出分类")

    n_fail = sum(1 for v in core.values() if v == "fail")
    n_uns = sum(1 for v in core.values() if v == "unsure")

    print("  核心六维：" + " | ".join(f"维度{d} {CN[core[d]]}" for d in CORE))
    if a.cond:
        for item in a.cond.split(","):
            k, v = item.split("=")
            print(f"  条件维度 {k} {CN[v.strip()]}")
    print(f"  → 核心存疑 {n_uns} 个，核心不通过 {n_fail} 个，否决项 {'有' if a.veto == 'yes' else '无'}")
    print(f"  → 护城河 {CN[a.moat]}，财务 {CN[a.fin]}")

    if n_fail > 0 or a.veto == "yes":
        got = "D"
        why = "核心维度存在'不通过'" if n_fail else "命中否决项"
    elif n_uns >= 3 or (a.moat != "pass" and a.fin != "pass"):
        got = "C"
        why = "核心存疑 >=3" if n_uns >= 3 else "护城河与财务同时不明确通过"
    elif n_uns <= 1 and a.moat == "pass" and a.fin == "pass":
        got = "A"
        why = f"存疑 {n_uns}<=1 且护城河/财务均明确通过"
    elif n_uns <= 2:
        got = "B"
        why = f"存疑 {n_uns}<=2，但有条件不满足 A（护城河或财务非明确通过）"
    else:
        got = "C"
        why = "兜底"

    # A 与 B 同时成立时，规则取更强的那一条；不得以"看起来更严格"选 B
    overlap = (n_uns <= 1 and a.moat == "pass" and a.fin == "pass")
    print(f"\n  **机械分类 = {got} 类**（{why}）")
    if overlap:
        print("  注：存疑 <=1 时 A 与 B 的条件同时成立。B 类只是 A 类的超集，")
        print("      **更宽的条件不等于更严格的标准**。此时选 B 不是保守，是把仓位上限从 20% 砍到 8%。")

    if a.claim:
        claim = a.claim.strip().upper()
        if claim != got:
            print()
            if overlap and claim == "B":
                return _bad(
                    "报告写的 B 类与机械分类 A 类不符。本轮腾讯的错误正是这一条："
                    "在 A/B 条件同时成立时选了 B（自以为保守），后果是仓位上限 20%->8%、"
                    "把 12.8% 判成超配 60%、建议卖出 48 万。**不得用'某维不满分'作为降级理由。**"
                )
            return _bad(f"报告写的 {claim} 类与机械分类 {got} 类不符，二者必居其一为错，先查计数")
        print(f"  ✓ 报告所述分类 {claim} 类与机械分类一致")
    print("\n  结果：PASS —— 可以把这段输出原样贴进报告")
    return 0


def cmd_inputs(a):
    print("【precheck · inputs】决策输入清单：缺失必须显式 UNKNOWN，禁止默认值静默生效")
    fields = [
        ("total", "可投资总资金基数", "仓位百分比无法换算成金额，目标配置不可给"),
        ("holding", "本标的持仓市值", "无法区分'建仓'与'加仓'，仓位结论整体无效"),
        ("cost", "持仓成本价", "无法判断浮盈/浮亏，减仓的价格档（反弹至成本）不可设"),
        ("px", "现价", "无法算现价相对买点，方向性结论为空"),
        ("cash", "可动用现金", "无法判断减出的钱有无去处，减仓建议可能只是把股票风险换成现金风险"),
        ("fx", "报表币->交易币汇率", "跨币种标的的价格链全错，且错误方向通常与先验一致"),
    ]
    have, miss = [], []
    for key, label, impact in fields:
        v = getattr(a, key, None)
        if v is None:
            miss.append((label, impact))
        else:
            have.append((label, v))
    for label, v in have:
        print(f"  ✓ {label:22s} = {v}")
    for label, impact in miss:
        print(f"  ✗ {label:22s} = UNKNOWN")
        print(f"      若实际不同，结论变为：{impact}")

    if a.holding is not None and a.total:
        pct = a.holding / a.total * 100
        print(f"\n  仓位 = {a.holding} / {a.total} = {pct:.2f}%")
        if a.px and a.fx and a.cost:
            sh = a.holding / (a.px * a.fx)
            amt = sh * a.cost * a.fx
            print(f"  隐含股数 {sh:,.0f} 股，投入 {amt:,.1f} 万，"
                  f"浮盈亏 {a.holding - amt:+.1f} 万（{(a.holding / amt - 1) * 100:+.2f}%）")

    if miss:
        print(f"\n  结果：FAIL —— {len(miss)} 项输入缺失。缺失项必须在报告开头写成"
              "「未知（默认 X，若实际为 Y 则结论变为 Z）」，不得直接采用默认值。")
        return 1
    print("\n  结果：PASS")
    return 0


def cmd_fx(a):
    print("【precheck · fx】跨币种扰动自检（终值必须与股息同币种）")
    fx = [float(x) for x in a.fx.split(",")]
    pa = [float(x) for x in a.a.split(",")] if a.a else None
    pb = [float(x) for x in a.b.split(",")] if a.b else None
    irr = [float(x) for x in a.irr.split(",")] if a.irr else None
    for lst, name in ((pa, "A 法"), (pb, "B 法")):
        if lst and len(lst) != len(fx):
            return _bad(f"{name} 价格序列长度 {len(lst)} 与 fx 序列 {len(fx)} 不一致")

    rows = []
    for i, f in enumerate(fx):
        rows.append((f, pa[i] if pa else None, pb[i] if pb else None, irr[i] if irr else None))
    print("     FXR      A 法价     B 法价      IRR")
    for f, x, y, z in rows:
        print(f"   {f:5.3f}  {('-' if x is None else f'{x:9.2f}')}  "
              f"{('-' if y is None else f'{y:9.2f}')}  {('-' if z is None else f'{z:7.4%}')}")

    fail = 0
    # fx 上升（交易币升值）-> 同一 RMB 价值折成更少交易币 -> 价格必须下降
    for lst, name in ((pa, "A 法"), (pb, "B 法")):
        if not lst:
            continue
        diffs = [lst[i + 1] - lst[i] for i in range(len(lst) - 1)]
        if not (all(d < 0 for d in diffs) or all(d > 0 for d in diffs)):
            print(f"  ✗ {name}价格对 FXR 不单调 —— 换算位置错了（该除的乘了，或换算点不在终值）")
            fail += 1
        if pa and pb:
            ratio0 = pa[0] / pb[0]
            ratioN = pa[-1] / pb[-1]
            if abs(ratioN / ratio0 - 1) > 0.005:
                print(f"  ✗ 两法比值随 FXR 变化 {ratio0:.4f} -> {ratioN:.4f} —— 两法换算位置不一致")
                fail += 1
    if irr:
        lo, hi = min(irr), max(irr)
        print(f"  IRR 极差 {hi - lo:.6%}")
        if hi - lo > 0.0002:
            print("  ✗ IRR 随 FXR 变动 —— 说明汇率被塞进了现金流序列，而不是只换展示币种")
            fail += 1
        else:
            print("  ✓ IRR 对 FXR 恒定（汇率只换展示，不改回报）")

    if fail:
        print("\n  结果：FAIL")
        return 1
    print("\n  结果：PASS —— 反向自查：把 FXR 改 0.5 重跑，两个价格同向变、IRR 一格不动")
    return 0


def main():
    ap = argparse.ArgumentParser(description="结论形成之前的强制前置闸")
    sub = ap.add_subparsers(dest="cmd", required=True)

    c = sub.add_parser("class", help="分类计数闸")
    c.add_argument("--d", required=True, help="核心维度判定，如 2=pass,3=unsure,5=pass,6=pass,7=pass,8=pass")
    c.add_argument("--cond", default="", help="条件维度判定，如 1=pass,4=na")
    c.add_argument("--moat", required=True, choices=VERDICTS, help="护城河维度结论")
    c.add_argument("--fin", required=True, choices=VERDICTS, help="财务质量维度结论")
    c.add_argument("--veto", default="no", choices=("no", "yes"), help="是否命中否决项")
    c.add_argument("--claim", default="", help="报告里准备写的分类，用于比对")
    c.set_defaults(func=cmd_class)

    i = sub.add_parser("inputs", help="决策输入清单闸")
    for k in ("total", "holding", "cost", "px", "cash", "fx"):
        i.add_argument(f"--{k}", type=float, default=None)
    i.add_argument("--ccy", default="")
    i.set_defaults(func=cmd_inputs)

    f = sub.add_parser("fx", help="跨币种扰动自检")
    f.add_argument("--fx", required=True)
    f.add_argument("--a", default="")
    f.add_argument("--b", default="")
    f.add_argument("--irr", default="")
    f.set_defaults(func=cmd_fx)

    ns = ap.parse_args()
    sys.exit(ns.func(ns))


if __name__ == "__main__":
    main()
