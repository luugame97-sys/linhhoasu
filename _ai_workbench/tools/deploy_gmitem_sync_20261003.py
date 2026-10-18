from __future__ import annotations

import base64
import datetime as dt
import hashlib
import json
import shlex
from pathlib import Path

import paramiko

from rollback_role_lian_manifest_20260930 import ssh_config

ROOT = Path(__file__).resolve().parents[2]
REMOTE = '/linhhoasu/webgame/gm/assets/item/gmitem.txt'
ITEM_ID = 100097
ITEM_NAME = 'Túi tự chọn Hồn ngọc cấp 10'
OUT = ROOT / '_ai_workbench/temp/gmitem_sync_20261003'


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def main() -> None:
    args, kwargs = ssh_config()
    assert args[0] == '103.116.104.165'
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(*args, **kwargs)
    sftp = client.open_sftp()
    stamp = dt.datetime.now(dt.timezone(dt.timedelta(hours=7))).strftime('%Y%m%d_%H%M%S')
    backup = f'/linhhoasu/_ai_workbench/backups/gmitem_sync_20261003_{stamp}'
    stage = f'{REMOTE}.sync_{stamp}.tmp'
    receipt = {'at': dt.datetime.now(dt.timezone.utc).isoformat(), 'remoteFile': REMOTE,
               'item': {'id': ITEM_ID, 'name': ITEM_NAME}, 'backupDir': backup,
               'productionWrites': 0, 'playerWrites': 0, 'restart': False, 'result': 'STARTED'}

    def run(command: str, timeout: int = 45) -> str:
        _, out, err = client.exec_command(command, timeout=timeout)
        raw = out.read().decode('utf8', 'replace')
        error = err.read().decode('utf8', 'replace')
        code = out.channel.recv_exit_status()
        if code:
            raise RuntimeError(f'REMOTE_COMMAND_FAILED:{code}:{error[-900:]}')
        return raw.strip()

    def read(path: str) -> bytes:
        with sftp.open(path, 'rb') as stream:
            return stream.read()

    try:
        original = read(REMOTE)
        pre_hash = sha(original)
        text = original.decode('utf-8-sig')
        existing = [line for line in text.splitlines() if line.split(';', 1)[0].strip() == str(ITEM_ID)]
        if existing:
            if existing == [f'{ITEM_ID};{ITEM_NAME}']:
                receipt.update(result='ALREADY_PRESENT', preSha256=pre_hash, postSha256=pre_hash)
                OUT.mkdir(parents=True, exist_ok=True)
                (OUT / 'deployment.json').write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
                print(json.dumps(receipt, ensure_ascii=False, indent=2))
                return
            raise RuntimeError(f'ITEM_ID_CONFLICT:{existing}')
        newline = '\r\n' if '\r\n' in text else '\n'
        if not text.endswith(('\n', '\r')):
            text += newline
        candidate = (text + f'{ITEM_ID};{ITEM_NAME}' + newline).encode('utf8')
        post_hash = sha(candidate)
        receipt.update(preSha256=pre_hash, postSha256=post_hash, bytesBefore=len(original), bytesAfter=len(candidate))

        run(f'install -d -m 700 -- {shlex.quote(backup)}')
        backup_file = f'{backup}/gmitem.txt'
        run(f'cp -p -- {shlex.quote(REMOTE)} {shlex.quote(backup_file)}')
        if sha(read(backup_file)) != pre_hash:
            raise RuntimeError('BACKUP_HASH_MISMATCH')
        with sftp.open(stage, 'wb') as stream:
            stream.write(candidate)
        run(f'chown --reference={shlex.quote(REMOTE)} {shlex.quote(stage)} && chmod --reference={shlex.quote(REMOTE)} {shlex.quote(stage)}')
        if sha(read(stage)) != post_hash:
            raise RuntimeError('STAGE_HASH_MISMATCH')
        if sha(read(REMOTE)) != pre_hash:
            raise RuntimeError('CAS_BEFORE_SWAP_FAILED')
        sftp.posix_rename(stage, REMOTE)
        if sha(read(REMOTE)) != post_hash:
            raise RuntimeError('POST_SWAP_HASH_MISMATCH')
        rows = [line for line in read(REMOTE).decode('utf-8-sig').splitlines() if line.startswith(f'{ITEM_ID};')]
        if rows != [f'{ITEM_ID};{ITEM_NAME}']:
            raise RuntimeError(f'ITEM_READBACK_MISMATCH:{rows}')

        php = "require '/linhhoasu/webgame/gm/config.php';$m=vht6ur_item_catalog();echo json_encode(['allowed'=>isset($m[100097]),'name'=>$m[100097]??null],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES),\"\\n\";"
        encoded = base64.b64encode(php.encode()).decode()
        output = run('php -r ' + shlex.quote(f'eval(base64_decode("{encoded}"));'))
        readback = json.loads(next(line for line in reversed(output.splitlines()) if line.startswith('{')))
        if readback != {'allowed': True, 'name': ITEM_NAME}:
            raise RuntimeError(f'PHP_READBACK_MISMATCH:{readback}')
        receipt.update(result='DEPLOYED', phpReadback=readback, completedAt=dt.datetime.now(dt.timezone.utc).isoformat())
        OUT.mkdir(parents=True, exist_ok=True)
        (OUT / 'deployment.json').write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
        print(json.dumps(receipt, ensure_ascii=False, indent=2))
    except Exception as exc:
        receipt.update(result='FAILED', error=str(exc))
        OUT.mkdir(parents=True, exist_ok=True)
        (OUT / 'deployment.json').write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
        try:
            sftp.remove(stage)
        except FileNotFoundError:
            pass
        raise
    finally:
        try:
            sftp.remove(stage)
        except FileNotFoundError:
            pass
        sftp.close()
        client.close()


if __name__ == '__main__':
    main()
