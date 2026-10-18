"""Deploy OldTrekPass fix to production VPS and rolling reload game server nodes."""
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
REMOTE_STAGE = '/linhhoasu/_ai_workbench/temp/oldtrek_pass_fix_20260920'
BACKUP = '/linhhoasu/_ai_workbench/backups/oldtrek_pass_fix_20260920_pre'
LOCAL = WB / 'temp/oldtrek_pass_fix_20260920'

FILES = {
    'src/handlers/old-trek.js': ROOT / 'src/handlers/old-trek.js',
    'src/services/RechargeRewardResolver.js': ROOT / 'src/services/RechargeRewardResolver.js',
    'src/services/RechargeBenefitService.js': ROOT / 'src/services/RechargeBenefitService.js',
    'src/handlers/compat.js': ROOT / 'src/handlers/compat.js',
    'src/handlers/recharge.js': ROOT / 'src/handlers/recharge.js',
}

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
    candidates = {rel: path.read_bytes() for rel, path in FILES.items()}
    candidate_hashes = {rel: sha(data) for rel, data in candidates.items()}

    ssh = connect()
    try:
        # Check baseline hashes
        print("[1/7] Verifying remote baseline...")
        for rel, expected in BASELINE.items():
            remote = APP + '/' + rel
            actual = remote_digest(ssh, remote)
            if actual != expected:
                raise RuntimeError(f"BASELINE_MISMATCH: {rel} expected={expected} actual={actual}")
        print("  Remote baselines match expected hashes.")

        # Create backup
        print(f"[2/7] Creating remote backup at {BACKUP}...")
        run(ssh, f"mkdir -p {shlex.quote(BACKUP)}")
        for rel in FILES:
            src = APP + '/' + rel
            dst = BACKUP + '/' + rel
            run(ssh, f"mkdir -p {shlex.quote(dst.rsplit('/', 1)[0])} && cp -p {shlex.quote(src)} {shlex.quote(dst)}")
        print("  Backup created successfully.")

        # Upload staged files
        print(f"[3/7] Uploading staged files to {REMOTE_STAGE}...")
        run(ssh, f"mkdir -p {shlex.quote(REMOTE_STAGE + '/app')}")
        with ssh.open_sftp() as sftp:
            for rel, data in candidates.items():
                staged = REMOTE_STAGE + '/app/' + rel
                run(ssh, f"mkdir -p {shlex.quote(staged.rsplit('/', 1)[0])}")
                with sftp.open(staged, 'wb') as handle:
                    handle.write(data)
                remote_hash = remote_digest(ssh, staged)
                if remote_hash != candidate_hashes[rel]:
                    raise RuntimeError(f"STAGE_HASH_MISMATCH: {rel}")
        print("  Staged files uploaded and verified.")

        # Check syntax on VPS
        print("[4/7] Checking Node syntax on VPS...")
        for rel in FILES:
            staged = REMOTE_STAGE + '/app/' + rel
            run(ssh, f"node --check {shlex.quote(staged)}")
        print("  Syntax check passed on remote node runtime.")

        # Atomically apply files
        print("[5/7] Atomically applying files to live tree...")
        for rel in FILES:
            remote = APP + '/' + rel
            staged = REMOTE_STAGE + '/app/' + rel
            tmp = remote + '.oldtrek-pass-fix.tmp'
            run(ssh, f"cp {shlex.quote(staged)} {shlex.quote(tmp)} && mv {shlex.quote(tmp)} {shlex.quote(remote)}")
        print("  Files deployed successfully.")

        # Rolling reload PM2 nodes
        print("[6/7] Reloading PM2 nodes...")
        for proc in NODES:
            print(f"  Reloading {proc}...")
            run(ssh, f"pm2 reload {shlex.quote(proc)}")
            time.sleep(1)

        print("  Waiting for nodes to be ready...")
        ready = wait_ready(ssh)
        print(f"  Ready status: {ready}")

        # Post-deploy probe
        print("[7/7] Running post-deploy live probe on VPS...")
        probe_cmd = (
            f"cd {shlex.quote(APP)} && node -e "
            + shlex.quote(
                "const rrr = require('./src/services/RechargeRewardResolver');"
                + "const assert = require('assert');"
                + "assert.strictEqual(rrr.isOldTrekPassPayId(11121), true);"
                + "assert.strictEqual(rrr.isOldTrekPassPayId(11122), true);"
                + "const p = { playerId: 'probe', other_attr_info: { oldTrekInfo: { passRecords: [{ id: 1, buyRecord: 1 }] } } };"
                + "const r1 = rrr.resolveRechargeRewards(p, { payId: 11121, multi: 1 });"
                + "assert.strictEqual(r1.ok, true);"
                + "const r2 = rrr.resolveRechargeRewards(p, { payId: 11122, multi: 1 });"
                + "assert.strictEqual(r2.ok, true);"
                + "console.log(JSON.stringify({ ok: true, pass11121_items: r1.rows.length, pass11122_items: r2.rows.length }));"
            )
        )
        probe_output = run(ssh, probe_cmd).strip()
        print(f"  Probe output: {probe_output}")

        pm2_status = run(
            ssh,
            "pm2 jlist | node -e "
            + shlex.quote(
                "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.stringify(JSON.parse(s).filter(p=>/^lhs-s100[1-5]$/.test(p.name)).map(p=>({name:p.name,status:p.pm2_env.status,restarts:p.pm2_env.restart_time})))));"
            ),
        )

        result = {
            'timestamp': datetime.now(timezone.utc).isoformat(),
            'backup': BACKUP,
            'deployed_files': candidate_hashes,
            'ready': ready,
            'probe': json.loads(probe_output.splitlines()[-1]),
            'pm2': json.loads(pm2_status),
            'status': 'SUCCESS' if set(ready.values()) == {'200'} and all(x['status'] == 'online' for x in json.loads(pm2_status)) else 'FAILED',
        }

        (LOCAL / 'deploy_result.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
        print(f"\nDEPLOYMENT {result['status']}!")
        print(json.dumps(result, indent=2))

    finally:
        ssh.close()


if __name__ == '__main__':
    main()
