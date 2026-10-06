#!/usr/bin/env python3
"""快筛产出自动防串检 screen_lint v1 (2026-10-07)
背景：20261006快筛出现三类质量事故——①资格卡20只漏2只(扬农/伟星) ②报告声明港股通税20%但携程脚本填0%
③泡泡玛特卡片串入农夫山泉"茶饮"叙事(张冠李戴)。本脚本将三类事故变成机器可拦的检查。
用法: python3 screen_lint_v34.py <快筛脚本.py> <快筛报告.md>
退出码: 0=通过 1=存在FAIL级问题 2=用法错误
"""
import re, sys, io

# ── 1. 公司专有词表（专有名词只允许出现在本公司上下文）──
# 原则：只收"他公司绝不会合法提到"的强专有词，宁可漏报不可误报（warn vs fail分级）
EXCLUSIVE_KEYWORDS = {
    "泡泡玛特": ["盲盒", "LABUBU", "MOLLY", "SKULLPANDA", "泡泡玛特"],
    "农夫山泉": ["东方树叶", "茶π", "农夫山泉", "包装水", "无糖茶", "茶饮"],
    "康臣药业": ["尿毒清", "康臣"],
    "携程集团": ["Trip.com", "携程", "去哪儿"],
    "名创优品": ["名创", "MINISO", "永辉"],
    "招商银行": ["招行", "招商银行", "净息差"],
    "伊利股份": ["伊利", "澳优", "液奶"],
    "海天味业": ["海天", "酱油", "中炬"],
    "伟星新材": ["伟星", "PPR", "零售建材"],
    "扬农化工": ["扬农", "原药", "菊酯"],
    "长江电力": ["长江电力", "六站", "乌东德", "三峡来水", "梯级调度"],
    "中国移动": ["中国移动", "通信服务", "算力收入"],
    "华润置地": ["华润置地", "万象", "开发收入"],
    "福耀玻璃": ["福耀", "汽玻", "汽车玻璃"],
    "格力电器": ["格力", "空调"],
    "安踏体育": ["安踏", "FILA", "Amer", "主品牌"],
    "迈瑞医疗": ["迈瑞", "监护仪", "试剂"],
    "恒瑞医药": ["恒瑞", "创新药销售", "抗肿瘤"],
    "万华化学": ["万华", "MDI", "聚氨酯"],
    "小商品城": ["小商品城", "商位", "Chinagoods"],
    "茅台": ["茅台"], "腾讯": ["腾讯"],
}

def parse_script_stocks(path):
    """从快筛脚本提取参数行: (name, cur, price, eps, pay, g, exitpe, tax, ...)"""
    src = io.open(path, encoding="utf-8").read()
    rows = []
    for m in re.finditer(r'\("([^"]+)","([A-Z]{3})",\s*([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*(-?[\d.]+),\s*([\d.]+),\s*([\d.]+)', src):
        name, cur, price, eps, pay, g, exitpe, tax = m.groups()
        rows.append(dict(name=name, cur=cur, price=float(price), eps=float(eps),
                         pay=float(pay), g=float(g), exitpe=float(exitpe), tax=float(tax)))
    return rows

def match_company(text):
    """返回该文本片段命中的公司集合（按专有词）"""
    hits = set()
    for comp, kws in EXCLUSIVE_KEYWORDS.items():
        for kw in kws:
            if kw.lower() in text.lower():
                hits.add(comp); break
    return hits

def main():
    if len(sys.argv) != 3:
        print(__doc__); sys.exit(2)
    script_path, report_path = sys.argv[1], sys.argv[2]
    stocks = parse_script_stocks(script_path)
    report = io.open(report_path, encoding="utf-8").read()
    fails, warns = [], []

    # ── 检查1：完整性断言（事故①：20只漏2只）──
    # 启发式：每只标的在报告中应出现≥3次（总表+资格卡+参数表各1次）；<3次疑似缺卡
    print(f"[检查1] 参数表标的数: {len(stocks)}")
    def name_count(name):
        variants = {name, re.sub(r"[AH]$", "", name)} if name[-1] in "AH" else {name}
        return sum(report.count(v) for v in variants)
    for s in stocks:
        n = name_count(s["name"])
        if n == 0:
            fails.append(f"完整性: {s['name']} 参数表存在但报告完全未出现")
        elif n < 3:
            warns.append(f"完整性: {s['name']} 在报告仅出现{n}次（疑似缺资格卡/缺档位）")

    # ── 检查2：声明-执行一致性（事故②：携程税0%）──
    declared_hk_tax = re.search(r"港股通[^。\n]*?(\d+)%", report)
    declared = float(declared_hk_tax.group(1))/100 if declared_hk_tax else None
    print(f"[检查2] 报告声明港股通税率: {declared if declared is not None else '未声明'}")
    for s in stocks:
        if s["cur"] == "HKD" and declared is not None and abs(s["tax"] - declared) > 1e-9:
            fails.append(f"税率声明-执行不一致: {s['name']} 脚本tax={s['tax']:.2f} ≠ 声明{declared:.2f}")

    # ── 检查3：张冠李戴串文检测（事故③：泡泡卡出现"茶饮"）──
    # 句级扫描（按。！？\n切分）：命中2家专有词且无比较语境则告警；≥3家视为枚举跳过
    sentences = re.split(r"[。！？\n]", report)
    for ln in sentences:
        hits = match_company(ln)
        # ≥3家命中视为枚举清单行（如"继续名单"），跳过；仅2家命中且无比较语境才告警
        if len(hits) == 2 and not re.search(r"对标|比较|对比|高于|低于|溢价|重复条目", ln):
            warns.append(f"疑似串文(一行命中2公司专有词): {hits} -> {ln.strip()[:80]}")

    # ── 检查4：币种标签（农夫DPS人民币/港元混用类事故）──
    for s in stocks:
        if s["cur"] == "HKD" and re.search(re.escape(s["name"]) + r"[^\n]{0,120}(人民币|RMB|CNY)", report):
            warns.append(f"{s['name']} 为HKD标的但附近文本出现人民币字样，请核对DPS/EPS币种")

    print(f"\n===== 结果: FAIL {len(fails)} 项 / WARN {len(warns)} 项 =====")
    for f in fails: print("  FAIL:", f)
    for w in warns: print("  WARN:", w)
    sys.exit(1 if fails else 0)

if __name__ == "__main__":
    main()
