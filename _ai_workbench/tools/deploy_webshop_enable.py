import getpass
import hashlib
import json
import os
import posixpath
from datetime import datetime, timezone

import paramiko


HOST = '103.116.105.154'
REMOTE_ROOT = '/linhhoasu/webgame/gm'
LOCAL_CATALOG = r'I:\Linhhoasu\server\server\_ai_workbench\temp\webshop_remote_audit\assets__item__webshop_catalog.json'
LOCAL_ENABLE = r'I:\Linhhoasu\server\server\_ai_workbench\tools\enable_webshop_categories.php'
REMOTE_CATALOG = f'{REMOTE_ROOT}/assets/item/webshop_catalog.json'


def run(ssh, command):
    _, stdout, stderr = ssh.exec_command(command)
    text = stdout.read().decode('utf-8', 'replace')
    code = stdout.channel.recv_exit_status()
    if code:
        raise RuntimeError(stderr.read().decode('utf-8', 'replace')[-3000:])
    return text


def sha(path):
    digest = hashlib.sha256()
    with open(path, 'rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


with open(LOCAL_CATALOG, 'rb') as stream:
    catalog_bytes = stream.read()
catalog = json.loads(catalog_bytes.decode('utf-8'))
if catalog['sort_groups']['gem'].get('enabled') is not True or catalog['sort_groups']['rare'].get('enabled') is not True:
    raise RuntimeError('local catalog groups are not enabled')
targets = [row for row in catalog['items'] if row.get('category') in ('gem', 'rare')]
if len(targets) != 32:
    raise RuntimeError(f'expected 32 target rows, got {len(targets)}')

password = getpass.getpass('VPS password (not logged): ')
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username='root', password=password, look_for_keys=False, allow_agent=False, timeout=15)

remote_enable = None
stage_catalog = None
try:
    stamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
    backup = f'/linhhoasu/_ai_workbench/backups/webshop_enable_categories_{stamp}'
    run(ssh, f'mkdir -p {backup}')
    run(ssh, f'cp -p {REMOTE_CATALOG} {backup}/webshop_catalog_before.json')

    remote_enable = f'/linhhoasu/_ai_workbench/temp/enable_webshop_categories_{stamp}.php'
    stage_catalog = f'{REMOTE_CATALOG}.deploy-{stamp}.json'
    sftp = ssh.open_sftp()
    try:
        sftp.put(LOCAL_CATALOG, stage_catalog)
        sftp.put(LOCAL_ENABLE, remote_enable)
    finally:
        sftp.close()

    run(ssh, f'php -r \'$d=json_decode(file_get_contents("{stage_catalog}"),true); if(!is_array($d)||($d["sort_groups"]["gem"]["enabled"]??null)!==true||($d["sort_groups"]["rare"]["enabled"]??null)!==true||count($d["items"]??[])!==141) exit(2); echo "CATALOG_OK\\n";\'')
    run(ssh, f'php -l {remote_enable}')
    run(ssh, f'mv {stage_catalog} {REMOTE_CATALOG}; chmod 644 {REMOTE_CATALOG}')
    result = run(ssh, f'php {remote_enable} {backup}')
    parsed = json.loads(result[result.find('{'):])
    if parsed.get('targets') != 32 or parsed.get('active_after') != 32 or parsed.get('policy') != {'gem': True, 'rare': True, 'normal': True}:
        raise RuntimeError(f'enable readback failed: {result}')

    run(ssh, f'php -l {REMOTE_ROOT}/config.php')
    run(ssh, f'php -l {REMOTE_ROOT}/api/user_api.php')
    run(ssh, f'php -l {REMOTE_ROOT}/admin/admin_api.php')
    readback = run(ssh, f"cd {REMOTE_ROOT} && php -r 'require \"config.php\"; $ids=array(25011,25012,25013,25014,25021,25022,25023,25024,25031,25032,25033,25034,25041,25042,25043,25044,25051,25052,25053,25054,90014,90015,90016,90034,90036,90042,90043,90064,90065,100005,100006,100043); $m=implode(\",\",array_fill(0,count($ids),\"?\")); $s=$conn_web->prepare(\"SELECT COUNT(*) FROM webshop_items WHERE item_id IN ($m) AND is_active=1\"); $s->execute($ids); echo $s->fetchColumn();' ").strip()
    if readback != '32':
        raise RuntimeError(f'active target readback is not 32: {readback}')
    policy_raw = run(ssh, f"cd {REMOTE_ROOT} && php -r 'require \"config.php\"; echo json_encode(array(\"gem\"=>webshop_item_sale_enabled(25011),\"rare\"=>webshop_item_sale_enabled(90014),\"normal\"=>webshop_item_sale_enabled(2)));' ")
    policy = json.loads(policy_raw[policy_raw.find('{'):])
    print(json.dumps({
        'result': 'ok',
        'backup': backup,
        'active_before': parsed.get('active_before'),
        'active_after': parsed.get('active_after'),
        'policy': policy,
        'catalog_sha256': sha(LOCAL_CATALOG),
    }, ensure_ascii=False, indent=2))
finally:
    try:
        if remote_enable:
            run(ssh, f'rm -f {remote_enable} {stage_catalog or ""}')
    except Exception:
        pass
    ssh.close()
