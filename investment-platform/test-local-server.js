/* Actual HTTP startup/save smoke, temporary synthetic config only. */
const fs=require('fs'),path=require('path'),os=require('os'),net=require('net'),assert=require('assert/strict'),{spawn}=require('child_process')
const {once}=require('events')
;(async()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'invest-local-smoke-'));let child,count=0
 const check=(name,ok)=>{assert.ok(ok,name);count++;console.log('PASS '+name)}
 try{
  fs.mkdirSync(path.join(dir,'public'))
  for(const f of ['server.js','config-service.js','decision-preview.js','research-supplement.js'])fs.copyFileSync(path.join(__dirname,f),path.join(dir,f))
  for(const f of ['index.html','investment-core.js','research-supplement.json'])fs.copyFileSync(path.join(__dirname,'public',f),path.join(dir,'public',f))
  fs.mkdirSync(path.join(dir,'public/research'));fs.copyFileSync(path.join(__dirname,'public/research/index.html'),path.join(dir,'public/research/index.html'))
  fs.writeFileSync(path.join(dir,'config.json'),JSON.stringify({accessKey:'synthetic-local-only',targetCapital:1000000,investable:10000,holdings:[],universe:[]}),{mode:0o600})
  const port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p))})})
  const base='http://127.0.0.1:'+port,headers={Cookie:'ak=synthetic-local-only'}
  child=spawn(process.execPath,[path.join(dir,'server.js')],{env:{...process.env,CONFIG_SOURCE_MODE:'local',PORT:String(port),HOST:'127.0.0.1'},stdio:['ignore','pipe','pipe']})
  await Promise.race([once(child.stdout,'data'),new Promise((_,reject)=>setTimeout(()=>reject(Error('startup timeout')),5000).unref())])
  const page=await fetch(base,{headers});check('real local server serves homepage',page.status===200&&(await page.text()).includes('决策与证据'))
  const first=await (await fetch(base+'/api/config',{headers})).json();check('local source with revision and no credential leak',first._sourceMode==='local'&&first._revision&&!first.accessKey)
  check('authenticated HTTP config includes 34 public studies without granting approval',first._researchSupplement.presentationOnly===true&&first._researchSupplement.records.length===34)
  const report=await fetch(base+'/research/index.html',{headers});check('research checklist is available on local website',report.ok&&(await report.text()).includes('全股票池'))
  const save=await fetch(base+'/api/config',{method:'POST',headers:{...headers,'Content-Type':'application/json',Origin:base},body:JSON.stringify({expectedRevision:first._revision,investable:9000})});const receipt=await save.json();check('actual HTTP local save returns confirmed receipt',save.status===200&&receipt.sourceMode==='local'&&receipt.changedFields.includes('investable'))
  const saved=await(await fetch(base+'/api/config',{headers})).json();check('readback matches receipt and invalidates evidence',saved._revision===receipt.revision&&saved.investable===9000&&saved.targetCapital===1000000&&saved.decisionInputsChanged)
  const conflict=await fetch(base+'/api/config',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({expectedRevision:first._revision,investable:8000})});check('old version cannot overwrite saved data',conflict.status===409)
  const noOverride=await fetch(base+'/api/decision-preview?code=600000.SH&revision='+receipt.revision+'&approvedCNY=999999',{headers});check('HTTP preview rejects client amount injection before quote fetch',noOverride.status===400)
  const protectedWrite=await fetch(base+'/api/config',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({expectedRevision:receipt.revision,targetCapital:2})});check('HTTP rejects protected planning-policy edit',protectedWrite.status===400)
  check('temporary config credential preserved',JSON.parse(fs.readFileSync(path.join(dir,'config.json'))).accessKey==='synthetic-local-only')
  check('research presentation metadata never persisted to account config',!JSON.parse(fs.readFileSync(path.join(dir,'config.json')))._researchSupplement)
  console.log('Local HTTP smoke: '+count+' checks passed; temporary fixture only')
 }finally{if(child&&child.exitCode===null&&child.signalCode===null){child.kill();await once(child,'exit')}fs.rmSync(dir,{recursive:true,force:true})}
})().catch(e=>{console.error(e);process.exitCode=1})
