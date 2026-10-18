"""Read exact Fulu release inputs and bounded diagnostics; no remote writes."""
from pathlib import Path
import hashlib
import json
import sys
from skin_incident_remote import connect, run

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / '_ai_workbench/temp/fulu_qa_20261008'
FILES = [
    'lhs/newServer/src/services/Activity52Service.js',
    'lhs/newServer/src/services/Activity52TaskService.js',
    'lhs/newServer/src/services/EventExposureGate.js',
    'lhs/newServer/src/services/EventRotationRegistry.js',
    'lhs/newServer/src/services/ActivityCycleSchedule.js',
    'lhs/newServer/src/services/MainTaskProgressService.js',
    'lhs/newServer/src/services/SideTaskProgressService.js',
    'lhs/newServer/src/services/RealmTaskProgressService.js',
    'lhs/newServer/src/services/PlayerService.js',
    'lhs/newServer/src/services/FeatureReceiptService.js',
    'lhs/newServer/src/handlers/activity.js',
    'lhs/newServer/src/handlers/task.js',
    'lhs/newServer/src/handlers/playerPayload.js',
    'lhs/newServer/src/handlers/compat.js',
    'lhs/newServer/src/config/eventRotation.json',
    'webgame/game/js/lhs-fulu-safe-v1.js',
    'webgame/game/js/lhs-event-maintenance-v1.js',
    'webgame/game/index.html',
]
NODE = r'''
const fs=require('fs'),cp=require('child_process'),crypto=require('crypto');
const app='/linhhoasu/lhs/newServer';
const cfg=require(app+'/src/services/ConfigService');cfg.loadAllTables();
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const pms=JSON.parse(cp.execFileSync('pm2',['jlist'],{encoding:'utf8'}));
const ports={1001:8080,1002:8083,1003:8084,1004:8085,1005:8086,1006:8087,1007:8088};
const nodes=pms.filter(p=>/^lhs-s100[1-7]$/.test(p.name)).map(p=>{
 const sid=Number(p.name.slice(-4)),e=p.pm2_env;let ready;
 try{ready=JSON.parse(cp.execFileSync('curl',['-fsS','--max-time','5',`http://127.0.0.1:${ports[sid]}/ready`],{encoding:'utf8'}));}catch{ready={status:'failed'};}
 const file=e.pm_out_log_path;let logs=[];
 if(file){const st=fs.statSync(file),n=Math.min(262144,st.size),b=Buffer.alloc(n),fd=fs.openSync(file,'r');try{fs.readSync(fd,b,0,n,st.size-n);}finally{fs.closeSync(fd);}
  logs=b.toString('utf8').split(/\r?\n/).filter(x=>/FULU_|Activity52|EVENT_MAINTENANCE/.test(x)).slice(-12).map(x=>x.replace(/user=[^ ]+/g,'user=[redacted]'));}
 return {name:p.name,pid:p.pid,status:e.status,started:e.pm_uptime,scoped:e.OLD_TREK_SCOPED_CAS||null,ready,logs};
});
const names=['Activity52Config','Activity52ArrangeConfig','ActivityShopConfig','ActivityConfig'];
const config=Object.fromEntries(names.map(n=>[n,cfg.get(n)?.[52001]||null]));
config.TaskConfig=Object.fromEntries([75001,75002,75003,75004,75005].map(i=>[i,cfg.get('TaskConfig')?.[i]]));
config.ShopConfig=Object.fromEntries(Object.keys(config.ActivityShopConfig||{}).map(i=>[i,cfg.get('ShopConfig')?.[i]]));
const source={};for(const rel of ['webgame/game/js/main.min_drop200.js','lhs/newServer/src/services/RewardSync.js','lhs/newServer/src/services/RewardGrantService.js']){const b=fs.readFileSync('/linhhoasu/'+rel);source[rel]={sha256:hash(b),bytes:b.length};}
console.log(JSON.stringify({at:new Date().toISOString(),nodes,config,source,nonGame:pms.filter(p=>!/^lhs-s100[1-7]$/.test(p.name)).map(p=>({name:p.name,pid:p.pid,status:p.pm2_env.status}))}));
'''

def main():
    if (OUT / 'baseline.json').exists():
        raise RuntimeError('BASELINE_ALREADY_EXISTS: reuse or explicitly reconcile drift')
    manifest = {'readOnly': True, 'productionPlayerWrites': 0, 'files': []}
    with connect() as c:
        with c.open_sftp() as sftp:
            for rel in FILES:
                with sftp.open('/linhhoasu/' + rel, 'rb') as remote:
                    data = remote.read()
                local = OUT / 'before' / rel
                local.parent.mkdir(parents=True, exist_ok=True)
                local.write_bytes(data)
                manifest['files'].append({'relative': rel, 'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data)})
        stdout = run(c, 'cd /linhhoasu/lhs/newServer && node -', NODE)
        manifest.update(json.loads(stdout.strip().splitlines()[-1]))
    (OUT / 'baseline.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'at':manifest['at'],'files':manifest['files'],'nodes':manifest['nodes'],'source':manifest['source']}, ensure_ascii=False, indent=2))

def extras():
    manifest=json.loads((OUT/'baseline.json').read_text(encoding='utf-8'))
    known={r['relative']:r for r in manifest['files']}
    with connect() as c:
        with c.open_sftp() as sftp:
            for rel in ['lhs/newServer/src/services/PlayerMutationService.js',
                        'lhs/newServer/src/services/RuntimeBus.js',
                        'lhs/newServer/src/services/TaskDirtyService.js',
                        'lhs/newServer/src/net/WSServer.js']:
                with sftp.open('/linhhoasu/'+rel,'rb') as f: data=f.read()
                digest=hashlib.sha256(data).hexdigest()
                target=OUT/'before'/rel
                if target.exists() and hashlib.sha256(target.read_bytes()).hexdigest()!=digest:
                    raise RuntimeError('EXTRA_BASELINE_DRIFT:'+rel)
                target.parent.mkdir(parents=True,exist_ok=True)
                if not target.exists(): target.write_bytes(data)
                row={'relative':rel,'sha256':digest,'bytes':len(data)}
                if rel not in known: manifest['files'].append(row)
                print(json.dumps(row))
    (OUT/'baseline.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

if __name__ == '__main__':
    extras() if len(sys.argv)>1 and sys.argv[1]=='extras' else main()
