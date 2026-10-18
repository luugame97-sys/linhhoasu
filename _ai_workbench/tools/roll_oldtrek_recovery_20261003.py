from __future__ import annotations

import datetime as dt
import hashlib
import json
import shlex
import time
from pathlib import Path

import paramiko
from rollback_role_lian_manifest_20260930 import ssh_config


REMOTE = '/linhhoasu/lhs/newServer/src/handlers/old-trek.js'
EXPECTED = '50939476c24ac1a011dab8c05b1481da3361e5e7f4d4afd3dc3e46a80e67ab2e'
NODES = {'lhs-s1001':8080,'lhs-s1002':8083,'lhs-s1003':8084,'lhs-s1004':8085,'lhs-s1005':8086,'lhs-s1006':8087}
OUT = Path(__file__).resolve().parents[2] / '_ai_workbench/temp/oldtrek_recovery_20261002'


def sha(b): return hashlib.sha256(b).hexdigest()
def q(s): return shlex.quote(s)


def summary(row):
    env = row.get('pm2_env', {})
    return {'name': row.get('name'), 'pid': row.get('pid'), 'restart_time': env.get('restart_time'), 'status': env.get('status'), 'pm_id': row.get('pm_id')}


def main():
    args, kw = ssh_config(); assert args[0] == '103.116.104.165'
    c=paramiko.SSHClient();c.set_missing_host_key_policy(paramiko.AutoAddPolicy());c.connect(*args,**kw);s=c.open_sftp()
    receipt={'at':dt.datetime.now(dt.timezone.utc).isoformat(),'directPlayerWrites':0,'remoteFileWrites':0,'result':'STARTED','sourceHash':EXPECTED,'restarts':[]}
    def run(cmd,timeout=50):
        _,o,e=c.exec_command(cmd,timeout=timeout);out=o.read();err=e.read();rc=o.channel.recv_exit_status()
        if rc:raise RuntimeError(f'COMMAND_FAILED:{rc}:{err.decode("utf8","replace")[-700:]}')
        return out
    def rh(path):
        with s.open(path,'rb') as f:return sha(f.read())
    def pmap():return {x['name']:summary(x) for x in json.loads(run('pm2 jlist').decode()) if x.get('name') in NODES}
    def ready(name):
        end=time.monotonic()+60
        while True:
            try:
                v=json.loads(run(f'curl --max-time 5 -fsS http://127.0.0.1:{NODES[name]}/ready',8).decode())
                if v.get('status')=='ok' and v.get('checks',{}).get('mongo') is True and v.get('checks',{}).get('redis') is True:return v
            except Exception:pass
            if time.monotonic()>=end:raise RuntimeError('READY_TIMEOUT:'+name)
            time.sleep(1)
    try:
        if rh(REMOTE)!=EXPECTED:raise RuntimeError('SOURCE_HASH_DRIFT:'+rh(REMOTE))
        receipt['preProcess']=pmap();receipt['preReady']={n:ready(n) for n in NODES}
        for name in ('lhs-s1001','lhs-s1002','lhs-s1003','lhs-s1004','lhs-s1005'):
            before=receipt['preProcess'][name]
            run(f'pm2 restart {q(name)} --update-env')
            health=ready(name);after=pmap()[name]
            if after['status']!='online' or after['pid']==before['pid'] or after['restart_time']!=before['restart_time']+1:raise RuntimeError('RESTART_GATE:'+name)
            receipt['restarts'].append({'name':name,'ready':health,'process':after})
        receipt['postProcess']=pmap();receipt['postReady']={n:ready(n) for n in NODES};receipt['liveHash']=rh(REMOTE);receipt['result']='ROLLING_VERIFIED';receipt['completedAt']=dt.datetime.now(dt.timezone.utc).isoformat()
    except Exception as exc:
        receipt['result']='FAILED';receipt['error']=str(exc);raise
    finally:
        OUT.mkdir(parents=True,exist_ok=True);(OUT/'rolling_deployment.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n',encoding='utf8');s.close();c.close();print(json.dumps(receipt,ensure_ascii=False,indent=2))

if __name__=='__main__':main()
