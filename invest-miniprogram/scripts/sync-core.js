/* 唯一源码在网页版 public/investment-core.js；同步不访问网络或个人配置。 */
const fs = require('fs')
const path = require('path')
const source = path.join(__dirname, '../../investment-platform/public/investment-core.js')
const target = path.join(__dirname, '../utils/investment-core.js')
if (process.argv.includes('--check')) {
  if (!fs.existsSync(target) || !fs.readFileSync(source).equals(fs.readFileSync(target))) {
    console.error('共用口径副本不一致，请执行 node scripts/sync-core.js')
    process.exitCode = 1
  }
} else {
  fs.copyFileSync(source, target)
  console.log('已同步网页版共用口径 → 小程序')
}
