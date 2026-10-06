#!/usr/bin/env python3
# 腾讯控股 v3.4 估值重跑 2026-10-06
# 输入（全部可追溯）：
PRICE_HKD = 428.20          # [事实] 2026-10-06收盘 腾讯行情
FX = 0.8543                 # [事实] HKDCNY 2026-10-06
EPS0_RMB = 29.6             # [计算] 2026H1 non-IFRS摊薄EPS 14.799 x2，保守不假设H2环比增长
EPS0_HKD = EPS0_RMB / FX
PAYOUT = 0.16               # [计算] FY2025 DPS 5.30港币/EPS约27.9人民币 ≈ 16%
TAX = 0.20                  # 港股通红利税

def cashflows(price, g1, g2, exit_pe, n1=5, n=10, tax=0.0, payout=PAYOUT):
    """每股口径：DPS折现 + 终值；返回IRR(二分)与给定r的价格"""
    eps = EPS0_HKD
    # 年1..n的EPS与DPS（税前）
    flows = []
    e = eps
    for t in range(1, n+1):
        g = g1 if t <= n1 else g2
        e *= (1+g)
        flows.append((t, e, e*payout*(1-tax)))
    tv = e * exit_pe
    def pv(r):
        return sum(d/(1+r)**t for t,_,d in flows) + tv/(1+r)**n
    # IRR: 解 pv(r)=price
    lo, hi = -0.5, 1.0
    for _ in range(200):
        mid = (lo+hi)/2
        if pv(mid) > price: lo = mid
        else: hi = mid
    irr = (lo+hi)/2
    return irr, pv

def price_for_r(g1,g2,exit_pe,r,n=10,tax=0.0):
    eps=EPS0_HKD; e=eps; flows=[]
    for t in range(1,n+1):
        g = g1 if t<=5 else g2
        e*=(1+g); flows.append((t,e*PAYOUT*(1-tax)))
    tv=e*exit_pe
    return sum(d/(1+r)**t for t,d in flows)+tv/(1+r)**n

SCEN = {
  '悲观': dict(g1=0.03,g2=0.03,exit_pe=10,  w=0.25, note='AI资本开支回报不足、折旧吞噬利润、回购收缩；核心业务低增长'),
  '基准': dict(g1=0.09,g2=0.07,exit_pe=14,  w=0.50, note='AI增强存量业务(2026Q2剔除新AI产品经营利润+19%)，游戏/广告/云增长；期末PE受制于持续高折旧给14x'),
  '乐观': dict(g1=0.13,g2=0.10,exit_pe=18,  w=0.25, note='微信成为AI Agent主入口，云与全球游戏扩张，AI投入兑现'),
}

print('='*72)
print(f'腾讯控股 v3.4 重估 | 现价 HK${PRICE_HKD} ({FX}→人民币{PRICE_HKD*FX:.1f}) | EPS0={EPS0_RMB}元({EPS0_HKD:.2f}港币) TTM PE={PRICE_HKD/(EPS0_HKD*1.0):.1f}x(2026E)')
print('='*72)

# 1) 各情景 IRR
for name,s in SCEN.items():
    irr5,_ = cashflows(PRICE_HKD, s['g1'],s['g2'],s['exit_pe'],n=5)
    irr10,_ = cashflows(PRICE_HKD, s['g1'],s['g2'],s['exit_pe'],n=10)
    irr10t,_ = cashflows(PRICE_HKD, s['g1'],s['g2'],s['exit_pe'],n=10,tax=TAX)
    print(f"{name}: 5y税前IRR={irr5*100:.1f}% | 10y税前={irr10*100:.1f}% | 10y税后(20%红利税)={irr10t*100:.1f}%  [{s['note'][:30]}]")

