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
for(const prefix of ['investment-platform/config.json','invest-miniprogram/utils/config.js','invest-miniprogram/utils/snapshot.js','investment-hq/','codex-产出/','.workbuddy/'])assert.ok(!actual.some(p=>p===prefix||p.startsWith(prefix.endsWith('/')?prefix:prefix+'/')),'Protected data changed: '+prefix)
assert.equal(manifest.productionDataWritten,false,'This delivery must not claim data migration')
console.log('PASS delivery manifest: '+declared.length+' files reconcile; source/evidence hashes match; protected data unchanged; no MM staging split')
