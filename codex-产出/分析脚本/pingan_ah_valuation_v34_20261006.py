#!/usr/bin/env python3
# 中国平安 A/H v3.4 重估 2026-10-06 —— 基准情景不内嵌倍数修复（v3.4终值纪律）
PRICE_A, PRICE_H = 53.29, 51.55      # [事实] A:9-30收盘(假期休市) H:10-06收盘
FX = 0.8543                           # [事实] HKDCNY 10-06
EPS0 = 8.80/1.0519                    # [计算] TTM EPS 8.80 ÷ CB全转股稀释1.0519 → 全摊薄口径(保守)
PE_A, PE_H = PRICE_A/(8.80/1.0519), (PRICE_H*FX)/(8.80/1.0519)  # 全摊薄PE
DPS0 = 2.73/1.0519                    # TTM DPS 2.73 摊薄
H_TAX = 0.20                          # 港股通红利税

def irr(price, flows, tv, n, tax=0.0):
    def pv(r): return sum(d*(1-tax)/(1+r)**t for t,d in flows)+tv/(1+r)**n
    lo,hi=-0.5,1.0
    for _ in range(200):
        m=(lo+hi)/2
        if pv(m)>price: lo=m
        else: hi=m
    return (lo+hi)/2, pv

def build(g1,g2,payout,exitpe,n=10,n1=5):
    e=EPS0; fl=[]
    for t in range(1,n+1):
        g=g1 if t<=n1 else g2
        e*=(1+g); fl.append((t,e*payout))
    return fl, e*exitpe

def price_for_r(g1,g2,payout,exitpe,r,tax,n=10,n1=5):
    fl,tv=build(g1,g2,payout,exitpe,n,n1)
    return sum(d*(1-tax)/(1+r)**t for t,d in fl)+tv/(1+r)**n

SC={
 '悲观':dict(g1=0.01,g2=0.01,pay=0.30,exitA=4.5,exitH=4.5,w=0.25,note='利差损实质化：g1%、派30%、双向再降估值至4.5x'),
 '基准':dict(g1=0.04,g2=0.04,pay=0.33,exitA=PE_A,exitH=PE_H,w=0.50,note='g4%(营运利润8.3%但净投资收益率2.8%逼近负债成本)、派33%、退出=当前PE【零修复假设】'),
 '乐观':dict(g1=0.06,g2=0.06,pay=0.36,exitA=7.5,exitH=7.5,w=0.25,note='NBVM修复+利差企稳：g6%、派36%、倍数修复至7.5x'),
}

print('='*76)
print(f'中国平安 A/H v3.4 重估 | A={PRICE_A}元 H={PRICE_H}港元({PRICE_H*FX:.2f}元) FX={FX}')
print(f'EPS0(全摊薄)={EPS0:.3f}元 摊薄PE: A={PE_A:.2f}x H={PE_H:.2f}x | A/H折价={(1-PRICE_H*FX/PRICE_A)*100:.1f}%')
print('='*76)
for name,s in SC.items():
    flA,tvA=build(s['g1'],s['g2'],s['pay'],s['exitA'])
    flH,tvH=build(s['g1'],s['g2'],s['pay'],s['exitH'])
    irrA,_=irr(PRICE_A,flA,tvA,10)
    irrH_pre,_=irr(PRICE_H,flH,tvH,10)
    irrH_post,_=irr(PRICE_H,flH,tvH,10,tax=H_TAX)
    print(f"{name}: A股10y税前={irrA*100:.2f}%(A股免税) | H股10y税前={irrH_pre*100:.2f}% 税后={irrH_post*100:.2f}%  [{s['note'][:34]}]")

# 概率加权期末财富（10年，A与H各自，税后口径）
for mkt,price,tk,ek in [('A',PRICE_A,1.0,'exitA'),('H',PRICE_H,1-H_TAX,'exitH')]:
    wsum=0; wp=SC['悲观']['w']
    for name,s in SC.items():
        w={'悲观':wp,'基准':0.5*(1-0.10),'乐观':0.25*(1-0.10)}[name] if False else {'悲观':0.35,'基准':0.45,'乐观':0.20}[name] if False else None
    # 基准权重与悲观+10pct敏感性
    for extra,label in [(0,'基准权重'),(10,'悲观+10pct')]:
        wP=0.25+extra/100; scale=(1-extra/100)
        tot=0
        for name,s in SC.items():
            w={'悲观':wP,'基准':0.50*scale,'乐观':0.25*scale}[name]
            fl,tv=build(s['g1'],s['g2'],s['pay'],s[ek])
            wealth=sum(d*tk for t,d in fl)+tv   # 每1股投入的期末财富(税后)
            tot+=w*wealth/price
        print(f"[{mkt}] 概率加权期末财富[{label}]={tot:.2f}倍 → 等效10y CAGR={((tot)**0.1-1)*100:.2f}%")

# H档位（基准=零修复）
print('-'*76)
labels=[('H10',0.10),('H12',0.12),('H15',0.15),('H17.46',0.1746)]
print('A股档位（免税，基准情景）:')
for lab,r in labels:
    p=price_for_r(SC['基准']['g1'],SC['基准']['g2'],SC['基准']['pay'],PE_A,r,tax=1.0)
    print(f'  {lab:7s} = {p:6.2f} 元')
print('H股档位（港股通税后口径，基准情景）:')
for lab,r in labels:
    p=price_for_r(SC['基准']['g1'],SC['基准']['g2'],SC['基准']['pay'],PE_H,r,tax=H_TAX)
    print(f'  {lab:7s} = {p:6.2f} 港元')

# A/H双门槛检验
print('-'*76)
disc=(1-PRICE_H*FX/PRICE_A)*100
print(f'A/H折价={disc:.1f}% → v3.4门槛25%: {"H获得相对资格" if disc>=25 else "H未过折价门槛(25%)，H的买入只看自身档位"}')
h12=price_for_r(SC['基准']['g1'],SC['基准']['g2'],SC['基准']['pay'],PE_H,0.12,tax=H_TAX)
a12=price_for_r(SC['基准']['g1'],SC['基准']['g2'],SC['基准']['pay'],PE_A,0.12,tax=1.0)
print(f'H股现价{PRICE_H} vs 自身H12={h12:.2f} → {"达标" if PRICE_H<=h12 else "未达标"}')
print(f'A股现价{PRICE_A} vs 自身H12={a12:.2f} → {"达标" if PRICE_A<=a12 else "未达标"}')

# 压力测试
print('-'*76)
fl,tv=build(0.0,0.0,0.33,PE_A*0.7); print(f"压力① EPS零增长+PE压缩30%: A股10y IRR={irr(PRICE_A,fl,tv,10)[0]*100:.1f}%")
fl,tv=build(-0.03,-0.03,0.30,4.0);  print(f"压力② 利差损恶化(EPS年-3%+4.0x): A股10y IRR={irr(PRICE_A,fl,tv,10)[0]*100:.1f}%")
