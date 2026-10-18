"""Read-only production audit for missing Activity 43/44 and maps 990001-990008."""
import hashlib,json,os,shlex
from datetime import datetime,timezone
from pathlib import Path
import paramiko

ROOT=Path(__file__).resolve().parents[1];APP='/linhhoasu/lhs/newServer';WEB='/linhhoasu/webgame/game'
def run(s,c,timeout=180):
 _,o,e=s.exec_command(c,timeout=timeout);out=o.read().decode('utf8','replace');err=e.read().decode('utf8','replace');code=o.channel.recv_exit_status()
 if code:raise RuntimeError((err+out)[-8000:])
 return out
def main():
 creds=Path(os.environ['LHS_PROD_CREDENTIAL_FILE']).read_text(encoding='utf-8-sig').splitlines();s=paramiko.SSHClient();s.load_system_host_keys();s.set_missing_host_key_policy(paramiko.RejectPolicy());s.connect(creds[0].strip(),username='root',password=creds[2],look_for_keys=False,allow_agent=False,timeout=20)
 stamp=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S');remote='/linhhoasu/_ai_workbench/temp/audit_missing_events_maps_'+stamp+'.js';evidence=ROOT/'temp'/('missing_events_maps_prod_audit_'+stamp+'.json')
 script=r'''const {MongoClient}=require('/linhhoasu/lhs/newServer/node_modules/mongodb');
const C=require('/linhhoasu/lhs/newServer/src/services/ConfigService');
const M=require('/linhhoasu/lhs/newServer/src/services/MapMonsterService');
const SL=require('/linhhoasu/lhs/newServer/src/handlers/serverList');
const fs=require('fs'),path=require('path');
const ids=[43001,44001],maps=[990001,990002,990003,990004,990005,990006,990007,990008],now=Date.now();
function n(x){x=Number(x);return Number.isFinite(x)?x:0}function arr(x){return Array.isArray(x)?x:[]}
function emptyStats(){return{players:0,has43:0,has44:0,active43:0,active44:0,expired43:0,expired44:0,future43:0,future44:0,disabled43:0,disabled44:0,minEnd43:0,maxEnd43:0,minEnd44:0,maxEnd44:0}}
(async()=>{
 C.loadAllTables();const cfg=C.get('ActivityConfig')||{},mapCfg=C.get('MapConfig')||{};
 const configActivities=ids.map(id=>{const x=cfg[id]||{};return{id,activityType:n(x.activityType),area:n(x.area),conditions:arr(x.conditions),exists:!!cfg[id]}});
 const mapConfig=maps.map(id=>{const x=mapCfg[id]||{},slots=M.getSlots(id);return{id,exists:!!mapCfg[id],type:n(x.type),sceneId:n(x.sceneId),bornPoints:arr(x.bornPoints).length,monsterSlots:slots.length}});
 const client=new MongoClient('mongodb://127.0.0.1:27017');await client.connect();const databases={};
 for(const name of ['lhs_s1001','lhs_s1002']){const stats=emptyStats(),cursor=client.db(name).collection('players').find({}, {projection:{'activityInfo.datas':1,'activityInfo.disabledEntryIds':1}});for await(const p of cursor){stats.players++;const info=p.activityInfo||{},rows=arr(info.datas),disabled=arr(info.disabledEntryIds).map(n);for(const id of ids){const row=rows.find(r=>n(r&&r.id)===id),key=id===43001?'43':'44';if(row){stats['has'+key]++;const start=n(row.startTime),end=n(row.endTime);if(start<=now&&end>now)stats['active'+key]++;else if(end<=now)stats['expired'+key]++;else if(start>now)stats['future'+key]++;if(end>0){const minKey='minEnd'+key,maxKey='maxEnd'+key;stats[minKey]=stats[minKey]===0?end:Math.min(stats[minKey],end);stats[maxKey]=Math.max(stats[maxKey],end)}}if(disabled.includes(id))stats['disabled'+key]++}}databases[name]=stats}
 await client.close();
 function walkCount(root){const out={files:0,bytes:0,extensions:{}};if(!fs.existsSync(root))return out;const stack=[root];while(stack.length){const dir=stack.pop();for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const full=path.join(dir,entry.name);if(entry.isDirectory())stack.push(full);else if(entry.isFile()){const size=fs.statSync(full).size,ext=path.extname(entry.name).toLowerCase()||'<none>';out.files++;out.bytes+=size;out.extensions[ext]=(out.extensions[ext]||0)+1}}}return out}
 const mapAssets={greatRuler:walkCount('/linhhoasu/webgame/game/update/resource/assets/map/map_greatRuler_001'),hotSpring:walkCount('/linhhoasu/webgame/game/update/resource/assets/map/map_hotSpring_002')};
 const linkageResponse=SL.handleReqParams({keyList:['linkage']}),linkageParam=JSON.parse(linkageResponse.param.linkage);
 const activityBase=C.get('ActivityBaseConfig')||{};
 console.log('AUDIT_JSON='+JSON.stringify({now,nowIso:new Date(now).toISOString(),configActivities,databases,mapConfig,mapAssets,stats:M.getStats(),linkageParam,activityBase:{linkageStartTime:n(activityBase.linkageStartTime),linkageEndTime:n(activityBase.linkageEndTime),mapId:n(activityBase.mapId),hotSpringMapId:n(activityBase.hotSpringMapId)},linkageOpen:{serverParam:linkageParam.start<=now&&now<linkageParam.end,clientConfig:n(activityBase.linkageStartTime)<=now&&now<n(activityBase.linkageEndTime)}}));
})().catch(e=>{console.error(e.stack);process.exit(1)});'''
 try:
  f=s.open_sftp()
  try:
   with f.open(remote,'wb') as q:q.write(script.encode('utf8'))
  finally:f.close()
  output=run(s,'cd '+APP+' && node '+shlex.quote(remote),180);payload=json.loads(output.split('AUDIT_JSON=',1)[1].splitlines()[0]);hashes=run(s,'sha256sum '+APP+'/src/handlers/activity.js '+APP+'/src/handlers/playerPayload.js '+APP+'/src/services/MapMonsterService.js '+WEB+'/js/main.min_a6195824.js '+WEB+'/index.html').strip();payload.update({'result':'PASS','generatedAt':datetime.now(timezone.utc).isoformat(),'remoteHashes':hashes});evidence.write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n',encoding='utf8');print(json.dumps({'result':'PASS','evidence':str(evidence),'sha256':hashlib.sha256(evidence.read_bytes()).hexdigest(),'now':payload['nowIso'],'activities':payload['databases'],'mapStats':payload['stats']}))
 finally:
  try:run(s,'rm -f -- '+shlex.quote(remote))
  except Exception:pass
  s.close()
if __name__=='__main__':main()
