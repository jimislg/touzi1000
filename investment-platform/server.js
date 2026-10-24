#!/usr/bin/env node
/* 个人投资工作平台 · 本地服务（零npm依赖）
 * 启动: node server.js  →  http://localhost:8307
 * 行情代理腾讯接口(qt.gtimg.cn)，服务端GBK转码，绕开浏览器CORS限制。
 * POST /api/config 以版本检查保存明确编辑；目标本金与审批证据只读
 */
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const PORT = process.env.PORT || 8307;
const ROOT = __dirname;
/* 本地默认只绑127.0.0.1；云端沙箱注入PORT环境变量时绑0.0.0.0（发布要求） */
const HOST = process.env.HOST || (process.env.PORT ? '0.0.0.0' : '127.0.0.1');

/* —— 显式配置来源：VPS使用CONFIG_SOURCE_MODE=local；cloud为保留的兼容通道 —— */
const sourceMode = process.env.CONFIG_SOURCE_MODE || 'cloud';
const store = sourceMode === 'local' ? null : require('./cloud-store');
const CORE = require('./public/investment-core');
const { createConfigService } = require('./config-service');
const configService = createConfigService({ store, sourceMode, file: path.join(ROOT,'config.json') });
const { createDecisionPreview } = require('./decision-preview');
const { readSupplement } = require('./research-supplement');
const researchSupplement = readSupplement(path.join(ROOT, 'public/research-supplement.json'));

function fetchRemote(url){ return new Promise((resolve,reject)=>{
  http.get(url, res=>{ if(res.statusCode!==200){res.resume();reject(new Error('上游HTTP '+res.statusCode));return;} const cs=[]; res.on('data',c=>cs.push(c)); res.on('end',()=>resolve(Buffer.concat(cs))); })
      .on('error', reject).setTimeout(8000, function(){ this.destroy(new Error('timeout')); });
});}

function fetchHTTPS(url){ return new Promise((resolve,reject)=>{
  https.get(url, {headers:{'User-Agent':'Mozilla/5.0','Referer':'https://data.eastmoney.com/'}},
    res=>{ if(res.statusCode!==200){res.resume();reject(new Error('上游HTTP '+res.statusCode));return;} const cs=[]; res.on('data',c=>cs.push(c)); res.on('end',()=>resolve(Buffer.concat(cs))); })
    .on('error', reject).setTimeout(10000, function(){ this.destroy(new Error('timeout')); });
});}

