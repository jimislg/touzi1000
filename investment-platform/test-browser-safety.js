/* Browser QA with synthetic HTTP responses only. Requires an explicit local Playwright path. */
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('node:assert/strict')
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright')
const cfg={_revision:'a'.repeat(64),_sourceMode:'local',_syncStatus:'local',targetCapital:10000000,investable:8300000,cash:8300000,cashYield:1,annualContribution:500000,holdings:[{code:'600000.SH',qt:'qa',name:'示例现金流公司',market:'A',grade:'A',shares:170000,cost:10,dps:0,buyDate:'2020-01-01'},{code:'0700.HK',qt:'qh',name:'示例港股公司',market:'HK',grade:'A',shares:100,cost:90,dps:5}],universe:[{code:'600000.SH',qt:'qa',name:'示例现金流公司',grade:'A',buyPrice:11,bizTag:'合成测试',plan:'历史确认买入1700股',tiers:[{label:'H10',price:11},{label:'H12',price:9},{label:'H15',price:8}],tierPct:[10,25,100]},{code:'0700.HK',qt:'qh',name:'示例港股公司',grade:'B',buyPrice:null}],seats:{list:[{key:'s',name:'示例共享席位',pct:20,members:['600000.SH','0700.HK']}]}}
let posts=0,requests=0,count=0
const check=(n,v)=>{assert.ok(v,n);count++;console.log('PASS '+n)}
const server=http.createServer((req,res)=>{requests++;const url=new URL(req.url,'http://localhost');res.setHeader('Cache-Control','no-store');
 if(url.pathname==='/api/config'){if(req.method==='POST'){posts++;let body='';req.on('data',c=>body+=c);req.on('end',()=>{const p=JSON.parse(body);for(const row of p.universe||[]){Object.assign(cfg.universe.find(u=>u.code===row.code),row)}cfg._revision='b'.repeat(64);cfg.decisionInputsChanged={fields:['universe.0.bizTag']};res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ok:true,revision:cfg._revision,sourceMode:'local',syncStatus:'local',serverSavedAt:new Date().toISOString()}))});return}res.setHeader('Content-Type','application/json');res.end(JSON.stringify(cfg));return}
 if(url.pathname==='/api/quotes'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ok:true,quotes:{qa:{price:10,time:'20261023150000'},qh:{price:100,time:'20261023160000'},whHKDCNY:{price:.8}}}));return}
 if(url.pathname==='/api/dividends'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ok:true,dividends:{'600000.SH':{dps:0},'0700.HK':{dps:5}}}));return}
 const f=url.pathname==='/'?'index.html':url.pathname==='/investment-core.js'?'investment-core.js':null
 if(!f){res.writeHead(404);res.end();return}res.setHeader('Content-Type',f.endsWith('html')?'text/html;charset=utf-8':'text/javascript');res.end(fs.readFileSync(path.join(__dirname,'public',f)))
})
;(async()=>{let browser;await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));try{
 browser=await chromium.launch({headless:true,...(process.env.CHROME_EXECUTABLE?{executablePath:process.env.CHROME_EXECUTABLE}:{}),args:['--no-sandbox']})
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>document.querySelector('#netDot').className==='dot on')
 check('page loads all modules with no runtime errors',errors.length===0)
 check('today workspace only initially',await page.locator('#dash').isVisible()&&!(await page.locator('#pos').isVisible()))
 await page.getByRole('link',{name:'公司研究'}).click();await page.waitForTimeout(50)
 check('research navigation exposes both grade pools',await page.locator('#poolA').isVisible()&&await page.locator('#poolB').isVisible())
 await page.locator('#researchSearch').fill('港股');await page.locator('#researchSearch').dispatchEvent('input');check('search narrows companies',!(await page.locator('#aTable').innerText()).includes('示例现金流公司')&&(await page.locator('#bTable').innerText()).includes('示例港股公司'))
 await page.locator('#researchSearch').fill('');await page.locator('#researchSearch').dispatchEvent('input')
 const tag=page.getByRole('textbox',{name:'示例现金流公司经营标签'});await tag.fill('新标签');await tag.press('Tab')
 await page.getByRole('button',{name:'保存修改',exact:true}).click();check('review precedes write in browser',posts===0&&await page.locator('#saveReview').isVisible())
 check('review contains only requested business-tag edit',(await page.locator('#saveReviewText').innerText()).includes('bizTag')&&!(await page.locator('#saveReviewText').innerText()).includes('targetCapital'))
 await page.getByRole('button',{name:'确认保存这些修改'}).click();await page.waitForFunction(()=>document.querySelector('#saveText').textContent.includes('服务器已保存'))
 check('explicit confirmation saves once then reads server revision',posts===1&&await page.evaluate(()=>CFG._revision==='b'.repeat(64)&&!dirty&&CFG.decisionInputsChanged))
 await page.getByRole('link',{name:'组合决策'}).click();check('shared-seat view and server-only preview visible',await page.locator('#deploy').isVisible()&&(await page.locator('#deployTable').innerText()).includes('未核准'))
 await page.getByRole('link',{name:'资产账本'}).click();check('HK historical CNY cost gap visible', (await page.locator('#posTable').innerText()).includes('人民币成本待核'))
 await page.getByRole('link',{name:'工具与证据'}).click();await page.locator('#cSel').selectOption('0');await page.locator('#cEps').fill('1');await page.locator('#cSel').selectOption('1');check('company switch clears previous EPS',await page.locator('#cEps').inputValue()==='')
 await page.getByRole('link',{name:'今日',exact:true}).click();await page.screenshot({path:path.join(__dirname,'../delivery-tests/browser-desktop.png'),fullPage:true})
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(250);await page.screenshot({path:path.join(__dirname,'../delivery-tests/browser-mobile.png'),fullPage:false});check('mobile page does not overflow horizontally',await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1))
 check('no runtime errors through editing and navigation',errors.length===0);check('no requests made to production',requests>0)
 console.log('Browser safety: '+count+' checks passed; synthetic local server only')
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve))}})().catch(e=>{console.error(e);process.exitCode=1})
