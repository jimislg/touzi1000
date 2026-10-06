#!/usr/bin/env node
/* 个人投资工作平台 · 本地服务（零npm依赖）
 * 启动: node server.js  →  http://localhost:8307
 * 行情代理腾讯接口(qt.gtimg.cn)，服务端GBK转码，绕开浏览器CORS限制。
 * POST /api/config 保存前端修改（持仓/档位/目标本金）到 config.json
 */
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const PORT = process.env.PORT || 8307;
const ROOT = __dirname;
/* 本地默认只绑127.0.0.1；云端沙箱注入PORT环境变量时绑0.0.0.0（发布要求） */
const HOST = process.env.HOST || (process.env.PORT ? '0.0.0.0' : '127.0.0.1');

function fetchRemote(url){ return new Promise((resolve,reject)=>{
  http.get(url, res=>{ const cs=[]; res.on('data',c=>cs.push(c)); res.on('end',()=>resolve(Buffer.concat(cs))); })
      .on('error', reject).setTimeout(8000, function(){ this.destroy(new Error('timeout')); });
});}

function fetchHTTPS(url){ return new Promise((resolve,reject)=>{
  https.get(url, {headers:{'User-Agent':'Mozilla/5.0','Referer':'https://data.eastmoney.com/'}},
    res=>{ const cs=[]; res.on('data',c=>cs.push(c)); res.on('end',()=>resolve(Buffer.concat(cs))); })
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
  const cut=Date.now()-365*86400000, out={};
  for(const h of cfg.holdings){
    const sc=h.market==='HK'?h.code.split('.')[0].padStart(5,'0'):h.code.split('.')[0]; // 港股代码补齐5位(0700→00700)
    const url = h.market==='HK'
      ? `https://datacenter.eastmoney.com/securities/api/data/v1/get?reportName=RPT_HKF10_INFO_DIVIDEND&columns=ALL&filter=(SECURITY_CODE%3D%22${sc}%22)&pageNumber=1&pageSize=12&sortTypes=-1&sortColumns=NOTICE_DATE&source=F10&client=PC`
      : `https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_SHAREBONUS_DET&columns=ALL&filter=(SECURITY_CODE%3D%22${sc}%22)&pageNumber=1&pageSize=12&sortColumns=EX_DIVIDEND_DATE&sortTypes=-1&source=WEB&client=WEB`;
    const out1={dps:0,source:'近12个月无已实施分红记录'};
    try{
      const j=JSON.parse((await fetchHTTPS(url)).toString('utf8'));
      const rows=(j.result&&j.result.data)||[]; const parts=[];
      for(const r of rows){
        const ex=r.EX_DIVIDEND_DATE||'';
        if(!ex||new Date(ex.replace(' ','T')+'+08:00').getTime()<cut)continue;
        if(r.ASSIGN_PROGRESS&&r.ASSIGN_PROGRESS!=='实施分配')continue;
        if(h.market==='HK'){
          const p=parseHKAmount(r.PLAN_EXPLAIN); if(!p)continue;
          const hk=p.cur==='HKD'?p.amt:p.amt/fx;
          out1.dps+=hk; parts.push(`${r.ASSIGN_PERIOD||''}${hk.toFixed(4)}港元·除息${ex.slice(0,10)}`);
        }else{
          const a=(r.PRETAX_BONUS_RMB||0)/10; if(!a)continue;
          out1.dps+=a; parts.push(`${r.REPORT_DATE?r.REPORT_DATE.slice(0,4)+(new Date(r.REPORT_DATE).getMonth()<6?'中期':'年度')+'':''}${a.toFixed(4)}元·除息${ex.slice(0,10)}`);
        }
      }
      if(parts.length)out1.source='近12个月已实施除息合计：'+parts.join(' + ');
      out1.dps=Math.round(out1.dps*10000)/10000;
      out1.auto=true;
    }catch(e){ out1.err=String(e); }
    out[h.code]=out1;
  }
  return {ok:true, fetchedAt:new Date().toISOString(), fx, dividends:out};
}

function parseQuotes(text){
  const out={}; const re=/v_([A-Za-z0-9_]+)="([^"]*)"/g; let m;
  while((m=re.exec(text))){
    const f=m[2].split('~');
    let price=parseFloat(f[3]);
    if(!isFinite(price)||price<=0){ // 外汇等特殊格式：向后找第一个合理数
      for(let i=3;i<12;i++){ const v=parseFloat(f[i]); if(isFinite(v)&&v>0&&v<10){price=v;break;} }
    }
    out[m[1]]={ name:f[1]||'',
      price:(isFinite(price)&&price>0)?price:null,
      prevClose:parseFloat(f[4])||null,
      pct:(f[32]!==undefined&&f[32]!==''&&isFinite(parseFloat(f[32])))?parseFloat(f[32]):null,
      time:(f[30]||'').slice(0,14) };
  }
  return out;
}

