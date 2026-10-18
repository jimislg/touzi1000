/* app_config存取。所有正式更新必须比较旧JSONB整行，避免覆盖外部jsonb_set修改。 */
const fs = require('fs'), path = require('path')
const clone = x => JSON.parse(JSON.stringify(x))
if (process.env.LG_MOCK_CLOUD === '1') {
  let cfg
  try { cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8')) } catch (_) { cfg = null }
  console.log('[cloud-store] LG_MOCK_CLOUD=1 → 内存mock模式，不触碰真实云库')
  module.exports = {
    read: async () => ({ ok: true, cfg: clone(cfg) }),
    write: async next => { cfg = clone(next); return { ok: true } },
    compareAndSwap: async (next, expected) => {
      const { revisionOf } = require('./config-service')
      if (revisionOf(cfg) !== revisionOf(expected)) return { ok: false, conflict: true }
      cfg = clone(next); return { ok: true }
    }
  }
} else {
  let cloud
  function client () {
    if (cloud) return cloud
    const pc = JSON.parse(fs.readFileSync(path.join(__dirname, 'publicConfig.json'), 'utf8'))
    const { createWorkBuddyCloud } = require('@tencent-ai/workbuddy-cloud-sdk')
    cloud = createWorkBuddyCloud({ endpoint: pc.endpoint, publishableKey: pc.publishableKey })
    return cloud
  }
  module.exports = {
    read: async () => {
      try {
        const r = await client().database.from('app_config').select('data').eq('key', 'config').maybeSingle()
        if (r.error) throw new Error('云配置读取失败')
        return { ok: true, cfg: r.data ? r.data.data : null }
      } catch (_) { return { ok: false, err: '云配置暂不可达' } }
    },
    write: async () => ({ ok: false, err: '禁止无版本覆盖，请使用compareAndSwap' }),
    compareAndSwap: async (cfg, expected) => {
      try {
        // 完整JSONB比较在数据库RPC执行；配置通过POST正文传输，不放入URL。
        // RPC尚未安装/权限不足时只返回失败，绝不降级为无条件覆盖。
        const r = await client().database.rpc('compare_and_swap_app_config', { p_expected: expected, p_next: cfg })
        if (r.error) return { ok: false, err: '云端条件保存暂不可用' }
        if (r.data !== true) return { ok: false, conflict: true }
        return { ok: true }
      } catch (_) { return { ok: false, err: '云配置条件更新暂不可达' } }
    }
  }
}
