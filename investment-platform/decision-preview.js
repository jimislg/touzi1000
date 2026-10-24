/* Read-only server decision preview. Client amounts and qualification flags are never inputs. */
function apiError (status, message) { return Object.assign(new Error(message), { status }) }
function createDecisionPreview ({ configService, fetchQuotes, core, now = Date.now, ttlMs = 30000 }) {
  return async function preview ({ code, revision }) {
    if (typeof code !== 'string' || !/^(?:\d{6}\.(?:SH|SZ)|\d{4,5}\.HK)$/.test(code)) throw apiError(400, '证券代码格式错误')
    if (typeof revision !== 'string' || !/^[a-f0-9]{64}$/.test(revision)) throw apiError(428, '预览必须引用当前配置版本')
    const cfg = await configService.read()
    if (revision !== cfg._revision) throw apiError(409, '配置版本已变化，请刷新后重新预览')
    if (!(cfg.universe || []).some(u => u.code === code)) throw apiError(404, '证券不在当前股票池')
    const symbols = [...new Set([...(cfg.holdings || []), ...(cfg.universe || [])].map(x => x.qt).filter(Boolean).concat('whHKDCNY'))]
    let quotes = {}, quoteError = null
    try {
      const result = await fetchQuotes(symbols)
      quotes = result && result.quotes ? result.quotes : {}
      if (!result || result.ok !== true) quoteError = '可信行情不完整，不能确认可执行金额'
    } catch (_) { quoteError = '可信行情暂不可用，不能确认可执行金额' }
    // The quote request may take seconds; never authorize against a config changed meanwhile.
    const latest = await configService.read()
    if (latest._revision !== revision) throw apiError(409, '行情加载期间配置已变化，请重新预览')
    const clock = now()
    const decision = core.decisionBudget(cfg, quotes, code, { now: clock })
    const syncSafe = cfg._sourceMode === 'local' ? cfg._syncStatus === 'local' : cfg._syncStatus === 'synced'
    const externalBlockers = []
    if (!syncSafe) externalBlockers.push('配置来源未确认一致（' + (cfg._syncStatus || 'unknown') + '），预览禁止执行')
    if (quoteError) externalBlockers.push(quoteError)
    if (externalBlockers.length) {
      decision.approvedCNY = 0
      decision.approvedCNYFen = 0
      decision.status = 'blocked'
      decision.blockers = [...(decision.blockers || []), ...externalBlockers]
    }
    return { ok: true, readOnly: true, revision, researchSupplementVersion: cfg._researchSupplement && cfg._researchSupplement.version || null, dataRevision: cfg.decisionDataRevision || null, sourceMode: cfg._sourceMode || 'cloud', syncStatus: cfg._syncStatus, serverAsOf: new Date(clock).toISOString(), expiresAt: new Date(clock + ttlMs).toISOString(), decision }
  }
}
module.exports = { createDecisionPreview }
