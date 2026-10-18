"""Deploy Linh điền 41..100 server/client config + gated metadata/addon."""
import hashlib,json,shlex,time
from datetime import datetime,timezone
from pathlib import Path
from snapshot_web_multiserver_20260906 import connect,run
ROOT=Path(__file__).resolve().parents[2]
BASE='b5216c257c2a0743b6acdfe8bb43f4b989d000beeaa46c8ffe0b3d4ec789671e'
CAND='66b86d99474287d5f4d2737900fcce52c6c3683a49e72db235fbbacef7968511'
BASE_SOURCE={
 '/linhhoasu/lhs/newServer/src/handlers/farm.js':'97991f57f3a9abd607c26341defdb7ac3476c384f3cee255e0cba07e10da2eb4',
 '/linhhoasu/lhs/newServer/src/handlers/playerPayload.js':'b582c237313ebd65f27b72e83ad8681c41e3770e24d86348455e1a938524048e',
 '/linhhoasu/webgame/game/index.html':'bdf30e228a4542fbe5ea39b5bd8c6d249255cf159ad72cc843dcd9b4cf19db3c',
}
FILES=[
('/linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin',ROOT/'_ai_workbench/temp/plant_level100_candidate_20260923/config_server_candidate.bin'),
('/linhhoasu/lhs/update/resource/assets/excel/config_fashion_20260909.bin',ROOT/'_ai_workbench/temp/plant_level100_candidate_20260923/config_server_candidate.bin'),
('/linhhoasu/webgame/game/update/resource/assets/excel/config_e5ac72c2.bin',ROOT/'_ai_workbench/temp/plant_level100_candidate_20260923/config_client_candidate.bin'),
('/linhhoasu/webgame/game/update/resource/assets/excel/config_fashion_20260909.bin',ROOT/'_ai_workbench/temp/plant_level100_candidate_20260923/config_client_candidate.bin'),
('/linhhoasu/lhs/newServer/src/handlers/farm.js',ROOT/'linhhoasu/lhs/newServer/src/handlers/farm.js'),
('/linhhoasu/lhs/newServer/src/handlers/playerPayload.js',ROOT/'linhhoasu/lhs/newServer/src/handlers/playerPayload.js'),
('/linhhoasu/webgame/game/index.html',ROOT/'linhhoasu/webgame/game/index.html'),
('/linhhoasu/webgame/game/js/lhs-plant-level100-v1.js',ROOT/'linhhoasu/webgame/game/js/lhs-plant-level100-v1.js'),
]
NODES=[('lhs-s1002',8083),('lhs-s1001',8080),('lhs-s1003',8084),('lhs-s1004',8085),('lhs-s1005',8086)]
def sha(b):return hashlib.sha256(b).hexdigest()
def main():
    payloads=[(r,p.read_bytes()) for r,p in FILES]
    for r,b in payloads:
        if r.endswith('.bin') and sha(b)!=CAND:raise RuntimeError('CANDIDATE_BINARY_HASH_DRIFT')
    stamp=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S');backup=f'/linhhoasu/_ai_workbench/backups/plant_level100_20260923_{stamp}';stage=f'/linhhoasu/_ai_workbench/temp/plant_level100_20260923_{stamp}'
    report={'at':datetime.now(timezone.utc).isoformat(),'status':'STARTED','backup':backup,'stage':stage,'directPlayerWrites':0,'files':{},'restarts':[]}
    ssh=connect();swapped=[]
    try:
        with ssh.open_sftp() as sf:
            run(ssh,'mkdir -p '+shlex.quote(backup)+' '+shlex.quote(stage))
            for remote,payload in payloads:
                try:old=sf.open(remote,'rb').read();exists=True
                except FileNotFoundError:old=b'';exists=False
                oldHash=sha(old) if exists else None
                if remote.endswith('.bin') and oldHash!=BASE:raise RuntimeError('BASE_BINARY_CAS_DRIFT:'+remote+':'+str(oldHash))
                if remote in BASE_SOURCE and oldHash != BASE_SOURCE[remote]:
                    raise RuntimeError('BASE_SOURCE_CAS_DRIFT:'+remote+':'+str(oldHash))
                rel=remote.lstrip('/').replace('/','__'); backupFile=backup+'/'+rel+'.before'
                if exists:
                    with sf.open(backupFile,'wb') as f:f.write(old)
                staged=stage+'/'+rel
                with sf.open(staged,'wb') as f:f.write(payload)
                run(ssh,'chmod 644 '+shlex.quote(staged))
                if remote.endswith('.js'):run(ssh,'node --check '+shlex.quote(staged))
                if sha(sf.open(staged,'rb').read())!=sha(payload):raise RuntimeError('STAGE_HASH_MISMATCH:'+remote)
                if exists and sha(sf.open(remote,'rb').read())!=oldHash:raise RuntimeError('PRE_SWAP_CAS_DRIFT:'+remote)
                sf.posix_rename(staged,remote);swapped.append((remote,exists,backupFile))
                if sha(sf.open(remote,'rb').read())!=sha(payload):raise RuntimeError('LIVE_HASH_MISMATCH:'+remote)
                report['files'][remote]={'before':oldHash,'after':sha(payload),'existsBefore':exists}
        for name,port in NODES:
            run(ssh,'pm2 restart '+shlex.quote(name)+' --update-env');report['restarts'].append(name);code=''
            for _ in range(25):
                code=run(ssh,f"curl -sS -o /dev/null -w '%{{http_code}}' --max-time 3 http://127.0.0.1:{port}/ready || true").strip()
                if code=='200':break
                time.sleep(2)
            report.setdefault('readiness',{})[str(port)]=code
            if code!='200':raise RuntimeError('READY_FAILED:'+name)
        status_js="let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.stringify(JSON.parse(s).filter(p=>/^lhs-s100[1-5]$/.test(p.name)).map(p=>({name:p.name,status:p.pm2_env.status,pid:p.pid,restarts:p.pm2_env.restart_time})))));"
        report['processes']=json.loads(run(ssh,'pm2 jlist | node -e '+shlex.quote(status_js)))
        if any(p.get('status')!='online' for p in report['processes']):raise RuntimeError('NODE_NOT_ONLINE')
        run(ssh,'pm2 save');
        # Verify the cache-busted client addon is served and contains the marker.
        served=run(ssh,'curl -fsS --max-time 10 http://127.0.0.1:81/js/lhs-plant-level100-v1.js')
        index=run(ssh,'curl -fsS --max-time 10 http://127.0.0.1:81/')
        report['servedAddonHash']=sha(served.encode());report['servedIndexMarker']='plant_level100_candidate_v1' in index
        if report['servedAddonHash']!=report['files']['/linhhoasu/webgame/game/js/lhs-plant-level100-v1.js']['after'] or not report['servedIndexMarker']:raise RuntimeError('CLIENT_HTTP_VERIFY_FAILED')
        report['status']='DEPLOYED'
    except Exception as e:
        report['status']='FAILED';report['error']=str(e)
        try:
            for remote,exists,bf in reversed(swapped):
                if exists:run(ssh,'cp -p '+shlex.quote(bf)+' '+shlex.quote(remote))
                else:run(ssh,'rm -f -- '+shlex.quote(remote))
            for name,_port in NODES:
                try:run(ssh,'pm2 restart '+shlex.quote(name)+' --update-env')
                except Exception:pass
            report['rollback']='restored_and_restarted'
        except Exception as re:report['rollbackError']=str(re)
        raise
    finally:
        try:run(ssh,'rm -rf -- '+shlex.quote(stage))
        except Exception:pass
        ssh.close();out=ROOT/'_ai_workbench/temp/plant_level100_20260923/release.json';out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');print(json.dumps(report,ensure_ascii=False,indent=2),flush=True)
if __name__=='__main__':main()