/* —— 分红实时数据：东财数据中心，近12个月已实施除息合计口径 —— */
const DIV_TTL=6*3600*1000; // 缓存6小时（分红数据低频变化，防接口封禁）
function parseHKAmount(txt){ // 港股PLAN_EXPLAIN解析，优先取港元口径
  if(!txt)return null;
  let m=txt.match(/相当于港币([\d.]+)/); if(m)return {amt:parseFloat(m[1]),cur:'HKD'};
  m=txt.match(/每股派港币([\d.]+)/);    if(m)return {amt:parseFloat(m[1]),cur:'HKD'};
  m=txt.match(/每股派(?:人民币)?([\d.]+)/); if(m)return {amt:parseFloat(m[1]),cur:'CNY'};
  return null;
}
async function fetchDividends(){
  const cfg=JSON.parse(fs.readFileSync(path.join(ROOT,'config.json')));
  // 汇率：1港元=fx人民币 → 人民币金额换港元 = ÷fx
  let fx=cfg.hkdcnyFallback||0.9;
  try{ const b=await fetchRemote('http://qt.gtimg.cn/q=whHKDCNY');
    const p=parseQuotes(new TextDecoder('gbk').decode(b)).whHKDCNY;
    if(p&&p.price)fx=p.price;
  }catch(_){}
  const now=Date.now(),cut=now-365*86400000, out={};
  for(const h of cfg.holdings){
    const sc=h.market==='HK'?h.code.split('.')[0].padStart(5,'0'):h.code.split('.')[0]; // 港股代码补齐5位(0700→00700)
    const url = h.market==='HK'
      ? `https://datacenter.eastmoney.com/securities/api/data/v1/get?reportName=RPT_HKF10_INFO_DIVIDEND&columns=ALL&filter=(SECURITY_CODE%3D%22${sc}%22)&pageNumber=1&pageSize=12&sortTypes=-1&sortColumns=NOTICE_DATE&source=F10&client=PC`
      : `https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_SHAREBONUS_DET&columns=ALL&filter=(SECURITY_CODE%3D%22${sc}%22)&pageNumber=1&pageSize=12&sortColumns=EX_DIVIDEND_DATE&sortTypes=-1&source=WEB&client=WEB`;
    const out1={dps:0,source:'近12个月无已实施分红记录',asOf:new Date().toISOString().slice(0,10)};
    try{
      const j=JSON.parse((await fetchHTTPS(url)).toString('utf8'));
      if(j.success===false || !j.result || !Array.isArray(j.result.data))throw new Error('分红数据结构异常');
      const rows=j.result.data; const parts=[];
      for(const r of rows){
        const ex=r.EX_DIVIDEND_DATE||'';
        if(r.ASSIGN_PROGRESS&&r.ASSIGN_PROGRESS!=='实施分配')continue;
        if(!ex)continue;
        const exTime=new Date(ex.replace(' ','T')+(/(?:Z|[+-]\d{2}:\d{2})$/.test(ex)?'':'+08:00')).getTime();
        if(!Number.isFinite(exTime))throw new Error('分红除息日格式异常');
        if(exTime<cut||exTime>now)continue;
        if(h.market==='HK'){
          const p=parseHKAmount(r.PLAN_EXPLAIN); if(!p)throw new Error('港股分红金额无法解析');
          const hk=p.cur==='HKD'?p.amt:p.amt/fx;
          out1.dps+=hk; parts.push(`${r.ASSIGN_PERIOD||''}${hk.toFixed(4)}港元·除息${ex.slice(0,10)}`);
        }else{
          if(r.PRETAX_BONUS_RMB==null||String(r.PRETAX_BONUS_RMB).trim()===''||!Number.isFinite(Number(r.PRETAX_BONUS_RMB))||Number(r.PRETAX_BONUS_RMB)<0)throw new Error('A股分红金额缺失或异常');
          const a=Number(r.PRETAX_BONUS_RMB)/10; if(!a)continue;
          out1.dps+=a; parts.push(`${r.REPORT_DATE?r.REPORT_DATE.slice(0,4)+(new Date(r.REPORT_DATE).getMonth()<6?'中期':'年度')+'':''}${a.toFixed(4)}元·除息${ex.slice(0,10)}`);
        }
      }
      if(parts.length)out1.source='近12个月已实施除息合计：'+parts.join(' + ');
      out1.dps=Math.round(out1.dps*10000)/10000;
      out1.auto=true;
    }catch(e){ out1.dps=null; out1.source='接口失败，保留上次可信值'; out1.err=String(e); }
    out[h.code]=out1;
  }
  return {ok:true, fetchedAt:new Date().toISOString(), fx, dividends:out};
}

const parseQuotes = CORE.parseQuotes;
async function trustedQuotes(symbols){
  const buf=await fetchRemote('http://qt.gtimg.cn/q='+symbols.join(','));
  const quotes=parseQuotes(new TextDecoder('gbk').decode(buf));
  return {ok:CORE.missingSymbols(quotes,symbols).length===0,quotes};
}
const decisionConfigService={read:async()=>Object.assign(await configService.read(),{_researchSupplement:researchSupplement})};
const decisionPreview=createDecisionPreview({configService:decisionConfigService,fetchQuotes:trustedQuotes,core:CORE});

/* —— 访问口令闸门：config.json 存在 accessKey 时启用。
 * 线上发布后 URL 可能被他人碰见，而站内是全部持仓成本，必须口令保护。
 * 本地把 accessKey 删除或置空即可关闭闸门。 —— */
