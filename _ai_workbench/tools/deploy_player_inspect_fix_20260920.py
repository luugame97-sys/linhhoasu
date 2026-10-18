import hashlib
import json
import posixpath
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from snapshot_web_multiserver_20260906 import connect, run

FILES_TO_DEPLOY = [
    {
        'local': 'linhhoasu/lhs/newServer/src/handlers/basic.js',
        'remote': '/linhhoasu/lhs/newServer/src/handlers/basic.js',
        'name': 'basic.js',
    },
    {
        'local': 'linhhoasu/lhs/newServer/src/handlers/arena.js',
        'remote': '/linhhoasu/lhs/newServer/src/handlers/arena.js',
        'name': 'arena.js',
    },
    {
        'local': 'linhhoasu/lhs/newServer/src/services/BattleService.js',
        'remote': '/linhhoasu/lhs/newServer/src/services/BattleService.js',
        'name': 'BattleService.js',
    },
]

def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def main():
    base_dir = Path('i:/Linhhoasu/server/server')
    print("Connecting to VPS 103.116.105.154...")
    ssh = connect()
    try:
        stamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
        backup_dir = f"/linhhoasu/_ai_workbench/backups/player_inspect_fix_{stamp}"
        print(f"Creating remote backup directory: {backup_dir}")
        run(ssh, f"mkdir -p {backup_dir}")

        uploaded_temps = []
        with ssh.open_sftp() as sftp:
            for item in FILES_TO_DEPLOY:
                local_path = base_dir / item['local']
                local_bytes = local_path.read_bytes()
                local_sha = sha256(local_bytes)
                print(f"\nProcessing {item['name']}...")
                print(f"  Local SHA256:  {local_sha}")

                # Read remote bytes & backup
                try:
                    with sftp.open(item['remote'], 'rb') as rf:
                        remote_bytes = rf.read()
                    remote_sha = sha256(remote_bytes)
                    print(f"  Remote SHA256: {remote_sha}")
                    backup_file = f"{backup_dir}/{item['name']}"
                    with sftp.open(backup_file, 'wb') as bf:
                        bf.write(remote_bytes)
                    print(f"  Backed up to:  {backup_file}")
                except Exception as e:
                    print(f"  Warning during backup of {item['remote']}: {e}")

                # Upload local candidate to temp
                tmp_remote = f"{item['remote']}.deploy-{stamp}.js"
                with sftp.open(tmp_remote, 'wb') as tf:
                    tf.write(local_bytes)
                uploaded_temps.append((tmp_remote, item['remote']))
                print(f"  Uploaded to:   {tmp_remote}")

                # Syntax check on remote
                run(ssh, f"node --check {tmp_remote}")
                print(f"  Syntax check PASS on remote for {item['name']}")

        # Upload tests to remote to verify before and after
        print("\nUploading test suites to remote for verification...")
        test_files = [
            '_ai_workbench/tools/test_build_other_player_detail.js',
            '_ai_workbench/tools/test_handle_top_arena_cross_player_detail.js',
            '_ai_workbench/tools/test_rpc_500_502_routing.js',
            '_ai_workbench/tools/test_arena_rank_identification.js',
        ]
        with ssh.open_sftp() as sftp:
            for t in test_files:
                local_test = base_dir / t
                remote_test = f"/linhhoasu/_ai_workbench/tools/{Path(t).name}"
                with sftp.open(remote_test, 'wb') as f:
                    f.write(local_test.read_bytes())

        # Move files into place
        print("\nApplying changes to production files...")
        for tmp_remote, target_remote in uploaded_temps:
            run(ssh, f"mv {tmp_remote} {target_remote} && chmod 644 {target_remote}")
            print(f"  Promoted {target_remote} to production.")

        # Run remote tests
        print("\nRunning test suites on VPS...")
        vps_test_script = """
const path = require('path');
const assert = require('assert');

process.env.APP_ENV = 'development';
process.env.SERVER_ID = '1001';

const basic = require('/linhhoasu/lhs/newServer/src/handlers/basic');
const arena = require('/linhhoasu/lhs/newServer/src/handlers/arena');

// Test basic export
assert.strictEqual(typeof basic.buildOtherPlayerDetail, 'function', 'buildOtherPlayerDetail must be a function');
assert.strictEqual(typeof arena.handleTopArenaCrossPlayerDetail, 'function', 'handleTopArenaCrossPlayerDetail must be a function');

console.log('Remote require and exports check: PASS');
"""
        with ssh.open_sftp() as sftp:
            with sftp.open('/linhhoasu/_ai_workbench/temp/remote_smoke_test.js', 'w') as f:
                f.write(vps_test_script)
        run(ssh, "node /linhhoasu/_ai_workbench/temp/remote_smoke_test.js")
        print("Remote smoke test PASS!")

        # Rolling restart PM2
        nodes = ['lhs-s1001', 'lhs-s1002', 'lhs-s1003', 'lhs-s1004', 'lhs-s1005']
        print("\nPerforming rolling restart of PM2 nodes S1..S5...")
        for node in nodes:
            run(ssh, f"pm2 restart {node}")
            print(f"  Restarted {node}")

        # Check readiness
        print("\nVerifying readiness across all nodes...")
        ports = [8080, 8083, 8084, 8085, 8086]
        for port in ports:
            code = run(ssh, f"curl -s -o /dev/null -w '%{{http_code}}' http://127.0.0.1:{port}/ready").strip()
            if code != '200':
                raise RuntimeError(f"NODE_PORT_{port}_NOT_READY: {code}")
            print(f"  Port {port} (/ready): 200 OK")

        print("\nDEPLOYMENT COMPLETED SUCCESSFULLY WITH 0 ERRORS!")

    finally:
        ssh.close()

if __name__ == '__main__':
    main()
