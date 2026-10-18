'use strict';
// Local-only native UI with actual handler transactions and in-memory persistence.
const fs=require('fs'),path=require('path'),http=require('http'),crypto=require('crypto');
const wb=path.resolve(__dirname,'..'),game=path.resolve(wb,'../linhhoasu/webgame/game'),app=path.resolve(wb,'../linhhoasu/lhs/newServer'),out=path.join(wb,'temp/fashion_box_open_20260909');fs.mkdirSync(out,{recursive:true});
const logger=require.resolve(path.join(app,'src/logger'));require.cache[logger]={id:logger,filename:logger,loaded:true,exports:{info(){},warn(){},error(){},debug(){}}};
const cfg=require(path.join(app,'src/services/ConfigService')),tables=cfg.loadAllTables();
tables.LanguageConfig=cfg.decodeTables(fs.readFileSync(path.join(game,'update/resource/assets/excel/lang_cn/config_lang_c2fa8585.bin'))).LanguageConfig;
const players=require(path.join(app,'src/services/PlayerService'));let saved=null;players.savePlayer=async(_id,p)=>(saved=JSON.parse(JSON.stringify(p)),p);players.drainPendingSaves=async()=>{};
const item=require(path.join(app,'src/handlers/item')),fashion=require(path.join(app,'src/handlers/fashion')),receipt=require(path.join(app,'src/services/FeatureReceiptService'));
const player={userId:'local-box-ui',playerId:'local-box-ui',level:120,roleInfo:{kungfuId:8,subJob:1},items:{28350:2,28040:1,29010:1,28340:1,29800:1,28320:1,28370:1},currencies:{diamond:0,silver:0,gold:0},fashionInfo:{curFashion:{},fashion:{},fashionMap:{},equipped:{},fashions:{},activateFashion:[],fashionData:[],sets:[],setId:0,suits:{},dress:[]}};
const session={userId:player.userId,player};
const data=JSON.stringify(tables),index=JSON.parse(fs.readFileSync(path.join(wb,'temp/fashion_rods_audit_20260908/resource-index.json'),'utf8')),resources={};
for(const [key,entries]of Object.entries(index)){const entry=entries.find(r=>!/-pack-entry$/.test(r.type));if(entry)resources[key]='/game/update/resource/'+entry.url;}
const shell=fs.readFileSync(path.join(__dirname,'fishing_visual_runtime_20260906.html'),'utf8');
const html=shell.replace('/main.fixed.js','/game/js/main.min_a6195824.js').replace(/<script>\s*window.inspectRuntime[\s\S]*?<\/script>/,'<script src="/qa.js"></script>');
const sockets=new Set();
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1');res.setHeader('Cache-Control','no-store');
 if(req.method==='POST'&&['/rpc','/result'].includes(url.pathname)){let body='';req.on('data',b=>{body+=b;if(body.length>200000)req.destroy();});req.on('end',async()=>{try{
  const r=JSON.parse(body);res.setHeader('Content-Type','application/json');
  if(url.pathname==='/result'){const report={...r,serverItems:session.player.items,serverFashion:session.player.fashionInfo,productionWrites:0,
    hashes:Object.fromEntries(['lhs-fashion-box-v1.js','lhs-fashion-gear-v1.js'].map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(path.join(game,'js',f))).digest('hex')]))};fs.writeFileSync(path.join(out,'visual.json'),JSON.stringify(report,null,2)+'\n');res.end('{}');console.log(JSON.stringify({uiResult:r.result,checks:r.checks?.length}));return;}
  let response;if(r.tag===2499)response={tag:2499,msgUid:1,data:receipt.createEpoch(session.player)};
  else if(r.tag===1300)response=await item.handleUseItem(r.data,session,1);
  else if(r.tag===1802)response=await fashion.handleChangeSuit(r.data,session,1);
  else throw Error('QA_TAG_NOT_ALLOWED');res.end(JSON.stringify(Array.isArray(response)?response:[response]));
 }catch(e){res.statusCode=400;res.end(JSON.stringify({error:e.message}));}});return;}
 if(req.method!=='GET'){res.statusCode=405;return res.end();}
 if(url.pathname==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(html);}
 if(url.pathname==='/config.json'){res.setHeader('Content-Type','application/json');return res.end(data);}
 if(url.pathname==='/resources.json'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(resources));}
 if(url.pathname==='/player.json'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(session.player));}
 if(url.pathname==='/relog.json'){session.player=JSON.parse(JSON.stringify(saved||session.player));res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(session.player));}
 if(url.pathname==='/skins.json'){res.setHeader('Content-Type','application/json');return fs.createReadStream(path.join(wb,'temp/fishing_full_candidate_20260906/visual-skins.json')).pipe(res);}
 let file;if(url.pathname==='/qa.js')file=path.join(__dirname,'fashion_box_visual_qa_20260909.js');
 else if(url.pathname.startsWith('/game/')){file=path.resolve(game,'.'+decodeURIComponent(url.pathname.slice(5)));if(!file.startsWith(game+path.sep)){res.statusCode=403;return res.end();}}
 if(!file||!fs.existsSync(file)){res.statusCode=404;return res.end('not found');}
 res.setHeader('Content-Type',({'.js':'text/javascript; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.json':'application/json'})[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);
});
server.on('connection',s=>{sockets.add(s);s.on('close',()=>sockets.delete(s));});server.listen(18750,'127.0.0.1',()=>console.log('Box native QA http://127.0.0.1:18750/'));
process.on('SIGINT',()=>{for(const s of sockets)s.destroy();server.close(()=>process.exit(0));});
