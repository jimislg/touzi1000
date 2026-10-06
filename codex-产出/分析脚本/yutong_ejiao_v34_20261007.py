#!/usr/bin/env python3
# 宇通客车/东阿阿胶 v3.4零修复重估 2026-10-07
# 口径：基准情景退出倍数=当前正常化PE（零修复）；DPS折现+终值；A股税=0；两段增长g1/g2
# 参数来源：
#  宇通：正常化EPS2.20(20260908报告)、派息基准65%(50-70%中值,2026中期不分红已发生,2025年100%不可外推)、
#        g1=5%/g2=3%(报告口径利润增长5%外推十年取保守衰减)
#  东阿：正常化扣非EPS2.62、派息85%、g1=5%/g2=3%、退出16x(20260925报告基准)
FX=0.8543
LABELS=[("H10",0.10),("H12",0.12),("H15",0.15),("H17.46",0.1746)]

def price_for_r(eps,pay,g1,g2,exitpe,r,tax=0.0,n=10):
    e=eps; pv=0.0
    for t in range(1,n+1):
        e*=(1+(g1 if t<=5 else g2))
        pv+=e*pay*(1-tax)/(1+r)**t
    return pv+e*exitpe/(1+r)**n

def irr_now(price,eps,pay,g1,g2,exitpe,tax=0.0,n=10):
    lo,hi=-0.5,1.0
    for _ in range(200):
        m=(lo+hi)/2
        if price_for_r(eps,pay,g1,g2,exitpe,m,tax)>price: lo=m
        else: hi=m
    return (lo+hi)/2

CASES=[
 dict(name="宇通客车",code="600066.SH",cur="CNY",price=26.72,eps=2.20,pay=0.65,g1=0.05,g2=0.03,
      grade="A-",note="正常化EPS2.20；2026中期不分红(年度股息按0确认)；payout基准65%为50-70%情景中值"),
 dict(name="东阿阿胶",code="000423.SZ",cur="CNY",price=45.95,eps=2.62,pay=0.85,g1=0.05,g2=0.03,
      grade="B+",note="正常化扣非EPS2.62；TTM OCF/归母78.7%+应收激增→研究口径非正式定价"),
]
SENS=[
 ("宇通客车",dict(name="宇通客车",price=26.72,eps=2.20,pay=0.50,g1=0.05,g2=0.03),"/sensY"),
 ("宇通客车",dict(name="宇通客车",price=26.72,eps=2.20,pay=0.65,g1=0.00,g2=0.00),"/sensYg0"),
 ("东阿阿胶",dict(name="东阿阿胶",price=45.95,eps=2.62,pay=0.70,g1=0.05,g2=0.03),"/sensD"),
 ("东阿阿胶",dict(name="东阿阿胶",price=45.95,eps=2.62,pay=0.85,g1=0.03,g2=0.01),"/sensDg"),
]
print("="*104)
for c in CASES:
    exitpe=c['price']/c['eps']
    irr=irr_now(c['price'],c['eps'],c['pay'],c['g1'],c['g2'],exitpe)
    tiers={lab:price_for_r(c['eps'],c['pay'],c['g1'],c['g2'],exitpe,r) for lab,r in LABELS}
    h12=tiers['H12']; gap=(c['price']/h12-1)*100
    verdict=("价格合格(可进第四步)" if irr>=0.12 else (f"等待价格(≤{h12:.1f}再行动)" if irr>=0.08 else "回报不合格(<8%)"))
    print(f"{c['name']} {c['code']}  现价{c['price']}  当前正常化PE={exitpe:.2f}(零修复退出)")
    print(f"  参数: EPS{c['eps']} payout{int(c['pay']*100)}% g1={c['g1']*100:.0f}%/g2={c['g2']*100:.0f}% 税0  质量{c['grade']}")
    print(f"  现价IRR={irr*100:.2f}%   四档: "+"/".join(f"{l}={tiers[l]:.1f}" for l,_ in LABELS))
    print(f"  现价vs H12: 高{gap:+.1f}%   快筛结论: {verdict}")
    print(f"  标注: {c['note']}")
    print("-"*104)
print("敏感性（同现价、同退出PE=当前PE，只改payout/g）:")
for tag,c,_ in SENS:
    exitpe=c['price']/c['eps']
    irr=irr_now(c['price'],c['eps'],c['pay'],c['g1'],c['g2'],exitpe)
    tiers={lab:price_for_r(c['eps'],c['pay'],c['g1'],c['g2'],exitpe,r) for lab,r in LABELS}
    print(f"  {c['name']} payout{int(c['pay']*100)}% g{c['g1']*100:.0f}/{c['g2']*100:.0f}: IRR={irr*100:.2f}%  "+"/".join(f"{l}={tiers[l]:.1f}" for l,_ in LABELS))
