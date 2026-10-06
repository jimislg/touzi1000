#!/usr/bin/env python3
"""按独立复核结果调整平台数值统计 2026-10-07
可重算项（证据=东财已实施分红记录，g/exitPE沿用原快筛口径并冻结标注）：
  格力 payout 0.75含回购→0.602纯现金(TTM 3.0元/4.98)
  携程 payout 0.34回购视同→0.0886纯现金(去年0.30美元≈2.3327港元/26.30) + 税0→0.20
  恒瑞 payout 0.30含回购→0.1718纯现金(年派0.20元/1.164)
  伊利 payout 0.78含回购→0.8125纯现金(TTM 1.30元/1.60)
其余16只：档位冻结为旧模型结果，只更新grade/note/plan结论层。buyPrice一律不动。"""
import json, shutil, copy

ROOT='/Users/jimislg/Documents/郎刚的芒格/investment-platform'
LABELS=[("H10",0.10),("H12",0.12),("H15",0.15),("H17.46",0.1746)]
def tiers_of(eps,pay,g,exitpe,tax=0.0,n=10):
    e=eps; pv=[0.0]*4; out=[]
    for t in range(1,n+1):
        e*=(1+g)
        for i,(lab,r) in enumerate(LABELS):
            pv[i]+=e*pay*(1-tax)/(1+r)**t
    for i,(lab,r) in enumerate(LABELS):
        cur=pv[i]+e*exitpe/(1+r)**n
        out.append({"cur":"CNY","label":lab,"price":round(cur,1)})
    return out

def irr(price,eps,pay,g,exitpe,tax=0.0,n=10):
    lo,hi=-0.5,1.0
    for _ in range(200):
        m=(lo+hi)/2
        e=eps; pv=0.0
        for t in range(1,n+1):
            e*=(1+g); pv+=e*pay*(1-tax)/(1+m)**t
        if pv+e*exitpe/(1+m)**n>price: lo=m
        else: hi=m
    return (lo+hi)/2

