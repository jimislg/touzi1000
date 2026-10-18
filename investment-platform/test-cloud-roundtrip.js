/* 仅验证内存mock读写；禁止向真实app_config写入探针或替换正式配置。 */
if (process.env.LG_MOCK_CLOUD !== '1') {
  console.error('已阻止：此脚本仅允许 LG_MOCK_CLOUD=1，不能对正式云配置执行往返写入测试。')
  process.exit(1)
}
const assert = require('assert/strict')
const store = require('./cloud-store')
;(async () => {
  const original = await store.read()
  assert.ok(original.ok && original.cfg && Array.isArray(original.cfg.holdings))
  console.log('PASS mock读取配置')
  const probe = Object.assign({}, original.cfg, { _probe: 'offline-roundtrip' })
  const written = await store.write(probe)
  assert.ok(written.ok)
  const readBack = await store.read()
  assert.deepEqual(readBack.cfg, probe)
  console.log('PASS mock写入并回读（不落云、不落盘）')
  await store.write(original.cfg)
  assert.deepEqual((await store.read()).cfg, original.cfg)
  console.log('PASS mock恢复原始配置')
})().catch(e => { console.error(e.message); process.exitCode = 1 })
