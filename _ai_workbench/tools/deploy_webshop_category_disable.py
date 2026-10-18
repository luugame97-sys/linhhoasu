import getpass
import hashlib
import json
import os
import posixpath
from datetime import datetime, timezone

import paramiko

HOST = '103.116.105.154'
REMOTE_ROOT = '/linhhoasu/webgame/gm'
LOCAL_DIR = r'I:\Linhhoasu\server\server\_ai_workbench\temp\webshop_remote_audit'
DISABLE_SCRIPT = r'I:\Linhhoasu\server\server\_ai_workbench\tools\disable_webshop_categories.php'
stamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
backup = f'/linhhoasu/_ai_workbench/backups/webshop_disable_categories_{stamp}'

files = {
    'config.php': os.path.join(LOCAL_DIR, 'config.php'),
    'api/user_api.php': os.path.join(LOCAL_DIR, 'api__user_api.php'),
    'admin/admin_api.php': os.path.join(LOCAL_DIR, 'admin__admin_api.php'),
    'assets/item/webshop_catalog.json': os.path.join(LOCAL_DIR, 'assets__item__webshop_catalog.json'),
    '_ai_workbench/tools/sync_webshop_catalog.php': os.path.join(LOCAL_DIR, '_ai_workbench__tools__sync_webshop_catalog.php'),
}


def sha(data): return hashlib.sha256(data).hexdigest()
def read(path):
    with open(path, 'rb') as stream: return stream.read()
def run(ssh, command, check=True):
    _, out, err = ssh.exec_command(command)
    text = out.read().decode('utf-8', 'replace')
    code = out.channel.recv_exit_status()
    if check and code:
        raise RuntimeError(f'command failed ({code}): {err.read().decode("utf-8", "replace")[-4000:]}')
    return text


payloads = {relative: read(local) for relative, local in files.items()}
catalog = json.loads(payloads['assets/item/webshop_catalog.json'].decode('utf-8'))
if catalog['sort_groups']['gem'].get('enabled') is not False or catalog['sort_groups']['rare'].get('enabled') is not False:
    raise RuntimeError('local catalog groups are not disabled')
targets = [row for row in catalog['items'] if row.get('category') in ('gem', 'rare')]
if len(targets) != 32:
    raise RuntimeError(f'expected 32 local catalog targets, got {len(targets)}')
required = {
    'config.php': b'function webshop_catalog_policy()',
    'api/user_api.php': b'if (!webshop_item_sale_enabled($item_id))',
    'admin/admin_api.php': b'Category c\xe1\xbb\'a item',  # relaxed check below handles UTF-8 text
    '_ai_workbench/tools/sync_webshop_catalog.php': b"'is_active' => $groupEnabled ? 1 : 0",
}
if required['config.php'] not in payloads['config.php'] or required['api/user_api.php'] not in payloads['api/user_api.php']:
    raise RuntimeError('local policy guard missing')
if b'webshop_item_sale_enabled' not in payloads['admin/admin_api.php']:
    raise RuntimeError('local admin policy guard missing')
if required['_ai_workbench/tools/sync_webshop_catalog.php'] not in payloads['_ai_workbench/tools/sync_webshop_catalog.php']:
    raise RuntimeError('local sync policy missing')

