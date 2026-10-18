"""Release the narrow fashion star power fix with staged RAM QA and CAS."""
import hashlib
import json
import shlex
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from skin_incident_remote import connect, run

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'_ai_workbench/temp/fashion_star_power_fix_20261005'
APP='/linhhoasu/lhs/newServer'
REL='src/services/BattleService.js'
REMOTE=APP+'/'+REL
BEFORE='7e6d8b58c3ea6825362696694b30073bb269afe2a5f1d16b84e9fa008848ac91'
CONTEXT={'src/handlers/fashion.js':'da994d505f07a79db857e211948d32c67945a956bdc8d66268bc0815523b8f8b',
 'src/services/FashionTransactionService.js':'6e12a1172caff8a911d09e3dd9fcc2641af7d25d08996ffa38160c647ecbfe28',
 'src/services/PowerDisplaySyncService.js':'23eb1eb19ddb8e311c692a541b62bdb7af8363208f66bdd53f2b54302dd0f050'}
NODES=[('lhs-s1001',8080),('lhs-s1002',8083),('lhs-s1003',8084),('lhs-s1004',8085),('lhs-s1005',8086),('lhs-s1006',8087),('lhs-s1007',8088)]
MANIFEST=OUT/'deployment.json'
def sha(b):return hashlib.sha256(b).hexdigest()
def save(m):MANIFEST.write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def rh(s,p):return run(s,'sha256sum '+shlex.quote(p)+" | awk '{print $1}'").strip()
def processes(s):
    src="const a=JSON.parse(require('child_process').execFileSync('pm2',['jlist'],{encoding:'utf8'}));console.log(JSON.stringify(a.map(p=>({name:p.name,pid:p.pid,status:p.pm2_env.status,started:p.pm2_env.pm_uptime}))))"
    return json.loads(run(s,'node -',src))
def ready(s,port):
    for i in range(25):
        try:
            b=json.loads(run(s,f'curl -fsS --max-time 4 http://127.0.0.1:{port}/ready'))
            if b.get('status')=='ok' and b.get('checks',{}).get('mongo') is True and b.get('checks',{}).get('redis') is True:
                return {'http':200,'body':b,'attempts':i+1}
        except Exception:pass
        time.sleep(2)
    raise RuntimeError('READINESS_FAILED:'+str(port))
def context_ok(s):
    for rel,h in CONTEXT.items():
        if rh(s,APP+'/'+rel)!=h:raise RuntimeError('CONTEXT_DRIFT:'+rel)
def loader(s,m,candidate):
    # Exact module filename preserves its production relative imports. Never
    # start the application or any scheduler in the test process.
    src="""const fs=require('fs'),Module=require('module'),cp=require('child_process');
const app=APP,pm=JSON.parse(cp.execFileSync('pm2',['jlist'],{encoding:'utf8'})).find(p=>p.name==='lhs-s1001');
const env={...require(app+'/node_modules/dotenv').parse(fs.readFileSync(app+'/.env')),...pm.pm2_env.env,...pm.pm2_env};
for(const k of ['CONFIG_BIN_PATH','FASHION_CONTENT_OVERLAY_PATH','FASHION_CHOICE_OVERLAY_PATH','FASHION_CHOICE_STARS_OVERLAY_PATH','DROP_LEVEL_100_ENABLED','DROP_LEVEL_46_ENABLED','ROLE_LEVEL_2000_ENABLED'])if(env[k]!=null)process.env[k]=String(env[k]);
const log=require.resolve(app+'/src/logger');require.cache[log]={exports:{info(){},warn(){},error(){},debug(){}}};
const deny=()=>{throw Error('QA_NETWORK_DENIED')};require('net').Socket.prototype.connect=deny;require('tls').connect=deny;
for(const n of ['http','https']){require(n).request=deny;require(n).get=deny}global.fetch=deny;
PATCH
""".replace('APP,',''+json.dumps(APP)+',')
    patch="const old=Module._extensions['.js'];Module._extensions['.js']=function(mod,file){if(file==="+json.dumps(REMOTE)+")return mod._compile(fs.readFileSync("+json.dumps(m['stage']+'/BattleService.js')+",'utf8'),file);return old(mod,file);};" if candidate else ''
    src=src.replace('PATCH',patch)
    p=m['stage']+('/candidate-loader.js' if candidate else '/installed-loader.js')
    with s.open_sftp() as sf:
        with sf.open(p,'wb') as h:h.write(src.encode('utf-8'))
    return p
