from pathlib import Path
import json, sys, paramiko
from rollback_role_lian_manifest_20260930 import ssh_config
ROOT=Path(__file__).resolve().parents[2]
args,kwargs=ssh_config(); assert args[0]=='103.116.104.165'
mode=sys.argv[1] if len(sys.argv)>1 else 'live'
if mode not in ['live','cas']:raise ValueError('Unsupported audit')
source=(ROOT/('_ai_workbench/tools/audit_oldtrek_'+mode+'_20261001.js')).read_text(encoding='utf-8-sig')
c=paramiko.SSHClient();c.set_missing_host_key_policy(paramiko.AutoAddPolicy());c.connect(*args,**kwargs)
try:
    i,o,e=c.exec_command('cd /linhhoasu/lhs/newServer && timeout 65s node -',timeout=70);i.write(source);i.channel.shutdown_write();out=o.read().decode('utf8','replace');err=e.read().decode('utf8','replace');rc=o.channel.recv_exit_status()
    if rc: raise RuntimeError('REMOTE_AUDIT_FAILED:'+str(rc)+':'+err[-1200:])
    data=json.loads(out); outdir=ROOT/'_ai_workbench/temp/oldtrek_audit_20261001';outdir.mkdir(parents=True,exist_ok=True);(outdir/(mode+'.json')).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf8');print(json.dumps(data,ensure_ascii=False,indent=2))
finally:c.close()
