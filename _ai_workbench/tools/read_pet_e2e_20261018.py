"""Read-only snapshots for the authorized Talo/S1 native pet QA session."""
from pathlib import Path
import json
import re
import sys
from auction_ops_20261015 import connect, run

TASK = Path(__file__).resolve().parents[1] / 'temp/pet_followup_20261018'
NODE = r'''
const {MongoClient}=require('mongodb');
const cfg=require('./src/services/ConfigService').loadAllTables();
(async()=>{const c=new MongoClient('mongodb://127.0.0.1:27017',{maxPoolSize:1});await c.connect();try{
const p=await c.db('lhs_s1001').collection('players').findOne({name:'Talo'},{projection:{_id:0,name:1,userId:1,serverId:1,updatedAt:1,petInfo:1,items:1,currencies:1,'other_attr_info.featureReceipts.rows':1}});
if(!p)throw Error('TEST_ROLE_NOT_FOUND');
const quality=cfg.PetQualityConfig||{},ids=new Set([36,24,25]);
for(const row of Object.values(quality))for(const k of ['consumes','addConsumes','composeConsumes'])for(const x of row[k]||[])if(x.id)ids.add(x.id);
const pets=(p.petInfo?.pets||[]).map(x=>({...x,name:cfg.PetConfig?.[x.id]?.name,quality:cfg.PetConfig?.[x.id]?.quality}));
const rows=(p.other_attr_info?.featureReceipts?.rows||[]).filter(x=>String(x.key).startsWith('3314:')).slice(-5);
console.log(JSON.stringify({at:new Date().toISOString(),directPlayerWrites:0,role:{name:p.name,userId:p.userId,serverId:p.serverId},updatedAt:p.updatedAt,petInfo:{...p.petInfo,pets},items:Object.fromEntries([...ids].map(id=>[id,p.items?.[id]??0])),currencies:p.currencies,quality,base:cfg.PetBaseConfig,receiptKeys:rows.map(x=>x.key),featureReceipts:rows}));
}finally{await c.close()}})().catch(e=>{console.error(e.message);process.exitCode=1});
'''

if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    label = sys.argv[1]
    assert re.fullmatch('[a-z0-9_]+', label)
    c = connect()
    try:
        out = run(c, "cd /linhhoasu/lhs/newServer && node - <<'PET_QA_READ'\n" + NODE + '\nPET_QA_READ', timeout=30)
    finally:
        c.close()
    result = json.loads(next(line for line in reversed(out.splitlines()) if line.startswith('{')))
    (TASK / ('live_' + label + '.json')).write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({k:result[k] for k in ['at','role','items','currencies']} | {'pets':[{k:p.get(k) for k in ['uid','id','level','slot','quality','lock']} for p in result['petInfo']['pets']], 'receiptKeys':result['receiptKeys']},ensure_ascii=False))
