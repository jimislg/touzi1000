/* 串行本地保存 + 持久待同步记录 + 云端整行比较后更新。无需数据库迁移。 */
const fs = require('fs')
const crypto = require('crypto')
const clone = value => JSON.parse(JSON.stringify(value))
function clean (cfg) {
  const out = clone(cfg)
  delete out._revision
  delete out._syncStatus
  return out
}
function canonical (value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}'
  return JSON.stringify(value)
}
const revisionOf = cfg => crypto.createHash('sha256').update(canonical(clean(cfg))).digest('hex')
function failure (status, message) { return Object.assign(new Error(message), { status }) }
function atomicWrite (file, data) {
  const tmp = file + '.tmp-' + crypto.randomUUID()
  try {
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 })
    fs.renameSync(tmp, file)
  } finally { if (fs.existsSync(tmp)) fs.unlinkSync(tmp) }
}
function mergePatch (base, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw failure(400, '配置必须是对象')
  const out = clean(base)
  function numeric (obj, key, max = 1e12) {
    if (obj[key] !== undefined && (typeof obj[key] !== 'number' || !Number.isFinite(obj[key]) || obj[key] < 0 || obj[key] > max)) throw failure(400, key + '数值超出范围')
  }
  const scalars = ['targetCapital', 'investable', 'cash', 'cashYield', 'annualContribution']
  scalars.forEach(k => { numeric(patch, k, k === 'cashYield' ? 100 : 1e12); if (patch[k] !== undefined) out[k] = patch[k] })
  if (out.targetCapital === 0) throw failure(400, '目标本金必须大于零')
  for (const [key, fields] of [['holdings', ['shares', 'cost', 'dps', 'buyDate', 'dpsManual']], ['universe', ['buyPrice', 'plan']]]) {
    if (patch[key] === undefined) continue
    if (!Array.isArray(patch[key])) throw failure(400, key + '必须是数组')
    const seen = new Set()
    patch[key].forEach(row => {
      if (!row || typeof row.code !== 'string' || seen.has(row.code)) throw failure(400, '代码缺失或重复')
      seen.add(row.code)
      const target = (out[key] || []).find(h => h.code === row.code)
      if (!target) throw failure(400, '不允许通过配置补丁新增代码')
      for (const k of fields) {
        if (row[k] === undefined) continue
        if (['shares', 'cost', 'dps', 'buyPrice'].includes(k)) {
          if (k === 'buyPrice' && row[k] === null) { target[k] = null; continue }
          numeric(row, k)
          if (k === 'buyPrice' && row[k] === 0) throw failure(400, '触发价必须大于零或为null')
          if (k === 'shares' && !Number.isInteger(row[k])) throw failure(400, '股数必须是整数')
        } else if (k === 'dpsManual') {
          if (typeof row[k] !== 'boolean') throw failure(400, '手工股息标识必须是布尔值')
        } else if (typeof row[k] !== 'string' || row[k].length > 5000) throw failure(400, k + '文本不合法')
        if (k === 'buyDate' && row[k] && (!/^\d{4}-\d{2}-\d{2}$/.test(row[k]) || !Number.isFinite(Date.parse(row[k])) || new Date(row[k]).toISOString().slice(0, 10) !== row[k])) throw failure(400, '买入日不合法')
        target[k] = row[k]
      }
    })
  }
  if (patch.dismissedSignals !== undefined) {
    if (!Array.isArray(patch.dismissedSignals) || patch.dismissedSignals.some(x => typeof x !== 'string' || x.length > 100)) throw failure(400, '信号列表不合法')
    out.dismissedSignals = [...new Set(patch.dismissedSignals)]
  }
  if (patch.dismissedReasons !== undefined) {
    const reasons = patch.dismissedReasons
    if (!reasons || typeof reasons !== 'object' || Array.isArray(reasons) || Object.entries(reasons).some(([k, v]) => k.length > 100 || typeof v !== 'string' || v.length > 2000)) throw failure(400, '决策原因不合法')
    out.dismissedReasons = clone(reasons)
  }
  if (patch.seats !== undefined) {
    const seats = patch.seats
    if (!seats || !Array.isArray(seats.list) || seats.list.length > 30) throw failure(400, '席位结构不合法')
    const codes = new Set((out.universe || []).map(x => x.code))
    const members = new Set(), keys = new Set()
    let total = 0
    for (const seat of seats.list) {
      if (!seat || typeof seat.key !== 'string' || keys.has(seat.key)) throw failure(400, '席位代码缺失或重复')
      keys.add(seat.key); numeric(seat, 'pct', 100)
      if (seat.pct === undefined || !Array.isArray(seat.members)) throw failure(400, '席位权重或成员缺失')
      total += seat.pct
      for (const code of seat.members) {
        if (!codes.has(code) || members.has(code)) throw failure(400, '席位成员未知或重复')
        members.add(code)
      }
    }
    if (total > 100.000001) throw failure(400, '席位权重合计不能超过100%')
    out.seats = clone(seats)
  }
  return out
}

