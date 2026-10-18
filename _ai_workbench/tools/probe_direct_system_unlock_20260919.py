"""Read-only server-side proof that FORCE_UNLOCK_SYSTEM_IDS yields 209/216."""
import json
import shlex
import sys
from pathlib import Path

sys.dont_write_bytecode = True
WB = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(WB / 'temp/pydeps'))
from snapshot_web_multiserver_20260906 import connect, run

CODE = r'''
const cp=require('child_process');const ps=JSON.parse(cp.execFileSync('pm2',['jlist'],{encoding:'utf8'}));const p=ps.find(x=>x.name==='lhs-s1003');const env={...process.env,...(p.pm2_env.env||{})};
const child=cp.spawnSync(process.execPath,['-e',`const mongoose=require('/linhhoasu/lhs/newServer/node_modules/mongoose');const Player=require('/linhhoasu/lhs/newServer/src/db/models/Player');const up=require('/linhhoasu/lhs/newServer/src/handlers/upgrade');(async()=>{await mongoose.connect(process.env.MONGO_URI,{serverSelectionTimeoutMS:7000});const p=await Player.findOne({userId:'u_Wk_1003_7a09bf_1789278201013'}).lean();if(!p)throw Error('TARGET_MISSING');const changed=await up.refreshSystemUnlockInfo(p);console.log(JSON.stringify({changed,unlocked:(p.systemUnlockInfo&&p.systemUnlockInfo.unlockedSystem||[]).filter(x=>[209,216,219,220,222,311,313].includes(Number(x))),productionWrites:0}));await mongoose.disconnect()})().catch(e=>{console.error(e.stack);process.exit(1)})`],{env,encoding:'utf8'});process.stdout.write(child.stdout||'');process.stderr.write(child.stderr||'');process.exit(child.status||0);
'''

ssh = connect()
try:
    CODE = CODE.replace('\\n', '\n')
    data = json.loads(run(ssh, 'node -e ' + shlex.quote(CODE)))
finally:
    ssh.close()
print(json.dumps(data, ensure_ascii=False))
