"""CAS/idempotent Pet Soul Wish entitlement compensation."""
import json
import shlex
import sys
from datetime import datetime, timezone
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from skin_incident_remote import connect, run

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / '_ai_workbench/temp/petsoul_fix_20261006'
MARKER = 'petsoul_wish_entitlement_repair_v1_20261006'
REMOTE_BACKUP = '/linhhoasu/_ai_workbench/backups/petsoul_fix_20261006'

JS_TEMPLATE = r'''
const {MongoClient}=require('/linhhoasu/lhs/newServer/node_modules/mongodb');
const mode=MODE,marker=MARKER;
(async()=>{const c=new MongoClient('mongodb://127.0.0.1:27017',{serverSelectionTimeoutMS:7000,maxPoolSize:3});await c.connect();try{
const names=(await c.db().admin().listDatabases()).databases.map(x=>x.name).filter(n=>/^lhs_s\d+$/.test(n));const found=[],changed=[],conflicts=[],post=[];
for(const dbName of names){const col=c.db(dbName).collection('players');const docs=await col.find({'rechargeInfo.records':{$elemMatch:{id:11000021,count:{$gt:0}}}},{projection:{userId:1,playerId:1,name:1,isBot:1,'rechargeInfo.records':1,'rechargeInfo.privilegeItem':1,'rechargeInfo.petSoulWishRepairV1':1,'items.287':1,updatedAt:1}}).limit(10000).toArray();for(const p of docs){const rec=(p.rechargeInfo?.records||[]).find(r=>Number(r.id)===11000021&&Number(r.count)>0),privilege=p.rechargeInfo?.privilegeItem?.['44'],markerRow=p.rechargeInfo?.petSoulWishRepairV1,row={db:dbName,userId:p.userId,playerId:p.playerId,name:p.name,isBot:!!p.isBot,recordCount:Number(rec?.count||0),privilege44:privilege??null,item287:Number(p.items?.[287]||0),marker:markerRow||null,updatedAt:p.updatedAt};found.push(row);if(markerRow||privilege!==undefined||mode!=='commit')continue;const filter={userId:p.userId,playerId:p.playerId,'rechargeInfo.records':{$elemMatch:{id:11000021,count:{$gt:0}}},'rechargeInfo.privilegeItem.44':{$exists:false},'rechargeInfo.petSoulWishRepairV1':{$exists:false}},result=await col.updateOne(filter,{$set:{'rechargeInfo.privilegeItem.44':-1,'rechargeInfo.petSoulWishRepairV1':{marker,sourcePayId:11000021,recordCount:Number(rec.count),appliedAt:new Date().toISOString()}}});if(result.modifiedCount===1)changed.push({...row,action:'ENTITLEMENT44_APPLIED'});else conflicts.push({...row,action:'CAS_CONFLICT'});}}
if(mode==='commit')for(const row of changed){const p=await c.db(row.db).collection('players').findOne({userId:row.userId,playerId:row.playerId},{projection:{_id:0,'rechargeInfo.privilegeItem.44':1,'rechargeInfo.petSoulWishRepairV1':1}});post.push({db:row.db,userId:row.userId,privilege44:p?.rechargeInfo?.privilegeItem?.['44']??null,marker:p?.rechargeInfo?.petSoulWishRepairV1||null});}console.log(JSON.stringify({mode,marker,found,changed,conflicts,post,productionWrites:mode==='commit'?changed.length:0}));}finally{await c.close()}})().catch(e=>{console.error(e.stack);process.exitCode=1});
'''

def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else 'plan'
    if mode not in ('plan', 'commit'): raise SystemExit('usage: plan|commit')
    js = JS_TEMPLATE.replace('MODE', json.dumps(mode)).replace('MARKER', json.dumps(MARKER))
    with connect() as client:
        data = json.loads(run(client, 'node -', js))
        if mode == 'commit':
            run(client, 'mkdir -p ' + shlex.quote(REMOTE_BACKUP))
            backup_path = REMOTE_BACKUP + '/compensation_' + datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S') + '.json'
            plan_file = OUT / 'compensation_plan.json'
            backup_rows = json.loads(plan_file.read_text(encoding='utf-8'))['rows'] if plan_file.exists() else data['found']
            with client.open_sftp() as sf:
                with sf.open(backup_path, 'wb') as handle: handle.write(json.dumps(backup_rows, ensure_ascii=False, indent=2).encode('utf-8'))
            data['remoteBackup'] = backup_path
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / ('compensation_plan_v2.json' if mode == 'plan' else 'compensation_commit_v2.json')).write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'mode':mode,'found':len(data['found']),'changed':len(data['changed']),'conflicts':len(data['conflicts']),'productionWrites':data['productionWrites'],'remoteBackup':data.get('remoteBackup')}, ensure_ascii=False))

if __name__ == '__main__': main()