ssh = paramiko.SSHClient(); ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username='root', password=getpass.getpass('VPS password (not logged): '), look_for_keys=False, allow_agent=False, timeout=15)
try:
    sftp = ssh.open_sftp()
    originals = {}
    try:
        for relative in files:
            with sftp.open(f'{REMOTE_ROOT}/{relative}', 'rb') as stream:
                originals[relative] = stream.read()
    finally:
        sftp.close()

    # Fail closed if another deployment already changed these exact areas.
    if b'function webshop_catalog_policy()' in originals['config.php']:
        raise RuntimeError('remote category policy already exists unexpectedly')
    if b'webshop_item_sale_enabled' in originals['api/user_api.php'] or b'webshop_item_sale_enabled' in originals['admin/admin_api.php']:
        raise RuntimeError('remote API category policy already exists unexpectedly')
    remote_catalog = json.loads(originals['assets/item/webshop_catalog.json'].decode('utf-8'))
    if 'enabled' in remote_catalog['sort_groups']['gem'] or 'enabled' in remote_catalog['sort_groups']['rare']:
        raise RuntimeError('remote catalog enabled flag already changed unexpectedly')

    run(ssh, f'mkdir -p {backup}')
    stage_paths = {}
    sftp = ssh.open_sftp()
    try:
        for relative, payload in payloads.items():
            backup_name = relative.replace('/', '__')
            with sftp.open(posixpath.join(backup, backup_name), 'wb') as stream:
                stream.write(originals[relative])
            suffix = '.json' if relative.endswith('.json') else '.php'
            stage = f'{REMOTE_ROOT}/{relative}.deploy-{stamp}{suffix}'
            with sftp.open(stage, 'wb') as stream:
                stream.write(payload)
            stage_paths[relative] = stage
        remote_disable = f'/linhhoasu/_ai_workbench/temp/disable_webshop_categories_{stamp}.php'
        sftp.put(DISABLE_SCRIPT, remote_disable)
    finally:
        sftp.close()

    # Syntax and catalog validation before replacing any live file.
    for relative in ('config.php','api/user_api.php','admin/admin_api.php','_ai_workbench/tools/sync_webshop_catalog.php'):
        run(ssh, f'php -l {stage_paths[relative]}')
    run(ssh, f"php -r '$d=json_decode(file_get_contents(\"{stage_paths['assets/item/webshop_catalog.json']}\"),true); if(!is_array($d)||($d[\"sort_groups\"][\"gem\"][\"enabled\"]??null)!==false||($d[\"sort_groups\"][\"rare\"][\"enabled\"]??null)!==false) exit(2); echo \"CATALOG_OK\\n\";' ")
    run(ssh, f'php -l {remote_disable}')
    dry_run = run(ssh, f"php {stage_paths['_ai_workbench/tools/sync_webshop_catalog.php']} --catalog={stage_paths['assets/item/webshop_catalog.json']} --project={REMOTE_ROOT}")
    if 'DRY-RUN catalog: 141 items' not in dry_run:
        raise RuntimeError('catalog dry-run did not validate 141 items: ' + dry_run[-1000:])

    # Promote source-of-truth and policy guards together.
    for relative, stage in stage_paths.items():
        remote = f'{REMOTE_ROOT}/{relative}'
        run(ssh, f'mv {stage} {remote}; chmod 644 {remote}')

    disable_result = run(ssh, f'php {remote_disable} {backup}')
    parsed = json.loads(disable_result[disable_result.find('{'):])
    if parsed.get('targets') != 32 or parsed.get('active_after') != 0:
        raise RuntimeError('database disable verification failed: ' + disable_result)

    policy_test = run(ssh, f"cd {REMOTE_ROOT} && php -r 'require \"config.php\"; echo json_encode(array(\"gem\"=>webshop_item_sale_enabled(25011),\"rare\"=>webshop_item_sale_enabled(90014),\"normal\"=>webshop_item_sale_enabled(2)));' ")
    policy = json.loads(policy_test[policy_test.find('{'):])
    if policy != {'gem': False, 'rare': False, 'normal': True}:
        raise RuntimeError('policy helper verification failed: ' + policy_test)

    # Final PHP syntax and active-row readback.
    for relative in ('config.php','api/user_api.php','admin/admin_api.php','_ai_workbench/tools/sync_webshop_catalog.php'):
        run(ssh, f'php -l {REMOTE_ROOT}/{relative}')
    readback = run(ssh, f"cd {REMOTE_ROOT} && php -r 'require \"config.php\"; $ids=array(25011,25012,25013,25014,25021,25022,25023,25024,25031,25032,25033,25034,25041,25042,25043,25044,25051,25052,25053,25054,90014,90015,90016,90034,90036,90042,90043,90064,90065,100005,100006,100043); $m=implode(\",\",array_fill(0,count($ids),\"?\")); $s=$conn_web->prepare(\"SELECT COUNT(*) FROM webshop_items WHERE item_id IN ($m) AND is_active=1\"); $s->execute($ids); echo $s->fetchColumn();' ").strip()
    if readback != '0':
        raise RuntimeError('active target readback is not zero: ' + readback)

    print(json.dumps({
        'result': 'ok',
        'backup': backup,
        'disabled': parsed,
        'policy': policy,
        'dry_run': dry_run.strip().splitlines()[:8],
        'hashes': {relative: sha(payload) for relative, payload in payloads.items()},
    }, ensure_ascii=False, indent=2))
finally:
    try:
        ssh.exec_command(f'rm -f /linhhoasu/_ai_workbench/temp/disable_webshop_categories_{stamp}.php')
    except Exception:
        pass
    ssh.close()
