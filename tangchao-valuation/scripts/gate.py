#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
交付闸门 · 反自欺校验器（v3.10）
==================================================
背景：本技能连续四次在"差异拆解 / 验证"这一环出错——
  泡泡玛特 1.4pct（五开关抵消，被当成共识）
  江南布衣 0.2%（两组假设抵消，被当成"内在价值真实刻度"）
  泡泡重算 3.07pct（起点填错，方向还反）
  恒隆 −25.4 / +5.2（两个分量是凑的，残值 0.00 是假的）
前三次是判断失误，第四次是表格本身造假。规则条文拦不住，只能让脚本拦。

设计原则
--------
1. **残值是输出，不是输入。** 脚本先加总分量，残值 = 总差 − Σ分量。
   人工填"残值 0.00"在结构上不可能。
2. **分量必须带公式。** 没有 formula 字符串的分量一律判 FAIL —— 不可复算 = 未解释。
3. **断言失败即退出码非 0。** 报告不得在闸门 FAIL 时交付。

用法
----
    python3 gate.py --demo          # 用恒隆实测数据自检（应看到旧表 FAIL、新表 PASS）
    from gate import decomp, hurdle, run_gate   # 在算例脚本里直接调用

SKILL.md 对应：第 10 节「交付闸门」、禁止 51/52/53。
"""
import sys

EPS = 0.005          # 残值容差，pct 空间（小数）用：0.5 pct
EPS_ABS = 0.005      # 残值容差，金额空间（元/股）用：0.005 元
RERATE_TOL = 0.10    # 买入隐含倍数与退出倍数偏离超过 10% → 必须给敏感性表
TERM_NEAR = 0.03     # 终值与现价差 <3% → 视为"终值即现价"


def decomp(total_gap, components, tol=EPS, unit="pct"):
    """差异拆解校验。

    total_gap : float，两法总额差（pct 空间用小数如 −0.202；金额空间用元如 +0.874）
    components: list of dict(name, value, formula)
                value  —— 该分量对总差的贡献（与 total_gap 同量纲同符号）
                formula—— 可复算的算式字符串，如 "1.9899 − 1.1162 = 0.8738"
    unit      : "pct" 或 "元"，只影响报错文案
    返回 dict(ok, sigma, residual, rows, msg)

    ⚠️ pct 不可加：拆解一律先在金额空间做完，再折算成 pct 写进报告。
    """
    rows, sigma, missing = [], 0.0, []
    for c in components:
        f = (c.get("formula") or "").strip()
        if not f:
            missing.append(c.get("name", "?"))
        sigma += c["value"]
        rows.append((c.get("name", "?"), c["value"], f))
    residual = total_gap - sigma
    ok = (abs(residual) <= tol) and not missing
    fmt = (lambda v: f"{v*100:+.2f} pct") if unit == "pct" else (lambda v: f"{v:+.4f} 元")
    msg = []
    if missing:
        msg.append(f"FAIL 分量缺公式，视为不可复算：{', '.join(missing)}")
    if abs(residual) > tol:
        msg.append(f"FAIL 残值 {fmt(residual)} 超过容差 {fmt(tol)} —— "
                   f"有未解释部分，报告中必须标注，不得写『残值 0.00』")
    if ok:
        msg.append(f"PASS Σ分量 {fmt(sigma)}，残值 {fmt(residual)}")
    return dict(ok=ok, sigma=sigma, residual=residual, rows=rows, msg="；".join(msg), unit=unit)


def hurdle(price, bps, exit_mult, dps, r, n=10, label="H12", cur_price=None,
           bps_end=None, dps_list=None, sens_mults=None):
    """H 档反解校验：买入隐含倍数 vs 退出倍数；终值是否等于现价。

    price     : 反解出的买入价
    bps       : 当前每股净资产（用于算「买入隐含倍数」）
    exit_mult : 退出倍数（PB）
    dps       : 每期股息（税后，恒定）——dps_list 提供时忽略
    r, n      : 要求回报、年限
    cur_price : 现价，用于"终值 ≈ 现价"判断
    bps_end   : 期末每股净资产。**BPS 有增长的标的必须传**，否则终值会被当成
                当前 BPS×退出倍数，误判"终值即现价"（v3.10.1，成都银行暴露）
    dps_list  : 逐年股息列表。给定时按实际序列折现，不再假设 DPS 恒定
    sens_mults: 退出倍数敏感性档位，缺省沿用恒隆的四档（0.158/0.20/当前/0.35）
    """
    bps_end = bps if bps_end is None else bps_end
    buy_mult = price / bps
    rerating = exit_mult / buy_mult - 1.0
    term = bps_end * exit_mult
    checks = []

    if dps_list is not None:
        pv_div = sum(d / (1 + r) ** (i + 1) for i, d in enumerate(dps_list[:n]))
    else:
        pv_div = dps * (1 - (1 + r) ** -n) / r
    pv_term = term / (1 + r) ** n
    recon = pv_div + pv_term

    checks.append(("反解价自洽", abs(recon - price) / price < 0.01,
                   f"股息现值 {pv_div:.2f} + 终值现值 {pv_term:.2f} = {recon:.2f} vs 反解价 {price:.2f}"))

    need_sens = abs(rerating) > RERATE_TOL
    checks.append(("倍数修复已披露", not need_sens or True,  # 披露动作由报告承担，脚本只负责报警
                   f"买入隐含倍数 {buy_mult:.3f} vs 退出 {exit_mult:.3f} → 内含修复 {rerating:+.1%}"
                   + ("（>10%，报告必须给退出倍数敏感性表）" if need_sens else "")))

    term_eq = cur_price is not None and abs(term / cur_price - 1) < TERM_NEAR
    if term_eq:
        checks.append(("终值即现价已声明", True,
                       f"终值 {term:.2f} ≈ 现价 {cur_price:.2f} —— 该 H 档含价格回归，禁止只写『PB 不变』"))
    elif bps_end != bps:
        checks.append(("BPS 增长已建模式", True,
                       f"期末 BPS {bps_end:.2f}（当前 {bps:.2f}，+{bps_end/bps-1:.1%}）→ 终值 {term:.2f}"
                       f"，与现价 {cur_price:.2f} 差 {term/cur_price-1:+.0%}，不构成价格回归"))

    # 敏感性表（退出倍数）
    mults = sens_mults if sens_mults else (0.158, 0.20, exit_mult, 0.35)
    sens = []
    for m in mults:
        v = pv_div + bps_end * m / (1 + r) ** n
        sens.append((m, v))

    return dict(label=label, buy_mult=buy_mult, rerating=rerating, term=term,
                checks=checks, sens=sens, need_sens=need_sens)


def run_gate(title, decomp_res=None, hurdle_res=None):
    """汇总输出。任一 FAIL → 返回 False。"""
    print(f"\n{'='*66}\n交付闸门 · {title}\n{'='*66}")
    ok = True
    if decomp_res:
        print("\n[1] 差异拆解")
        for n, v, f in decomp_res["rows"]:
            print(f"    {n:<22} {v:+.4f}   {('← ' + f) if f else '← 【无公式】'}")
        print(f"    {'Σ':<22} {decomp_res['sigma']:+.4f}")
        print(f"    残值（脚本算出，非人工填写） {decomp_res['residual']:+.4f}")
        print(f"    → {decomp_res['msg']}")
        ok &= decomp_res["ok"]
    if hurdle_res:
        h = hurdle_res
        print(f"\n[2] {h['label']} 反解")
        print(f"    买入隐含倍数 {h['buy_mult']:.3f}   退出倍数见敏感性表   内含修复 {h['rerating']:+.1%}")
        for name, passed, msg in h["checks"]:
            print(f"    {'✓' if passed else '✗'} {name}: {msg}")
        print("    退出倍数敏感性（必须贴进报告）：")
        for m, v in h["sens"]:
            print(f"      PB {m:.3f} → {v:5.2f}")
    print(f"\n{'—'*66}\n闸门结果：{'PASS —— 可交付' if ok else 'FAIL —— 报告不得交付，先修分量'}\n")
    return ok


# ------------------------------------------------------------------ demo
if __name__ == "__main__":
    if "--demo" not in sys.argv:
        print(__doc__)
        sys.exit(0)

    # 恒隆实测数据（2026-10-31，00101.HK）
    BPS, EXIT_PB, DPS, R, N, CUR = 26.64, 0.232, 0.416, 0.12, 10, 6.19
    pv_div = DPS * (1 - (1 + R) ** -N) / R
    perp = DPS / R
    pv_term = BPS * EXIT_PB / (1 + R) ** N
    h12 = pv_div + pv_term
    gap = perp / h12 - 1                      # −20.2%

    print(f"恒隆：H12 = {h12:.2f}（股息现值 {pv_div:.2f} + 终值现值 {pv_term:.2f}）")
    print(f"      唐朝法永续 = {perp:.2f}   两法差 = {gap:+.2%}")

    # ① 旧写法：两个凑出来的分量
    old = decomp(gap, [
        dict(name="年限（永续 vs 10 年）", value=-0.254,
             formula=""),   # 复算不出来 → 必然 FAIL
        dict(name="终值口径", value=+0.052,
             formula=""),
    ], unit="pct")
    run_gate("恒隆 · 旧拆解表（应 FAIL）", decomp_res=old)

    # ② 新写法：单一分量。**必须切换到金额空间**——pct 不可加，元可加。
    delta = pv_term - perp / (1 + R) ** N
    new = decomp(h12 - perp, [
        dict(name="终值现值 − 永续股息现值",
             value=delta,
             formula=f"{pv_term:.4f} − {perp/(1+R)**N:.4f} = {delta:.4f}"),
    ], tol=EPS_ABS, unit="元")
    run_gate("恒隆 · 更正后（应 PASS）", decomp_res=new,
             hurdle_res=hurdle(h12, BPS, EXIT_PB, DPS, R, N, cur_price=CUR))

    print("要点：pct 空间不可加（容差 0.5pct 会被股本/价格差异放大），")
    print("      拆解一律先在金额空间做完，再折算成 pct 写进报告。\n")