/* —— 访问口令闸门：config.json 存在 accessKey 时启用。
 * 线上发布后 URL 可能被他人碰见，而站内是全部持仓成本，必须口令保护。
 * 本地把 accessKey 删除或置空即可关闭闸门。 —— */
function gateCheck(req,res,u){
  let key=null;
  try{key=JSON.parse(fs.readFileSync(path.join(ROOT,'config.json'),'utf8')).accessKey||null;}catch(_){}
  if(!key)return true;
  const cookies=(req.headers.cookie||'').split(/;\s*/).reduce((o,c)=>{const i=c.indexOf('=');
    if(i>0)o[c.slice(0,i)]=decodeURIComponent(c.slice(i+1));return o;},{});
  if(cookies.ak===key)return true;
  if(u.searchParams.get('key')===key){
    res.writeHead(302,{'Set-Cookie':`ak=${encodeURIComponent(key)}; Path=/; HttpOnly; Max-Age=31536000`,'Location':u.pathname||'/'});
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
  const u=new URL(req.url,'http://localhost');
  if(!gateCheck(req,res,u))return;
  try{
    if(u.pathname==='/api/quotes'){
      const symbols=u.searchParams.get('symbols')||'';
      const buf=await fetchRemote('http://qt.gtimg.cn/q='+symbols);
      const q=parseQuotes(new TextDecoder('gbk').decode(buf));
      res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
      res.end(JSON.stringify({ok:Object.keys(q).length>0, fetchedAt:new Date().toISOString(), quotes:q}));
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
      res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
      res.end(fs.readFileSync(path.join(ROOT,'config.json')));
      return;
    }
    if(u.pathname==='/api/config'&&req.method==='POST'){
      let body=''; req.on('data',c=>body+=c);
      req.on('end',()=>{
        try{
          const patch=JSON.parse(body);
          // 合并式保存：以磁盘最新版为基底，只覆盖前端可编辑字段，防止全量覆盖
          const disk=JSON.parse(fs.readFileSync(path.join(ROOT,'config.json')));
          if(patch.targetCapital>0)disk.targetCapital=patch.targetCapital;
          if(typeof patch.cash==='number')disk.cash=patch.cash;
          if(typeof patch.cashYield==='number')disk.cashYield=patch.cashYield;
          const hp={}; (patch.holdings||[]).forEach(h=>{if(h.code)hp[h.code]=h;});
          (disk.holdings||[]).forEach(h=>{const p=hp[h.code];if(!p)return;
            ['shares','cost','dps','buyDate','dpsManual'].forEach(k=>{if(p[k]!=null)h[k]=p[k];});});
          const up={}; (patch.universe||[]).forEach(x=>{if(x.code)up[x.code]=x;});
          (disk.universe||[]).forEach(x=>{const p=up[x.code];if(!p)return;
            ['buyPrice','plan'].forEach(k=>{if(p[k]!==undefined)x[k]=p[k];});});
          const fp=path.join(ROOT,'config.json');
          try{fs.copyFileSync(fp,fp+'.backup');}catch(_){}       // 保险④：写前备份，坏写可回滚
          fs.writeFileSync(fp, JSON.stringify(disk,null,2));
          try{fs.appendFileSync(path.join(ROOT,'server.log'),new Date().toISOString()+' saved: holdings='+(patch.holdings||[]).length+' universe='+(patch.universe||[]).length+'\n');}catch(_){} // 审计留痕
          res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});
          res.end(JSON.stringify({ok:true,savedAt:new Date().toISOString()}));
        }catch(e){ res.writeHead(500,{'Content-Type':'application/json; charset=utf-8'}); res.end(JSON.stringify({ok:false,err:String(e)})); }
      });
      return;
    }
    let p=u.pathname==='/'?'/index.html':u.pathname;
    const file=path.join(ROOT,'public',path.normalize(p));
    if(file.startsWith(path.join(ROOT,'public')) && fs.existsSync(file) && fs.statSync(file).isFile()){
      const ext=path.extname(file);
      const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json'}[ext]||'application/octet-stream';
      res.writeHead(200,{'Content-Type':mime,'Cache-Control':'no-store'});
      res.end(fs.readFileSync(file));
      return;
    }
    res.writeHead(404); res.end('Not Found');
  }catch(e){ res.writeHead(500,{'Content-Type':'application/json'}); res.end(JSON.stringify({ok:false,error:e.message})); }
});
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
