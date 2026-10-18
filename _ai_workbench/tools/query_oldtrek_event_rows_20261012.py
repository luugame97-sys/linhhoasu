import json
import paramiko
from rollback_role_lian_manifest_20260930 import ssh_config

args, kwargs = ssh_config()
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(*args, **kwargs)
try:
    js = "const c=require('/linhhoasu/lhs/newServer/src/services/ConfigService');c.loadAllTables();const t=c.get('OldTrekCommonEventConfig')||{};console.log(JSON.stringify(Object.values(t).filter(r=>[2,99].includes(Number(r.eventType))).map(r=>({id:r.id,eventType:r.eventType,nextId:r.nextId,choiceNext:r.choiceNext,checkValue:r.checkValue}))));"
    _, out, err = c.exec_command('cd /linhhoasu/lhs/newServer && node -e ' + json.dumps(js), timeout=60)
    print(out.read().decode('utf-8', 'replace'))
    print(err.read().decode('utf-8', 'replace'))
finally:
    c.close()
