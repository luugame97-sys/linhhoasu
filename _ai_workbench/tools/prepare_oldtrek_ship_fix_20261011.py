import importlib.util, hashlib, json, shlex
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'_ai_workbench/temp/oldtrek_ship_fix_20261011'
spec=importlib.util.spec_from_file_location('h',ROOT/'_ai_workbench/tools/release_artifact_quench_fix_20261009.py');h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)
FILES=['services/RewardGrantService.js','services/NativeItemRewardService.js','services/PlayerService.js','services/PlayerMutationService.js','handlers/item.js','handlers/raid.js','handlers/mail.js','handlers/old-trek.js','net/WSServer.js']
QUERY=r'''
const {MongoClient}=require('/linhhoasu/lhs/newServer/node_modules/mongodb');
const cfg=require('/linhhoasu/lhs/newServer/src/services/ConfigService');cfg.loadAllTables();
(async()=>{const c=new MongoClient('mongodb://127.0.0.1:27017',{serverSelectionTimeoutMS:7000});await c.connect();try{
const dress=Object.values(cfg.get('OldTrekShipDressConfig')).filter(r=>r.unlock>0);
const projection={_id:1,userId:1,playerId:1,name:1,serverId:1,isBot:1,managedBot:1,updatedAt:1,moderation:1,'other_attr_info.oldTrekInfo.skin':1,'other_attr_info.oldTrekInfo.shipSkins':1,'other_attr_info.oldTrekInfo.stateRevision':1,'rechargeInfo.records':1};
const or=[];for(const r of dress){projection['items.'+r.id]=1;projection['shopInfo.buyRecords.'+r.unlock]=1;or.push({['items.'+r.id]:{$gt:0}},{['shopInfo.buyRecords.'+r.unlock]:{$gt:0}},{'rechargeInfo.records':{$elemMatch:{id:r.unlock,count:{$gt:0}}}});}
const servers=[];for(let sid=1001;sid<=1008;sid++){
const rows=await c.db('lhs_s'+sid).collection('players').find({$or:or},{projection}).maxTimeMS(10000).toArray();
servers.push({serverId:sid,players:rows.map(p=>({userId:p.userId,playerId:p.playerId,name:p.name,isBot:p.isBot||p.managedBot||false,updatedAt:p.updatedAt,ships:dress.map(r=>({id:r.id,shopId:r.unlock,bag:p.items?.[r.id]||0,owned:(p.other_attr_info?.oldTrekInfo?.shipSkins||[]).includes(r.id),shopCount:p.shopInfo?.buyRecords?.[r.unlock]||0,rechargeCount:(p.rechargeInfo?.records||[]).filter(x=>x.id===r.unlock).reduce((a,x)=>a+x.count,0)}))}))});}
console.log(JSON.stringify({at:new Date().toISOString(),dress:dress.map(r=>({...r,shop:cfg.get('ShopConfig')[r.unlock]})),servers,playerWrites:0}));
}finally{await c.close()}})().catch(e=>{console.error(e.stack);process.exit(1)});
'''
OUT.mkdir(parents=True,exist_ok=True)
s=h.connect()
try:
 hashes={}
 with s.open_sftp() as sf:
  for rel in FILES:
   target=OUT/'baseline'/rel;target.parent.mkdir(parents=True,exist_ok=True)
   with sf.open('/linhhoasu/lhs/newServer/src/'+rel,'rb') as f:data=f.read()
   if target.exists() and target.read_bytes()!=data: raise RuntimeError('BASELINE_DRIFT:'+rel)
   target.write_bytes(data);hashes[rel]=hashlib.sha256(data).hexdigest()
 snapshot=json.loads(h.run(s,'node -e '+shlex.quote(QUERY),60).strip().splitlines()[-1])
 snapshot['hashes']=hashes;snapshot['processes']=h.procs(s)
 (OUT/'preflight.json').write_text(json.dumps(snapshot,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 print(json.dumps({'hashes':hashes,'servers':snapshot['servers']},ensure_ascii=True))
finally:s.close()
