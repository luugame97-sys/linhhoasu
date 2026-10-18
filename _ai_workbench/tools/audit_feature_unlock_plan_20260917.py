"""Read-only planning inventory. Existing pinned SSH helper; remote program through stdin."""
import hashlib
import json
import sys
from pathlib import Path

sys.dont_write_bytecode = True
WB = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(WB / 'temp/pydeps'))
from snapshot_web_multiserver_20260906 import connect, run

out = WB / 'temp/feature_unlock_plan_20260917'
out.mkdir(parents=True, exist_ok=True)
mode = sys.argv[1] if len(sys.argv) > 1 else 'inventory'
if mode not in ('inventory', 'sources', 'scope', 'status'):
    raise SystemExit('Unknown mode')
ssh = connect()
try:
    if mode == 'status':
        code = r'''
'use strict';
const fs=require('fs'),crypto=require('crypto'),{execFileSync}=require('child_process');
const app='/linhhoasu/lhs/newServer',game='/linhhoasu/webgame/game';
const all=JSON.parse(execFileSync('pm2',['jlist'],{encoding:'utf8',timeout:10000}));
const nodes=all.filter(p=>/^lhs-s100[1-4]$/.test(p.name));
if(nodes.length!==4||nodes.some(p=>p.pm2_env.pm_cwd!==app))throw Error('RUNTIME_MISMATCH');
const common=require(app+'/node_modules/dotenv').parse(fs.readFileSync(app+'/.env'));
const state=p=>({name:p.name,pid:p.pid,status:p.pm2_env.status,restarts:p.pm2_env.restart_time});
const keys=['FEATURE_UNLOCK_DAY1_ENABLED','FEATURE_SIDE_TASKS_ENABLED','FEATURE_SIDE_TASK_ROOTS'];
const out={at:new Date().toISOString(),productionWrites:0,realPlayerWrites:0,
 processes:nodes.map(p=>({...state(p),flags:Object.fromEntries(keys.map(k=>[k,p.pm2_env[k]??common[k]??null]))})),files:{}};
const files=['src/handlers/upgrade.js','src/handlers/playerPayload.js','src/handlers/task.js','src/handlers/arena.js',
 'src/handlers/account.js','src/services/ConfigService.js','src/services/CrossArenaService.js',
 'src/services/CrossServerEventService.js','src/services/SideTaskProgressService.js','src/config/featureUnlockDay1.js'];
for(const rel of files){const p=app+'/'+rel;out.files[p]=fs.existsSync(p)?crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'):null;}
for(const rel of ['index.html','js/lhs-feature-day1-v1.js','js/lhs-cross-events-v2.js']){const p=game+'/'+rel;
 out.files[p]=fs.existsSync(p)?crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'):null;}
const index=fs.readFileSync(game+'/index.html','utf8');out.index={day1:index.includes('lhs-feature-day1-v1.js'),parallelEvents:index.includes('lhs-cross-events-v2.js')};
out.ageGateSource={};
for(const rel of ['src/services/CrossArenaService.js','src/services/CrossServerEventService.js']){
 out.ageGateSource[rel]=fs.readFileSync(app+'/'+rel,'utf8').split('\n').map((text,index)=>({line:index+1,text}))
  .filter(r=>/openDay|serverDay|serverRunDay|ageDays|minServerDay|DAY_GATE|SERVER_DAY|condition.type === 5|condition.type===5/.test(r.text)).slice(0,18);
}
(async()=>{out.ready={};for(const port of [8080,8083,8084,8085]){
 const res=await fetch('http://127.0.0.1:'+port+'/ready',{signal:AbortSignal.timeout(6000)});out.ready[port]=res.status;
}const after=JSON.parse(execFileSync('pm2',['jlist'],{encoding:'utf8',timeout:10000}));
out.processesUnchanged=JSON.stringify(all.filter(p=>/^lhs-/.test(p.name)).map(state))===JSON.stringify(after.filter(p=>/^lhs-/.test(p.name)).map(state));
console.log(JSON.stringify(out));})().catch(e=>{console.error(e.stack);process.exitCode=1;});
'''
        data = json.loads(run(ssh, 'node -', code))
        release = WB / 'temp/feature_unlock_release_20260917'
        baseline = json.loads((release / 'baseline.json').read_text(encoding='utf-8'))['files']
        data['baselineDrift'] = [p for p, value in data['files'].items()
                                 if p in baseline and value != baseline[p]['sha256']]
        data['candidateNewFilesPresentOnLive'] = [p for p in data['files']
            if p.endswith(('SideTaskProgressService.js','featureUnlockDay1.js','lhs-feature-day1-v1.js'))
            and data['files'][p] is not None]
        data['localCandidate'] = str(release / 'candidate')
        (out / 'status_20260918.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        print(json.dumps(data,ensure_ascii=True))
    elif mode == 'sources':
        old = json.loads((out / 'inventory.json').read_text(encoding='utf-8'))
        paths = [s['path'] for s in old['sources'] if not s['localMatch']]
        paths += ['src/handlers/arena.js','src/handlers/artifact.js','src/services/CurrencySync.js',
                  'src/handlers/farm.js','src/handlers/raid.js','src/services/RealmTaskProgressService.js']
        manifest = []
        with ssh.open_sftp() as sftp:
            for rel in sorted(set(paths)):
                target = out / 'source' / rel
                if target.is_file():
                    manifest.append({'path':rel,'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'reusedSnapshot':True})
                    continue
                payload = sftp.open('/linhhoasu/lhs/newServer/' + rel, 'rb').read()
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(payload)
                manifest.append({'path':rel,'sha256':hashlib.sha256(payload).hexdigest()})
        (out / 'source-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
        print(json.dumps({'downloaded':manifest,'output':str(out / 'source')}))
    else:
        source = 'const PLAN_MODE=' + json.dumps(mode) + ';\n' + (WB / 'tools/audit_feature_unlock_plan_20260917.js').read_text(encoding='utf-8')
        data = json.loads(run(ssh, 'cd /linhhoasu/lhs/newServer && node -', source))
finally:
    ssh.close()
if mode in ('sources', 'status'):
    raise SystemExit(0)
for item in data['sources']:
    local = WB.parent / 'linhhoasu/lhs/newServer' / item['path']
    item['localMatch'] = local.is_file() and hashlib.sha256(local.read_bytes()).hexdigest() == item['sha256']
(out / (mode+'.json')).write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'at':data['at'],'systemDayGates':len(data['systemDayGates']),
 'conditionTables':[{ 'name':r['name'],'count':r['count']} for r in data['conditionTables']],
 'population':data['population'],'processesUnchanged':data['processesUnchanged'],'output':str(out)},ensure_ascii=True))
