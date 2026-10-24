/* Shared isolated browser harness. No disk writes or network. */
const fs=require('fs'),path=require('path'),vm=require('vm'),CORE=require('./public/investment-core')
module.exports=function runtime(fixture={holdings:[],universe:[]},quotes={}){
 const elements={},storage=new Map(),listeners={},workspaces=['today','account','research','portfolio','tools'].map(workspace=>({dataset:{workspace},hidden:false})),nav=workspaces.map(x=>({dataset:{nav:x.dataset.workspace},setAttribute(k,v){this[k]=v}}))
 const el=id=>elements[id]||(elements[id]={innerHTML:'',textContent:'',value:'',hidden:false,checked:false,style:{},dataset:{},classList:{contains:()=>false,toggle:()=>false,add(){}},_h:{},addEventListener(k,f){this._h[k]=f}})
 const state={cfg:structuredClone(fixture),quotes:structuredClone(quotes),posts:[],configCalls:0,postFail:false}
 const context=vm.createContext({console,InvestmentCore:CORE,Date,location:{hash:''},setTimeout:()=>0,clearTimeout(){},setInterval:()=>0,clearInterval(){},alert(){},document:{getElementById:el,querySelectorAll:s=>s==='[data-workspace]'?workspaces:nav,querySelector:()=>null,documentElement:el('html'),activeElement:null,addEventListener:(k,f)=>listeners[k]=f},window:{addEventListener(){}},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},fetch:async(url,o)=>{
  if(o?.method==='POST'){state.posts.push(JSON.parse(o.body));if(state.postFail)throw Error('lost response');return {ok:true,json:async()=>({ok:true,revision:state.cfg._revision,sourceMode:'local',syncStatus:'local'})}}
  if(url.startsWith('/api/config')){state.configCalls++;return {ok:true,json:async()=>structuredClone(state.cfg)}}
  if(url.startsWith('/api/quotes'))return {ok:true,json:async()=>({ok:true,quotes:structuredClone(state.quotes)})}
  return {ok:true,json:async()=>({ok:false})}
 }})
 let js=fs.readFileSync(path.join(__dirname,'public/index.html'),'utf8').match(/<script>([\s\S]*?)<\/script>\s*<\/body>/)[1];js=js.slice(0,js.indexOf('/* —— 启动 —— */'));vm.runInContext(js,context)
 return {state,el,storage,listeners,workspaces,nav,context,run:code=>vm.runInContext(code,context)}
}
