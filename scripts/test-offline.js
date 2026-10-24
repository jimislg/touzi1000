#!/usr/bin/env node
/* One offline acceptance entry. Every child receives the mock-cloud guard. */
const {spawnSync}=require('node:child_process'),path=require('node:path'),fs=require('node:fs')
const root=path.resolve(__dirname,'..'),logDir=process.env.TEST_LOG_DIR?path.resolve(process.env.TEST_LOG_DIR):null
const suites=['investment-platform/lg_sync_test.js','investment-platform/test-cloud-adapter.js','investment-platform/test-cloud-roundtrip.js','investment-platform/test-config-service.js','investment-platform/test-refresh.js','investment-platform/test-seat-risk-ui.js','investment-platform/test-server-api.js','investment-platform/test-stress-model.js','investment-platform/verify-integrity.js','investment-platform/verify-config-data.js','investment-platform/test-decision-safety.js','investment-platform/test-research-evidence.js','investment-platform/test-repricing.js','invest-miniprogram/scripts/sync-core.js --check','invest-miniprogram/scripts/verify.js','invest-miniprogram/scripts/verify-network.js']
if(process.argv.includes('--with-http'))suites.push('investment-platform/test-local-server.js')
if(logDir)fs.mkdirSync(logDir,{recursive:true})
let failed=0
for(const suite of suites){const [file,...args]=suite.split(' '),result=spawnSync(process.execPath,[path.join(root,file),...args],{cwd:path.dirname(path.join(root,file)),encoding:'utf8',env:{...process.env,LG_MOCK_CLOUD:'1'},timeout:60000});const output=(result.stdout||'')+(result.stderr||'')+(result.error?'\n'+result.error.message:'');process.stdout.write('\n'+suite+'\n'+output);if(logDir)fs.writeFileSync(path.join(logDir,file.replaceAll('/','_')+'.log'),output);if(result.status!==0)failed++}
console.log('\nOffline acceptance: '+(suites.length-failed)+'/'+suites.length+' suites passed. No production writes.')
process.exitCode=failed?1:0
