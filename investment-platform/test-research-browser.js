/* Portable report QA: local public research only, no account/config/network calls. */
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('node:assert/strict')
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright')
const root=path.join(__dirname,'public/research'),evidence=path.join(__dirname,'../delivery-tests/research')
fs.mkdirSync(evidence,{recursive:true})
let n=0;const check=(name,ok)=>{assert.ok(ok,name);n++;console.log('PASS '+name)}
const server=http.createServer((req,res)=>{const p=new URL(req.url,'http://localhost').pathname;const file=path.join(root,p==='/'?'index.html':p);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return}res.setHeader('Content-Type','text/html;charset=utf-8');res.end(fs.readFileSync(file))})
;(async()=>{let browser;await new Promise(r=>server.listen(0,'127.0.0.1',r));try{
 const origin='http://127.0.0.1:'+server.address().port,errors=[],external=[]
 browser=await chromium.launch({headless:true,...(process.env.CHROME_EXECUTABLE?{executablePath:process.env.CHROME_EXECUTABLE}:{}),args:['--no-sandbox']})
 const p=await browser.newPage({viewport:{width:1440,height:1000}})
 p.on('pageerror',e=>errors.push(e.message));await p.route('**/*',route=>{if(!route.request().url().startsWith(origin)){external.push(route.request().url());return route.abort()}return route.continue()})
 await p.goto(origin);check('34 issuers visible in searchable checklist',await p.locator('tbody tr').count()===34)
 await p.locator('#filter').selectOption('financial');check('all 8 retrieved Q3 financials filter correctly',await p.locator('tbody tr:visible').count()===8)
 await p.locator('#filter').selectOption('operating');check('4 operating updates remain distinct from financials',await p.locator('tbody tr:visible').count()===4)
 await p.locator('#filter').selectOption('subsidiary');check('Ping An group/bank identity visible',await p.locator('tbody tr:visible').count()===1&&(await p.locator('tbody tr:visible').innerText()).includes('平安银行'))
 await p.locator('#filter').selectOption('');await p.locator('#search').fill('康臣');check('issuer search works',await p.locator('tbody tr:visible').count()===1)
 await p.locator('#search').fill('');await p.evaluate(()=>scrollTo(0,0));await p.screenshot({path:path.join(evidence,'checklist-desktop.png'),fullPage:false})
 const hrefs=await p.locator('a[href$=".html"]').evaluateAll(xs=>xs.map(x=>x.getAttribute('href')))
 check('all local report links resolve',hrefs.every(h=>fs.existsSync(path.join(root,h))))
 for(const id of ['catl','popmart','china_mobile','miniso']){await p.goto(origin+'/'+id+'.html');check(id+' has sources and named evidence gaps',(await p.locator('article').innerText()).includes('现金')&&await p.locator('article a[href^="http"]').count()>0);const heading=p.getByRole('heading').filter({hasText:/现金桥|现金与|经营、现金/}).first();if(await heading.count())await heading.scrollIntoViewIfNeeded();await p.screenshot({path:path.join(evidence,id+'-cash-review.png'),fullPage:false})}
 await p.setViewportSize({width:390,height:844});await p.goto(origin);check('mobile checklist contains overflow inside table only',await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await p.screenshot({path:path.join(evidence,'checklist-mobile.png'),fullPage:false})
 check('no page runtime errors and no remote requests',!errors.length&&!external.length)
 console.log('Research browser QA: '+n+' checks passed; local public files only.')
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r))}})().catch(e=>{console.error(e);process.exitCode=1})
