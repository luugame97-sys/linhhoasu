from __future__ import annotations

import datetime as dt
import hashlib
import json
import shlex
import time
from pathlib import Path

import paramiko

from rollback_role_lian_manifest_20260930 import ssh_config


ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / '_ai_workbench/temp/oldtrek_recovery_20261002'
REMOTE = '/linhhoasu/lhs/newServer/src/handlers/old-trek.js'
LOCAL = ROOT / '_ai_workbench/temp/oldtrek_recovery_20261002/candidate/server/src/handlers/old-trek.js'
EXPECTED = '51998a3ab10311c699b706a164184a1a459ad7388e17997c6d1b258854acf141'
NODE = 'lhs-s1006'
PORT = 8087


def sha(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def q(value: str) -> str:
    return shlex.quote(value)


def main() -> None:
    data = LOCAL.read_bytes()
    after = sha(data)
    assert b'recoverExpiredOldTrekEvent' in data and b'OLD_TREK_RESYNC_REQUIRED' in data

    args, kwargs = ssh_config()
    assert args[0] == '103.116.104.165'
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(*args, **kwargs)
    sftp = client.open_sftp()
    stamp = dt.datetime.now(dt.timezone(dt.timedelta(hours=7))).strftime('%Y%m%d_%H%M%S')
    backup = f'/linhhoasu/_ai_workbench/backups/oldtrek_recovery_canary_{stamp}'
    stage = REMOTE + f'.recovery_{stamp}.js'
    receipt = {'at': dt.datetime.now(dt.timezone.utc).isoformat(), 'backupDir': backup,
               'directPlayerWrites': 0, 'node': NODE, 'result': 'STARTED',
               'before': EXPECTED, 'after': after}
    swapped = False

    def run(command: str, timeout: int = 50) -> bytes:
        _, out, err = client.exec_command(command, timeout=timeout)
        raw = out.read(); error = err.read(); code = out.channel.recv_exit_status()
        if code:
            raise RuntimeError(f'COMMAND_FAILED:{code}:{error.decode("utf8", "replace")[-900:]}')
        return raw

    def rh(path: str) -> str:
        with sftp.open(path, 'rb') as f:
            return sha(f.read())

    def ready() -> dict:
        end = time.monotonic() + 60
        while True:
            try:
                value = json.loads(run(f'curl --max-time 5 -fsS http://127.0.0.1:{PORT}/ready', 8).decode())
                if value.get('status') == 'ok' and value.get('checks', {}).get('mongo') is True and value.get('checks', {}).get('redis') is True:
                    return value
            except Exception:
                pass
            if time.monotonic() >= end:
                raise RuntimeError('S6_READY_TIMEOUT')
            time.sleep(1)

    try:
        current = rh(REMOTE)
        if current != EXPECTED:
            raise RuntimeError(f'CAS_MISMATCH:{current}:{EXPECTED}')
        receipt['preProcess'] = next(x for x in json.loads(run('pm2 jlist').decode()) if x['name'] == NODE)
        receipt['preReady'] = ready()
        run(f'mkdir -m 700 -- {q(backup)}')
        run(f'cp -p -- {q(REMOTE)} {q(backup + "/old-trek.js")}')
        if rh(backup + '/old-trek.js') != EXPECTED:
            raise RuntimeError('BACKUP_HASH_MISMATCH')
        with sftp.open(stage, 'wb') as f:
            f.write(data)
        sftp.chmod(stage, 0o644)
        run(f'node --check {q(stage)}')
        if rh(stage) != after:
            raise RuntimeError('STAGE_HASH_MISMATCH')
        sftp.posix_rename(stage, REMOTE)
        swapped = True
        if rh(REMOTE) != after:
            raise RuntimeError('POST_SWAP_HASH_MISMATCH')
        run(f'pm2 restart {q(NODE)} --update-env')
        receipt['postReady'] = ready()
        receipt['postProcess'] = next(x for x in json.loads(run('pm2 jlist').decode()) if x['name'] == NODE)
        if receipt['postProcess']['pm2_env']['status'] != 'online' or receipt['postProcess']['pid'] == receipt['preProcess']['pid']:
            raise RuntimeError('S6_PROCESS_RESTART_GATE_FAILED')
        receipt['liveHash'] = rh(REMOTE)
        receipt['result'] = 'CANARY_DEPLOYED_VERIFIED'
        receipt['completedAt'] = dt.datetime.now(dt.timezone.utc).isoformat()
    except Exception as exc:
        receipt['result'] = 'FAILED'
        receipt['error'] = str(exc)
        if swapped:
            rollback_stage = REMOTE + f'.rollback_{stamp}.js'
            run(f'cp -p -- {q(backup + "/old-trek.js")} {q(rollback_stage)}')
            sftp.posix_rename(rollback_stage, REMOTE)
            run(f'pm2 restart {q(NODE)} --update-env')
            receipt['rollback'] = 'restored'
        else:
            receipt['rollback'] = 'not_needed'
        raise
    finally:
        OUT.mkdir(parents=True, exist_ok=True)
        (OUT / 'canary_deployment.json').write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
        try:
            sftp.remove(stage)
        except FileNotFoundError:
            pass
        sftp.close(); client.close()
        print(json.dumps(receipt, ensure_ascii=False, indent=2), flush=True)


if __name__ == '__main__':
    main()
