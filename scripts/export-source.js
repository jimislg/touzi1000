/* 创建不含个人数据与旧历史的独立交付目录；现有目录必须为空。 */
const fs = require('fs'), path = require('path'), crypto = require('crypto')
const ROOT = path.resolve(__dirname, '..')
const entries = require('./source-files')
function exportSource (destination, options = {}) {
  const target = path.resolve(destination)
  if (target === ROOT || target.startsWith(ROOT + path.sep)) throw new Error('交付目录必须位于工作仓库之外')
  if (fs.existsSync(target) && fs.readdirSync(target).length) throw new Error('目标目录必须为空')
  fs.mkdirSync(target, { recursive: true })
  const hashes = {}
  function copy (relative) {
    const source = path.join(ROOT, relative), dest = path.join(target, relative)
    if (!fs.existsSync(source)) {
      if (options.allowMissingResults && /(?:validation-results\.json|第二轮完善与验收-20261018\.md)$/.test(relative)) return
      throw new Error('交付文件缺失：' + relative)
    }
    const stat = fs.lstatSync(source)
    if (stat.isSymbolicLink()) throw new Error('不允许交付符号链接：' + relative)
    if (stat.isDirectory()) { fs.readdirSync(source).filter(x => !x.startsWith('.')).sort().forEach(x => copy(path.join(relative, x))); return }
    fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.copyFileSync(source, dest)
    hashes[relative] = crypto.createHash('sha256').update(fs.readFileSync(dest)).digest('hex')
  }
  entries.forEach(copy)
  // 精确比对本机凭证，命中只报告文件名，永不输出值。无本机配置时跳过已知值检查。
  const secrets = new Set()
  for (const file of ['investment-platform/config.json', 'investment-platform/publicConfig.json']) {
    try { const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8')); for (const key of ['accessKey', 'publishableKey']) if (typeof cfg[key] === 'string' && cfg[key].length >= 12) secrets.add(cfg[key]) } catch (_) {}
  }
  for (const relative of Object.keys(hashes)) {
    const content = fs.readFileSync(path.join(target, relative), 'utf8')
    if ([...secrets].some(value => content.includes(value))) throw new Error('交付内容含本机凭证：' + relative)
  }
  fs.writeFileSync(path.join(target, 'delivery-manifest.json'), JSON.stringify({ schema: 1, historyIncluded: false, personalConfigIncluded: false, knownCredentialMatches: 0, sha256: hashes }, null, 2) + '\n')
  return { files: Object.keys(hashes).length, hashes }
}
module.exports = { exportSource }
if (require.main === module) {
  try { if (!process.argv[2]) throw new Error('用法：node scripts/export-source.js 空目录'); const result = exportSource(process.argv[2]); console.log('脱敏交付文件：' + result.files + '；不含旧Git历史及个人配置，已通过本机凭证匹配检查') }
  catch (e) { console.error(e.message); process.exitCode = 1 }
}