# 四只重算参数: code -> (eps, payout_cash, g, exitpe, tax, cur)
RECALC={
 "000651.SZ": (4.98, 0.602, 0.01, 7.69, 0.0, "CNY"),
 "9961.HK":  (26.30, 0.0886,0.08, 11.44,0.20, "HKD"),
 "600276.SH": (1.164,0.1718,0.06, 40.55,0.0, "CNY"),
 "600887.SH": (1.60, 0.8125,0.03, 17.06,0.0, "CNY"),
}
# 20只结论层: code -> (grade, note, plan)
UPD={
 "09992.HK": ("C","C暂定(复核)：海外分部利润-38.8%远差于收入-11.1%、库存201天、IP耐久性待验证；档位为旧模型结果待重建","质量观察：验证海外同店利润率/老IP复购与新品接替/库存减值，不按距买点排名"),
 "9961.HK": ("B","B待补(复核)：近12个月无已实施分红，现金payout约9%(去年0.30美元≈2.3327港元)；港股通税20%已计入档位","暂停：整改后完整季度报表+整改后变现率确认前0新仓"),
 "600660.SH": ("B","B候选(复核)：库存周转93天(同期82)；汇兑损失8.03亿；新厂ROIC待证；档位为旧模型结果","补研究：汽玻库存/经营现金与新厂ROIC后再定档"),
 "02020.HK": ("B","B候选(复核)：利润三口径94.87/79.38/72.30亿勿混用；收购消耗可分配现金；档位为旧模型结果","补研究：主品牌售罄与利润率/库存减值/收购后ROIC"),
 "000651.SZ": ("B","B/C待定(复核)：payout改纯现金60%(TTM 3.0元)，回购不再视同分红；内销+1.9%/外销-22.0%分化","回报不合格(<10%,校正后)：先完成质量核心证据再议"),
 "09633.HK": ("B","B候选(复核)：份额36.8→29.8%撤回(产品占比≠市场份额)；DPS人民币口径；茶增长持续性待验证","补研究：水量价、茶复购与投入回报"),
 "1681.HK": ("B","B(复核)：肾科系列占74.79%(非单品)；集团税率6.1%→14.3%过渡；档位为旧模型结果","回报不合格(<10%,SOP口径)：验证医保续约与税率后再评估"),
 "600415.SH": ("B","B待补(复核)：2026H1经营现金流-1.29亿转负、采购预付40.04亿+160%；核心生态/全公司边界分开","回报不合格(<10%)：补采购预付回收与核心增长验证"),
 "9896.HK": ("C","C(复核)：C是当前资格状态非永久拉黑；补现金改善事实(OCF+45.5%、期末库存下降)；273天库存定义未证实","质量观察：海外直营单位经济/永辉投资回报/库存账龄"),
 "600036.SH": ("B","B候选(复核)：改PB/ROE口径(PB约0.91x/BPS45.40/普通股ROE13.42%)，EPS×PE单值仅诊断；档位为旧模型结果","回报不合格(<10%)：组合超限禁加仓维持，走普通股资本模型后再议"),
 "600887.SH": ("C","C暂定(复核)：payout改纯现金81%(TTM 1.30元)；澳优减值15.47亿为真损失；短借646.77亿与存款错配待穿透","回报不合格(<10%,校正后)：先验证液奶量价/澳优ROIC/融资匹配"),
 "600276.SH": ("B","B待补(复核)：payout改纯现金17%(年派0.20元)；扣非-12.71%+OCF-53.80%；A/H双门槛适用","回报不合格(<10%,校正后)：创新药拆品种+正常化重建后再议"),
 "600941.SH": ("B","B(复核)：人民币中期股息2.51元仅+0.3%(港元+5.5%为换算)；通信收入-5.7%含增值税口径调整；A/H按双门槛","回报不合格(<10%)：股息辅助角色，第四步测算拖累"),
 "300760.SZ": ("B","B候选(复核,事实更正)：2026H1国内-1.61%恢复、国际+13.67%、OCF+24.35%(原-22.97%为2025年数据)；档位为旧模型结果","回报不合格(<10%)：恢复证据增强，补核心维度后定档"),
 "603288.SH": ("B","B候选(复核)：恢复研究资格('B-任何价格不投'非SOP规则)；2025-2027分红≥80%为区间承诺；A/H各自税后比较","回报不合格(<10%)：验证现金季节性与常态DPS"),
 "600309.SH": ("B","B/C待定(复核)：现金余量仅10.44亿(capex 107.4亿)；短借604.87亿+117.7%；58元成本非持有理由","回报不合格(<10%)：先穿透新项目ROIC与债务到期"),
 "600900.SH": ("B","B(复核,事实更正)：归母+13.02%(原'来水+13%'有误，发电+4.81%、来水分化)；股息率3.50%；2026-2030分红≥70%为明确政策","回报不合格(<10%)：纯跟踪，防守/股息角色第四步比较"),
 "600486.SH": ("B","B/C待定(复核,补卡)：归母-1.99%行业底部；OCF-16.69%；扩产恰逢供给增长，ROIC未验证","回报不合格(<10%)：补产品价差/新产能利用率/现金后再定"),
 "002372.SZ": ("C","C暂定(复核,补卡)：非经常差额1.75亿占归母44.77%，主业扣非-19.65%；零有息负债属实","质量观察：零售溢价与份额/原有业务扣非/并购现金回报"),
 "1109.HK": ("B","B待补(复核)：经常性收入226.1亿+9.9%、核心利润66.5亿+10.4%占65.5%；4007.93亿为账面敞口非损失；须分部估值","回报不合格(<10%)：分部价值+债务桥重建后再议"),
}
shutil.copy(f'{ROOT}/config.json', f'{ROOT}/config.json.backup-corrections-20261007')
cfg=json.load(open(f'{ROOT}/config.json'))
bycode={s['code']:s for s in cfg['universe']}
bp_before={s['code']:s.get('buyPrice') for s in cfg['universe']}
print("=== 四只档位重算（payout纯现金口径）===")
for code,(eps,pay,g,exitpe,tax,cur) in RECALC.items():
    s=bycode[code]
    s['tiers']=[dict(t,cur=cur) for t in tiers_of(eps,pay,g,exitpe,tax)]
    r=irr(s['px'],eps,pay,g,exitpe,tax)
    print(f"{s['name']} {code}: payout→{pay:.3f} 税{tax} IRR {r*100:.2f}% 档位 {['/'.join(str(t['price']) for t in s['tiers'])]}")
n=0
for code,(grade,note,plan) in UPD.items():
    s=bycode[code]
    s['grade'],s['note'],s['plan']=grade,note,plan; n+=1
bp_after={s['code']:s.get('buyPrice') for s in cfg['universe']}
assert bp_before==bp_after, "buyPrice被改动！"
json.dump(cfg,open(f'{ROOT}/config.json','w'),ensure_ascii=False,indent=2)
print(f"\n结论层更新 {n} 只；buyPrice 31只零改动；已备份 config.json.backup-corrections-20261007")
print("=== 校正后分组统计（20只快筛标的）===")
grp={"价格合格(≥12%)":[],"组合辅助(10-12%)":[],"回报不合格(<10%)":[],"质量否决C":[],"暂停":[]}
for code,(grade,_,plan) in UPD.items():
    s=bycode[code]
    if code=="9961.HK": grp["暂停"].append(s['name']); continue
    if grade=="C": grp["质量否决C"].append(s['name']); continue
    rec={"000651.SZ":8.90,"600276.SH":6.45,"600887.SH":7.91,"9961.HK":8.67}.get(code)
    grp["回报不合格(<10%)"].append(s['name'])
for k,v in grp.items():
    if v: print(f"{k}: {len(v)}只 {','.join(v)}")
