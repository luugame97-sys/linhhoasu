"""Read-back only after release. Never calls gameplay or mutates player data."""
import hashlib
import json
import shlex
import sys
from pathlib import Path
sys.dont_write_bytecode=True
from snapshot_web_multiserver_20260906 import connect
from release_huyenvu_daily_20260906 import run,hashes,pm2
from release_competitions_20260917 import OUT,APP,GAME,ready,arena_env

m=json.loads((OUT/'release.json').read_text(encoding='utf-8'))
assert m['status']=='DEPLOYED'
s=connect()
try:
    current=hashes(s,list(m['after']));assert current==m['after'],'DEPLOYED_HASH_DRIFT'
    state=pm2(s);health=ready(s);assert all(v=='200' for v in health.values())
    env=arena_env(s);assert all(v['ARENA_SETTLEMENT_ENABLED']=='1' and v['ARENA_SETTLEMENT_APPROVED']=='1' for v in env.values())
    public={}
    for rel in ['index.html','js/lhs-arena-v1.js']:
        body=run(s,'curl --fail --silent --show-error --compressed --max-time 12 '+shlex.quote('http://127.0.0.1:81/'+rel))
        digest=hashlib.sha256(body.encode()).hexdigest();assert digest==m['after'][GAME+'/'+rel],'PUBLIC_HASH_MISMATCH:'+rel
        public[rel]=digest
    keep={GAME+'/js/main.min_drop100.js':'9b030e70cdfd3ecd1655df13b9e13cb96f2fcf81761ef969fff9a4f8a58708cb',
        GAME+'/js/lhs-hud-power-full-v1.js':'d1e1695b5e46dfa4f484e483cc9d23a48feaace14583871fff52588d5c1b2773',
        GAME+'/js/lhs-power-cells-full-v1.js':'00f0802d13393a47bb0596b7baf35cbe303e089a0a5e0ef7058c65f546fb8f88'}
    assert hashes(s,list(keep))==keep,'UNRELATED_CLIENT_PATCH_CHANGED'
    js=r"""const fs=require('fs'),APP=ROOT,{MongoClient}=require(APP+'/node_modules/mongodb');
(async()=>{const mongo=new MongoClient('mongodb://127.0.0.1:27017',{serverSelectionTimeoutMS:5000});await mongo.connect();
try{const q={accountId:{$regex:'^qa_cpt_[a-f0-9]{12}$'}},dbs=[];
for(const sid of [1001,1002,1003,1004]){const db=mongo.db('lhs_s'+sid);dbs.push({serverId:sid,qaPlayers:await db.collection('players').countDocuments(q),
 qaFightLogs:await db.collection('arenafightlogs').countDocuments({targetName:{$regex:'^QA Enemy [a-f0-9]{5}$'}})});}
const qaAccounts=await mongo.db('lhs_s1001').collection('accounts').countDocuments(q);
const all=(await mongo.db('admin').admin().listDatabases()).databases.map(r=>r.name);
const qaDatabases=all.filter(n=>/^lhs_qa_comp_v3_20260917_073606_s100[1-4]$/.test(n));
const cfg=require(APP+'/ecosystem.config.js').apps.filter(p=>/^lhs-s100[1-4]$/.test(p.name)).map(p=>({name:p.name,enabled:p.env.ARENA_SETTLEMENT_ENABLED,approved:p.env.ARENA_SETTLEMENT_APPROVED,activation:p.env.ARENA_SETTLEMENT_ACTIVATION_AT}));
const dump=JSON.parse(fs.readFileSync('/root/.pm2/dump.pm2','utf8')).filter(p=>/^lhs-s100[1-4]$/.test(p.name)).map(p=>({name:p.name,enabled:p.ARENA_SETTLEMENT_ENABLED??p.env?.ARENA_SETTLEMENT_ENABLED,approved:p.ARENA_SETTLEMENT_APPROVED??p.env?.ARENA_SETTLEMENT_APPROVED}));
console.log(JSON.stringify({qaAccounts,dbs,qaDatabases,persistentConfig:cfg,bootSnapshot:dump}));}finally{await mongo.close();}})().catch(e=>{console.error(e.message);process.exitCode=1;});
""".replace('APP=ROOT,','APP='+json.dumps(APP)+',')
    detail=json.loads(run(s,'node -',js))
    assert detail['qaAccounts']==0 and not detail['qaDatabases']
    assert all(r['qaPlayers']==r['qaFightLogs']==0 for r in detail['dbs'])
    assert len(detail['persistentConfig'])==len(detail['bootSnapshot'])==4
    assert all(str(r['enabled'])==str(r['approved'])=='1' for r in detail['persistentConfig']+detail['bootSnapshot'])
    before={p['name']:p for p in m['beforePm2']}
    restarts={p['name']:p['restarts']-before[p['name']]['restarts'] for p in state if p['name'].startswith('lhs-s100')}
    assert all(p==before[p['name']] for p in state if not p['name'].startswith('lhs-s100')),'UNRELATED_PROCESS_CHANGED'
    result={'result':'PASS','at':run(s,"date -u '+%FT%TZ'").strip(),'ready':health,'sourceHashes':current,'public':public,
      'arenaEnv':env,'processes':state,'restartDeltasIncludingRollback':restarts,'unchangedClient':keep,**detail}
    (OUT/'postcheck.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({k:v for k,v in result.items() if k not in ['sourceHashes','unchangedClient','processes']},ensure_ascii=True))
finally:s.close()
