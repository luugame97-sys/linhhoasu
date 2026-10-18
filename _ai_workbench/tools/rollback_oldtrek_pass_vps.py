"""Rollback OldTrekPass fix on VPS and local workspace to pre-deploy backup."""
import hashlib
import json
import shlex
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parent))
from snapshot_web_multiserver_20260906 import connect, run

WB = Path(__file__).resolve().parents[1]
ROOT = WB.parent / 'linhhoasu/lhs/newServer'
APP = '/linhhoasu/lhs/newServer'
BACKUP = '/linhhoasu/_ai_workbench/backups/oldtrek_pass_fix_20260920_pre'
LOCAL = WB / 'temp/oldtrek_rollback_20260920'

FILES = [
    'src/handlers/old-trek.js',
    'src/services/RechargeRewardResolver.js',
    'src/services/RechargeBenefitService.js',
    'src/handlers/compat.js',
    'src/handlers/recharge.js',
]

BASELINE = {
    'src/handlers/old-trek.js': 'c81ab9df8766deccfd4a957e5255182e250ea6df7f25f1bd44dad717fae74aa5',
    'src/services/RechargeRewardResolver.js': '79122443c25b1ec0b6f39df3705a37e3f89f51d41bd745d569229162af6fdd0e',
    'src/services/RechargeBenefitService.js': '71dce3fe541dab948fd7194fbf20ceeb6df264c60f0cde05b7593ff753c52c6d',
    'src/handlers/compat.js': 'adc70ada84957e3f417143396fa00ccab46f2883d1433923590f8538f04eb8ad',
    'src/handlers/recharge.js': 'c88e6852df7ad112dc8aceb2d9b200c3fddc79ae994c1d2031f6862916fbfb19',
}

NODES = ['lhs-s1001', 'lhs-s1002', 'lhs-s1003', 'lhs-s1004', 'lhs-s1005']
PORTS = [8080, 8083, 8084, 8085, 8086]


def sha(data):
    return hashlib.sha256(data).hexdigest()


def remote_digest(ssh, path):
    return run(ssh, f"sha256sum {shlex.quote(path)} | awk '{{print $1}}'").strip()


def wait_ready(ssh):
    last = {}
    for _ in range(20):
        last = {}
        for port in PORTS:
            try:
                code = run(ssh, f"curl -fsS --max-time 5 -o /dev/null -w '%{{http_code}}' http://127.0.0.1:{port}/ready").strip()
                last[str(port)] = code
            except RuntimeError:
                last[str(port)] = '000'
        if set(last.values()) == {'200'}:
            return last
        time.sleep(2)
    return last


def main():
    LOCAL.mkdir(parents=True, exist_ok=True)
    ssh = connect()
    try:
        print("[1/5] Verifying backup files on VPS...")
        for rel, expected in BASELINE.items():
            backup_file = BACKUP + '/' + rel
            actual = remote_digest(ssh, backup_file)
            if actual != expected:
                raise RuntimeError(f"BACKUP_HASH_MISMATCH: {backup_file} expected={expected} actual={actual}")
        print("  Backup files verified against baseline hashes.")

        print("[2/5] Restoring backup files to live VPS directory...")
        with ssh.open_sftp() as sftp:
            for rel in FILES:
                remote_backup = BACKUP + '/' + rel
                remote_dest = APP + '/' + rel
                run(ssh, f"cp {shlex.quote(remote_backup)} {shlex.quote(remote_dest)}")
                # also sync to local workspace
                with sftp.open(remote_backup, 'rb') as stream:
                    content = stream.read()
                local_dest = ROOT / rel
                local_dest.parent.mkdir(parents=True, exist_ok=True)
                local_dest.write_bytes(content)
        print("  Restored files on VPS and synced to local workspace.")

        print("[3/5] Verifying restored files on VPS...")
        for rel, expected in BASELINE.items():
            remote = APP + '/' + rel
            actual = remote_digest(ssh, remote)
            if actual != expected:
                raise RuntimeError(f"RESTORED_MISMATCH: {remote} expected={expected} actual={actual}")
            # local verify
            local_hash = sha((ROOT / rel).read_bytes())
            if local_hash != expected:
                raise RuntimeError(f"LOCAL_RESTORED_MISMATCH: {rel} expected={expected} actual={local_hash}")
        print("  Remote and local restored files match baseline hashes.")

        print("[4/5] Rolling reload PM2 nodes on VPS...")
        for proc in NODES:
            print(f"  Reloading {proc}...")
            run(ssh, f"pm2 reload {shlex.quote(proc)}")
            time.sleep(1)

        print("  Waiting for nodes to be ready...")
        ready = wait_ready(ssh)
        print(f"  Ready status: {ready}")

        print("[5/5] Checking PM2 process status...")
        pm2_status = run(
            ssh,
            "pm2 jlist | node -e "
            + shlex.quote(
                "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.stringify(JSON.parse(s).filter(p=>/^lhs-s100[1-5]$/.test(p.name)).map(p=>({name:p.name,status:p.pm2_env.status,restarts:p.pm2_env.restart_time})))));"
            ),
        )

        result = {
            'timestamp': datetime.now(timezone.utc).isoformat(),
            'backup_source': BACKUP,
            'restored_files': BASELINE,
            'ready': ready,
            'pm2': json.loads(pm2_status),
            'status': 'SUCCESS' if set(ready.values()) == {'200'} and all(x['status'] == 'online' for x in json.loads(pm2_status)) else 'FAILED',
        }

        (LOCAL / 'rollback_result.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
        print(f"\nROLLBACK {result['status']}!")
        print(json.dumps(result, indent=2))

    finally:
        ssh.close()


if __name__ == '__main__':
    main()
