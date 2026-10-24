/* Public research is presentation evidence, never an approval or an account-data migration. */
const fs = require('fs')
function readSupplement (file) {
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (data.schemaVersion !== 1 || typeof data.version !== 'string' || !data.version.trim() || data.presentationOnly !== true || !/^\d{4}-\d{2}-\d{2}$/.test(data.asOf) || !Array.isArray(data.records) || !data.records.length) throw Error('invalid research package')
    const codes = new Set(), ids = new Set()
    for (const row of data.records) {
      if (!row.id || ids.has(row.id) || !Array.isArray(row.codes) || !row.codes.length || !row.thesis || !row.breakers || !row.reviewBy || !Array.isArray(row.remainingGaps) || !Array.isArray(row.sources) || !row.sources.length) throw Error('incomplete research entry')
      ids.add(row.id)
      if (!/^\/research\/[a-z0-9_-]+\.html$/.test(row.reportPath)) throw Error('unsafe report path')
      for (const code of row.codes) {
        if (typeof code !== 'string' || !/^(\d{4,5}\.HK|\d{6}\.(SH|SZ))$/.test(code)) throw Error('invalid research security')
        const key = code.replace(/^(\d+)\.HK$/, (_, n) => n.padStart(5, '0') + '.HK')
        if (codes.has(key)) throw Error('duplicate research security'); codes.add(key)
      }
    }
    return { ...data, presentationOnly: true }
  } catch (_) { return { schemaVersion: 1, presentationOnly: true, status: 'unavailable', records: [] } }
}
module.exports = { readSupplement }