function gateCheck(req,res,u){
  let key=null;
  try{key=JSON.parse(fs.readFileSync(path.join(ROOT,'config.json'),'utf8')).accessKey||null;}catch(_){
    res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:false,err:'访问配置不可用'}));return false;
  }
  if(!key){
    if(HOST==='127.0.0.1'||process.env.LG_MOCK_CLOUD==='1')return true;
    res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:false,err:'请先配置访问口令'}));return false;
  }
  const cookies=(req.headers.cookie||'').split(/;\s*/).reduce((o,c)=>{const i=c.indexOf('=');
    if(i>0){try{o[c.slice(0,i)]=decodeURIComponent(c.slice(i+1));}catch(_){}}return o;},{});
  if(cookies.ak===key)return true;
  if(u.searchParams.get('key')===key){
    res.writeHead(302,{'Set-Cookie':`ak=${encodeURIComponent(key)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=31536000${req.socket&&req.socket.encrypted||req.headers['x-forwarded-proto']==='https'?'; Secure':''}`,'Location':u.pathname||'/'});
    res.end(); return false;
  }
  if(u.pathname.startsWith('/api/')){
    res.writeHead(401,{'Content-Type':'application/json; charset=utf-8'});
    res.end(JSON.stringify({ok:false,err:'unauthorized'})); return false;
  }
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
  res.end('<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>访问验证</title></head>'
    +'<body style="margin:0;font-family:-apple-system,\'PingFang SC\',sans-serif;display:flex;justify-content:center;align-items:flex-start;padding-top:16vh;background:#f4f6f9">'
    +'<form method="GET" style="text-align:center;background:#fff;padding:40px 48px;border-radius:14px;box-shadow:0 4px 24px rgba(0,0,0,.08)">'
    +'<h2 style="margin:0 0 6px;color:#1a2233">投资工作平台</h2>'
    +'<p style="margin:0 0 18px;color:#8a93a6;font-size:13px">请输入访问口令</p>'
    +'<input name="key" type="password" autofocus placeholder="访问口令" required'
    +' style="padding:10px 14px;border-radius:8px;border:1px solid #d8dee8;font-size:15px;width:200px;outline:none">'
    +'<button style="display:block;margin:16px auto 0;padding:10px 36px;border-radius:8px;border:0;background:#2563eb;color:#fff;font-size:15px;cursor:pointer">进入</button>'
    +'</form></body></html>');
  return false;
}

