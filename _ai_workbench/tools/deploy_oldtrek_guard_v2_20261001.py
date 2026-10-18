from __future__ import annotations
import datetime as dt
import hashlib
import json
import shlex
from pathlib import Path
import paramiko
from rollback_role_lian_manifest_20260930 import ssh_config

ROOT=Path(__file__).resolve().parents[2]
LOCAL=ROOT/'linhhoasu/webgame/game/js/lhs-oldtrek-errors-v1.js'
REMOTE='/linhhoasu/webgame/game/js/lhs-oldtrek-errors-v1.js'
EXPECTED_REMOTE='6d40780202ac9964e2b54b35183166b77a6b25e0aa52118b169c4de8611a2da4'
OUT=ROOT/'_ai_workbench/temp/oldtrek_guard_v2_20261001'
def sha(b):return hashlib.sha256(b).hexdigest()
def main():
    data=LOCAL.read_bytes();assert b"20260927_v2" in data; local_hash=sha(data)
    args,kw=ssh_config();assert args[0]=='103.116.104.165'
    c=paramiko.SSHClient();c.set_missing_host_key_policy(paramiko.AutoAddPolicy());c.connect(*args,**kw);s=c.open_sftp()
    stamp=dt.datetime.now().strftime('%Y%m%d_%H%M%S');backup=f'/linhhoasu/_ai_workbench/backups/oldtrek_guard_v2_{stamp}';stage=REMOTE+'.oldtrek_v2_'+stamp+'.js';report={'at':dt.datetime.now(dt.timezone.utc).isoformat(),'backup':backup,'productionPlayerWrites':0,'pm2Restart':False}
    def run(cmd):
        _,o,e=c.exec_command(cmd,timeout=45);out=o.read().decode('utf8','replace');err=e.read().decode('utf8','replace');rc=o.channel.recv_exit_status()
        if rc:raise RuntimeError(f'REMOTE({rc}):{err[-600:]}')
        return out.strip()
    def rh(path):return sha(s.open(path,'rb').read())
    try:
        if rh(REMOTE)!=EXPECTED_REMOTE:raise RuntimeError('CAS_ADDON_DRIFT:'+rh(REMOTE))
        run('mkdir -m 700 -- '+shlex.quote(backup));run('cp -p -- '+shlex.quote(REMOTE)+' '+shlex.quote(backup+'/lhs-oldtrek-errors-v1.js'))
        if rh(backup+'/lhs-oldtrek-errors-v1.js')!=EXPECTED_REMOTE:raise RuntimeError('BACKUP_HASH')
        s.put(str(LOCAL),stage);run('chmod 644 -- '+shlex.quote(stage));run('node --check '+shlex.quote(stage))
        if rh(stage)!=local_hash:raise RuntimeError('STAGE_HASH')
        if rh(REMOTE)!=EXPECTED_REMOTE:raise RuntimeError('CAS_BEFORE_SWAP')
        run('mv -f -- '+shlex.quote(stage)+' '+shlex.quote(REMOTE))
        if rh(REMOTE)!=local_hash:raise RuntimeError('LIVE_HASH')
        loop=run('curl --max-time 15 -fsS http://127.0.0.1:81/js/lhs-oldtrek-errors-v1.js | sha256sum').split()[0]
        pub=run('curl --max-time 20 -fsS https://linhhoasu.lol/js/lhs-oldtrek-errors-v1.js?v=20260927_v2 | sha256sum').split()[0]
        if loop!=local_hash or pub!=local_hash:raise RuntimeError('SERVED_HASH')
        report.update(result='DEPLOYED',localHash=local_hash,loopbackHash=loop,publicHash=pub)
        OUT.mkdir(parents=True,exist_ok=True);(OUT/'deployment.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8');print(json.dumps(report,indent=2))
    except Exception as exc:
        report.update(result='FAILED',error=str(exc));OUT.mkdir(parents=True,exist_ok=True);(OUT/'deployment.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8');raise
    finally:
        try:s.remove(stage)
        except FileNotFoundError:pass
        s.close();c.close()
if __name__=='__main__':main()