function createConfigService ({ store, file, journal = file + '.pending', io = { read: f => JSON.parse(fs.readFileSync(f, 'utf8')), write: atomicWrite, remove: f => { if (fs.existsSync(f)) fs.unlinkSync(f) } }, timeoutMs = 8000 }) {
  let queue = Promise.resolve()
  // 已存在但损坏的journal不能被当作“没有积压”，否则会丢失用户修改。
  let pending
  try { pending = io.read(journal) } catch (e) { if (e.code !== 'ENOENT') throw failure(503, '待同步记录无法读取，请保留文件并恢复备份'); pending = null }
  if (pending && (!pending.cfg || !Array.isArray(pending.cfg.holdings) || !Array.isArray(pending.cfg.universe) || !/^[a-f0-9]{64}$/.test(pending.baseRevision))) throw failure(503, '待同步记录结构异常，请保留文件并恢复备份')
  const serial = fn => { const job = queue.then(fn); queue = job.catch(() => {}); return job }
  const timed = async promise => {
    let timer
    try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('云端超时')), timeoutMs) })]) }
    finally { clearTimeout(timer) }
  }
  async function remote () { try { return await timed(Promise.resolve().then(() => store.read())) } catch (e) { return { ok: false, err: e.message } } }
  function present (cfg, status) { const view = clean(cfg); delete view.accessKey; return Object.assign(view, { _revision: revisionOf(cfg), _syncStatus: status }) }
  async function flush () {
    if (!pending) return { ok: true }
    const cloud = await remote()
    if (!cloud.ok || !cloud.cfg) return { ok: false, reason: 'pending' }
    if (revisionOf(cloud.cfg) === revisionOf(pending.cfg)) {
      io.write(file, pending.cfg); io.remove(journal); pending = null
      return { ok: true }
    }
    if (revisionOf(cloud.cfg) !== pending.baseRevision) return { ok: false, reason: 'conflict' }
    let result
    try { result = await timed(Promise.resolve().then(() => store.compareAndSwap(pending.cfg, cloud.cfg))) }
    catch (e) { return { ok: false, reason: 'pending' } }
    if (!result.ok) return { ok: false, reason: result.conflict ? 'conflict' : 'pending' }
    io.write(file, pending.cfg); io.remove(journal); pending = null
    return { ok: true }
  }
  return {
    read: () => serial(async () => {
      if (pending) { const sync = await flush(); if (pending) return present(pending.cfg, sync.reason) }
      const cloud = await remote()
      if (cloud.ok && cloud.cfg && Array.isArray(cloud.cfg.holdings)) return present(cloud.cfg, 'synced')
      return present(io.read(file), 'offline')
    }),
    save: (patch, expectedRevision) => serial(async () => {
      if (pending) { const sync = await flush(); if (sync.reason === 'conflict') throw failure(409, '云端与本地待同步修改冲突，请保留记录并人工核对') }
      if (typeof expectedRevision !== 'string' || !/^[a-f0-9]{64}$/.test(expectedRevision)) throw failure(428, '缺少配置版本，请先刷新再保存')
      const cloud = await remote()
      const base = pending ? pending.cfg : cloud.ok && cloud.cfg ? cloud.cfg : io.read(file)
      if (revisionOf(base) !== expectedRevision) throw failure(409, '配置已被其他操作修改，请保留本地修改并刷新核对')
      if (pending && cloud.ok && cloud.cfg && revisionOf(cloud.cfg) !== pending.baseRevision && revisionOf(cloud.cfg) !== revisionOf(pending.cfg)) throw failure(409, '云端与本地待同步修改冲突，已保留双方数据，请人工核对')
      const candidate = mergePatch(base, patch)
      const record = { baseRevision: pending ? pending.baseRevision : revisionOf(base), cfg: candidate, savedAt: new Date().toISOString() }
      io.write(journal, record); pending = record
      io.write(file, candidate)
      const sync = await flush()
      return { ok: true, savedAt: record.savedAt, cloudSync: sync.ok, syncStatus: sync.ok ? 'synced' : sync.reason, revision: revisionOf(candidate) }
    }),
    retry: () => serial(flush)
  }
}
module.exports = { createConfigService, revisionOf, mergePatch, atomicWrite }
