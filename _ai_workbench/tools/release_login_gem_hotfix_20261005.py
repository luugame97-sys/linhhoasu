"""Stage and release the profiled gem hotfix with CAS and per-node gates."""
import hashlib
import json
import shlex
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from skin_incident_remote import connect, run

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / '_ai_workbench/temp/login_outage_20261005'
APP = '/linhhoasu/lhs/newServer'
FILES = {
    'src/handlers/item.js': ('item.candidate.js', 'a642e187d9f1f6df2abda77ee101cba4056bec6d182b99d4276e254ea6d48538'),
    'src/handlers/gem.js': ('gem.candidate.js', 'e01f1fa65145de9da6483d72cd81e076114d0611c8cdfb27a0fcf081bda01bea'),
}
NODES = [('lhs-s1002',8083),('lhs-s1007',8088),('lhs-s1001',8080),('lhs-s1003',8084),('lhs-s1004',8085),('lhs-s1005',8086),('lhs-s1006',8087)]
MANIFEST = OUT / 'gem_hotfix_deployment.json'

def save(m): MANIFEST.write_text(json.dumps(m, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
def sha(data): return hashlib.sha256(data).hexdigest()
def remote_hash(s,p): return run(s,"sha256sum "+shlex.quote(p)+" | awk '{print $1}'").strip()
def wait_ready(s,port):
    for i in range(25):
        try:
            b=json.loads(run(s,f'curl -fsS --max-time 4 http://127.0.0.1:{port}/ready'))
            if b.get('status')=='ok' and b.get('checks',{}).get('mongo') is True and b.get('checks',{}).get('redis') is True:
                return {'http':200,'body':b,'attempts':i+1}
        except Exception: pass
        time.sleep(2)
    raise RuntimeError('READINESS_FAILED:'+str(port))

def main():
    mode=sys.argv[1] if len(sys.argv)>1 else 'stage'
    with connect() as s:
        if mode=='stage':
            if MANIFEST.exists():raise RuntimeError('MANIFEST_EXISTS')
            stamp=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
            m={'status':'STAGING','stage':'/linhhoasu/_ai_workbench/temp/login_gem_'+stamp,'backup':'/linhhoasu/_ai_workbench/backups/login_gem_'+stamp,'files':{},'restarted':[],'readiness':{},'directPlayerWrites':0}
            save(m)
            run(s,'mkdir -p '+shlex.quote(m['stage']))
            with s.open_sftp() as sf:
                for rel,(name,before) in FILES.items():
                    p=APP+'/'+rel
                    if remote_hash(s,p)!=before:raise RuntimeError('BASELINE_DRIFT:'+rel)
                    data=(OUT/name).read_bytes();staged=m['stage']+'/'+name
                    with sf.open(staged,'wb') as h:h.write(data)
                    after=sha(data)
                    if remote_hash(s,staged)!=after:raise RuntimeError('STAGE_HASH:'+rel)
                    run(s,'node --check '+shlex.quote(staged))
                    m['files'][rel]={'name':name,'before':before,'after':after,'stage':staged};save(m)
            m['status']='STAGED';save(m);print(json.dumps({'status':'STAGED','stage':m['stage']}),flush=True)
            return
        m=json.loads(MANIFEST.read_text(encoding='utf-8'))
        if mode=='deploy':
            if m['status']!='STAGED':raise RuntimeError('NOT_STAGED')
            for rel,r in m['files'].items():
                if remote_hash(s,APP+'/'+rel)!=r['before'] or remote_hash(s,r['stage'])!=r['after']:raise RuntimeError('CAS_DRIFT:'+rel)
            for rel,r in m['files'].items():
                p=APP+'/'+rel;b=m['backup']+'/'+rel
                run(s,'mkdir -p '+shlex.quote(b.rsplit('/',1)[0])+' && cp -p '+shlex.quote(p)+' '+shlex.quote(b))
                if remote_hash(s,p)!=r['before']:raise RuntimeError('CAS_DRIFT_BEFORE_INSTALL:'+rel)
                tmp=p+'.login-gem-next'
                run(s,'cp '+shlex.quote(r['stage'])+' '+shlex.quote(tmp)+' && chown --reference='+shlex.quote(p)+' '+shlex.quote(tmp)+' && chmod --reference='+shlex.quote(p)+' '+shlex.quote(tmp)+' && mv '+shlex.quote(tmp)+' '+shlex.quote(p))
                if remote_hash(s,p)!=r['after']:raise RuntimeError('INSTALL_HASH:'+rel)
            m['status']='INSTALLED';save(m)
        elif mode!='resume':raise RuntimeError('UNKNOWN_MODE')
        if m['status'] not in ['INSTALLED','ROLLING']:raise RuntimeError('NOT_INSTALLED')
        for name,port in NODES:
            if name in m['restarted']:continue
            for rel,r in m['files'].items():
                if remote_hash(s,APP+'/'+rel)!=r['after']:raise RuntimeError('CURRENT_HASH_DRIFT')
            m['status']='ROLLING';save(m);print(json.dumps({'step':'restart','node':name}),flush=True)
            run(s,'pm2 restart '+shlex.quote(name))
            ready=wait_ready(s,port);m['restarted'].append(name);m['readiness'][str(port)]=ready;save(m)
            print(json.dumps({'step':'ready','node':name,'attempts':ready['attempts']}),flush=True)
        m['finalReadiness']={str(port):wait_ready(s,port) for _,port in NODES}
        m['status']='DEPLOYED_VERIFIED';m['finishedAt']=datetime.now(timezone.utc).isoformat();save(m)
        print(json.dumps({'status':m['status'],'backup':m['backup'],'restarted':m['restarted']}),flush=True)
if __name__=='__main__':main()
