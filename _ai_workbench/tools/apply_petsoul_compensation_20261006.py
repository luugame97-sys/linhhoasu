"""Apply the preflighted, idempotent entitlement backfill and verify it."""
import json
import shlex
from datetime import datetime, timezone
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parent))
from skin_incident_remote import connect, run

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / '_ai_workbench/temp/petsoul_fix_20261006'
MARKER = 'petsoul_wish_entitlement_repair_v1_20261006'
REMOTE_DIR = '/linhhoasu/_ai_workbench/backups/petsoul_fix_20261006'

JS = r'''
const {MongoClient}=require('/linhhoasu/lhs/newServer/node_modules/mongodb');
(async()=>{const c=new MongoClient('mongodb://127.0.0.1:27017',{serverSelectionTimeoutMS:7000,maxPoolSize:3});await c.connect();try{
const ns=(await c.db().admin().listDatabases()).databases.map(x=>x.name).filter(n=>/^lhs_s\d+$/.test(n));const changed=[],conflicts=[];
for(const dbName of ns){const col=c.db(dbName).collection('players');const docs=await col.find({'rechargeInfo.records':{$elemMatch:{id:11000021,count:{$gt:0}}}},{projection:{userId:1,playerId:1,'rechargeInfo.privilegeItem':1,'rechargeInfo.petSoulWishRepairV1':1,'rechargeInfo.records':1}}).limit(10000).toArray();for(const p of docs){const hasMarker=!!p.rechargeInfo?.petSoulWishRepairV1,hasPrivilege=p.rechargeInfo?.privilegeItem?.['44']!==undefined;if(hasMarker||hasPrivilege)continue;const rec=(p.rechargeInfo?.records||[]).find(r=>Number(r.id)===11000021&&Number(r.count)>0);const q={userId:p.userId,playerId:p.playerId,'rechargeInfo.records':{$elemMatch:{id:11000021,count:{$gt:0}}},'rechargeInfo.privilegeItem.44':{$exists:false},'rechargeInfo.petSoulWishRepairV1':{$exists:false}};const u={$set:{'rechargeInfo.privilegeItem.44':-1,'rechargeInfo.petSoulWishRepairV1':{marker:'MARKER',sourcePayId:11000021,recordCount:Number(rec.count),appliedAt:new Date().toISOString()}}};const result=await col.updateOne(q,u);if(result.modifiedCount===1)changed.push({db:dbName,userId:p.userId,playerId:p.playerId});else conflicts.push({db:dbName,userId:p.userId,playerId:p.playerId});}}
const post=[];for(const row of changed){const p=await c.db(row.db).collection('players').findOne({userId:row.userId,playerId:row.playerId},{projection:{_id:0,'rechargeInfo.privilegeItem.44':1,'rechargeInfo.petSoulWishRepairV1':1}});post.push({db:row.db,userId:row.userId,privilege44:p?.rechargeInfo?.privilegeItem?.['44']??null,marker:p?.rechargeInfo?.petSoulWishRepairV1?.marker||null});}console.log(JSON.stringify({changed,conflicts,post,productionWrites:changed.length}));}finally{await c.close()}})().catch(e=>{console.error(e.stack);process.exitCode=1});
'''.replace('MARKER', MARKER)

with connect() as client:
    run(client, 'mkdir -p ' + shlex.quote(REMOTE_DIR))
    plan = json.loads((OUT / 'compensation_plan.json').read_text(encoding='utf-8'))['found']
    stamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
    remote_backup = REMOTE_DIR + '/preimage_' + stamp + '.json'
    with client.open_sftp() as sf:
        with sf.open(remote_backup, 'wb') as handle:
            handle.write(json.dumps(plan, ensure_ascii=False, indent=2).encode('utf-8'))
    result = json.loads(run(client, 'node -', JS))
result['remoteBackup'] = remote_backup
result['at'] = datetime.now(timezone.utc).isoformat()
(OUT / 'compensation_apply.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'changed':len(result['changed']),'conflicts':len(result['conflicts']),'productionWrites':result['productionWrites'],'remoteBackup':remote_backup}, ensure_ascii=False))
