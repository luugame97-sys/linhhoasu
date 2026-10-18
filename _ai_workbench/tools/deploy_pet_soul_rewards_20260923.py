"""Deploy visible daily/dispatch PetSoul rewards and day accrual."""
import hashlib,json,shlex,time
from datetime import datetime,timezone
from pathlib import Path
from snapshot_web_multiserver_20260906 import connect,run
ROOT=Path(__file__).resolve().parents[2]
FILES=[
 ('/linhhoasu/lhs/newServer/src/handlers/pet-soul.js',ROOT/'_ai_workbench/temp/pet_soul_candidate_20260923/pet-soul.js','D1E7972A3FD5B3128D9A43B7DE935F8F3BA42EF2BE4CEFC034B19E8E88550650'),
 ('/linhhoasu/lhs/newServer/src/config/petSoulRewards.js',ROOT/'linhhoasu/lhs/newServer/src/config/petSoulRewards.js',None),
]
BEFORE_SOUL='52295077b3333220ab490a7295dd385187b9eef67af2c26eedb4f76de768197b'
NODES=[('lhs-s1002',8083),('lhs-s1001',8080),('lhs-s1003',8084),('lhs-s1004',8085),('lhs-s1005',8086)]
def sha(b):return hashlib.sha256(b).hexdigest()
def main():
    payloads=[(remote,local.read_bytes(),expected) for remote,local,expected in FILES]
    for _r,b,e in payloads:
        if e and sha(b).lower()!=e.lower():raise RuntimeError('LOCAL_HASH_DRIFT')
    stamp=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S');backup=f'/linhhoasu/_ai_workbench/backups/pet_soul_rewards_20260923_{stamp}';stageRoot=f'/linhhoasu/_ai_workbench/temp/pet_soul_rewards_20260923_{stamp}'
    report={'at':datetime.now(timezone.utc).isoformat(),'status':'STARTED','backup':backup,'directPlayerWrites':0,'files':{},'restarts':[]}
    ssh=connect();swapped=[]
    try:
        with ssh.open_sftp() as sf:
            run(ssh,'mkdir -p '+shlex.quote(backup)+' '+shlex.quote(stageRoot))
            for remote,payload,expected in payloads:
                try: current=sf.open(remote,'rb').read(); exists=True
                except FileNotFoundError: current=b'';exists=False
                current_hash=sha(current) if exists else None
                if remote.endswith('pet-soul.js') and current_hash!=BEFORE_SOUL:raise RuntimeError('REMOTE_CAS_DRIFT:'+str(current_hash))
                if exists:
                    with sf.open(backup+'/'+Path(remote).name+'.before','wb') as f:f.write(current)
                stage=stageRoot+'/'+Path(remote).name
                with sf.open(stage,'wb') as f:f.write(payload)
                run(ssh,'chmod 644 '+shlex.quote(stage));
                if remote.endswith('.js'):run(ssh,'node --check '+shlex.quote(stage))
                if sha(sf.open(stage,'rb').read())!=sha(payload):raise RuntimeError('STAGE_HASH_MISMATCH:'+remote)
                if exists and sha(sf.open(remote,'rb').read())!=current_hash:raise RuntimeError('PRE_SWAP_CAS_DRIFT:'+remote)
                sf.posix_rename(stage,remote);swapped.append((remote,exists));
                if sha(sf.open(remote,'rb').read())!=sha(payload):raise RuntimeError('LIVE_HASH_MISMATCH:'+remote)
                report['files'][remote]={'before':current_hash,'after':sha(payload),'existsBefore':exists}
        for name,port in NODES:
            run(ssh,'pm2 restart '+shlex.quote(name)+' --update-env');report['restarts'].append(name);code=''
            for _ in range(20):
                code=run(ssh,f"curl -sS -o /dev/null -w '%{{http_code}}' --max-time 3 http://127.0.0.1:{port}/ready || true").strip()
                if code=='200':break
                time.sleep(2)
            report.setdefault('readiness',{})[str(port)]=code
            if code!='200':raise RuntimeError('READY_FAILED:'+name)
        status_js="let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.stringify(JSON.parse(s).filter(p=>/^lhs-s100[1-5]$/.test(p.name)).map(p=>({name:p.name,status:p.pm2_env.status,pid:p.pid,restarts:p.pm2_env.restart_time})))));"
        report['processes']=json.loads(run(ssh,'pm2 jlist | node -e '+shlex.quote(status_js)))
        if any(p.get('status')!='online' for p in report['processes']):raise RuntimeError('NODE_NOT_ONLINE')
        run(ssh,'pm2 save');report['status']='DEPLOYED'
    except Exception as e:
        report['error']=str(e);report['status']='FAILED'
        try:
            for remote,exists in reversed(swapped):
                old=backup+'/'+Path(remote).name+'.before'
                if exists:run(ssh,'cp -p '+shlex.quote(old)+' '+shlex.quote(remote))
                else:run(ssh,'rm -f -- '+shlex.quote(remote))
            for name,_port in NODES:
                try:run(ssh,'pm2 restart '+shlex.quote(name)+' --update-env')
                except Exception:pass
            report['rollback']='restored_and_restarted'
        except Exception as re:report['rollbackError']=str(re)
        raise
    finally:
        try:run(ssh,'rm -rf -- '+shlex.quote(stageRoot))
        except Exception:pass
        ssh.close();out=ROOT/'_ai_workbench/temp/pet_soul_rewards_20260923/release.json';out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');print(json.dumps(report,ensure_ascii=False,indent=2),flush=True)
if __name__=='__main__':main()
