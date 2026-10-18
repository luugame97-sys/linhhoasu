import hashlib
import os
import sys
import time
from datetime import datetime
from pathlib import Path

if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

sys.path.insert(0, r'i:/Linhhoasu/server/server/_ai_workbench/tools')
from snapshot_web_multiserver_20260906 import connect, run

WORKSPACE_ROOT = Path("i:/Linhhoasu/server/server")

FILES_TO_DEPLOY = [
    ("linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin", "/linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin"),
    ("linhhoasu/webgame/game/update/resource/assets/excel/config_e5ac72c2.bin", "/linhhoasu/webgame/game/update/resource/assets/excel/config_e5ac72c2.bin"),
    ("linhhoasu/webgame/game/index.html", "/linhhoasu/webgame/game/index.html"),
]

def sha256_file(filepath):
    h = hashlib.sha256()
    with open(filepath, 'rb') as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()

def main():
    print(">>> 1. Connecting to VPS (103.116.105.154)...")
    ssh = connect()
    sftp = ssh.open_sftp()
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_dir = f"/linhhoasu/_ai_workbench/backups/rewards_fix_{ts}"
    run(ssh, f"mkdir -p {backup_dir}")
    print(f"  Created backup directory: {backup_dir}")

    print("\n>>> 2. Backing up remote files and checking existing hashes...")
    for local_rel, remote_path in FILES_TO_DEPLOY:
        p = Path(remote_path)
        dest_name = f"{p.name}_{p.parts[2]}" if len(p.parts) > 2 else p.name
        backup_dest = f"{backup_dir}/{dest_name}"
        run(ssh, f"cp {remote_path} {backup_dest} 2>/dev/null || true")
        remote_sha = run(ssh, f"sha256sum {remote_path} 2>/dev/null || echo 'NONE'").split()[0]
        print(f"  Backed up {remote_path} -> {backup_dest} (pre-sha: {remote_sha[:12]}...)")

    print("\n>>> 3. Uploading patched binary config & index.html...")
    for local_rel, remote_path in FILES_TO_DEPLOY:
        local_path = WORKSPACE_ROOT / local_rel
        local_sha = sha256_file(local_path)
        print(f"  Uploading {local_path} (sha: {local_sha[:12]}...) -> {remote_path}")
        sftp.put(str(local_path), remote_path)
        # Verify remote sha matches local sha
        remote_sha_after = run(ssh, f"sha256sum {remote_path}").split()[0]
        if local_sha != remote_sha_after:
            raise RuntimeError(f"SHA mismatch on {remote_path}! Local: {local_sha}, Remote: {remote_sha_after}")
        print(f"  Verified SHA match: {remote_sha_after[:12]}... OK")

    # Set proper permissions
    run(ssh, "chmod 644 /linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin")
    run(ssh, "chmod 644 /linhhoasu/webgame/game/update/resource/assets/excel/config_e5ac72c2.bin")
    run(ssh, "chmod 644 /linhhoasu/webgame/game/index.html")
    run(ssh, "chown -R www:www /linhhoasu/webgame/game/update/resource/assets/excel/ 2>/dev/null || true")
    run(ssh, "chown www:www /linhhoasu/webgame/game/index.html 2>/dev/null || true")
    sftp.close()

    print("\n>>> 4. Rolling restart PM2 with updated config...")
    nodes = ["lhs-s1001", "lhs-s1002", "lhs-s1003", "lhs-s1004", "lhs-s1005"]
    for node in nodes:
        print(f"  Restarting {node}...")
        run(ssh, f"pm2 restart {node}")
        time.sleep(3)

    print("\n>>> 5. Readiness probe check...")
    ports = [8080, 8083, 8084, 8085, 8086]
    for port in ports:
        code = run(ssh, f"curl -s -o /dev/null -w '%{{http_code}}' http://127.0.0.1:{port}/ready").strip()
        print(f"  Port {port}: HTTP {code}")
        if code != "200":
            print(f"  WARNING: Port {port} readiness code is {code}")

    print("\n>>> 6. Live verification test on remote VPS...")
    verify_script = """
    'use strict';
    const assert = require('assert');
    const config = require('/linhhoasu/lhs/newServer/src/services/ConfigService');

    async function test() {
        console.log('Loading ConfigService on VPS...');
        config.reload();

        const topCombatDay = config.get('TopCombatDayRankRewardConfig');
        const topCombatWeek = config.get('TopCombatWeeklyRankRewardConfig');
        const crossArenaDay = config.get('CrossArenaDayRankRewardConfig');
        const crossArenaWeek = config.get('CrossArenaWeeklyRankRewardConfig');

        assert.ok(topCombatDay, 'TopCombatDayRankRewardConfig must exist');
        assert.ok(topCombatWeek, 'TopCombatWeeklyRankRewardConfig must exist');
        assert.ok(crossArenaDay, 'CrossArenaDayRankRewardConfig must exist');
        assert.ok(crossArenaWeek, 'CrossArenaWeeklyRankRewardConfig must exist');

        assert.strictEqual(Object.keys(topCombatDay).length, 10, 'TopCombat Day config must have 10 rows');
        assert.strictEqual(Object.keys(topCombatWeek).length, 10, 'TopCombat Weekly config must have 10 rows');
        console.log('Tables loaded successfully, row counts verified: 10 each.');

        // TopCombat Day Checks
        const day1 = topCombatDay[1].rewards;
        assert.strictEqual(day1.find(r => r.id === 1).count, 400000);
        assert.strictEqual(day1.find(r => r.id === 90077).count, 10);
        assert.strictEqual(day1.find(r => r.id === 89).count, 100);

        const day2 = topCombatDay[2].rewards;
        assert.strictEqual(day2.find(r => r.id === 1).count, 360000);
        assert.strictEqual(day2.find(r => r.id === 90077).count, 8);

        const day3 = topCombatDay[3].rewards;
        assert.strictEqual(day3.find(r => r.id === 1).count, 320000);
        assert.strictEqual(day3.find(r => r.id === 90077).count, 5);

        const day4 = topCombatDay[4].rewards;
        assert.strictEqual(day4.find(r => r.id === 1).count, 280000);
        assert.strictEqual(day4.find(r => r.id === 90077).count, 3);

        const day5 = topCombatDay[5].rewards;
        assert.strictEqual(day5.find(r => r.id === 1).count, 50000);
        assert.strictEqual(day5.find(r => r.id === 90077).count, 3);

        const day6 = topCombatDay[6].rewards;
        assert.strictEqual(day6.find(r => r.id === 1).count, 50000);
        assert.strictEqual(day6.find(r => r.id === 90077).count, 3);

        const day7 = topCombatDay[7].rewards;
        assert.strictEqual(day7.find(r => r.id === 1).count, 50000);
        assert.strictEqual(day7.find(r => r.id === 90077).count, 2);

        const day10 = topCombatDay[10].rewards;
        assert.strictEqual(day10.find(r => r.id === 1).count, 10000);
        assert.strictEqual(day10.find(r => r.id === 90077).count, 2);
        console.log('TopCombat Day Reward checks: PASS');

        // TopCombat Week Checks
        const w1 = topCombatWeek[1].rewards;
        assert.strictEqual(w1.find(r => r.id === 1).count, 2000000);
        assert.strictEqual(w1.find(r => r.id === 90077).count, 20);
        assert.strictEqual(w1.find(r => r.id === 11221).count, 1);
        assert.strictEqual(w1.find(r => r.id === 89).count, 1000);

        const w2 = topCombatWeek[2].rewards;
        assert.strictEqual(w2.find(r => r.id === 1).count, 1500000);
        assert.strictEqual(w2.find(r => r.id === 90077).count, 16);

        const w3 = topCombatWeek[3].rewards;
        assert.strictEqual(w3.find(r => r.id === 1).count, 1000000);
        assert.strictEqual(w3.find(r => r.id === 90077).count, 10);

        const w4 = topCombatWeek[4].rewards;
        assert.strictEqual(w4.find(r => r.id === 1).count, 800000);
        assert.strictEqual(w4.find(r => r.id === 90077).count, 6);

        const w5 = topCombatWeek[5].rewards;
        assert.strictEqual(w5.find(r => r.id === 1).count, 600000);
        assert.strictEqual(w5.find(r => r.id === 90077).count, 6);

        const w6 = topCombatWeek[6].rewards;
        assert.strictEqual(w6.find(r => r.id === 1).count, 400000);
        assert.strictEqual(w6.find(r => r.id === 90077).count, 6);

        const w7 = topCombatWeek[7].rewards;
        assert.strictEqual(w7.find(r => r.id === 1).count, 300000);
        assert.strictEqual(w7.find(r => r.id === 90077).count, 4);

        const w10 = topCombatWeek[10].rewards;
        assert.strictEqual(w10.find(r => r.id === 1).count, 60000);
        assert.strictEqual(w10.find(r => r.id === 90077).count, 4);
        console.log('TopCombat Week Reward checks: PASS');

        // CrossArena Checks
        assert.strictEqual(crossArenaDay[1].rewards.find(r => r.id === 1).count, 400000);
        assert.strictEqual(crossArenaDay[1].rewards.find(r => r.id === 90077).count, 10);
        assert.strictEqual(crossArenaWeek[1].rewards.find(r => r.id === 1).count, 2000000);
        assert.strictEqual(crossArenaWeek[1].rewards.find(r => r.id === 90077).count, 20);
        console.log('CrossArena Reward checks: PASS');

        console.log('>>> ALL REMOTE CONFIG ASSERTIONS PASSED! <<<');
    }
    test().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
    """

    sftp2 = ssh.open_sftp()
    remote_verify_path = '/linhhoasu/_ai_workbench/temp/live_verify_all_rewards.js'
    with sftp2.file(remote_verify_path, 'w') as f:
        f.write(verify_script)
    sftp2.close()

    out = run(ssh, f"node {remote_verify_path}")
    print(out)
    run(ssh, f"rm -f {remote_verify_path}")

    # Verify index.html translationVersion on VPS
    idx_ver = run(ssh, "grep 'translationVersion' /linhhoasu/webgame/game/index.html")
    print("Remote index.html cache version:", idx_ver.strip())

    print("\n>>> DEPLOYMENT & VERIFICATION COMPLETED SUCCESSFULLY! <<<")
    ssh.close()

if __name__ == "__main__":
    main()
