"""Deploy TopArena v3 with CAS, backup, syntax checks and rolling readiness."""
import datetime as dt, hashlib, json, shlex, time
from pathlib import Path
from skin_incident_remote import connect, run

ROOT=Path(__file__).resolve().parents[2]
APP=ROOT/'linhhoasu/lhs/newServer'
GAME=ROOT/'linhhoasu/webgame/game'
OUT=ROOT/'_ai_workbench/temp/toparena_fix_20261003'
stamp=dt.datetime.now().strftime('%Y%m%d_%H%M%S')
backup=f'/linhhoasu/_ai_workbench/backups/toparena_v3_{stamp}'
remote_root='/linhhoasu/lhs/newServer'
files=['src/handlers/arena.js','src/router.js','src/app.js','src/services/PlayerService.js','src/services/RechargeBenefitService.js','src/services/RechargeRewardResolver.js','src/services/CrossEventScheduleService.js','src/services/CrossEventSettlementService.js','src/services/TopArenaRules.js','src/services/TopArenaRepository.js','src/services/TopArenaPassService.js','src/services/TopArenaService.js']
static=['index.html','js/lhs-cross-events-v2.js','js/lhs-toparena-v3.js']
def digest(b): return hashlib.sha256(b).hexdigest()
def q(x): return shlex.quote(str(x))
def wait_ready(client,port):
    last=''
    for _ in range(60):
        last=run(client,f'curl -sS --max-time 5 http://127.0.0.1:{port}/ready || true').strip()
        try:
            body=json.loads(last)
            if body.get('status')=='ok' and body.get('mongo') is True and body.get('redis') is True:return body
        except Exception: pass
        time.sleep(1)
    raise RuntimeError(f'READINESS_FAILED:{port}:{last[:400]}')
ports={'lhs-s1001':8080,'lhs-s1002':8083,'lhs-s1003':8084,'lhs-s1004':8085,'lhs-s1005':8086,'lhs-s1006':8087,'lhs-s1007':8088}
candidates={remote_root+'/'+r:(APP/r).read_bytes() for r in files}
candidates.update({'/linhhoasu/webgame/game/'+r:(GAME/r).read_bytes() for r in static})
with connect() as client:
    sftp=client.open_sftp(); pre={}
    for remote in candidates:
        try:
            current=sftp.open(remote,'rb').read(); pre[remote]={'sha256':digest(current),'size':len(current)}
        except IOError as exc:
            if getattr(exc,'errno',None)!=2: raise
            pre[remote]={'sha256':None,'size':0}
    sftp.close()
    run(client,f'install -d -m 700 {q(backup)}')
    sftp=client.open_sftp()
    for remote in candidates:
        safe=remote.lstrip('/').replace('/','__')
        if pre[remote]['sha256']:
            with sftp.open(f'{backup}/{safe}.bak','wb') as h:h.write(sftp.open(remote,'rb').read())
    with sftp.open(f'{backup}/preimage.json','wb') as h:h.write(json.dumps({'at':dt.datetime.now(dt.timezone.utc).isoformat(),'pre':pre},indent=2).encode())
    sftp.chmod(f'{backup}/preimage.json',0o600)
    staged={}
    for remote,data in candidates.items():
        stage=f'{remote}.stage_{stamp}'; staged[remote]=stage
        with sftp.open(stage,'wb') as h:h.write(data)
        sftp.chmod(stage,0o640)
    sftp.close()
    for remote,stage in staged.items():
        if pre[remote]['sha256']:
            current_hash=run(client,f"sha256sum {q(remote)} | cut -d' ' -f1").strip()
            if current_hash != pre[remote]['sha256']: raise RuntimeError(f'CAS_MISMATCH:{remote}:{current_hash}')
        else:
            if run(client,f'test -e {q(remote)}; echo $?').strip() != '1': raise RuntimeError(f'CAS_NEW_FILE_ALREADY_EXISTS:{remote}')
        if remote.endswith('.js'):
            check_path=f'/tmp/toparena_check_{stamp}.js'
            run(client,f'cp -- {q(stage)} {q(check_path)}; node --check {q(check_path)}; rm -f -- {q(check_path)}')
        run(client,f'mv -f -- {q(stage)} {q(remote)}')
        if digest(candidates[remote])!=run(client,f"sha256sum {q(remote)} | cut -d' ' -f1").strip():raise RuntimeError(f'HASH_MISMATCH:{remote}')
    restart=[]
    for name,port in ports.items():
        run(client,f'pm2 restart {q(name)} --update-env >/dev/null')
        body=wait_ready(client,port); restart.append({'name':name,'port':port,'ready':body})
    final={remote:run(client,f"sha256sum {q(remote)} | cut -d' ' -f1").strip() for remote in candidates}
    result={'result':'DEPLOYED_VERIFIED','at':dt.datetime.now(dt.timezone.utc).isoformat(),'backup':backup,'pre':pre,'final':final,'restart':restart,'productionWrites':0,'playerWrites':0}
    OUT.mkdir(parents=True,exist_ok=True); (OUT/f'deployment_{stamp}.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8')
    print(json.dumps({'result':result['result'],'backup':backup,'changed':len(candidates),'ready':len(restart),'playerWrites':0},ensure_ascii=False,indent=2))
