"""Recover the exact interrupted release, without restarting running nodes.

All targets/hashes come from the failed release receipt. New files are moved
into the release backup (recoverable), never recursively deleted.
"""
import hashlib
import json
import shlex
import sys
from datetime import datetime, timezone
from pathlib import Path
sys.dont_write_bytecode=True
WB=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(WB/'temp/pydeps'))
from snapshot_web_multiserver_20260906 import connect,run
OUT=WB/'temp/feature_unlock_release_20260917'
receipt_path=sorted(OUT.glob('deploy_artifact_valhalla_failed_*.json'))[-1]
receipt=json.loads(receipt_path.read_text(encoding='utf-8'))
backup=receipt['backup']
if receipt['backup']!=backup or receipt['restarts']:
    raise SystemExit('RECOVERY_RECEIPT_MISMATCH')
def digest(data):return hashlib.sha256(data).hexdigest()
source=r'''
const fs=require('fs'),cp=require('child_process');
const nodes=JSON.parse(cp.execFileSync('pm2',['jlist'],{encoding:'utf8'}));
console.log(JSON.stringify(nodes.filter(p=>/^lhs-/.test(p.name)).map(p=>({name:p.name,pid:p.pid,restarts:p.pm2_env.restart_time,status:p.pm2_env.status}))));
'''
ssh=connect()
try:
    before=json.loads(run(ssh,'node -',source))
    targets={**receipt['files'],'/linhhoasu/lhs/newServer/ecosystem.config.js':{
      'before':receipt['ecosystemBefore'],'candidate':receipt['ecosystemAfter'],'backup':receipt['ecosystemBackup']}}
    result={'at':datetime.now(timezone.utc).isoformat(),'releaseBackup':backup,'restored':[],'preserved':[],'quarantined':[],
            'playerDatabaseWrites':0,'restarts':[],'directoryPermissionsChanged':False}
    with ssh.open_sftp() as sftp:
        def sha(p):
            try:return digest(sftp.open(p,'rb').read())
            except FileNotFoundError:return None
        # Check every source before restoring anything.
        for target,row in targets.items():
            if not target.startswith(('/linhhoasu/lhs/newServer/','/linhhoasu/webgame/game/')):
                raise RuntimeError('TARGET_OUT_OF_SCOPE')
            current=sha(target)
            if current not in (row['before'],row['candidate']):raise RuntimeError('RECOVERY_CAS_DRIFT:'+target)
            if row['before'] is not None and sha(row['backup'])!=row['before']:
                raise RuntimeError('RECOVERY_BACKUP_INVALID:'+target)
        run(ssh,'mkdir -p -- '+shlex.quote(backup+'/quarantined-new'))
        # Restore normal files first; preserve www directory group/mode.
        for target,row in targets.items():
            if sha(target)==row['before']:
                result['preserved'].append(target);continue
            if row['before'] is not None:
                run(ssh,'cp -p -- '+shlex.quote(row['backup'])+' '+shlex.quote(target))
                if sha(target)!=row['before']:raise RuntimeError('RECOVERY_READBACK:'+target)
                result['restored'].append(target)
        for target,row in targets.items():
            if row['before'] is not None or sha(target) is None:continue
            if sha(target)!=row['candidate']:raise RuntimeError('RECOVERY_NEW_FILE_DRIFT:'+target)
            quarantine=backup+'/quarantined-new/'+target.strip('/').replace('/','__')
            if sha(quarantine) is not None:raise RuntimeError('RECOVERY_QUARANTINE_ALREADY_EXISTS')
            sftp.rename(target,quarantine)
            if sha(quarantine)!=row['candidate'] or sha(target) is not None:raise RuntimeError('RECOVERY_QUARANTINE_READBACK')
            result['quarantined'].append({'source':target,'recoverableAt':quarantine})
    after=json.loads(run(ssh,'node -',source));result['processesUnchanged']=before==after
    result['ready']={str(port):run(ssh,'curl -s --max-time 8 -o /dev/null -w "%{http_code}" http://127.0.0.1:'+str(port)+'/ready').strip() for port in [8080,8083,8084,8085]}
    result['publicIndexHttp']=run(ssh,'curl -s --max-time 8 -o /dev/null -w "%{http_code}" http://103.116.105.154:81/').strip()
    result['result']='RECOVERED' if result['processesUnchanged'] and all(v=='200' for v in result['ready'].values()) and result['publicIndexHttp']=='200' else 'CHECK_REQUIRED'
    (OUT/'recovery_20260918.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(result))
finally:ssh.close()
