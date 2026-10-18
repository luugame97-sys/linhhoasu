'use strict';
// Existing native Egret QA shell; synthetic players and RAM persistence only.
const fs=require('fs'),path=require('path'),http=require('http');
const wb=path.resolve(__dirname,'..'),app=path.resolve(wb,'../linhhoasu/lhs/newServer'),game=path.resolve(wb,'../linhhoasu/webgame/game');
const parallelMode=process.argv.includes('--parallel');
const out=path.join(wb,parallelMode?'temp/parallel_events_20260917':'temp/competitions_release_20260917');
const {memoryModel,clone}=require(path.join(app,'scripts/test-competitions-v3'));
const config=require(path.join(app,'src/services/ConfigService')),cross=require(path.join(app,'src/services/CrossServerEventService'));
const appearance=require(path.join(app,'src/services/RoleAppearanceService')),battle=require(path.join(app,'src/services/BattleService'));
const tables=config.loadAllTables();tables.LanguageConfig=config.decodeTables(fs.readFileSync(path.join(game,'update/resource/assets/excel/lang_cn/config_lang_c2fa8585.bin'))).LanguageConfig;
// A local fixture-only clock window; never modifies schedule files or VPS.
if(!parallelMode)cross.schedule.anchor=new Date(Date.now()-8*86400000).toISOString();
const Entry=memoryModel(),Action=memoryModel(),saved=new Map();const sessions=[];
const players={drainPendingSaves:async()=>{},savePlayer:async(id,p)=>{saved.set(id,clone(p));return p;}};
const service=require(path.join(app,'src/services/CrossArenaService')).createService({Entry,Action,players,runtime:{getWsServer:()=>null},
 getServer:async sid=>({serverId:sid,openTime:Date.now()-30*86400000,running:true}),logger:{warn(){}}});
for(let i=1;i<=7;i++){
 const p={_id:i.toString(16).padStart(24,'0'),userId:'visual_comp_'+i,playerId:'visual_comp_'+i,serverId:1001+(i-1)%3,name:['QA Võ Đạo','Kiếm Khách S2','Đạo Hữu S3','Thanh Vân','Bạch Hạc','Linh Phong','Ngọc Kiếm'][i-1],
  level:120,roleInfo:{kungfuId:4,subJob:0,stage:1,stageId:1},boxInfo:{level:1},equipInfo:{curIndex:0,equipSetMap:{0:{}}},fashionInfo:{},petInfo:{pets:[]},
  items:{10:20,110:20},currencies:{diamond:1000,silver:10000,gold:0},systemUnlockInfo:{unlockedSystem:[305,317]}};
 appearance.ensureRoleAppearance(p);sessions.push({serverId:p.serverId,userId:p.userId,player:p});
}
const registry=JSON.parse(fs.readFileSync(path.join(wb,'temp/fashion_current_audit_20260917/resources.json'))).registry;
const resources=Object.fromEntries(Object.entries(registry).map(([k,r])=>[k,'/game/update/resource/'+r.url]));
const shell=fs.readFileSync(path.join(__dirname,'fishing_visual_runtime_20260906.html'),'utf8');
const html=shell.replace('/main.fixed.js','/main.js').replace(/<script>\s*window.inspectRuntime[\s\S]*?<\/script>/,'<script src="/qa.js"></script>');
const sockets=new Set();let ready=false;
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://127.0.0.1');res.setHeader('Cache-Control','no-store');
 if(req.method==='POST'&&['/rpc','/relog','/result'].includes(u.pathname)){
  let body='';req.on('data',b=>{body+=b;if(body.length>256000)req.destroy();});req.on('end',async()=>{try{
   const input=JSON.parse(body||'{}'),s=sessions[0];res.setHeader('Content-Type','application/json');
   if(u.pathname==='/result'){fs.writeFileSync(path.join(out,'visual.json'),JSON.stringify(input,null,2)+'\n');console.log(JSON.stringify({result:input.result,checks:input.checks?.length}));return res.end('{}');}
   if(u.pathname==='/relog'){s.player=clone(saved.get(s.userId)||s.player);return res.end(JSON.stringify(s.player));}
   const allowed={5000:service.info,5001:service.refresh,5002:service.list,2300:service.fight};
   if(parallelMode&&input.tag===6199){const calendar=require(path.join(app,'src/services/CrossEventScheduleService')),now=Date.now();
    return res.end(JSON.stringify([{tag:6199,msgUid:input.msgUid,data:{result:0,version:cross.schedule.version,serverTime:now,serverId:1001,
     events:Object.fromEntries(cross.EVENTS.map(e=>[e,calendar.describe(e,s.player,{openTime:now-30*86400000,running:true},now)]))}}]));}
   if(!allowed[input.tag])throw Error('QA_TAG_DENIED');
   const r=await allowed[input.tag](input.data||{},s,Number(input.msgUid)||1);
   return res.end(JSON.stringify(Array.isArray(r)?r:[r]));
  }catch(e){res.statusCode=400;res.end(JSON.stringify({error:e.message}));}});return;
 }
 if(req.method!=='GET'){res.statusCode=405;return res.end();}
 const data={'/config.json':tables,'/resources.json':resources,'/player.json':sessions[0].player,
  '/state.json':{ready,attrs:battle.calcPlayerPower(sessions[0].player),power:battle.calcPowerScore(battle.calcPlayerPower(sessions[0].player))}};
 if(data[u.pathname]){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(data[u.pathname]));}
 if(u.pathname==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(html);}
 let file;
 if(u.pathname==='/main.js')file=path.join(wb,'temp/fashion_current_audit_20260917/client/js/main.min_drop100.js');
 if(u.pathname==='/qa.js')file=path.join(__dirname,'competitions_visual_qa_20260917.js');
 if(u.pathname==='/skins.json')file=path.join(wb,'temp/fishing_full_candidate_20260906/visual-skins.json');
 if(u.pathname.startsWith('/game/')){file=path.resolve(game,'.'+decodeURIComponent(u.pathname.slice(5)));if(!file.startsWith(game+path.sep)){res.statusCode=403;return res.end();}
  if(!fs.existsSync(file)&&u.pathname.startsWith('/game/update/resource/')){for(const cache of [path.join(wb,'temp/competitions_release_20260917/resources'),path.join(wb,'temp/kaka_end_effect_release_20260917/resources')]){const candidate=path.resolve(cache,u.pathname.slice('/game/update/resource/'.length));if(candidate.startsWith(cache+path.sep)&&fs.existsSync(candidate)){file=candidate;break;}}}}
 if(!file||!fs.existsSync(file)){res.statusCode=404;return res.end('missing');}
 res.setHeader('Content-Type',({'.js':'text/javascript; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.json':'application/json'})[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);
});
server.on('connection',s=>{sockets.add(s);s.on('close',()=>sockets.delete(s));});
(async()=>{for(const s of sessions)await service.info({},s,1);sessions[0].player.crossArenaInfo.challenge.expiresAt=0;await service.info({},sessions[0],2);ready=true;
 server.listen(18753,'127.0.0.1',()=>console.log(JSON.stringify({url:'http://127.0.0.1:18753/',pid:process.pid,productionWrites:0})));})().catch(e=>{console.error(e.stack);process.exitCode=1;});
function stop(){for(const s of sockets)s.destroy();server.close(()=>process.exit(0));}
process.on('SIGINT',stop);process.stdin.setEncoding('utf8');process.stdin.on('data',d=>{if(d.trim()==='quit')stop();});
