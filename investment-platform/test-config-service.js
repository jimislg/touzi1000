/* 配置服务离线回归：并发、离线、重启、晚到写入及校验。 */
const assert = require('assert/strict')
const { createConfigService, revisionOf, mergePatch } = require('./config-service')
const clone = x => JSON.parse(JSON.stringify(x))
let passed = 0
function check (name, ok) { assert.ok(ok, name); passed++; console.log('PASS ' + name) }
const initial = { accessKey: 'fixture-only', investable: 1000, targetCapital: 2000, holdings: [{ code: '600000.SH', shares: 100, cost: 10, dps: 1 }], universe: [{ code: '600000.SH', buyPrice: 9 }] }
function harness () {
  const files = new Map([['config', clone(initial)]])
  const state = { cfg: clone(initial), offline: false, race: false, writes: 0 }
  const io = {
    read: file => { if (!files.has(file)) throw Object.assign(new Error('missing'), { code: 'ENOENT' }); return clone(files.get(file)) },
    write: (file, cfg) => files.set(file, clone(cfg)), remove: file => files.delete(file)
  }
  const store = {
    read: async () => state.offline ? { ok: false } : { ok: true, cfg: clone(state.cfg) },
    compareAndSwap: async (next, expected) => {
      if (state.race) { state.cfg.cashYield = 2; state.race = false }
      if (state.offline) return { ok: false }
      if (revisionOf(expected) !== revisionOf(state.cfg)) return { ok: false, conflict: true }
      state.cfg = clone(next); state.writes++; return { ok: true }
    }
  }
  const create = () => createConfigService({ store, file: 'config', io, timeoutMs: 15 })
  return { files, state, io, store, create, service: create() }
}
;(async () => {
  const h = harness(), s = h.service
  const view = await s.read()
  check('读取不暴露访问口令并携带版本', !view.accessKey && /^[a-f0-9]{64}$/.test(view._revision))
  const [first, second] = await Promise.allSettled([s.save({ investable: 900 }, view._revision), s.save({ investable: 800 }, view._revision)])
  check('两个相同版本并发保存只接受一次', first.status === 'fulfilled' && second.status === 'rejected' && second.reason.status === 409 && h.state.cfg.investable === 900)
  check('成功后清理待同步记录且保留口令', !h.files.has('config.pending') && h.state.cfg.accessKey === 'fixture-only')
  h.state.offline = true
  let r = await s.save({ investable: 700 }, (await s.read())._revision)
  check('离线保存先写本地与journal且不冒充上云', r.ok && !r.cloudSync && h.files.get('config').investable === 700 && h.files.has('config.pending'))
  const restarted = h.create()
  check('进程重启仍能读到待同步数据', (await restarted.read()).investable === 700)
  h.state.offline = false
  check('网络恢复后条件补同步并清理记录', (await restarted.retry()).ok && h.state.cfg.investable === 700 && !h.files.has('config.pending'))
  h.state.offline = true
  await restarted.save({ investable: 600 }, (await restarted.read())._revision)
  h.state.cfg.investable = 500; h.state.offline = false
  r = await restarted.retry()
  check('外部修改与待同步冲突时保留双方数据', !r.ok && r.reason === 'conflict' && h.state.cfg.investable === 500 && h.files.get('config.pending').cfg.investable === 600)
  check('冲突对读取端可见', (await restarted.read())._syncStatus === 'conflict')
  const race = harness(); race.state.race = true
  r = await race.service.save({ investable: 800 }, (await race.service.read())._revision)
  check('读取后写入前发生外部变化时CAS拒绝覆盖', !r.cloudSync && r.syncStatus === 'conflict' && race.state.cfg.cashYield === 2 && race.files.has('config.pending'))
  const late = harness()
  let finish
  late.store.compareAndSwap = async next => { await new Promise(resolve => { finish = resolve }); late.state.cfg = clone(next); return { ok: true } }
  r = await late.service.save({ investable: 850 }, (await late.service.read())._revision)
  check('云写入超时保留持久记录', !r.cloudSync && late.files.has('config.pending'))
  finish(); await new Promise(resolve => setImmediate(resolve))
  check('超时后晚到成功可通过回读确认而非重复覆盖', (await late.service.retry()).ok && !late.files.has('config.pending'))
  check('对象键顺序不改变配置版本', revisionOf({ a: 1, b: 2 }) === revisionOf({ b: 2, a: 1 }))
  for (const patch of [{ investable: -1 }, { holdings: [{ code: '600000.SH', shares: 1.5 }] }, { universe: [{ code: '600000.SH', buyPrice: 0 }] }, { holdings: [{ code: 'bad', shares: 1 }] }, { seats: { list: [{ key: 'a', pct: 101, members: [] }] } }, { dismissedReasons: { x: 1 } }]) {
    let rejected = false
    try { mergePatch(initial, patch) } catch (e) { rejected = e.status === 400 }
    check('拒绝非法补丁 ' + JSON.stringify(patch), rejected)
  }
  const zero = mergePatch(initial, { holdings: [{ code: '600000.SH', shares: 0, cost: 0, dps: 0 }], universe: [{ code: '600000.SH', buyPrice: null }] })
  check('合法零值与待定触发价仍能保存', zero.holdings[0].shares === 0 && zero.universe[0].buyPrice === null)
  let required = false
  try { await harness().service.save({}, undefined) } catch (e) { required = e.status === 428 }
  check('未带版本的写入被拒绝', required)
  const broken = harness(); broken.files.set('config.pending', {})
  let blocked = false
  try { broken.create() } catch (e) { blocked = e.status === 503 }
  check('损坏journal阻止启动而不是丢弃待同步数据', blocked)
  const fs = require('fs'), path = require('path'), os = require('os')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'touzi-journal-')), file = path.join(dir, 'config.json')
  try {
    fs.writeFileSync(file, JSON.stringify(initial))
    const disk = harness(); disk.state.offline = true
    const instance = createConfigService({ store: disk.store, file })
    await instance.save({ investable: 321 }, (await instance.read())._revision)
    check('真实文件保存写入持久journal且文件权限不公开', fs.existsSync(file + '.pending') && (fs.statSync(file + '.pending').mode & 0o077) === 0)
    const secondInstance = createConfigService({ store: disk.store, file })
    check('新服务实例从真实journal恢复离线修改', (await secondInstance.read()).investable === 321)
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
  console.log('配置安全回归全部通过: ' + passed)
})().catch(e => { console.error(e); process.exitCode = 1 })
