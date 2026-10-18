import getpass
import json
from datetime import datetime, timezone

import paramiko


HOST = '103.116.105.154'
ROOT = '/linhhoasu/webgame/gm'
LOCAL_REPAIR = r'I:\Linhhoasu\server\server\_ai_workbench\tools\repair_webshop_reward_orders.js'


password = getpass.getpass('VPS password (not logged): ')
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username='root', password=password, look_for_keys=False, allow_agent=False, timeout=15)


def run(command):
    _, stdout, stderr = ssh.exec_command(command)
    text = stdout.read().decode('utf-8', 'replace')
    code = stdout.channel.recv_exit_status()
    if code:
        raise RuntimeError(stderr.read().decode('utf-8', 'replace')[-4000:])
    return text


remote_repair = None
orders_path = None
try:
    stamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
    backup = f'/linhhoasu/_ai_workbench/backups/webshop_reward_compensation_{stamp}'
    orders_path = f'/linhhoasu/_ai_workbench/temp/webshop_reward_orders_{stamp}.json'
    remote_repair = f'/linhhoasu/_ai_workbench/temp/repair_webshop_reward_orders_{stamp}.js'
    run(f'mkdir -p {backup}')
    php = r'''require "config.php";
$ids=array(25011,25012,25013,25014,25021,25022,25023,25024,25031,25032,25033,25034,25041,25042,25043,25044,25051,25052,25053,25054,90014,90015,90016,90034,90036,90042,90043,90064,90065,100005,100006,100043);
$m=implode(",",array_fill(0,count($ids),"?"));
$s=$conn_web->prepare("SELECT id,role_id,item_id,quantity,created_at,status FROM webshop_orders WHERE id<=119 AND item_id IN ($m) ORDER BY id");
$s->execute($ids); echo json_encode($s->fetchAll(PDO::FETCH_ASSOC),JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);'''
    orders_raw = run(f"cd {ROOT} && php -r '{php}'")
    orders = json.loads(orders_raw[orders_raw.find('['):])
    if len(orders) != 16:
        raise RuntimeError(f'expected 16 paid pre-fix orders, got {len(orders)}')

    sftp = ssh.open_sftp()
    try:
        with sftp.open(orders_path, 'w') as stream:
            stream.write(json.dumps(orders, ensure_ascii=False))
        sftp.chmod(orders_path, 0o600)
        sftp.put(LOCAL_REPAIR, remote_repair)
        sftp.chmod(remote_repair, 0o700)
    finally:
        sftp.close()

    run(f'node --check {remote_repair}')
    dry_raw = run(f'cd /linhhoasu/lhs/newServer && node {remote_repair} {orders_path} {backup}')
    dry = json.loads(dry_raw[dry_raw.find('{'):])
    if dry.get('result') != 'ok' or dry.get('orderCount') != 16:
        raise RuntimeError(f'dry run failed: {dry_raw}')
    commit_raw = run(f'cd /linhhoasu/lhs/newServer && node {remote_repair} {orders_path} {backup} --commit')
    committed = json.loads(commit_raw[commit_raw.find('{'):])
    if committed.get('result') != 'ok' or committed.get('createdCount') != committed.get('expectedCreates'):
        raise RuntimeError(f'commit readback failed: {commit_raw}')
    second_raw = run(f'cd /linhhoasu/lhs/newServer && node {remote_repair} {orders_path} {backup} --commit')
    second = json.loads(second_raw[second_raw.find('{'):])
    if second.get('result') != 'ok' or second.get('createdCount') != committed.get('createdCount'):
        raise RuntimeError(f'idempotency readback failed: {second_raw}')
    print(json.dumps({
        'result': 'ok',
        'backup': backup,
        'orderCount': committed.get('orderCount'),
        'createdCount': committed.get('createdCount'),
        'actions': committed.get('actions'),
        'idempotentCreatedCount': second.get('createdCount'),
    }, ensure_ascii=False, indent=2))
finally:
    try:
        run(f'rm -f {remote_repair or ""} {orders_path or ""}')
    except Exception:
        pass
    ssh.close()
