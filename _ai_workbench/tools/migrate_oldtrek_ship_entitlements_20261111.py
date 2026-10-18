from __future__ import annotations
import importlib.util, json, shlex
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('h',ROOT/'_ai_workbench/tools/release_artifact_quench_fix_20261009.py');h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)
QUERY=r'''
const {MongoClient}=require('/linhhoasu/lhs/newServer/node_modules/mongodb');
const cfg=require('/linhhoasu/lhs/newServer/src/services/ConfigService');cfg.loadAllTables();
const ships=Object.values(cfg.get('OldTrekShipDressConfig')).filter(r=>r.unlock>0).map(r=>({id:Number(r.id),shopId:Number(r.unlock)}));
(async()=>{const c=new MongoClient('mongodb://127.0.0.1:27017',{serverSelectionTimeoutMS:7000});await c.connect();
const report={at:new Date().toISOString(),result:'PASS',playerWrites:0,servers:[],skipped:[],repaired:[]};
try{for(let sid=1001;sid<=1008;sid++){const col=c.db('lhs_s'+sid).collection('players');const or=[];for(const s of ships){or.push({['shopInfo.buyRecords.'+s.shopId]:{$gt:0}},{'rechargeInfo.records':{$elemMatch:{id:s.shopId,count:{$gt:0}}}})}const rows=await col.find({isBot:{$ne:true},managedBot:{$ne:true},$or:or}).toArray();let server={serverId:sid,candidates:rows.length,repaired:0,casMiss:0};
for(const p of rows){const oldInfo=JSON.parse(JSON.stringify(p.other_attr_info?.oldTrekInfo||{}));const oldItems=JSON.parse(JSON.stringify(p.items||{}));const oldShop=JSON.parse(JSON.stringify(p.shopInfo||{}));const oldRecharge=JSON.parse(JSON.stringify(p.rechargeInfo||{}));const info=JSON.parse(JSON.stringify(oldInfo));info.shipSkins=Array.isArray(info.shipSkins)?info.shipSkins.slice():[];let grants=[];let itemChanges=[];
for(const s of ships){const bought=Number(oldShop.buyRecords?.[s.shopId]||0)+((oldRecharge.records||[]).filter(x=>Number(x.id)===s.shopId).reduce((a,x)=>a+Number(x.count||0),0));if(bought<=0)continue;if(!info.shipSkins.includes(s.id)){info.shipSkins.push(s.id);grants.push({shipId:s.id,shopId:s.shopId,bought});if(Number(oldItems[s.id]||0)>0){oldItems[s.id]=Number(oldItems[s.id])-1;if(oldItems[s.id]<=0)delete oldItems[s.id];itemChanges.push({id:s.id,count:-1});}}}
if(!grants.length){report.skipped.push({serverId:sid,userId:p.userId,reason:'already_owned'});continue;}
info.shipSkins=[...new Set(info.shipSkins.map(Number).filter(x=>x>0))];info.stateRevision=Math.max(Number(info.stateRevision||0),Number(p.other_attr_info?.oldTrekInfo?.stateRevision||0))+1;
const marker='oldTrekShipFix20261111';const moderation={...(p.moderation||{})};if(moderation[marker]){report.skipped.push({serverId:sid,userId:p.userId,reason:'receipt_exists'});continue;}moderation[marker]={at:new Date().toISOString(),serverId:sid,userId:p.userId,grants,itemChanges};
const filter={userId:p.userId,other_attr_info:p.other_attr_info||{},items:p.items||{},shopInfo:p.shopInfo||{},rechargeInfo:p.rechargeInfo||{}};const wr=await col.updateOne(filter,{$set:{'other_attr_info.oldTrekInfo':info,items:oldItems,moderation}});if(Number(wr.matchedCount||wr.n||0)!==1){server.casMiss++;report.casMiss=(report.casMiss||0)+1;continue;}const rb=await col.findOne({userId:p.userId},{projection:{_id:0,userId:1,serverId:1,'other_attr_info.oldTrekInfo.shipSkins':1,items:1,moderation:1}});if(!rb?.moderation?.[marker]||!(rb.other_attr_info?.oldTrekInfo?.shipSkins||[]).some(x=>x===grants[0].shipId))throw Error('READBACK:'+p.userId);server.repaired++;report.playerWrites++;report.repaired.push({serverId:sid,userId:p.userId,name:p.name,grants,itemChanges,shipSkins:rb.other_attr_info.oldTrekInfo.shipSkins});}
report.servers.push(server);}console.log(JSON.stringify(report));}finally{await c.close()}})().catch(e=>{console.error(e.stack||e);process.exit(1)});
'''
s=h.connect()
try: raw=h.run(s,'node -e '+shlex.quote(QUERY),120)
finally: s.close()
data=json.loads(raw.strip().splitlines()[-1]);out=ROOT/'_ai_workbench/temp/oldtrek_ship_fix_20261111/migration.json';out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');print(json.dumps({'result':data['result'],'playerWrites':data['playerWrites'],'repaired':data['repaired'],'casMiss':data.get('casMiss',0),'evidence':str(out)}))
