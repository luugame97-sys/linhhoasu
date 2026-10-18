from __future__ import annotations

import importlib.util
import json
import shlex
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("h", ROOT / "_ai_workbench/tools/release_artifact_quench_fix_20261009.py")
h = importlib.util.module_from_spec(spec)
spec.loader.exec_module(h)

QUERY = r'''
const {MongoClient}=require('/linhhoasu/lhs/newServer/node_modules/mongodb');
(async()=>{
 const c=new MongoClient('mongodb://127.0.0.1:27017',{serverSelectionTimeoutMS:7000}); await c.connect();
 try {
  const out=[], accounts=[];
  const dbs=(await c.db('admin').admin().listDatabases({nameOnly:true})).databases.map(x=>x.name).filter(x=>/^lhs/.test(x));
  const rx={$regex:'^luvlov9$', $options:'i'};
  for(const dbName of dbs){
    for(const a of await c.db(dbName).collection('accounts').find({accountId:rx},{projection:{_id:0,accountId:1,roles:1,lastSelectedServerId:1}}).limit(3).maxTimeMS(3000).toArray()) accounts.push({db:dbName,...a});
  }
  const users=[...new Set(accounts.flatMap(a=>(a.roles||[]).map(r=>r.userId)))];
  const cfg=require('/linhhoasu/lhs/newServer/src/services/ConfigService'); cfg.loadAllTables();
  const dress=cfg.get('OldTrekShipDressConfig'), uses=cfg.get('AssetsUseConfig'), assets=cfg.get('AssetsConfig'), lang=cfg.get('LanguageConfig');
  const named=r=>!r?r:{...r,localizedName:lang[r.name]||null};
  for(const sid of [1001,1002,1003,1004,1005,1006,1007,1008]){
   const db=c.db('lhs_s'+sid), p=db.collection('players');
   const rows=await p.find({$or:[{name:rx},{userId:{$in:users}}]},{projection:{_id:0,userId:1,playerId:1,name:1,serverId:1,level:1,updatedAt:1,items:1,itemUseRecords:1,shopInfo:1,rechargeInfo:1,'other_attr_info.oldTrekInfo':1,'other_attr_info.record':1,'other_attr_info.featureReceipts':1}}).limit(20).maxTimeMS(3000).toArray();
   for(const row of rows) out.push({db:'lhs_s'+sid,...row});
  }
  console.log(JSON.stringify({result:'PASS',accounts,players:out,shipDress:dress,shipItems:Object.entries(assets).filter(([id,r])=>Number(id)>=300000&&Number(id)<301000).map(([id,r])=>({id,...named(r),use:uses[id]||null}))}));
 } finally { await c.close(); }
})().catch(e=>{console.error(e.stack||e);process.exit(1)});
'''

s = h.connect()
try:
    raw = h.run(s, "node -e " + shlex.quote(QUERY), 60)
finally:
    s.close()

data = json.loads(raw.strip().splitlines()[-1])
out = ROOT / "_ai_workbench/temp/luvlov9_boat_audit_20261011.json"
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"result": data.get("result"), "matches": len(data.get("players", [])), "evidence": str(out)}))