const server = http.createServer(async (req,res)=>{
  if(res.setHeader){res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');}
  let u;try{u=new URL(req.url,'http://localhost');}catch(_){res.writeHead(400);res.end('{}');return;}
  if(!gateCheck(req,res,u))return;
  try{
    if(u.pathname==='/api/decision-preview'){
      if(req.method!=='GET'){res.writeHead(405,{'Content-Type':'application/json','Allow':'GET'});res.end(JSON.stringify({ok:false,err:'只读预览仅接受GET'}));return;}
      const keys=[...u.searchParams.keys()];
      if(keys.some(k=>!['code','revision'].includes(k))||new Set(keys).size!==keys.length){res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:false,err:'预览只接受单一code和revision，不接受客户端金额或资格覆盖'}));return;}
      try{
        const result=await decisionPreview({code:u.searchParams.get('code'),revision:u.searchParams.get('revision')});
        res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(result));
      }catch(e){res.writeHead(e.status||503,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify({ok:false,err:e.status?e.message:'服务端预览不可用，请稍后重试'}));}
      return;
    }
    if(u.pathname==='/api/quotes'){
      const symbols=u.searchParams.get('symbols')||'';
      if(!/^(?:(?:sh|sz)\d{6}|hk\d{5}|whHKDCNY)(?:,(?:(?:sh|sz)\d{6}|hk\d{5}|whHKDCNY))*$/.test(symbols)){
        res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:false,error:'行情代码格式错误'}));return;
      }
      const buf=await fetchRemote('http://qt.gtimg.cn/q='+symbols);
      const q=parseQuotes(new TextDecoder('gbk').decode(buf));
      res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
      const missing=CORE.missingSymbols(q,symbols);
      res.end(JSON.stringify({ok:missing.length===0, fetchedAt:new Date().toISOString(), quotes:q, missing}));
      return;
    }
    if(u.pathname==='/api/dividends'){
      let cache=null;
      try{cache=JSON.parse(fs.readFileSync(path.join(ROOT,'divcache.json'),'utf8'));}catch(_){}
      const age=cache?Date.now()-new Date(cache.fetchedAt).getTime():Infinity;
      const send=(d,tag)=>{ res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}); res.end(JSON.stringify(Object.assign({},d,{tag})) ); };
      if(cache&&age<DIV_TTL){ // 新缓存直接返回；超过一半TTL则后台静默续期
        if(age>DIV_TTL/2) fetchDividends().then(d=>fs.writeFileSync(path.join(ROOT,'divcache.json'),JSON.stringify(d,null,2))).catch(()=>{});
        send(cache,'cache');
        return;
      }
      try{
        const d=await fetchDividends();
        fs.writeFileSync(path.join(ROOT,'divcache.json'),JSON.stringify(d,null,2));
        send(d,'fresh');
      }catch(e){
        if(cache)send(cache,'stale');
        else{ res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'}); res.end(JSON.stringify({ok:false,err:String(e)})); }
      }
      return;
    }
    if(u.pathname==='/api/config'&&req.method==='GET'){
      const cfg=await configService.read();
      cfg._researchSupplement=researchSupplement;
      res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
      res.end(JSON.stringify(cfg));return;
    }
    if(u.pathname==='/api/config'&&req.method==='POST'){
      const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
      let foreign=req.headers['sec-fetch-site']==='cross-site';
      if(req.headers.origin){try{foreign=foreign||new URL(req.headers.origin).host!==req.headers.host;}catch(_){foreign=true;}}
      if(foreign){send(403,{ok:false,err:'拒绝跨站保存'});return;}
      if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||'')){send(415,{ok:false,err:'请使用application/json'});return;}
      let body='',size=0,rejected=false;
      req.on('data',c=>{
        if(rejected)return;
        size+=Buffer.byteLength(c);
        if(size>256*1024){rejected=true;send(413,{ok:false,err:'请求体过大'});return;}
        body+=c;
      });
      req.on('end',async()=>{
        if(rejected)return;
        try{
          let patch;try{patch=JSON.parse(body);}catch(_){send(400,{ok:false,err:'JSON格式错误'});return;}
          const result=await configService.save(patch,patch&&patch.expectedRevision);
          send(200,result);
        }catch(e){send(e.status||500,{ok:false,err:e.status?e.message:'保存未完成，已保留本地记录，请重试'});}
      });return;
    }
    /* 旧 /api/sync 已由云数据库双写取代并移除（2026-10-07） */
    let p=u.pathname==='/'?'/index.html':u.pathname;
    const file=path.join(ROOT,'public',path.normalize(p));
    if(file.startsWith(path.join(ROOT,'public')+path.sep) && fs.existsSync(file) && fs.statSync(file).isFile()){
      const ext=path.extname(file);
      const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json'}[ext]||'application/octet-stream';
      res.writeHead(200,{'Content-Type':mime,'Cache-Control':'no-store'});
      res.end(fs.readFileSync(file));
      return;
    }
    res.writeHead(404); res.end('Not Found');
  }catch(e){ res.writeHead(500,{'Content-Type':'application/json'}); res.end(JSON.stringify({ok:false,error:e.message})); }
});
const retryTimer=setInterval(()=>configService.retry().catch(()=>{}),30000);retryTimer.unref();
server.listen(PORT,HOST,()=>{
  console.log('投资工作平台已启动: http://'+(HOST==='0.0.0.0'?'0.0.0.0':'127.0.0.1')+':'+PORT);
}).on('error',e=>{
  if(e.code==='EADDRINUSE'){ // 已有健康实例在跑：安静退出，避免launchd反复拉起撞端口
    http.get('http://127.0.0.1:'+PORT+'/api/config',r=>{ console.log('端口已被健康实例占用，本实例退出'); process.exit(0); })
        .on('error',()=>{ console.error('端口被占用且探测失败: '+e.message); process.exit(1); });
  } else { console.error('监听失败: '+e.message); process.exit(1); }
});
/* 守护：未捕获异常只记日志不退出（配合launchd KeepAlive双保险） */
const logErr=t=>{ const line=new Date().toISOString()+' ['+t+'] '+ (arguments.length?'':'') + '\n';
  try{ fs.appendFileSync(path.join(ROOT,'server.log'),line); }catch(_){} };
process.on('uncaughtException',e=>{ try{fs.appendFileSync(path.join(ROOT,'server.log'),new Date().toISOString()+' uncaught: '+e.stack+'\n');}catch(_){} });
process.on('unhandledRejection',e=>{ try{fs.appendFileSync(path.join(ROOT,'server.log'),new Date().toISOString()+' unhandledRejection: '+String(e&&e.stack||e)+'\n');}catch(_){} });
