"""Narrow PHP Donate cap update, CAS + selected backup; never print config secrets."""
import hashlib
import json
import shlex
from snapshot_web_multiserver_20260906 import connect, run

TARGET = '/linhhoasu/webgame/gm/config.php'
BACKUP = '/linhhoasu/_ai_workbench/backups/donate_item_milestones_20260912/config.php.before'
STAGE = '/linhhoasu/_ai_workbench/temp/donate_item_caps_20260912.php'
OLD = b'function donate_reward_amount_limit($id) { $id=(int)$id;if($id===3)return 0;if($id===2)return 10000000000;if($id===1)return 10000000;if($id===4||$id===5||$id===6)return 1000000;return 999999; }'
NEW = b'function donate_reward_amount_limit($id) { $id=(int)$id;if($id===3)return 0;if($id===2)return 10000000000;if($id===1||$id===7||$id===20||$id===60)return 10000000;if($id===4||$id===5||$id===6||$id===8||$id===61)return 1000000;return 999999; }'

ssh = connect()
try:
    with ssh.open_sftp() as sftp:
        before = sftp.open(TARGET, 'rb').read()
        if before.count(OLD) != 1:
            raise RuntimeError('CAP_BASELINE_DRIFT')
        candidate = before.replace(OLD, NEW, 1)
        stat = sftp.stat(TARGET)
        try:
            sftp.stat(BACKUP)
            raise RuntimeError('BACKUP_ALREADY_EXISTS')
        except FileNotFoundError:
            pass
        with sftp.open(STAGE, 'wb') as f:
            f.write(candidate)
        sftp.chmod(STAGE, stat.st_mode & 0o777)
        run(ssh, 'php -l ' + shlex.quote(STAGE))
        if sftp.open(TARGET, 'rb').read() != before:
            raise RuntimeError('CAP_PRECOMMIT_DRIFT')
        with sftp.open(BACKUP, 'wb') as f:
            f.write(before)
        sftp.chmod(BACKUP, 0o600)
        sftp.posix_rename(STAGE, TARGET)
        after = sftp.open(TARGET, 'rb').read()
        if after != candidate:
            raise RuntimeError('CAP_READBACK_MISMATCH')
    print(json.dumps({'result': 'PASS', 'beforeSha256': hashlib.sha256(before).hexdigest(), 'afterSha256': hashlib.sha256(after).hexdigest(), 'backup': BACKUP, 'restart': False}))
finally:
    ssh.close()
