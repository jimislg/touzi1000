#!/usr/bin/env node
// 从 data/docs/ 的文件名生成 docs-index.json
const fs = require('fs');
const path = require('path');

const DOCS_DIR = path.join(__dirname, '..', 'data', 'docs');
const OUT = path.join(__dirname, '..', 'data', 'docs-index.json');

function categorize(name) {
  if (name.includes('SOP') || name.includes('框架') || name.includes('批判性审阅') || name.includes('投资分析法')) return '方法论';
  if (name.includes('两步投资分析')) return '两步法深度分析';
  if (name.includes('1000万') || name.includes('建仓') || name.includes('执行卡') || name.includes('执行清单') || name.includes('价格表')) return '组合与建仓';
  if (name.includes('茅台')) return '茅台专题';
  if (name.includes('丹书') || name.includes('璟恒') || name.includes('岁寒')) return '私募与外部审计';
  if (name.includes('比较') || name.includes('对比') || name.includes('类比')) return '比较研究';
  if (name.includes('决策') || name.includes('审计') || name.includes('压力测试') || name.includes('复核') || name.includes('推演') || name.includes('倒算')) return '决策与审计';
  return '专题研究';
}

const files = fs.readdirSync(DOCS_DIR).filter(f => f.endsWith('.md')).map(f => {
  const m = f.match(/-(\d{8})\.md$/);
  const date = m ? `${m[1].slice(0,4)}-${m[1].slice(4,6)}-${m[1].slice(6,8)}` : null;
  const stat = fs.statSync(path.join(DOCS_DIR, f));
  return { file: f, title: f.replace(/-\d{8}\.md$/, '').replace(/\.md$/, ''), date, category: categorize(f), sizeKb: Math.round(stat.size / 102.4) / 10 };
}).sort((a, b) => (b.date || '').localeCompare(a.date || ''));

fs.writeFileSync(OUT, JSON.stringify({ total: files.length, docs: files }, null, 2), 'utf8');
console.log(`docs-index.json: ${files.length} 篇`);
const byCat = {};
files.forEach(f => byCat[f.category] = (byCat[f.category] || 0) + 1);
console.log(byCat);