# 2) 概率加权期末财富（10年，股息不再投、期末按情景终值）
for extra,label in [(0,'基准权重'),(10,'悲观+10pct敏感性')]:
    w_p = SCEN['悲观']['w']+extra/100
    w_b, w_o = SCEN['基准']['w']* (1-extra/100) if False else 0.5*(1-extra/100), 0.25*(1-extra/100)
    wealth=0
    for name,s in SCEN.items():
        w = {'悲观':w_p,'基准':w_b,'乐观':w_o}[name]
        eps=EPS0_HKD; e=eps; div=0
        for t in range(1,11):
            g=s['g1'] if t<=5 else s['g2']; e*=(1+g); div+=e*PAYOUT
        w_end = (div + e*s['exit_pe'])/PRICE_HKD  # 每1元投入的期末财富倍数
        wealth += w * w_end
    cagr=(wealth)**0.1-1
    print(f"概率加权期末财富[{label}] = {wealth:.2f}倍（每1元投入）→ 等效10y CAGR = {cagr*100:.2f}%")

# 3) H档位（基准情景，10年为主）
print('-'*72)
print('H档位（基准情景反推，港币，税前口径）:')
labels=[('H10',0.10),('H12',0.12),('H15',0.15),('H17.46',0.1746)]
for lab,r in labels:
    p10=price_for_r(SCEN['基准']['g1'],SCEN['基准']['g2'],SCEN['基准']['exit_pe'],r,n=10)
    p5 =price_for_r(SCEN['基准']['g1'],SCEN['基准']['g2'],SCEN['基准']['exit_pe'],r,n=5)
    print(f"  {lab:7s} 10y={p10:7.1f}   (5y参考={p5:7.1f})")

# 4) 经济价值区间：保守现金流 = 基准增速-2pct、期末12x；10%/12%资本成本
print('-'*72)
cg1,cg2,ce = SCEN['基准']['g1']-0.02, SCEN['基准']['g2']-0.02, 12
ev10=price_for_r(cg1,cg2,ce,0.10,n=10); ev12=price_for_r(cg1,cg2,ce,0.12,n=10)
print(f"经济价值区间（保守现金流 {cg1*100:.0f}%/{cg2*100:.0f}%、期末{ce}x）:")
print(f"  10%资本成本={ev10:.0f}  12%资本成本={ev12:.0f}  ←保守经济价值取下沿 {ev12:.0f}")
print(f"  当前安全边际 = 1 - {PRICE_HKD}/{ev12:.0f} = {(1-PRICE_HKD/ev12)*100:.1f}%")

# 5) 压力测试（现价持有10年，基准路径）
print('-'*72)
irr_a,_=cashflows(PRICE_HKD,0.09,0.07,14*0.7,n=10)   # 盈利不变路径改为: g=0, PE-30%
irr_a,_=cashflows(PRICE_HKD,0.0,0.0,9.8,n=10)
irr_b,_=cashflows(PRICE_HKD,-0.20 if False else 0.0,0.0,9.8,n=10)  # 需要EPS-20%起点
# 手工: EPS0-20% & PE-30%
def irr_custom(eps0,g,pe,n=10):
    eps0_=eps0/FX; e=eps0_; fl=[]
    for t in range(1,n+1):
        e*=(1+g); fl.append((t,e*PAYOUT))
    tv=e*pe
    lo,hi=-0.5,1.0
    for _ in range(200):
        m=(lo+hi)/2
        v=sum(d/(1+m)**t for t,d in fl)+tv/(1+m)**n
        if v>PRICE_HKD: lo=m
        else: hi=m
    return (lo+hi)/2
print(f"压力① EPS零增长+期末PE压缩30%(9.8x): 10y IRR={irr_custom(EPS0_RMB,0,9.8)*100:.1f}%")
print(f"压力② EPS起点-20%+零增长+PE压缩30%:   10y IRR={irr_custom(EPS0_RMB*0.8,0,9.8)*100:.1f}%")
print(f"压力③ 公司特定: AI投入3年无回报(g=5%后回升至7%)、期末12x: 10y IRR={irr_custom(EPS0_RMB,0.05,12)*100:.1f}%")
