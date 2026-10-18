/* 在全新临时源码副本中注入合成数据，不依赖或覆盖本机持仓文件。 */
const fs = require('fs'), os = require('os'), path = require('path'), { spawnSync } = require('child_process')
const { exportSource } = require('./export-source')
const fixture = require('./fixtures')
const target = fs.mkdtempSync(path.join(os.tmpdir(), 'touzi-offline-'))
const results = []
try {
  exportSource(target, { allowMissingResults: true })
  const write = (file, content) => fs.writeFileSync(path.join(target, file), content)
  write('investment-platform/config.json', JSON.stringify(fixture.config))
  write('invest-miniprogram/project.config.json', fs.readFileSync(path.join(target, 'invest-miniprogram/project.config.example.json')))
  write('invest-miniprogram/utils/config.js', '/* 合成测试配置 */\nmodule.exports = ' + JSON.stringify(fixture.miniConfig))
  write('invest-miniprogram/utils/snapshot.js', '/* 合成测试快照 */\nmodule.exports = ' + JSON.stringify(fixture.snapshot))
  const tests = ['invest-miniprogram/scripts/verify.js', 'invest-miniprogram/scripts/verify-network.js', 'investment-platform/lg_sync_test.js', 'investment-platform/verify-integrity.js', 'investment-platform/test-config-service.js', 'investment-platform/test-stress-model.js', 'investment-platform/test-seat-risk-ui.js', 'investment-platform/test-cloud-adapter.js', 'investment-platform/test-refresh.js', 'investment-platform/test-server-api.js', 'investment-platform/test-cloud-roundtrip.js']
  for (const test of tests) {
    const r = spawnSync(process.execPath, [test], { cwd: target, env: { ...process.env, LG_MOCK_CLOUD: '1' }, encoding: 'utf8', timeout: 30000 })
    const count = (r.stdout.match(/^(PASS|✓) /gm) || []).length
    results.push({ test, passed: r.status === 0, checks: count, exitCode: r.status })
    console.log((r.status === 0 ? 'PASS ' : 'FAIL ') + test + ' (' + count + ')')
    if (r.status !== 0) { console.error(r.stderr || r.stdout); process.exitCode = 1 }
  }
  const env = { ...process.env }; delete env.LG_MOCK_CLOUD
  const guard = spawnSync(process.execPath, ['investment-platform/test-cloud-roundtrip.js'], { cwd: target, env, encoding: 'utf8' })
  const refused = guard.status === 1 && guard.stderr.includes('已阻止')
  results.push({ test: 'live-cloud-write-guard', passed: refused, checks: 1, exitCode: guard.status })
  if (!refused) process.exitCode = 1
  const report = { schema: 1, data: 'synthetic fixtures only', cloudOperations: 0, deployed: false, uploadedMiniprogram: false, passed: results.every(x => x.passed), checks: results.reduce((sum, x) => sum + x.checks, 0), results }
  const resultArg = process.argv.indexOf('--results')
  if (resultArg >= 0) fs.writeFileSync(path.resolve(process.argv[resultArg + 1]), JSON.stringify(report, null, 2) + '\n')
  console.log('离线验收：' + report.checks + '项，' + (report.passed ? '全部通过' : '存在失败'))
} finally { fs.rmSync(target, { recursive: true, force: true }) }
