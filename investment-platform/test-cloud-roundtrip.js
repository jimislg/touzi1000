/* 云数据库连通性实证：本地Node → 数据面 → PostgreSQL 读写闭环 */
const { createWorkBuddyCloud } = require('@tencent-ai/workbuddy-cloud-sdk');
const pc = require('./publicConfig.json');
const cloud = createWorkBuddyCloud({ endpoint: pc.endpoint, publishableKey: pc.publishableKey });
(async () => {
  // 1) 读（应为空表）
  let r = await cloud.database.from('app_config').select('*').eq('key', 'config').maybeSingle();
  console.log('① 初始读:', r.error ? 'ERROR ' + JSON.stringify(r.error) : (r.data ? '已有行' : '空表（符合预期）'));
  if (r.error) process.exit(1);
  // 2) 写（upsert 测试标记）
  const probe = { key: 'config', data: { _probe: 'cloud-roundtrip-' + Date.now() } };
  r = await cloud.database.from('app_config').upsert(probe).select();
  console.log('② 写入:', r.error ? 'ERROR ' + JSON.stringify(r.error) : (Array.isArray(r.data) && r.data.length ? 'OK 返回' + r.data.length + '行' : '空返回(RLS拦截?)'));
  if (r.error || !r.data || !r.data.length) process.exit(1);
  // 3) 回读验证
  r = await cloud.database.from('app_config').select('data, updated_at').eq('key', 'config').maybeSingle();
  console.log('③ 回读:', r.data && r.data.data && r.data.data._probe ? 'OK marker=' + r.data.data._probe : 'FAIL ' + JSON.stringify(r.data));
  console.log('④ updated_at:', r.data && r.data.updated_at);
  process.exit(r.data && r.data.data && r.data.data._probe ? 0 : 1);
})().catch(e => { console.error('异常:', e.message || e); process.exit(1); });
