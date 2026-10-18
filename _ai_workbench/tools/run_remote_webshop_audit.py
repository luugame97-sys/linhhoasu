import getpass
import json
import os
from datetime import datetime, timezone

import paramiko

HOST = '103.116.105.154'
LOCAL_SCRIPT = r'I:\Linhhoasu\server\server\_ai_workbench\tools\audit_webshop_db.php'
LOCAL_OUTPUT = r'I:\Linhhoasu\server\server\_ai_workbench\temp\webshop_remote_audit\db_audit.json'
stamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
remote_script = f'/linhhoasu/_ai_workbench/temp/audit_webshop_db_{stamp}.php'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username='root', password=getpass.getpass('VPS password (not logged): '), look_for_keys=False, allow_agent=False, timeout=15)
try:
    sftp = ssh.open_sftp()
    try:
        sftp.put(LOCAL_SCRIPT, remote_script)
    finally:
        sftp.close()
    _, out, err = ssh.exec_command(f'php {remote_script}')
    raw = out.read().decode('utf-8', 'replace')
    code = out.channel.recv_exit_status()
    if code:
        raise RuntimeError(err.read().decode('utf-8', 'replace')[-3000:])
    data = json.loads(raw)
    os.makedirs(os.path.dirname(LOCAL_OUTPUT), exist_ok=True)
    with open(LOCAL_OUTPUT, 'w', encoding='utf-8') as stream:
        json.dump(data, stream, ensure_ascii=False, indent=2)
    print(json.dumps({
        key: data[key] for key in (
            'target_catalog_count','products_count','active_products',
            'gem_products','rare_products','orders_count','order_columns'
        )
    }, ensure_ascii=False, indent=2))
    print('PRODUCTS')
    for row in data['products']:
        print(row)
    print('ORDERS_REDACTED')
    for row in data['orders']:
        print(row)
finally:
    try:
        ssh.exec_command(f'rm -f {remote_script}')
    except Exception:
        pass
    ssh.close()
