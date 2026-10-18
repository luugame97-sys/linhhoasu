import json
from pathlib import Path
import paramiko
from rollback_role_lian_manifest_20260930 import ssh_config

root = Path(__file__).resolve().parents[2]
args, kwargs = ssh_config()
assert args[0] == '103.116.104.165'
source = (root / '_ai_workbench/tools/audit_oldtrek_talo_20261001.js').read_text(encoding='utf-8-sig')
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(*args, **kwargs)
try:
    stdin, stdout, stderr = ssh.exec_command('cd /linhhoasu/lhs/newServer && timeout 55s node -', timeout=60)
    stdin.write(source)
    stdin.channel.shutdown_write()
    out = stdout.read().decode('utf-8', 'replace')
    err = stderr.read().decode('utf-8', 'replace')
    code = stdout.channel.recv_exit_status()
    if code:
        raise RuntimeError(f'REMOTE_AUDIT_FAILED:{code}:{err[-1000:]}')
    data = json.loads(out)
    target = root / '_ai_workbench/temp/oldtrek_audit_20261001/talo.json'
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'readOnly':True,'found':[{'sid':r['sid'],'rows':[{'name':p.get('name'),'level':p.get('level'),'eventId':p.get('other_attr_info',{}).get('oldTrekInfo',{}).get('sailInfo',{}).get('currentEvent',{}).get('id')} for p in r.get('rows',[])]} for r in data['found']]}))
finally:
    ssh.close()
