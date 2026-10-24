#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Build source-backed, presentation-only company notes and a portable HTML research pack.
No network, real config, account snapshot, approval or policy writes.
"""
from pathlib import Path
import json, re, html, hashlib
ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / 'research/20261024-evidence-completion'
OUT = ROOT / 'investment-platform/public/research'
DATE = '2026-10-24'
load = lambda p: json.loads(p.read_text())
write = lambda p, x: p.write_text(json.dumps(x, ensure_ascii=False, indent=2) + '\n')
notes = load(BASE/'review-notes.json')
seeds = load(BASE/'baseline-public-inputs.json')
disclosures = {d['id']: d for d in load(BASE/'disclosure-check.json')['records']}
receipts = {d['id']: d for d in load(BASE/'source-receipts.json')}
Q3 = {
 'fuyao': [341.22791889,60.0648044,58.79139817,82.59778584,38.91635657,2.30,'https://static.cninfo.com.cn/finalpage/2026-10-21/1225612062.PDF','2026-10-21','1—2、9—10'],
 'yutong': [258.1587158491,31.8353556979,30.9858072905,80.0441805331,4.8212431743,1.44,'https://static.cninfo.com.cn/finalpage/2026-10-15/1225604484.PDF','2026-10-15','1—2、8—9'],
 'dongee': [49.4024739134,13.2972325633,12.5876860881,3.9969839192,2.8149451057,2.0685,'https://static.cninfo.com.cn/finalpage/2026-10-24/1225617708.PDF','2026-10-24','4、6、9—14'],
 'yiwu': [153.1923947126,34.6052211301,34.2830881496,11.2630396766,39.8576326270,.63,'https://file.finance.sina.com.cn/211.154.219.97:9494/MRGG/CNSESH_STOCK/2026/2026-10/2026-10-22/12651918.PDF','2026-10-22','1—2、6—9（镜像）'],
 'shenhua':[2960.31,444.03,428.08,927.0,471.81,2.062,'https://static.cninfo.com.cn/finalpage/2026-10-24/1225620903.PDF','2026-10-24','1—3、15—18；CAS重述'],
 'zijin':[2834.52745522,575.25672087,558.42395338,842.76321162,189.6961785,2.163,'https://static.cninfo.com.cn/finalpage/2026-10-24/1225620996.PDF','2026-10-24','1—3、5—8、14—15']
}
OPERATING = {
 'miniso': ('Q3自愿营运更新，非集团季报','https://www.sec.gov/Archives/edgar/data/1815846/000110465926115744/tm2627490d1_ex99-4.htm','2026-10-09'),
 'anta': ('品牌零售更新，非集团季报','https://static.cninfo.com.cn/finalpage/2026-10-21/1225613886.PDF','2026-10-21'),
 'cypc': ('Q3发电数据，非财务季报','https://static.cninfo.com.cn/finalpage/2026-10-13/1225600572.PDF','2026-10-13'),
 'crland': ('9月/9M营运数据，非季报','https://static.cninfo.com.cn/finalpage/2026-10-13/1225603753.PDF','2026-10-13'),
 'pingan': ('平安银行Q3；集团Q3未取得','https://static.cninfo.com.cn/finalpage/2026-10-24/1225620609.PDF','2026-10-24')
}
SPECIAL = {
 'consun': ('https://www.hkexnews.hk/listedco/listconews/sehk/2026/0924/2026092400020_c.pdf','2026完整中期报告；PDF33—34页现金表（印页32—33）','read'),
 'anta': ('https://links.sgx.com/FileOpen/EANTA2026IRSGX.ashx?App=Announcement&FileID=902451','2026中期报告，印页45现金流','read'),
 'trip': ('https://investors.trip.com/static-files/2f337a9d-0a49-4c46-8764-bce15cc9e3f0','2026Q2/H1官方发布，PDF 1—3页；无完整现金表','read'),
 'miniso': ('https://www.hkexnews.hk/listedco/listconews/sehk/2026/0924/2026092400867_c.pdf','2026完整中期报告；PDF63页现金、80—81页普通股分母','read'),
 'pingan': ('https://static.cninfo.com.cn/finalpage/2026-08-21/1225487477.PDF','2026集团中期报告摘要；PDF4页CAS财务指标、9/18页银行指标','read'),
 'cnooc': ('https://www.cnoocltd.com/english/presscenter/pressreleases/2026/202608/t20260826_122439.html','2026中期业绩；本轮未完整重取现金附注','partial'),
 'dongpeng': ('https://static.cninfo.com.cn/finalpage/2026-07-31/1225449594.PDF','2026H1完整报告；主要指标及现金表，替代失效镜像','read')
}
LOC = {'moutai':'5—9、33—36','tencent':'18、22、34—35','nongfu':'管理层现金、财务及现金流表（英中文混排）','haitian':'47、70—71','yili':'6、56、178','hkex':'7、28','mindray':'16、131—133','hengrui':'6、79—81','consun':'1、32—33（完整中报现金表）','gree':'7、60—62','wanhua':'6、45—47','yangnong':'1—4（仅摘要）','sanhua':'7、59—61','cmb':'主要数据、资本及风险表','cypc':'主要数据、55—56','crland':'中期业绩主要数据/现金与债务','weixing':'7、43—45','yiwu':'6、现金表','focus':'7、14、现金表','ninghu':'8、79—81'}
FUTURE = {'tencent':('2026-11-18','公司IR日历'),'hkex':('2026-11-06','港交所董事会日历'),'ninghu':('2026-10-27','港交所董事会日历'),'hengrui':('2026-10-27','港交所董事会日历')}
labels = {'revenueYi':'收入','parentProfitYi':'归母净利润','adjustedProfitYi':'扣非归母','deductedProfitYi':'扣非归母','ocfYi':'经营现金净额','cashCapexYi':'全部现金CAPEX'}
# Only issuer/company data goes to the public package.
for d in seeds:
 id=d['id']; n=notes[id]; metric=dict(d['metrics']); period='2026H1'; sources=[]
 if id in Q3:
  x=Q3[id]; metric.update(dict(zip(['revenueYi','parentProfitYi','adjustedProfitYi','ocfYi','cashCapexYi','reportedEPS'],x[:6]))); period='2026Q1–Q3'
  sources.append({'id':id+'-latest','title':'2026第三季度报告'+('（发行人原文镜像）' if id=='yiwu' else ''),'url':x[6],'publishedAt':x[7],'period':period,'location':'PDF '+x[8],'readStatus':'read','scope':'selected_pages','type':'issuer_filing_mirror' if id=='yiwu' else 'official_filing'})
 else:
  if id in SPECIAL:u,title,status=SPECIAL[id]
  else:
   r=receipts.get(id,{});u=r.get('url',d['sources'][0]['url']);title='2026半年度报告，PDF '+LOC.get(id,'主要数据及现金流');status='read' if r.get('downloadStatus')=='downloaded' else 'partial'
  pub=re.search(r'2026[-/](\d\d)[-/](\d\d)',u)
  sources.append({'id':id+'-latest','title':title,'url':u,'publishedAt':'2026-'+pub[1]+'-'+pub[2] if pub else None,'period':period,'readStatus':status,'scope':'selected_pages','type':'official_filing','location':LOC.get(id,title)})
 if id=='wanhua':metric['cashCapexYi']=107.3989113586;metric['sharesYi']=31.30471626
 if id=='consun':metric['cashCapexYi']=.28174
 if id=='yangnong':metric['cashCapexYi']=None
 if id=='miniso':metric.update({'reportedEPS':.79,'ocfYi':14.75401,'cashCapexYi':7.24622})
 if id=='yili':metric['nciCashDividendYi']=.3973874424
 metrics=[{'id':k,'value':metric.get(k),'unit':metric.get('currency','CNY')+'亿元','period':period,'sourceId':id+'-latest','label':'fact_source_reported' if sources[0]['readStatus']=='read' and id!='trip' else 'prior_record_not_reverified'} for k in labels if k in metric]
 if 'reportedEPS' in metric:metrics.append({'id':'reportedEPS','value':metric['reportedEPS'],'unit':'CNY元/普通股','period':period,'sourceId':id+'-latest','label':'fact_source_reported'})
 for i,s in enumerate(d['sources']):
  if s['url']==sources[0]['url']:continue
  sources.append({'id':id+'-prior-'+str(i),'title':s['title'],'url':s['url'],'publishedAt':None,'period':s.get('period'),'location':s.get('pages'),'readStatus':'prior_read','type':'prior_research_reference','scope':'10/19底稿；未声称本轮逐页重读'})
 if id=='weixing':sources.append({'id':'weixing-report-index','title':'公司官方定期报告目录','url':'https://www.vasen.com/invest/notice/32/1','publishedAt':None,'period':'截至2026-10-24目录','readStatus':'read','location':'目录当前2026H1/2026Q1/2025Q3','type':'official_directory'})
 if id in OPERATING:
  k,u,pub=OPERATING[id];sources.append({'id':id+'-operating','title':k,'url':u,'publishedAt':pub,'period':'2026Q3 / 9M','readStatus':'read','location':'财务表/营运指标；口径详见正文','type':'official_filing'})
 q=disclosures.get(id,{})
 if id in Q3:kind='financial_mirror' if id=='yiwu' else 'financial';status='Q3财务已核原文'+('镜像；官方一致性待补' if id=='yiwu' else '')
 elif id in OPERATING:kind='subsidiary' if id=='pingan' else 'operating';status=OPERATING[id][0]
 else:kind='not_retrieved';status='截至本轮未取得Q3正文'+('；已公告'+FUTURE[id][0]+'董事会/业绩日' if id in FUTURE else '')
 qreview={'kind':kind,'status':status,'asOf':DATE,'coverage':'官方10月公告查询已返回' if q.get('status')=='queried' and q.get('totalAnnouncement',0)>0 else '官方查询受限/零条，结合公司IR和公开目录；不以空结果证明未披露','valuationImpact':n[1],'futureEvent':FUTURE.get(id)}
 ocf=metric.get('ocfYi');cap=metric.get('cashCapexYi');cash={'period':period,'unit':metric.get('currency','CNY')+'亿元','ocf':ocf,'totalCapex':cap,'conservativeResidual':ocf-cap if ocf is not None and cap is not None else None,'maintenanceCapex':None,'growthCapex':None,'parentDistributableCash':None,'basis':'OCF减所有已披露现金CAPEX；非归母FCFE，租赁/NCI/融资利息须另核。撤回无披露依据的维护/增长精确拆分。'}
 if id in ['cmb','pingan']:
  cash.update({'conservativeResidual':None,'totalCapex':None,'basis':'金融/保险不使用OCF−CAPEX估普通股收益；另核普通股资本/RWA、寿险自由盈余与母公司上划。'})
 if id=='miniso':cash.update({'leasePrincipalAndInterest':5.51492,'otherInterestPaid':.74956,'afterLeaseAndOtherInterest':1.24331})
 if id=='consun':cash.update({'leasePrincipal':.00571,'leaseInterest':.00119,'otherFinancePaid':.02569,'interestReceived':.44508,'nciCashDividend':.04903,'cashBeforeParentDividendAndBuyback':7.8961})
 if id=='tencent':cash.update({'leasePrincipal':36.36,'interestPaid':64.08,'interestReceived':91.14,'dividendsReceived':51.62,'nciCashDividend':16.62,'cashBeforeAcquisitionAndParentDistributions':494.68})
 if id=='anta':cash.update({'leaseFinancingCash':23.5,'afterLeaseResidual':92.78,'nciCashDividend':1.3})
 if id=='hkex':cash.update({'principalOperatingCashNonHKFRS':106.26,'principalAfterCapexLeaseFinancingNCI':71.36,'plusLongBondInterestReceived':15.84,'cashAfterAddingBondInterest':87.20})
 gap_text=d['evidenceGap']
 if id=='miniso':gap_text='海外成熟直营店单位经济、永辉资本占用及最终现金回报、股权挂钩证券经济成本；完整现金表、租赁现金与普通股稀释分母已补。'
 if id=='consun':gap_text='核心单品销量净价、医保续约与临床结局、上海华茂投后回报；完整现金流、CAPEX、租赁与NCI现金已补。'
 if id=='yili':gap_text='租赁本金/利息与经营租赁现金拆分仍待核；NCI现金股息已核0.39739亿元。存款/借款期限币种及澳优ROIC仍为决定项。'
 gaps=[{'item':gap_text,'reason':'未取得足够证据闭合；原缺项经本轮定位后仍有未公开/待独立核部分','requiredEvidence':n[2],'canPublicResearchResolve':True}]
 if id=='yiwu':gaps.append({'item':'官方与镜像文件一致性','reason':'交易所直链返回拦截页；巨潮查询403','requiredEvidence':'交易所/巨潮同版原件交叉核对，含披露身份与表格','canPublicResearchResolve':True})
 if id=='dongpeng':gaps.append({'item':'上市后每股资本桥','reason':'官方H1完整报告已补，仍需9月股本与回购注销交叉','requiredEvidence':'9月股本及回购注销公告','canPublicResearchResolve':True})
 prior=d['model'];prior['formalAllowed']=False
 record={'id':id,'name':d['name'],'codes':d['codes'],'scope':d['scope'],'asOf':DATE,'companyThesisStatus':'watch','securityReadiness':'not_decision_grade','researchCompletion':'partial','researchDeliverableStatus':'delivered_with_named_gaps','thesis':n[0],'breakers':n[3]+'（研究建议，未批准）','reviewBy':FUTURE.get(id,('2026-10-31',))[0],'reviewTrigger':'新财报/经营公告或上述反证出现即复核；日期为研究安排，非保证披露日','gradeRecommendation':d['grade']+'类研究候选' if d['grade']!='C' else 'C类经济性观察','gradeRationale':'依据10/19逐维底稿及本轮新证据复查；不覆盖应用现有评级或策略','dimensions':d['dimensions'],'businessAxes':d['businessAxes'],'metrics':metrics,'cashBridge':cash,'valuation':{'type':'prior_scenario_under_review','formalAllowed':False,'priorAsOf':'2026-10-19','priorInputs':prior,'newEvidenceImpact':n[1],'basis':'保留旧三情景供逐项复核，不能当本轮认证EPS、共识或正式价格。新证据未闭合前不给精确新买点。'},'q3Review':qreview,'monitoring':[{'metric':'经营、现金与资本反证','baseline':period,'trigger':n[3],'origin':'研究建议，未批准','nextSource':'下一份官方财报、经营数据及资本公告'}],'oldConclusionChanges':[{'old':'旧H1财务/未拆分维护CAPEX/旧增长与派息假设','new':n[1],'reason':n[2],'sourceIds':[s['id'] for s in sources if s['readStatus']=='read']}],'sources':sources,'completedItems':['逐公司核对披露范围与报告身份','补持有逻辑、证伪与复核安排','重列总现金CAPEX及估值影响','撤回无披露支持的维护CAPEX精确拆分'],'remainingGaps':gaps,'accountDataTouched':False,'approvalCreated':False}
 write(BASE/'companies'/f'{id}-20261024.json',record)
 lines=[f'# {d["name"]}｜全股票池证据与估值复核（{DATE}）','',f'**{record["gradeRecommendation"]}；研究材料已补充，关键待核项仍保留。** 公司质量判断与证券是否可执行分别展示。', '',f'范围：{d["scope"]}；证券：'+ ' / '.join(d['codes'])+'。未更改持仓、策略、现有评级、原价线或批准。','', '## 本轮核准与估值影响','',n[0],'',n[1],'',n[2],'', '**三季度披露状态：'+status+'。** '+qreview['coverage']+'。', '', '## 经营、现金与每股口径', '', '|指标|金额|期间与证据|','|---|---:|---|']
 for m in metrics:
  value='未知' if m['value'] is None else f'{m["value"]:.6f}'.rstrip('0').rstrip('.')
  lines.append('|'+labels.get(m['id'],m['id'])+'|'+value+' '+m['unit']+'|'+m['period']+('；本轮原表已核' if m['label']=='fact_source_reported' else '；历史记录，本轮未重核')+'|')
 lines += ['', '现金桥：'+cash['basis']]
 if cash['conservativeResidual'] is not None:lines += ['',f'保守现金剩余={ocf:.6f}−{cap:.6f}={cash["conservativeResidual"]:.6f}亿元。该值不是归母可持续分红能力，不把投资理财本金进出当维护投入。']
 lines += ['', '## 三轴与八维', '', *d['businessAxes'], '', '下表承接10/19逐维底稿；本轮新增事实和反证以本页前文为准。未新增证据支持的判断不升级成通过。', '', '|维度|判断|支持|最强反证|', '|---|---|---|---|']
 for dim in d['dimensions']:lines.append(f'|{dim["id"]} {dim["name"]}|{dim["verdict"]}|{dim["support"]}|{dim["counter"]}|')
 lines += ['', '## 旧估值输入逐项处理', '',n[1], '', '下表是10/19的研究情景，用来定位哪些变量失效；不是本轮新定价，也不是公司预测。维护/增长投资拆分没有原文证据时均保留未知。', '', '|情景|旧起始EPS/资本|旧前/后段增长或ROE|旧派息率|旧退出PE/PB|','|---|---|---|---|']
 for name,c in prior.get('cases',{}).items():
  eps=c.get('eps0',c.get('bps0','—')); growth=f'{c.get("g1","—")} / {c.get("g2","—")}' if 'g1' in c else str(c.get('roe','—'));lines.append(f'|{name}|{eps}|{growth}|{c.get("payout","—")}|{c.get("exit_pe",c.get("exit_pb","—"))}|')
 lines += ['',prior.get('assumptionBasis','旧模型支持不足的经营与资本假设须重算。'), '', '三情景均不设主观概率权重，不将回购与分红重复计入收益；资源公司需中周期商品价与储量NAV，银行需资本与RWA，公路需剩余收费期限。资料不足时不给一个看似精确的新买价。', '', '## 建议、证伪与完成清单', '', '**建议：**'+record['gradeRecommendation']+'。'+n[0], '', '**证伪/复核：**'+record['breakers'], '', '**下次复核安排：**'+record['reviewBy']+'；'+record['reviewTrigger']+'。', '', '已补：'+ '；'.join(record['completedItems'])+'。', '', '仍待核：'+gap_text, '', '所需证据：'+n[2], '', '## 来源与读取边界','']
 for s in sources:lines.append(f'- [{s["title"]}]({s["url"]})｜{s.get("publishedAt") or "披露日期见原文"}｜{s.get("period") or "原来源期间"}｜{s.get("location") or "原底稿定位"}｜'+{'read':'本轮已读所列关键页','prior_read':'旧稿来源，本轮未声称重读','partial':'本轮只取得部分证据','unavailable':'本轮重取失败'}.get(s['readStatus'],s['readStatus']))
 (BASE/'companies'/f'{id}-20261024.md').write_text('\n'.join(lines)+'\n')

# Deep refreshes keep their independent business models and evidence contracts.
for id in ['catl','popmart','china_mobile']:
 p=BASE/'companies'/f'{id}-20261024.json';r=load(p);r['scope']='主平台当前池'
 r['q3Review']={'kind':'not_retrieved' if id=='popmart' else 'financial','status':'H1为最新可核财务；未取得官方Q3营运正文' if id=='popmart' else 'Q3财务已核原文','asOf':DATE,'valuationImpact':r['gradeRationale'],'coverage':'公司/交易所原文、公告目录及本轮披露查询'}
 write(p,r)

# Minimal Markdown renderer, deliberately escapes all source HTML. No remote assets or executable source markup.
def inline(s):
 tokens=[]
 def link(m):
  url=html.unescape(m[2]);label=html.escape(m[1]);
  if not url.startswith(('https://','http://')):return label
  tokens.append('<a href="'+html.escape(url,quote=True)+'" target="_blank" rel="noopener noreferrer">'+label+'</a>');return '\x00'+str(len(tokens)-1)+'\x00'
 s=re.sub(r'\[([^\]]+)\]\((https?://[^\s]+?)\)',link,s)
 s=html.escape(s);s=re.sub(r'\*\*(.+?)\*\*',r'<strong>\1</strong>',s);s=re.sub(r'`([^`]+)`',r'<code>\1</code>',s)
 return re.sub('\x00(\\d+)\x00',lambda m:tokens[int(m[1])],s)
def markdown(s):
 lines=s.splitlines();out=[];i=0
 while i<len(lines):
  l=lines[i].strip()
  if not l:i+=1;continue
  if l.startswith('|'):
   rows=[]
   while i<len(lines) and lines[i].strip().startswith('|'):
    vals=[v.strip() for v in lines[i].strip().strip('|').split('|')];i+=1
    if all(re.fullmatch(r':?-{2,}:?',v) for v in vals):continue
    rows.append(vals)
   out.append('<div class="table-scroll"><table>'+''.join('<tr>'+''.join(('<th>' if j==0 else '<td>')+inline(v)+('</th>' if j==0 else '</td>') for v in vals)+'</tr>' for j,vals in enumerate(rows))+'</table></div>');continue
  if re.match(r'^#{1,6} ',l):
   n=len(l)-len(l.lstrip('#'));out.append(f'<h{min(n+1,6)}>'+inline(l[n:].strip())+f'</h{min(n+1,6)}>');i+=1;continue
  if re.match(r'^[-*] ',l):
   items=[]
   while i<len(lines) and re.match(r'^[-*] ',lines[i].strip()):items.append('<li>'+inline(lines[i].strip()[2:])+'</li>');i+=1
   out.append('<ul>'+''.join(items)+'</ul>');continue
  if l.startswith('```'):
   block=[];i+=1
   while i<len(lines) and not lines[i].startswith('```'):block.append(lines[i]);i+=1
   out.append('<pre>'+html.escape('\n'.join(block))+'</pre>');i+=1;continue
  parts=[l];i+=1
  while i<len(lines) and lines[i].strip() and not re.match(r'^(#{1,6} |\||[-*] |```)',lines[i].strip()):parts.append(lines[i].strip());i+=1
  out.append('<p>'+inline(' '.join(parts))+'</p>')
 return '\n'.join(out)
CSS='''*{box-sizing:border-box}body{margin:0;color:#172c34;background:#f4f6f5;font:16px/1.8 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft Yahei",sans-serif}header{background:#123b40;color:#fff;padding:48px max(24px,calc((100vw - 1160px)/2))}header h1{font-size:34px;line-height:1.3;margin:12px 0}header p{color:#d2e5df;max-width:900px}main{max-width:1208px;margin:24px auto;padding:0 24px 64px}article,.panel{background:white;border:1px solid #dde7e3;border-radius:14px;padding:28px;margin:20px 0}h2{margin-top:32px;color:#164a50;font-size:25px}h3{margin-top:28px;color:#164a50;font-size:21px}p{overflow-wrap:anywhere}a{color:#126d76;text-underline-offset:3px}header a{color:#c9eee4}.muted{color:#657a7e;font-size:14px}.tag{display:inline-block;background:#e6efec;color:#28534c;border-radius:6px;padding:2px 9px;margin:3px;font-size:13px}.warn{background:#fff3dd;border-left:4px solid #b78024;padding:16px 20px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}.card{background:#fff;border:1px solid #d7e5df;border-radius:12px;padding:22px}.num{font-size:32px;color:#175d5f;font-weight:700}input,select{padding:12px;border:1px solid #b9d0c9;border-radius:8px;background:#fff;color:#173c40;font-size:15px}input{width: min(480px,100%)}table{border-collapse:collapse;width:100%;font-size:14px;line-height:1.7}th,td{border-bottom:1px solid #dde7e3;text-align:left;padding:12px;vertical-align:top;min-width:90px}th{color:#1c5458;background:#edf4f1}td a{font-weight:600}.table-scroll{overflow:auto;margin:18px 0}.company{min-width:145px}.impact{min-width:360px;max-width:540px}.status{min-width:200px}details{margin:14px 0}summary{cursor:pointer;color:#16636c;font-weight:600}pre{white-space:pre-wrap;overflow:auto;font-size:13px}footer{max-width:1160px;margin:auto;padding:24px;color:#657a7e;font-size:13px}@media(max-width:700px){header{padding:28px 22px}header h1{font-size:27px}main{padding:0 14px 40px}.grid{grid-template-columns:1fr}article,.panel{padding:18px}h2{font-size:22px}.table-scroll{max-width:100%}}@media print{header{background:#fff;color:#123b40;padding:10px}header p{color:#123b40}input,select{display:none}.table-scroll{overflow:visible}article{break-inside:auto}a{color:#164a50}}'''
def page(title,subtitle,content):return '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+html.escape(title)+'</title><style>'+CSS+'</style></head><body><header><span>投资研究 · '+DATE+' · 公开资料证据版</span><h1>'+html.escape(title)+'</h1><p>'+html.escape(subtitle)+'</p><a href="index.html">全股票池清单</a></header><main>'+content+'</main><footer>事实、公司解释与研究假设分开。研究建议未获批准；未改账户或线上策略。报告时间不代表报价时间。自动生成于已人工复核的公司证据稿；未取得的证据在正文保留。</footer></body></html>'
OUT.mkdir(parents=True,exist_ok=True)
records=[]
for p in sorted((BASE/'companies').glob('*-20261024.json')):
 r=load(p);id=r['id'];r['reportPath']='/research/'+id+'.html';r['valuation']['formalAllowed']=False;write(p,r)
 md=(p.with_suffix('.md')).read_text();content='<article>'+markdown(md)+'</article>'
 (OUT/(id+'.html')).write_text(page(r['name']+'｜研究与估值复核',r['q3Review']['status']+'。'+r['thesis'],content))
 records.append(r)
assert len(records)==34
# Presentation copy contains no model, approval, portfolio, or personal cash records.
evidence_bytes=json.dumps(records,ensure_ascii=False,sort_keys=True).encode()+b''.join((BASE/'companies'/f'{r["id"]}-20261024.md').read_bytes() for r in records)
evidence_digest=hashlib.sha256(evidence_bytes).hexdigest()
pack={'schemaVersion':1,'version':'research-20261024-'+evidence_digest[:12],'evidenceDigest':evidence_digest,'asOf':DATE,'presentationOnly':True,'records':[{k:r[k] for k in ['id','name','codes','scope','asOf','thesis','breakers','reviewBy','researchCompletion','securityReadiness','gradeRecommendation','q3Review','remainingGaps','sources','reportPath']} for r in records]}
write(ROOT/'investment-platform/public/research-supplement.json',pack)
rows=[]
for r in sorted(records,key=lambda r:(r['scope']!='主平台当前池',r['name'])):
 q=r['q3Review'];gaps='；'.join(g['item'] if isinstance(g,dict) else g for g in r['remainingGaps'])
 impact=q.get('valuationImpact') or r.get('gradeRationale','')
 rows.append('<tr data-search="'+html.escape(r['name']+' '+' '.join(r['codes'])+' '+r['scope'],quote=True)+'" data-q3="'+q['kind']+'"><td class="company"><a href="'+r['id']+'.html">'+html.escape(r['name'])+'</a><br><span class="muted">'+' / '.join(r['codes'])+'</span><br><span class="tag">'+html.escape(r['scope'])+'</span></td><td class="status">'+html.escape(q['status'])+'<br><span class="tag">'+html.escape(r['gradeRecommendation'])+'</span></td><td class="impact">'+html.escape(impact)+'</td><td class="impact"><details><summary>研究待核与下一复核</summary><p>'+html.escape(gaps)+'</p><p>复核安排：'+html.escape(r['reviewBy'])+'</p></details><a href="'+r['id']+'.html">八维、现金桥、旧输入及来源 →</a></td></tr>')
financial=sum(r['q3Review']['kind'] in ['financial','financial_mirror'] for r in records)
body='''<div class="grid">
<div class="card">
<div class="num">34 家</div>全部发行人：当前28家 + 历史6家<br>
<span class="muted">当前31个证券，A/H分列；不恢复已排除公司。</span>
</div>
<div class="card">
<div class="num">'''+str(financial)+''' 家</div>已取得Q3财务原文<br>
<span class="muted">含1家原文镜像，官方一致性仍待补；其余另分营运更新、附属公司及未取得。</span>
</div>
<div class="card">
<div class="num">3 份</div>完整重新承保的重点研究<br>
<span class="muted">中国移动H、宁德时代、泡泡玛特；其余逐公司补证与核估值影响。</span>
</div>
</div>
<section class="panel">
<h2>先处理哪些估值输入</h2>
<p>
<strong>优先收紧宁德时代、泡泡玛特、安踏的承保假设；福耀、东阿、小商品城核现金与增长；中国移动和神华重审派息覆盖与每股口径。</strong> 价格跌到旧档位，仍须用这些更新后的证据判断。</p>
<div class="grid">
<div>
<h3>
<a href="catl.html">宁德时代</a>
</h3>
<p>Q3单季OCF约14.09亿元，扣现金CAPEX后为负；旧财务质量“通过”应重评为存疑，建议B观察。</p>
</div>
<div>
<h3>
<a href="popmart.html">泡泡玛特</a>
</h3>
<p>重建海外、IP和利润率，撤回旧EPS8.5作为基准；新中间研究情景EPS约6.49元，Q3券商预测不当实际。</p>
</div>
<div>
<h3>
<a href="china_mobile.html">中国移动H</a>
</h3>
<p>9M现金桥股息前余款722.51亿元，覆盖同期实付股息70.85%；税率、FX及支付错期分别做敏感性。</p>
</div>
</div>
<p class="muted">以上均是研究建议，不是调仓或下单指令；各家公司完整来源及假设见链接。</p>
</section>
<section class="panel">
<h2>本轮补全清单</h2>
<ul>
<li>34家均补持有逻辑、可核反证、复核安排、估值受影响因素与来源；保留逐公司剩余项。</li>
<li>8家已披露Q3财务逐项核：宁德、中国移动、福耀、宇通、东阿、小商品城、神华、紫金。宇通旧稿已纳入同份Q3，不重复当利好。</li>
<li>安踏品牌零售、名创GMV/同店、长江电力发电、华润置地营运数据单列；中国平安栏目中的平安银行Q3单列，不假冒集团业绩。</li>
<li>撤回无证据的维护/增长CAPEX精确拆分；租赁、利息、NCI和回购分列，银行保险改用资本预算。</li>
<li>公开资料补充进入系统只读展示；研究补充不自动生成独立审计、资金账本或投资批准。</li>
</ul>
<div class="warn">
<strong>仍不能称“所有缺项已解决”。</strong> 维护CAPEX、项目ROIC、海外同店/复购、寿险自由盈余、逐路收费期限等存在未公开或未完成交叉验证的部分。小商品城只取得发行人原文镜像；东鹏失效旧源已替换，伟星已用公司官网目录交叉；部分巨潮查询受限的边界均保留在下表。未取得Q3正文不等于证明未披露。</div>
</section>
<section class="panel">
<h2>逐公司清单与建议</h2>
<p class="muted">公司链接包含证据页码、财务期间、旧情景与本轮处理。表中评级是研究建议，与应用历史评级分别显示。</p>
<input id="search" type="search" placeholder="搜索公司、代码或当前/历史池" aria-label="搜索公司">
<select id="filter" aria-label="筛选三季度披露">
<option value="">全部34家</option>
<option value="financial">已取得Q3财务</option>
<option value="operating">仅营运更新</option>
<option value="subsidiary">附属公司Q3</option>
<option value="not_retrieved">未取得集团Q3</option>
</select>
<p id="count" class="muted" aria-live="polite">34家公司</p>
<div class="table-scroll">
<table>
<thead>
<tr>
<th>公司 / 证券范围</th>
<th>披露核准 / 建议</th>
<th>估值影响与旧结论处理</th>
<th>待核、复核及完整报告</th>
</tr>
</thead>
<tbody>'''+''.join(rows)+'''</tbody>
</table>
</div>
</section>
<script>const rows=[...document.querySelectorAll('tbody tr')];function filter(){const s=document.querySelector('#search').value.trim().toLowerCase(),f=document.querySelector('#filter').value;let n=0;rows.forEach(r=>{const hit=(!s||r.dataset.search.toLowerCase().includes(s))&&(!f||r.dataset.q3===f||(f==='financial'&&r.dataset.q3==='financial_mirror'));r.hidden=!hit;if(hit)n++});document.querySelector('#count').textContent=n+'家公司'}document.querySelector('#search').addEventListener('input',filter);document.querySelector('#filter').addEventListener('change',filter);</script>'''
(OUT/'index.html').write_text(page('全股票池｜研究补全与三季报核准','逐公司说明证据补了什么、旧估值哪些假设失效、还缺什么。研究截至2026-10-24；所有来源保留其真实财务期间。',body))
write(BASE/'completion-index.json',{'asOf':DATE,'issuers':len(records),'currentIssuers':sum(r['scope']=='主平台当前池' for r in records),'q3FinancialReports':financial,'formalApprovalsCreated':0,'productionDataWritten':False,'records':[{k:r[k] for k in ['id','name','codes','scope','researchCompletion','q3Review','completedItems','remainingGaps']} for r in records]})
print('Built 34 issuer notes, 35 portable HTML pages and a display-only research supplement. No account/policy writes.')
