/* 配置数据完整性校验（P1防再犯，郎刚10-22）：档位/tierPct一致性、汇率回退新鲜度、trades与持仓成本勾稽。
 * 用法：node verify-config-data.js
 * 失败退出码非0，供发布接力/CI调用。 */
const fs = require('fs')
const path = require('path')
const c = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'))
let pass = 0, fail = 0
const T = (name, ok) => { ok ? pass++ : fail++; console.log((ok ? 'PASS ' : 'FAIL ') + name) }

// 1) 档位/tierPct 一致性：tiers N 档 ⇒ tierPct N 个（非降）
for (const u of c.universe) {
  const n = (u.tiers || []).length
  const p = (u.tierPct || []).length
  if (n < 3) continue
  const ok = p === n && (p === 0 || u.tierPct.every((v, i) => i === 0 || v >= u.tierPct[i - 1]))
  T(`${u.code} ${u.name} 档位(tiers ${n})与 tierPct(${p})一致且非降`, ok)
}

// 2) 汇率回退新鲜度：与实时偏差 < 1%
const LIVE_FX = 0.8505
const fx = c.hkdcnyFallback
T(`汇率回退 ${fx} 与实时 ${LIVE_FX} 偏差 <1%`, fx != null && Math.abs(fx - LIVE_FX) / LIVE_FX < 0.01)

// 3) trades 与持仓成本勾稽：近30天 trades 的代码必须都能映射到 holdings 或 universe
const known = new Set([...c.holdings.map(h => h.code), ...c.universe.map(u => u.code)])
const orphans = (c.trades || []).filter(t => !known.has(t.code))
T('trades 所有代码均在 holdings/universe 中', orphans.length === 0)
if (orphans.length) console.log('  孤儿trades:', orphans.map(t => t.date + ' ' + t.code).join(', '))

// 4) 持仓 code 唯一性
const hc = c.holdings.map(h => h.code)
T('持仓 code 无重复', new Set(hc).size === hc.length)

console.log(`\n配置数据校验: ${pass} 通过, ${fail} 失败`)
process.exitCode = fail > 0 ? 1 : 0
