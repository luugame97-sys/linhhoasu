'use strict';
// Reuse the established Egret QA shell, local-only RAM player; no new HTML artifact.
const fs=require('fs'),path=require('path'),http=require('http'),crypto=require('crypto');
const wb=path.resolve(__dirname,'..'),game=path.resolve(wb,'../linhhoasu/webgame/game'),app=path.resolve(wb,'../linhhoasu/lhs/newServer'),out=path.join(wb,'temp/kaka_end_effect_release_20260917');
process.env.CONFIG_BIN_PATH=path.join(out,'config.bin');
function stub(rel,exports){const p=require.resolve(path.join(app,rel));require.cache[p]={id:p,filename:p,loaded:true,exports};}
stub('src/logger',{info(){},warn(){},error(){},debug(){}});
let saved;
stub('src/services/PlayerService',{savePlayer:async(_id,p)=>{saved=JSON.parse(JSON.stringify(p));return saved;},drainPendingSaves:async()=>{}});
stub('src/services/RuntimeBus',{getWsServer:()=>null});
const cfg=require(path.join(app,'src/services/ConfigService')),tables=cfg.loadAllTables();
tables.LanguageConfig=cfg.decodeTables(fs.readFileSync(path.join(game,'update/resource/assets/excel/lang_cn/config_lang_c2fa8585.bin'))).LanguageConfig;
const fashion=require(path.join(app,'src/handlers/fashion')),appearance=require(path.join(app,'src/services/RoleAppearanceService')),receipts=require(path.join(app,'src/services/FeatureReceiptService'));
const p={userId:'local_kaka_qa',playerId:'local_kaka_qa',level:120,roleInfo:{kungfuId:8,subJob:1},items:{},currencies:{diamond:0,silver:0,gold:0},fashionInfo:{fashion:{304:-1},curFashion:{304:-1},fashionMap:{304:-1},equipped:{304:-1},fashions:{},activateFashion:[],fashionData:[],sets:[],setId:0,suits:{},dress:[]}};
for(const id of [28321,28322,28323,28329,28324,28331,28332,28333,28339,28334])appearance.grantFashionOwnership(p,id);
appearance.ensureRoleAppearance(p);const session={userId:p.userId,player:p};
const registry=JSON.parse(fs.readFileSync(path.join(wb,'temp/fashion_current_audit_20260917/resources.json'))).registry;
const resources=Object.fromEntries(Object.entries(registry).map(([key,r])=>[key,'/game/update/resource/'+r.url]));
const shell=fs.readFileSync(path.join(__dirname,'fishing_visual_runtime_20260906.html'),'utf8');
const html=shell.replace('/main.fixed.js','/main.js').replace(/<script>\s*window.inspectRuntime[\s\S]*?<\/script>/,'<script src="/qa.js"></script>');
const allowed={1801:fashion.handleChangeFashion,1802:fashion.handleChangeSuit,1805:fashion.handleFashionChangeSet};
const sockets=new Set();
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://127.0.0.1');res.setHeader('Cache-Control','no-store');
 if(req.method==='POST'&&['/rpc','/relog','/result'].includes(u.pathname)){
  let body='';req.on('data',v=>{body+=v;if(body.length>200000)req.destroy();});req.on('end',async()=>{try{
   const q=JSON.parse(body||'{}');res.setHeader('Content-Type','application/json');
   if(u.pathname==='/result'){const r={...q,serverSelection:session.player.fashionInfo.fashion,productionWrites:0,handlerHash:crypto.createHash('sha256').update(fs.readFileSync(path.join(app,'src/handlers/fashion.js'))).digest('hex')};fs.writeFileSync(path.join(out,'visual.json'),JSON.stringify(r,null,2)+'\n');console.log(JSON.stringify({result:r.result,checks:r.checks?.length}));return res.end('{}');}
   if(u.pathname==='/relog'){session.player=JSON.parse(JSON.stringify(saved||session.player));return res.end(JSON.stringify(session.player));}
   if(q.tag!==2499&&!allowed[q.tag])throw Error('QA_TAG_DENIED');
   const r=q.tag===2499?{tag:2499,msgUid:1,data:receipts.createEpoch(session.player)}:await allowed[q.tag](q.data,session,1);
   return res.end(JSON.stringify(Array.isArray(r)?r:[r]));
  }catch(e){res.statusCode=400;res.end(JSON.stringify({error:e.message}));}});return;
 }
 if(req.method!=='GET'){res.statusCode=405;return res.end();}
 const data={'/config.json':tables,'/resources.json':resources,'/player.json':session.player};
 if(data[u.pathname]){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(data[u.pathname]));}
 if(u.pathname==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(html);}
 let file;
 if(u.pathname==='/main.js')file=path.join(wb,'temp/fashion_current_audit_20260917/client/js/main.min_drop100.js');
 if(u.pathname==='/qa.js')file=path.join(__dirname,'kaka_end_effect_visual_qa_20260917.js');
 if(u.pathname==='/skins.json')file=path.join(wb,'temp/fishing_full_candidate_20260906/visual-skins.json');
 if(u.pathname.startsWith('/game/')){file=path.resolve(game,'.'+decodeURIComponent(u.pathname.slice(5)));if(!file.startsWith(game+path.sep)){res.statusCode=403;return res.end();}
  if(!fs.existsSync(file)&&u.pathname.startsWith('/game/update/resource/')){const cached=path.resolve(out,'resources',u.pathname.slice('/game/update/resource/'.length));if(cached.startsWith(path.join(out,'resources')+path.sep))file=cached;}}
 if(!file||!fs.existsSync(file)){res.statusCode=404;return res.end('missing');}
 res.setHeader('Content-Type',({'.js':'text/javascript; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.json':'application/json'})[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);
});
server.on('connection',s=>{sockets.add(s);s.on('close',()=>sockets.delete(s));});server.listen(18751,'127.0.0.1',()=>console.log('Kaka native QA http://127.0.0.1:18751/'));
process.on('SIGINT',()=>{for(const s of sockets)s.destroy();server.close(()=>process.exit(0));});
