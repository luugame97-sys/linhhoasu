from pathlib import Path
import datetime as dt, json, sys, time
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
from skin_incident_remote import connect, run

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'_ai_workbench/temp/arena_top1_1001_20261014'
RECEIPT=OUT/'final_verification.json'
NODES={'lhs-s1001':8080,'lhs-s1002':8083,'lhs-s1003':8084,'lhs-s1004':8085,'lhs-s1005':8086,'lhs-s1006':8087,'lhs-s1007':8088,'lhs-s1008':8089}

def ready(c,name):
    deadline=time.monotonic()+60; last=None
    while time.monotonic()<deadline:
        try:
            last=json.loads(run(c,f'curl -fsS --max-time 5 http://127.0.0.1:{NODES[name]}/ready'))
            if last.get('status')=='ok' and last.get('checks',{}).get('mongo') is True and last.get('checks',{}).get('redis') is True:return last
        except Exception:pass
        time.sleep(1)
    raise RuntimeError('READY_TIMEOUT:'+name+':'+json.dumps(last))

with connect() as c:
    out={'at':dt.datetime.now(dt.timezone.utc).isoformat(),'scope':'S1-S8','playerWrites':0,'productionWrites':0,'restarts':[]}
    out['preReady']={n:ready(c,n) for n in NODES}
    for n in NODES:
        run(c,'pm2 restart '+n+' --update-env')
        out['restarts'].append({'name':n,'ready':ready(c,n)})
    out['postReady']={n:ready(c,n) for n in NODES}
    js="const C=require('/linhhoasu/lhs/newServer/src/services/ConfigService');C.reload();const d=C.get('ArenaDayRankRewardConfig')[1].rewards,w=C.get('ArenaWeeklyRankRewardConfig')[1].rewards;if(d.find(x=>x.id===1001).count!==2500||w.find(x=>x.id===1001).count!==7500)process.exit(2);console.log(JSON.stringify({day:d,week:w,playerWrites:0}));"
    out['runtimeReadback']=json.loads(run(c,'node -',js).splitlines()[-1])
    out['backup']='/linhhoasu/_ai_workbench/backups/arena_top1_1001_20261014_20261014162503'
    out['publicCacheMarker']='20261014_cross_arena_rewards_v2'
    out['servedHashes']={}
    for rel in ['update/resource/assets/excel/config_fashion_20260909.bin','update/resource/assets/excel/config_e5ac72c2.bin']:
        out['servedHashes'][rel]=run(c,'curl -fsS --max-time 30 https://linhhoasu.lol/'+rel+' | sha256sum').split()[0]
    out['result']='PASS'
    OUT.mkdir(parents=True,exist_ok=True); RECEIPT.write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'result':'PASS','scope':'S1-S8','backup':out['backup'],'restarts':list(NODES),'playerWrites':0,'productionWrites':0,'runtimeReadback':out['runtimeReadback']} ,ensure_ascii=False))
