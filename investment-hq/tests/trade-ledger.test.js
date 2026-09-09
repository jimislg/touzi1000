'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');

async function waitForServer(child) {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('server start timeout')), 5000);
    child.stdout.on('data', chunk => {
      if (String(chunk).includes('投资分析中心:')) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.stderr.on('data', chunk => {
      clearTimeout(timer);
      reject(new Error(String(chunk)));
    });
    child.once('exit', code => {
      clearTimeout(timer);
      reject(new Error(`server exited early: ${code}`));
    });
  });
}

async function request(base, pathname, body) {
  const response = await fetch(`${base}${pathname}`, body == null ? undefined : {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return { status: response.status, body: await response.json() };
}

test('成交登记只接受真实成交，并保持股息、重复登记和七席政策口径', async t => {
  const tempData = fs.mkdtempSync(path.join(os.tmpdir(), 'investment-hq-data-'));
  fs.cpSync(path.join(ROOT, 'data'), tempData, { recursive: true });
  const port = 46000 + Math.floor(Math.random() * 3000);
  const child = spawn(process.execPath, ['server.js', String(port)], {
    cwd: ROOT,
    env: { ...process.env, INVESTMENT_HQ_DATA_DIR: tempData },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  t.after(() => {
    child.kill('SIGTERM');
    fs.rmSync(tempData, { recursive: true, force: true });
  });
  await waitForServer(child);
  const base = `http://127.0.0.1:${port}`;

  const initial = await request(base, '/api/bootstrap');
  assert.equal(initial.status, 200);
  assert.equal(initial.body.decisionMetrics.postTriggeredDividend, null, '未配置的候选情景不能显示为0');
  assert.equal(initial.body.decisionMetrics.postPrimaryQueueDividend, null);
  assert.equal(initial.body.portfolio.policyAuthority.status, 'authoritative-execution-policy');

  const unconfirmed = await request(base, '/api/trades', {
    date: '2026-09-08', side: '买入', name: '宇通客车', symbol: '600066.SH',
    quantity: 1, price: 27.91, currency: 'CNY', fxRate: 1, fee: 0
  });
  assert.match(unconfirmed.body.error, /已经真实成交/);

  const missingFx = await request(base, '/api/trades', {
    date: '2026-09-08', side: '买入', name: '腾讯控股', symbol: '0700.HK',
    quantity: 400, price: 435.4, currency: 'HKD', fee: 0, confirmedExecuted: true
  });
  assert.match(missingFx.body.error, /实际结算汇率|有效的港元兑人民币/);

  const eighthWithoutAcknowledgement = await request(base, '/api/trades', {
    date: '2026-09-08', side: '买入', name: '宇通客车', symbol: '600066.SH',
    quantity: 1, price: 27.91, currency: 'CNY', fxRate: 1, fee: 0, confirmedExecuted: true
  });
  assert.match(eighthWithoutAcknowledgement.body.error, /政策违规/);

  const eighthRecorded = await request(base, '/api/trades', {
    date: '2026-09-08', side: '买入', name: '宇通客车', symbol: '600066.SH',
    quantity: 1, price: 27.91, currency: 'CNY', fxRate: 1, fee: 0,
    confirmedExecuted: true, acknowledgePolicyBreach: true
  });
  assert.equal(eighthRecorded.status, 200);
  assert.equal(eighthRecorded.body.trade.policyBreach, true);
  assert.equal(eighthRecorded.body.trade.annualDividendChange, 1.76);
  assert.equal(eighthRecorded.body.portfolio.concentrationPolicy.currentHoldingCount, 8);

  const breached = await request(base, '/api/bootstrap');
  assert.ok(breached.body.decisionMetrics.alerts.some(row => row.title === '实际持仓超过七席上限'));

  const duplicate = await request(base, '/api/trades', {
    date: '2026-09-08', side: '买入', name: '宇通客车', symbol: '600066.SH',
    quantity: 1, price: 27.91, currency: 'CNY', fxRate: 1, fee: 0,
    confirmedExecuted: true, acknowledgePolicyBreach: true
  });
  assert.match(duplicate.body.error, /重复入账/);

  const wanhuaExit = await request(base, '/api/trades', {
    date: '2026-09-08', side: '卖出', name: '万华化学', symbol: '600309.SH',
    quantity: 1200, price: 78.09, currency: 'CNY', fxRate: 1, fee: 0, confirmedExecuted: true
  });
  assert.equal(wanhuaExit.status, 200);
  assert.equal(wanhuaExit.body.trade.annualDividendChange, -1500);
  assert.equal(wanhuaExit.body.portfolio.concentrationPolicy.currentHoldingCount, 7);

  const tencentBuy = await request(base, '/api/trades', {
    date: '2026-09-08', side: '买入', name: '腾讯控股', symbol: '0700.HK',
    quantity: 400, price: 435.4, currency: 'HKD', fxRate: 0.86482, fee: 0, confirmedExecuted: true
  });
  assert.equal(tencentBuy.status, 200);
  assert.equal(tencentBuy.body.trade.resultingQuantity, 500);
  assert.equal(tencentBuy.body.trade.annualDividendChange, 1466.73);

  const targetSave = await request(base, '/api/portfolio', {
    targetPortfolio: tencentBuy.body.portfolio.targetPortfolio
  });
  assert.equal(targetSave.status, 200);
  assert.ok(targetSave.body.portfolio.dividends.perStock.some(row => row.name === '格力电器'), '仍持有的非目标公司股息口径必须保留');
  assert.deepEqual(
    targetSave.body.portfolio.concentrationPolicy.formalNames,
    targetSave.body.portfolio.targetPortfolio.map(row => row.name),
    '正式名单必须与唯一目标组合同步'
  );
});
