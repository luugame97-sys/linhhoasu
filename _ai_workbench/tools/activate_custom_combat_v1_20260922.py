"""Activate installed, hash-verified candidate on exact game nodes, no DB calls."""
import json,hashlib,shlex,time
from pathlib import Path
from snapshot_web_multiserver_20260906 import connect,run
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'_ai_workbench/temp/combat_parity_20260922/custom_activation.json'
NODES=[('lhs-s1002',8083),('lhs-s1001',8080),('lhs-s1003',8084),('lhs-s1004',8085),('lhs-s1005',8086)]
def snapshot(s):
    return json.loads(run(s,'node',r'''
const cp=require('child_process'),fs=require('fs');
const list=JSON.parse(cp.execSync('pm2 jlist',{encoding:'utf8'}));
console.log(JSON.stringify(list.filter(p=>/^lhs-s100[1-5]$/.test(p.name)).map(p=>{
 const flag=(fs.readFileSync('/proc/'+p.pid+'/environ','utf8').split('\0').find(x=>x.startsWith('CUSTOM_PVP_FORMULA_ENABLED='))||'').split('=')[1]||null;
 return {name:p.name,status:p.pm2_env.status,cwd:p.pm2_env.pm_cwd,flag:p.pm2_env.CUSTOM_PVP_FORMULA_ENABLED??p.pm2_env.env?.CUSTOM_PVP_FORMULA_ENABLED??null,processFlag:flag};
})));
'''))
def ready(s,p):
    for attempt in range(30):
        try:
            d=json.loads(run(s,f'curl -fsS --max-time 3 http://127.0.0.1:{p}/ready'))
            if d.get('status')=='ok' and d.get('checks',{}).get('mongo') and d.get('checks',{}).get('redis'): return d
        except Exception: pass
        time.sleep(1)
    raise RuntimeError('READY_TIMEOUT:'+str(p))
def main():
    release=json.loads((OUT.parent/'custom_release.json').read_text(encoding='utf8'))
    s=connect(); attempted=[]; results=[]; state={'status':'PRECHECK','directPlayerWrites':0,'rows':results}
    try:
        with s.open_sftp() as sf:
            for rel,expected in release['files'].items():
                blob=sf.open('/linhhoasu/lhs/newServer/'+rel,'rb').read()
                if hashlib.sha256(blob).hexdigest()!=expected['after']: raise RuntimeError('INSTALLED_HASH_DRIFT:'+rel)
        before=snapshot(s)
        if sorted(x['name'] for x in before)!=sorted(n for n,_ in NODES):raise RuntimeError('NODE_INVENTORY')
        if any(x['cwd']!='/linhhoasu/lhs/newServer' or x['flag'] not in (None,'0') for x in before):raise RuntimeError('NODE_SCOPE_OR_FLAG')
        state['before']=before
        for name,port in NODES:
            attempted.append(name)
            print('ACTIVATING '+name,flush=True)
            run(s,'env CUSTOM_PVP_FORMULA_ENABLED=1 pm2 restart '+shlex.quote(name)+' --update-env')
            health=ready(s,port)
            row=next(x for x in snapshot(s) if x['name']==name)
            if row['flag']!='1' or row['processFlag']!='1':raise RuntimeError('PROCESS_FLAG_MISSING:'+name)
            results.append({'node':name,'readiness':health,'runtime':row})
            print('VERIFIED '+name,flush=True)
        state['status']='ACTIVE_AND_READY';state['after']=snapshot(s)
    except Exception as err:
        state['error']=str(err);state['status']='ACTIVATION_FAILED';state['rollback']=[]
        for name,port in NODES:
            if name not in attempted:continue
            try:
                run(s,'env CUSTOM_PVP_FORMULA_ENABLED=0 pm2 restart '+shlex.quote(name)+' --update-env')
                state['rollback'].append({'node':name,'ready':ready(s,port)})
            except Exception as rollback_error:state['rollback'].append({'node':name,'error':str(rollback_error)})
        raise
    finally:
        state['at']=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())
        OUT.write_text(json.dumps(state,ensure_ascii=False,indent=2)+'\n',encoding='utf8');s.close()
    print(json.dumps({'status':state['status'],'nodes':len(results),'evidence':str(OUT)}),flush=True)
if __name__=='__main__':main()
