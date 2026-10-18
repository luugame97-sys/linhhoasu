"""Deploy legacy completed-boss-task frontier recovery with CAS/readiness."""
import hashlib, json, shlex, time
from pathlib import Path
from snapshot_web_multiserver_20260906 import connect, run

ROOT=Path(__file__).resolve().parents[2]
LOCAL=ROOT/'linhhoasu/lhs/newServer/src/handlers/dungeon.js'
BACKUP_LOCAL=ROOT/'_ai_workbench/backups/demon_boss_drop_task_fix_20260922_v3/dungeon.js.before'
REMOTE='/linhhoasu/lhs/newServer/src/handlers/dungeon.js'
BACKUP='/linhhoasu/_ai_workbench/backups/demon_boss_drop_task_fix_20260922_v3/dungeon.js.before'
STAGE_ROOT='/linhhoasu/_ai_workbench/temp/demon_boss_drop_task_fix_20260922_v3'
NODES=[('lhs-s1002',8083),('lhs-s1001',8080),('lhs-s1003',8084),('lhs-s1004',8085),('lhs-s1005',8086)]
def sha(b): return hashlib.sha256(b).hexdigest()
def ready(ssh,port):
    return run(ssh,f"for i in $(seq 1 90); do c=$(curl -fsS -o /dev/null -w '%{{http_code}}' --max-time 5 http://127.0.0.1:{port}/ready || true); if [ \"$c\" = 200 ]; then echo 200; exit 0; fi; sleep 1; done; exit 1").strip()
def main():
    new=LOCAL.read_bytes(); baseline=BACKUP_LOCAL.read_bytes()
    if sha(new)==sha(baseline): raise RuntimeError('SOURCE_CHANGE_MISSING')
    ssh=connect();old=b'';published=False;touched=[]
    try:
        with ssh.open_sftp() as sftp:
            old=sftp.open(REMOTE,'rb').read()
            if old!=baseline or sftp.open(BACKUP,'rb').read()!=baseline: raise RuntimeError('REMOTE_CAS_DRIFT')
            stage=f'{STAGE_ROOT}/{int(time.time())}/lhs/newServer/src/handlers';run(ssh,'install -d -m 700 '+shlex.quote(stage));staged=stage+'/dungeon.js'
            with sftp.open(staged,'wb') as f:f.write(new)
            sftp.chmod(staged,0o755);run(ssh,'node --check '+shlex.quote(staged));sftp.posix_rename(staged,REMOTE);published=True
        for name,port in NODES:
            run(ssh,'pm2 restart '+shlex.quote(name)+' --update-env');touched.append(name)
            if ready(ssh,port)!='200':raise RuntimeError('READY_FAILED:'+name)
        with ssh.open_sftp() as sftp:
            if sftp.open(REMOTE,'rb').read()!=new:raise RuntimeError('HASH_MISMATCH')
        result={'result':'DEPLOYED_AND_READY','at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'productionWrites':0,'backup':'/linhhoasu/_ai_workbench/backups/demon_boss_drop_task_fix_20260922_v3','file':{'before':sha(old),'after':sha(new)},'restartOrder':touched,'readiness':{n:json.loads(run(ssh,f'curl -fsS http://127.0.0.1:{p}/ready')) for n,p in NODES}}
        out=ROOT/'_ai_workbench/temp/demon_boss_drop_task_fix_20260922/release_v3.json';out.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8');print(json.dumps(result,ensure_ascii=False,indent=2))
    except Exception:
        if published:
            with ssh.open_sftp() as sftp:
                stage=f'{STAGE_ROOT}/rollback-{int(time.time())}/lhs/newServer/src/handlers';run(ssh,'install -d -m 700 '+shlex.quote(stage));staged=stage+'/dungeon.js'
                with sftp.open(staged,'wb') as f:f.write(old)
                sftp.chmod(staged,0o755);sftp.posix_rename(staged,REMOTE)
            for n,p in NODES:
                if n in touched:run(ssh,'pm2 restart '+shlex.quote(n)+' --update-env');ready(ssh,p)
        raise
    finally: ssh.close()
if __name__=='__main__':main()
