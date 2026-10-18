/* 真实适配器运行于SDK桩：核对RPC参数与失败语义，不连接数据库。 */
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert/strict')
let passed = 0
function check (name, ok) { assert.ok(ok, name); passed++; console.log('PASS ' + name) }
const state = { result: { data: true }, calls: 0 }
const sandbox = { module: { exports: {} }, __dirname, process: { env: {} }, require: name => {
  if (name === 'path') return path
  if (name === 'fs') return { readFileSync: () => JSON.stringify({ endpoint: 'https://fixture.invalid', publishableKey: 'fixture-only' }) }
  if (name === '@tencent-ai/workbuddy-cloud-sdk') return { createWorkBuddyCloud: () => ({ database: { rpc: async (name, args) => { state.name = name; state.args = args; state.calls++; return state.result } } }) }
  throw new Error('unexpected dependency')
} }
vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'cloud-store.js'), 'utf8'), sandbox)
;(async () => {
  const adapter = sandbox.module.exports, expected = { holdings: [] }, next = { holdings: [], investable: 100 }
  check('RPC成功才能标记条件保存成功', (await adapter.compareAndSwap(next, expected)).ok)
  check('使用RPC正文对象传递旧值与新值', state.name === 'compare_and_swap_app_config' && state.args.p_expected === expected && state.args.p_next === next)
  state.result = { data: false }
  let r = await adapter.compareAndSwap(next, expected)
  check('比较失败返回冲突', !r.ok && r.conflict)
  state.result = { error: { message: 'function unavailable' } }
  r = await adapter.compareAndSwap(next, expected)
  check('RPC未安装或权限错误不冒充成功', !r.ok && !r.conflict)
  const calls = state.calls
  check('生产适配器拒绝无条件write', !(await adapter.write(next)).ok && state.calls === calls)
  console.log('云适配器离线回归全部通过: ' + passed)
})().catch(e => { console.error(e); process.exitCode = 1 })
