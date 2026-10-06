/* 云数据库配置存取：app_config 单行（key=config，JSONB）。
 * 设计原则：云端=唯一数据源；本调用层失败永不抛出，返回 {ok:false}，由 server.js 降级到本地缓存。
 * 客户端一律由 publicConfig.json 初始化（endpoint+publishableKey），不在代码里写死。 */
const fs = require('fs'), path = require('path');
let cloud = null;
function client(){
  if (cloud) return cloud;
  const pc = JSON.parse(fs.readFileSync(path.join(__dirname,'publicConfig.json'),'utf8'));
  const { createWorkBuddyCloud } = require('@tencent-ai/workbuddy-cloud-sdk');
  cloud = createWorkBuddyCloud({ endpoint: pc.endpoint, publishableKey: pc.publishableKey });
  return cloud;
}
async function read(){
  try{
    const r = await client().database.from('app_config').select('data').eq('key','config').maybeSingle();
    if (r.error) throw new Error(JSON.stringify(r.error).slice(0,200));
    return { ok:true, cfg: r.data ? r.data.data : null };
  }catch(e){ return { ok:false, err:String(e.message||e).slice(0,200) }; }
}
async function write(cfg){
  try{
    const r = await client().database.from('app_config').upsert({ key:'config', data:cfg, updated_at:new Date().toISOString() }, { onConflict:'key' }).select();
    if (r.error) throw new Error(JSON.stringify(r.error).slice(0,200));
    if (!Array.isArray(r.data) || !r.data.length) throw new Error('upsert空返回（被策略拦截）');
    return { ok:true };
  }catch(e){ return { ok:false, err:String(e.message||e).slice(0,200) }; }
}
module.exports = { read, write };
