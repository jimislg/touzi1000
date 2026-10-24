/* 串行本地保存 + 持久待同步记录 + 云端整行比较后更新。无需数据库迁移。 */
const fs = require('fs')
const crypto = require('crypto')
const clone = value => JSON.parse(JSON.stringify(value))
function clean (cfg) {
  const out = clone(cfg)
  delete out._revision
  delete out._syncStatus
  delete out._sourceMode
  delete out._journalStatus
  delete out._researchSupplement // read-only release material; not part of the account revision
  return out
}
function canonical (value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}'
  return JSON.stringify(value)
}
const revisionOf = cfg => crypto.createHash('sha256').update(canonical(clean(cfg))).digest('hex')
function changedFields (before, after, prefix = '') {
  if (canonical(before) === canonical(after)) return []
  if (before && after && typeof before === 'object' && typeof after === 'object') return [...new Set([...Object.keys(before), ...Object.keys(after)])].flatMap(k => changedFields(before[k], after[k], prefix ? prefix + '.' + k : k))
  return [prefix]
}
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
  const allowed = new Set(['expectedRevision', 'investable', 'cash', 'cashYield', 'annualContribution', 'holdings', 'universe', 'dismissedSignals', 'dismissedReasons'])
  if (Object.keys(patch).some(k => !allowed.has(k))) throw failure(400, '补丁含只读或未授权字段；策略、审计和批准记录不可由普通编辑修改')
  const out = clean(base)
  function numeric (obj, key, max = 1e12) {
    if (obj[key] !== undefined && (typeof obj[key] !== 'number' || !Number.isFinite(obj[key]) || obj[key] < 0 || obj[key] > max)) throw failure(400, key + '数值超出范围')
  }
  const scalars = ['investable', 'cash', 'cashYield', 'annualContribution']
  scalars.forEach(k => { numeric(patch, k, k === 'cashYield' ? 100 : 1e12); if (patch[k] !== undefined) out[k] = patch[k] })
  if (out.targetCapital === 0) throw failure(400, '目标本金必须大于零')
  for (const [key, fields] of [['holdings', ['shares', 'cost', 'dps', 'buyDate', 'dpsManual']], ['universe', ['buyPrice', 'plan', 'bizTag']]]) {
    if (patch[key] === undefined) continue
    if (!Array.isArray(patch[key])) throw failure(400, key + '必须是数组')
    const seen = new Set()
    patch[key].forEach(row => {
      if (!row || typeof row.code !== 'string' || seen.has(row.code)) throw failure(400, '代码缺失或重复')
      if (Object.keys(row).some(k => k !== 'code' && !fields.includes(k))) throw failure(400, '条目含只读或未授权字段')
      seen.add(row.code)
      const target = (out[key] || []).find(h => h.code === row.code)
      if (!target) throw failure(400, '不允许通过配置补丁新增代码')
      for (const k of fields) {
        if (row[k] === undefined) continue
        if (['shares', 'cost', 'dps', 'buyPrice'].includes(k)) {
          if (['buyPrice', 'dps'].includes(k) && row[k] === null) { target[k] = null; continue }
          numeric(row, k)
          if (k === 'buyPrice' && row[k] === 0) throw failure(400, '触发价必须大于零或为null')
          if (k === 'shares' && !Number.isInteger(row[k])) throw failure(400, '股数必须是整数')
        } else if (k === 'dpsManual') {
          if (typeof row[k] !== 'boolean') throw failure(400, '手工股息标识必须是布尔值')
        } else if (typeof row[k] !== 'string' || row[k].length > (k === 'bizTag' ? 80 : 5000)) throw failure(400, k + '文本不合法')
        if (k === 'buyDate' && row[k] && (!/^\d{4}-\d{2}-\d{2}$/.test(row[k]) || !Number.isFinite(Date.parse(row[k])) || new Date(row[k]).toISOString().slice(0, 10) !== row[k])) throw failure(400, '买入日不合法')
        target[k] = row[k]
      }
      if (key === 'holdings') {
        const original = (base.holdings || []).find(h => h.code === row.code)
        if (['shares', 'cost'].some(k => row[k] !== undefined && row[k] !== original[k])) {
          target.costBasisStatus = 'unverified'
          delete target.settledCostCNYFen
          delete target.costBasisSource
        }
      }
      if (key === 'holdings' && (row.dps !== undefined || row.dpsManual !== undefined)) {
        if (target.dps === null) {
          target.dpsManual = false
          target.dpsSource = '股息未知，等待可信数据更新'
          delete target.dpsAsOf
        } else if (row.dpsManual === false) {
          // 恢复自动仅解除覆盖，客户端不得冒充自动来源写入新数值。
          if (row.dps !== undefined && row.dps !== (base.holdings || []).find(h => h.code === row.code).dps) throw failure(400, '自动股息数值只接受可信数据源；手工录入请标记手工覆盖')
          target.dpsManual = false
          if ((base.holdings || []).find(h => h.code === row.code).dpsManual === true) {
            target.dpsSource = '已恢复自动，等待可信数据更新'
            target.dpsStale = true
          }
        } else if (row.dps !== undefined) {
          target.dpsManual = true
          target.dpsSource = '用户手工覆盖，非自动分红数据'
          target.dpsAsOf = new Date().toISOString().slice(0, 10)
          target.dpsStale = false
        }
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
  const fields = changedFields(clean(base), out)
  if (fields.length) {
    const at = new Date().toISOString()
    const material = fields.filter(k => !k.startsWith('dismissed') && !/^universe\.\d+\.bizTag$/.test(k))
    if (material.length) out.decisionInputsChanged = { at, fields: material, reason: '普通编辑改变了已核数据，请重新对账并按新版本审批' }
    const atPath = (obj, path) => path.split('.').reduce((value, key) => value == null ? undefined : value[key], obj)
    out.changeHistory = (Array.isArray(base.changeHistory) ? base.changeHistory : []).concat({ at, baseRevision: revisionOf(base), changes: fields.map(path => ({ path, before: atPath(base, path) ?? null, after: atPath(out, path) ?? null })) }).slice(-100)
  }
  return out
}

function createConfigService ({ store, file, sourceMode = 'cloud', journal = file + '.pending', io = { read: f => JSON.parse(fs.readFileSync(f, 'utf8')), write: atomicWrite, remove: f => { if (fs.existsSync(f)) fs.unlinkSync(f) } }, timeoutMs = 8000 }) {
  if (!['cloud', 'local'].includes(sourceMode)) throw failure(503, 'sourceMode必须显式为cloud或local')
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
  function present (cfg, status) { const view = clean(cfg); delete view.accessKey; return Object.assign(view, { _revision: revisionOf(cfg), _syncStatus: status, _sourceMode: sourceMode, _journalStatus: pending ? 'preserved' : 'none' }) }
  async function flush () {
    if (sourceMode === 'local') return pending ? { ok: false, reason: 'local-pending-review' } : { ok: true, sourceMode: 'local' }
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
      if (sourceMode === 'local') return present(io.read(file), pending ? 'local-pending-review' : 'local')
      if (pending) { const sync = await flush(); if (pending) return present(pending.cfg, sync.reason) }
      const cloud = await remote()
      if (cloud.ok && cloud.cfg && Array.isArray(cloud.cfg.holdings)) return present(cloud.cfg, 'synced')
      return present(io.read(file), 'offline')
    }),
    save: (patch, expectedRevision) => serial(async () => {
      if (sourceMode === 'local') {
        if (pending) throw failure(409, '检测到旧待同步记录，已保留；请先人工核对，不能静默切换数据源')
        if (typeof expectedRevision !== 'string' || !/^[a-f0-9]{64}$/.test(expectedRevision)) throw failure(428, '缺少配置版本，请先刷新再保存')
        const base = io.read(file)
        if (revisionOf(base) !== expectedRevision) throw failure(409, '配置已被其他操作修改，请保留本地修改并刷新核对')
        const candidate = mergePatch(base, patch)
        io.write(file, candidate)
        const serverSavedAt = new Date().toISOString()
        return { ok: true, savedAt: serverSavedAt, serverSavedAt, cloudSync: false, syncStatus: 'local', sourceMode: 'local', revision: revisionOf(candidate), dataRevision: candidate.decisionDataRevision || null, changedFields: changedFields(clean(base), clean(candidate)) }
      }
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
      return { ok: true, savedAt: record.savedAt, serverSavedAt: record.savedAt, cloudSync: sync.ok, syncStatus: sync.ok ? 'synced' : sync.reason, sourceMode, revision: revisionOf(candidate), dataRevision: candidate.decisionDataRevision || null, changedFields: changedFields(clean(base), clean(candidate)) }
    }),
    retry: () => serial(flush)
  }
}
module.exports = { createConfigService, revisionOf, mergePatch, atomicWrite }
