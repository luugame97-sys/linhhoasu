"""Pinned-host read-only inventory and selected, non-overwriting release baseline."""
import hashlib,json,sys
from pathlib import Path
sys.dont_write_bytecode=True
from snapshot_web_multiserver_20260906 import connect,run
from release_huyenvu_daily_20260906 import pm2
WB=Path(__file__).resolve().parents[1];OUT=WB/'temp/parallel_events_20260917';BASE=WB/'backups/parallel_events_20260917'
FILES=['src/config/crossServerEventSchedule.json','src/services/CrossServerEventService.js','src/services/CrossEventSettlementService.js',
 'src/services/CrossArenaService.js','src/handlers/cross-rival.js','src/handlers/arena.js','src/router.js']
assert not BASE.exists(),'BASELINE_EXISTS';BASE.mkdir(parents=True);OUT.mkdir(parents=True,exist_ok=True)
s=connect();result={'before':{},'localMatch':{},'beforePm2':pm2(s)}
try:
 with s.open_sftp() as f:
  for rel in FILES+['client/index.html']:
   remote='/linhhoasu/webgame/game/index.html' if rel.startswith('client/') else '/linhhoasu/lhs/newServer/'+rel
   with f.open(remote,'rb') as h:data=h.read()
   target=BASE/rel;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
   digest=hashlib.sha256(data).hexdigest();result['before'][remote]=digest
   local=WB.parent/('linhhoasu/webgame/game/index.html' if rel.startswith('client/') else 'linhhoasu/lhs/newServer/'+rel)
   result['localMatch'][rel]=hashlib.sha256(local.read_bytes()).hexdigest()==digest
 code=r"""const app='/linhhoasu/lhs/newServer',fs=require('fs'),p=require.resolve(app+'/src/logger');require.cache[p]={id:p,filename:p,loaded:true,exports:{info(){},warn(){},error(){},debug(){}}};
const cfg=require(app+'/src/services/ConfigService'),{MongoClient}=require(app+'/node_modules/mongodb');
(async()=>{const c=new MongoClient('mongodb://127.0.0.1:27017',{serverSelectionTimeoutMS:5000});await c.connect();try{
const id=c.db('lhs_s1001'),players=[];for(const sid of [1001,1002,1003,1004])players.push({serverId:sid,
 crossArenaV2:await c.db('lhs_s'+sid).collection('players').countDocuments({'crossArenaInfo.version':2}),
 topArena:await c.db('lhs_s'+sid).collection('players').countDocuments({'topArenaInfo':{$exists:true}})});
const entries=await id.collection('crossevententries').aggregate([{$group:{_id:{cycleKey:'$cycleKey',event:'$event'},count:{$sum:1},maxScore:{$max:'$score'}}}]).toArray();
const settlements=await id.collection('crosseventsettlements').find({},{projection:{_id:1,event:1,cycleKey:1,state:1,cursorAt:1,cutoffAt:1}}).sort({cutoffAt:-1}).limit(16).toArray();
const servers=await id.collection('gameservers').find({serverId:{$in:[1001,1002,1003,1004]}},{projection:{_id:0,serverId:1,openTime:1,running:1,status:1}}).toArray();
console.log(JSON.stringify({now:Date.now(),schedule:require(app+'/src/config/crossServerEventSchedule.json'),entries,settlements,players,servers,
 system317:cfg.get('SystemConfig')[317],system322:cfg.get('SystemConfig')[322],system324:cfg.get('SystemConfig')[324],
 topOpen:Object.values(cfg.get('TopArenaOpenConfig')||{}).slice(0,2),rivalOpen:Object.values(cfg.get('CrossRivalOpenConfig')||{}).slice(0,1)}));
}finally{await c.close();}})().catch(e=>{console.error(e.message);process.exitCode=1;});"""
 result['live']=json.loads(run(s,'node -',code))
 (BASE/'manifest.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
 (OUT/'baseline.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
 print(json.dumps(result,ensure_ascii=True));assert all(result['localMatch'].values()),'LOCAL_DRIFT'
finally:s.close()
