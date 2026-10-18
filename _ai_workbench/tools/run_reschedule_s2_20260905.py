"""Audit/apply the S2 date change; credentials are read only from the supplied file."""
import json
import os
import shlex
import sys
from datetime import datetime, timezone
from pathlib import Path
import paramiko

root=Path(__file__).resolve().parents[1]
mode=sys.argv[1] if len(sys.argv)>1 else 'audit'
if mode not in ['audit','apply']: raise RuntimeError('INVALID_MODE')
credentials=Path(os.environ['LHS_PROD_CREDENTIAL_FILE']).read_text(encoding='utf-8-sig').splitlines()
if credentials[0].strip()!='103.116.105.154' or credentials[1].strip()!='root': raise RuntimeError('TARGET_MISMATCH')
ssh=paramiko.SSHClient();ssh.load_system_host_keys();ssh.set_missing_host_key_policy(paramiko.RejectPolicy())
ssh.connect(credentials[0].strip(),username='root',password=credentials[2],look_for_keys=False,allow_agent=False,timeout=20)
try:
    stamp=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
    backup_dir='/linhhoasu/_ai_workbench/backups/s2_reschedule_'+stamp
    if mode=='apply':
        _,out,err=ssh.exec_command('install -d -m 700 '+shlex.quote(backup_dir))
        if out.channel.recv_exit_status(): raise RuntimeError(err.read().decode())
    command='S2_SCHEDULE_MODE='+mode+' S2_SCHEDULE_BACKUP='+shlex.quote(backup_dir+'/before.json')+' node -'
    i,o,e=ssh.exec_command(command,timeout=90)
    i.write((root/'tools/reschedule_s2_20260905.js').read_text(encoding='utf-8'));i.flush();i.channel.shutdown_write()
    output=o.read().decode('utf-8');error=e.read().decode('utf-8')
    code=o.channel.recv_exit_status()
    if code: raise RuntimeError(error[-1500:])
    data=json.loads(output.strip().splitlines()[-1])
    path=root/('temp/s2_reschedule_'+mode+'_'+stamp+'.json')
    path.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'evidence':str(path),'data':data},ensure_ascii=False))
finally: ssh.close()
