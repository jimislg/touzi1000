#!/usr/bin/env node
/* 个人投资工作平台 · 本地服务（零npm依赖）
 * 启动: node server.js  →  http://localhost:8307
 * 行情代理腾讯接口(qt.gtimg.cn)，服务端GBK转码，绕开浏览器CORS限制。
 * POST /api/config 保存前端修改（持仓/档位/目标本金）到 config.json
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const PORT = process.env.PORT || 8307;
const ROOT = __dirname;

function fetchRemote(url){ return new Promise((resolve,reject)=>{
  http.get(url, res=>{ const cs=[]; res.on('data',c=>cs.push(c)); res.on('end',()=>resolve(Buffer.concat(cs))); })
      .on('error', reject).setTimeout(8000, function(){ this.destroy(new Error('timeout')); });
});}

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

const server = http.createServer(async (req,res)=>{
  const u=new URL(req.url,'http://localhost');
  try{
    if(u.pathname==='/api/quotes'){
      const symbols=u.searchParams.get('symbols')||'';
      const buf=await fetchRemote('http://qt.gtimg.cn/q='+symbols);
      const q=parseQuotes(new TextDecoder('gbk').decode(buf));
      res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
      res.end(JSON.stringify({ok:Object.keys(q).length>0, fetchedAt:new Date().toISOString(), quotes:q}));
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
            ['shares','cost','dps','buyDate'].forEach(k=>{if(p[k]!=null)h[k]=p[k];});});
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
server.listen(PORT,'127.0.0.1',()=>{
  console.log('投资工作平台已启动: http://127.0.0.1:'+PORT);
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
