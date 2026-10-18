"""Read-only exact task-handler snapshot and event task configuration."""
import base64, hashlib, json, shlex
from pathlib import Path
from release_petsoul_day1_20261007 import connect, run
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'_ai_workbench/temp/event_goal_20261007/exposure'
ssh=connect()
try:
    hashes=[]
    for rel in ['lhs/newServer/src/handlers/task.js','lhs/newServer/src/handlers/index.js']:
        data=base64.b64decode(run(ssh,'base64 -w0 '+shlex.quote('/linhhoasu/'+rel),60))
        target=OUT/'before'/rel
        target.parent.mkdir(parents=True,exist_ok=True)
        target.write_bytes(data)
        hashes.append({'relative':rel,'sha256':hashlib.sha256(data).hexdigest()})
    js="""const c=require('/linhhoasu/lhs/newServer/src/services/ConfigService');c.loadAllTables();const out={};for(const name of ['TaskConfig','ActivityConfig','Activity21Config','Activity21BaseConfig','Activity27Config','Activity30Config','Activity52Config','ActivityTaskConfig']){const rows=c.get(name);if(name==='TaskConfig')out[name]=Object.fromEntries(Object.entries(rows||{}).filter(([k,v])=>Number(v.type)===6||Number(k)>=75001&&Number(k)<=75005));else if(name==='ActivityConfig')out[name]=Object.fromEntries(Object.entries(rows||{}).filter(([k,v])=>[21,27,30,52].includes(Number(v.activityType))));else out[name]=rows;}console.log(JSON.stringify(out));"""
    result=json.loads(run(ssh,'node -e '+shlex.quote(js),60).strip().splitlines()[-1])
    (OUT/'task-baseline.json').write_text(json.dumps({'files':hashes,'config':result},ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'files':hashes,'tables':list(result)}))
finally: ssh.close()