def tests(s,m,candidate):
    l=loader(s,m,candidate)
    result={}
    for name in ['test_fashion_star_selection_20261005.js','audit_fashion_star_power_20261005.js']:
        env='FASHION_POWER_REQUIRE_INCREASE=1 FASHION_BATTLE_CANDIDATE='+shlex.quote(m['stage']+'/BattleService.js' if candidate else REMOTE)
        raw=run(s,env+' node -r '+shlex.quote(l)+' '+shlex.quote(m['stage']+'/'+name))
        obj=json.loads(raw)
        if name.startswith('audit_'):
            if obj['summary']!={'suits':20,'transitions':62,'accepted':62,'increased':62,'unchanged':0}:raise RuntimeError('STAR_POWER_QA_FAILED')
            (OUT/('candidate_qa.json' if candidate else 'installed_qa.json')).write_text(json.dumps(obj,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
            result[name]={k:obj[k] for k in ['summary','networkAttempts','memorySaves','productionWrites']}
            result[name]['sample']=obj['rows'][0]
        else:result[name]=obj
    power_test=(ROOT/'linhhoasu/lhs/newServer/scripts/test-power-display-sync-service.js').read_text(encoding='utf-8-sig')
    power_test=power_test.replace("require('../src/", "require('"+APP+"/src/")
    raw=run(s,'node -r '+shlex.quote(l)+' -',power_test)
    result['power-display']=json.loads(raw.splitlines()[-1])
    m['candidateTests' if candidate else 'installedTests']=result;save(m)
    print(json.dumps({'step':'tests','candidate':candidate,'result':result},ensure_ascii=False),flush=True)
def rollback(s,m):
    if rh(s,REMOTE)!=m['after']:raise RuntimeError('ROLLBACK_SOURCE_DRIFT')
    backup=m['backup']+'/BattleService.js'
    if rh(s,backup)!=BEFORE:raise RuntimeError('ROLLBACK_BACKUP_HASH')
    temp=REMOTE+'.fashion-star-rollback'
    run(s,'cp -p '+shlex.quote(backup)+' '+shlex.quote(temp)+' && mv '+shlex.quote(temp)+' '+shlex.quote(REMOTE))
    m['rollbackReady']={}
    for name,port in NODES:
        if name not in m['restarted']:continue
        run(s,'pm2 restart '+shlex.quote(name));m['rollbackReady'][str(port)]=ready(s,port);save(m)
    m['status']='ROLLED_BACK';save(m)
def main():
    mode=sys.argv[1] if len(sys.argv)>1 else 'stage'
    OUT.mkdir(parents=True,exist_ok=True)
    with connect() as s:
        if mode in ['stage','restage']:
            if rh(s,REMOTE)!=BEFORE:raise RuntimeError('LIVE_BASELINE_DRIFT')
            context_ok(s)
            data=(ROOT/'linhhoasu/lhs/newServer'/REL).read_bytes()
            if mode=='restage':
                m=json.loads(MANIFEST.read_text(encoding='utf-8'))
                if m['status'] not in ['STAGING','STAGED']:raise RuntimeError('CANNOT_RESTAGE')
                if processes(s)!=m['beforeProcesses']:raise RuntimeError('LIVE_PROCESS_CHANGED')
                m['status']='STAGING';m['after']=sha(data)
            else:
                if MANIFEST.exists():raise RuntimeError('MANIFEST_EXISTS')
                stamp=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
                m={'status':'STAGING','stage':'/linhhoasu/_ai_workbench/temp/fashion_star_power_'+stamp,
                    'backup':'/linhhoasu/_ai_workbench/backups/fashion_star_power_'+stamp,'before':BEFORE,'after':sha(data),
                    'restarted':[],'readiness':{},'directPlayerWrites':0,'beforeProcesses':processes(s)}
            save(m);run(s,'mkdir -p '+shlex.quote(m['stage']))
            files={'BattleService.js':data}
            for name in ['test_fashion_star_selection_20261005.js','audit_fashion_star_power_20261005.js']:files[name]=(ROOT/'_ai_workbench/tools'/name).read_bytes()
            with s.open_sftp() as sf:
                for name,b in files.items():
                    target=m['stage']+'/'+name
                    with sf.open(target,'wb') as h:h.write(b)
                    if rh(s,target)!=sha(b):raise RuntimeError('STAGE_HASH:'+name)
                    run(s,'node --check '+shlex.quote(target))
            tests(s,m,True)
            if rh(s,REMOTE)!=BEFORE or processes(s)!=m['beforeProcesses']:raise RuntimeError('LIVE_STATE_CHANGED_DURING_QA')
            m['status']='STAGED';save(m);print(json.dumps({'status':m['status'],'stage':m['stage']}),flush=True);return
        m=json.loads(MANIFEST.read_text(encoding='utf-8'))
        if mode=='deploy':
            if m['status']!='STAGED':raise RuntimeError('NOT_STAGED')
            context_ok(s)
            if rh(s,REMOTE)!=BEFORE or rh(s,m['stage']+'/BattleService.js')!=m['after']:raise RuntimeError('PREDEPLOY_CAS')
            m['predeployReady']={str(p):ready(s,p) for _,p in NODES};m['predeployProcesses']=processes(s);save(m)
            run(s,'mkdir -p '+shlex.quote(m['backup'])+' && cp -p '+shlex.quote(REMOTE)+' '+shlex.quote(m['backup']+'/BattleService.js'))
            if rh(s,REMOTE)!=BEFORE or rh(s,m['backup']+'/BattleService.js')!=BEFORE:raise RuntimeError('BACKUP_CAS')
            temp=REMOTE+'.fashion-star-next'
            run(s,'cp '+shlex.quote(m['stage']+'/BattleService.js')+' '+shlex.quote(temp)+' && chown --reference='+shlex.quote(REMOTE)+' '+shlex.quote(temp)+' && chmod --reference='+shlex.quote(REMOTE)+' '+shlex.quote(temp)+' && mv '+shlex.quote(temp)+' '+shlex.quote(REMOTE))
            m['status']='INSTALLED';save(m)
        elif mode!='resume':raise RuntimeError('UNKNOWN_MODE')
        if m['status'] not in ['INSTALLED','ROLLING']:raise RuntimeError('NOT_INSTALLED')
        try:
            for name,port in NODES:
                if name in m['restarted']:continue
                if rh(s,REMOTE)!=m['after']:raise RuntimeError('CURRENT_SOURCE_DRIFT')
                m['status']='ROLLING';m['restarted'].append(name);save(m)
                print(json.dumps({'step':'restart','node':name}),flush=True)
                run(s,'pm2 restart '+shlex.quote(name));m['readiness'][str(port)]=ready(s,port);save(m)
                if len(m['restarted'])==1:tests(s,m,False)
                print(json.dumps({'step':'ready','node':name}),flush=True)
            m['finalReadiness']={str(p):ready(s,p) for _,p in NODES}
            m['afterProcesses']=processes(s)
            expected={p['name']:p for p in m['predeployProcesses'] if not p['name'].startswith('lhs-s100')}
            actual={p['name']:p for p in m['afterProcesses'] if p['name'] in expected}
            if expected!=actual:raise RuntimeError('UNRELATED_PROCESS_CHANGED')
            if rh(s,REMOTE)!=m['after']:raise RuntimeError('FINAL_SOURCE_HASH')
            m['status']='DEPLOYED_VERIFIED';m['finishedAt']=datetime.now(timezone.utc).isoformat();save(m)
            print(json.dumps({'status':m['status'],'backup':m['backup'],'restarted':m['restarted']}),flush=True)
        except Exception as e:
            m['error']=str(e);save(m);rollback(s,m);raise
if __name__=='__main__':main()
