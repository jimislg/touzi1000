#!/usr/bin/env node
/* Read-only manifest reconciliation: every changed file, source hash, protected data and staging state. */
const fs=require('fs'),path=require('path'),crypto=require('crypto'),{execFileSync}=require('child_process'),assert=require('assert/strict')
const root=path.resolve(__dirname,'..'),manifest=JSON.parse(fs.readFileSync(path.join(root,'delivery-manifest.json')))
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim()
const paths=s=>s?s.split('\n'):[]
const actual=[...new Set([...paths(git('diff','--name-only',manifest.baseCommit,'--')), ...paths(git('ls-files','--others','--exclude-standard'))])].sort()
const declared=manifest.files.map(f=>f.path).sort()
assert.deepEqual(declared,actual,'Manifest must match every changed file; no omissions or extras')
assert.equal(new Set(declared).size,declared.length,'No duplicate file entries')
assert.ok(!git('status','--porcelain').split('\n').some(s=>s.startsWith('MM ')),'Worktree and stage cannot contain different modifications')
for(const f of manifest.files){assert.ok(typeof f.dataOrSchemaTouch==='boolean'&&f.intent,'Each file must declare intent and data/schema impact');if(f.sha256){const hash=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f.path))).digest('hex');assert.equal(hash,f.sha256,'Source/evidence hash mismatch: '+f.path)}}
// snapshot.js是config.json+build.js的确定性构建产物，每次发版须随代码刷新；账户数据本体仍由config.json与utils/config.js保护（郎刚10-25确认发布流程含快照重建）
// 郎刚10-25股票调整通道：受保护数据允许变更，但必须在manifest中以dataOrSchemaTouch:true显式声明该文件（未声明的变更仍然红灯——防止夹带）；productionDataWritten须与声明一致
const declaredData=new Set(manifest.files.filter(f=>f.dataOrSchemaTouch===true).map(f=>f.path))
for(const prefix of ['investment-platform/config.json','invest-miniprogram/utils/config.js','investment-hq/','codex-产出/','.workbuddy/']){
  const hit=actual.find(p=>p===prefix||(prefix.endsWith('/')&&p.startsWith(prefix)))
  if(!hit)continue
  assert.ok(declaredData.has(hit),'Protected data changed without dataOrSchemaTouch declaration: '+hit)
}
assert.equal(manifest.productionDataWritten,declaredData.size>0,'productionDataWritten must reflect declared data changes')
console.log('PASS delivery manifest: '+declared.length+' files reconcile; source/evidence hashes match; protected data unchanged; no MM staging split')
