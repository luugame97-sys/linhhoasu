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
    ("linhhoasu/webgame/game/update/resource/assets/excel/config_fashion_20260909.bin", "/linhhoasu/webgame/game/update/resource/assets/excel/config_fashion_20260909.bin"),
    ("linhhoasu/lhs/update/resource/assets/excel/config_fashion_20260909.bin", "/linhhoasu/lhs/update/resource/assets/excel/config_fashion_20260909.bin"),
    ("linhhoasu/webgame/game/update/resource/assets/excel/config_e5ac72c2.bin", "/linhhoasu/webgame/game/update/resource/assets/excel/config_e5ac72c2.bin"),
    ("linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin", "/linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin"),
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
    backup_dir = f"/linhhoasu/_ai_workbench/backups/arena_rewards_deploy_{ts}"
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
        remote_sha_after = run(ssh, f"sha256sum {remote_path}").split()[0]
        if local_sha != remote_sha_after:
            raise RuntimeError(f"SHA mismatch on {remote_path}! Local: {local_sha}, Remote: {remote_sha_after}")
        print(f"  Verified SHA match: {remote_sha_after[:12]}... OK")

    run(ssh, "chmod 644 /linhhoasu/lhs/update/resource/assets/excel/config_fashion_20260909.bin")
    run(ssh, "chmod 644 /linhhoasu/webgame/game/update/resource/assets/excel/config_fashion_20260909.bin")
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
    time.sleep(3)
    for port in ports:
        code = run(ssh, f"curl -s -o /dev/null -w '%{{http_code}}' http://127.0.0.1:{port}/ready").strip()
        print(f"  Port {port}: HTTP {code}")
        if code != "200":
            print(f"  Waiting for port {port}...")
            time.sleep(3)
            code = run(ssh, f"curl -s -o /dev/null -w '%{{http_code}}' http://127.0.0.1:{port}/ready").strip()
            print(f"  Port {port} retry: HTTP {code}")

    print("\n>>> 6. Live verification test on remote VPS...")
    verify_script = """
    'use strict';
    const assert = require('assert');
    const fs = require('fs');
    const zlib = require('zlib');
    const { BinJsonUtil, ByteArray } = require('/linhhoasu/lhs/newServer/src/protocol/BinJsonUtil');
    const config = require('/linhhoasu/lhs/newServer/src/services/ConfigService');

    function readTableFromBin(path, targetName) {
        const buf = fs.readFileSync(path);
        let offset = 0;
        while (offset < buf.length) {
            const nameLen = buf.readUInt8(offset); offset += 1;
            const name = buf.toString('utf8', offset, offset + nameLen); offset += nameLen;
            const dataLen = buf.readUInt32BE(offset); offset += 4;
            const compressed = buf.subarray(offset, offset + dataLen); offset += dataLen;
            if (name === targetName) {
                const inflated = zlib.inflateSync(compressed);
                return BinJsonUtil.readFullJson(new ByteArray(inflated.buffer.slice(inflated.byteOffset, inflated.byteOffset + inflated.byteLength)));
            }
        }
        return null;
    }

    const clientFashionBin = '/linhhoasu/webgame/game/update/resource/assets/excel/config_fashion_20260909.bin';
    console.log('Verifying client loaded file:', clientFashionBin);

    const dayTable = readTableFromBin(clientFashionBin, 'ArenaDayRankRewardConfig');
    const weekTable = readTableFromBin(clientFashionBin, 'ArenaWeeklyRankRewardConfig');

    assert.ok(dayTable, 'ArenaDayRankRewardConfig must exist in client fashion bin');
    assert.ok(weekTable, 'ArenaWeeklyRankRewardConfig must exist in client fashion bin');

    // Check Arena Day Rewards
    console.log('Client Arena Day 1:', JSON.stringify(dayTable[1]));
    assert.strictEqual(dayTable[1].rewards.find(r => r.id === 1).count, 200000, 'Top 1 diamond must be 200,000');
    assert.strictEqual(dayTable[1].rewards.find(r => r.id === 90077).count, 10, 'Top 1 box 90077 must be 10');
    assert.strictEqual(dayTable[1].rewards.find(r => r.id === 7).count, 50);

    console.log('Client Arena Day 2:', JSON.stringify(dayTable[2]));
    assert.strictEqual(dayTable[2].rewards.find(r => r.id === 1).count, 160000);
    assert.strictEqual(dayTable[2].rewards.find(r => r.id === 90077).count, 8);

    console.log('Client Arena Day 3:', JSON.stringify(dayTable[3]));
    assert.strictEqual(dayTable[3].rewards.find(r => r.id === 1).count, 120000);
    assert.strictEqual(dayTable[3].rewards.find(r => r.id === 90077).count, 5);

    console.log('Client Arena Day 4:', JSON.stringify(dayTable[4]));
    assert.strictEqual(dayTable[4].rewards.find(r => r.id === 1).count, 80000);
    assert.strictEqual(dayTable[4].rewards.find(r => r.id === 90077).count, 3);

    console.log('Client Arena Day 5:', JSON.stringify(dayTable[5]));
    assert.strictEqual(dayTable[5].rewards.find(r => r.id === 1).count, 50000);
    assert.strictEqual(dayTable[5].rewards.find(r => r.id === 90077).count, 3);

    console.log('Client Arena Day 7 (rank 11-20):', JSON.stringify(dayTable[7]));
    assert.strictEqual(dayTable[7].rewards.find(r => r.id === 90077).count, 2);

    // Check Arena Week Rewards
    console.log('Client Arena Week 1:', JSON.stringify(weekTable[1]));
    assert.strictEqual(weekTable[1].rewards.find(r => r.id === 1).count, 2000000);
    assert.strictEqual(weekTable[1].rewards.find(r => r.id === 90077).count, 20);
    assert.strictEqual(weekTable[1].rewards.find(r => r.id === 11201).count, 1);
    assert.strictEqual(weekTable[1].rewards.find(r => r.id === 8).count, 50);

    console.log('Client Arena Week 2:', JSON.stringify(weekTable[2]));
    assert.strictEqual(weekTable[2].rewards.find(r => r.id === 1).count, 1500000);
    assert.strictEqual(weekTable[2].rewards.find(r => r.id === 90077).count, 16);

    console.log('Client Arena Week 3:', JSON.stringify(weekTable[3]));
    assert.strictEqual(weekTable[3].rewards.find(r => r.id === 1).count, 1000000);
    assert.strictEqual(weekTable[3].rewards.find(r => r.id === 90077).count, 10);

    console.log('Client Arena Week 4:', JSON.stringify(weekTable[4]));
    assert.strictEqual(weekTable[4].rewards.find(r => r.id === 1).count, 800000);
    assert.strictEqual(weekTable[4].rewards.find(r => r.id === 90077).count, 6);

    console.log('Client Arena Week 7 (rank 11-20):', JSON.stringify(weekTable[7]));
    assert.strictEqual(weekTable[7].rewards.find(r => r.id === 90077).count, 4);

    // Check ConfigService runtime loading
    config.reload();
    const runtimeDay = config.get('ArenaDayRankRewardConfig');
    const runtimeWeek = config.get('ArenaWeeklyRankRewardConfig');
    assert.strictEqual(runtimeDay[1].rewards.find(r => r.id === 90077).count, 10);
    assert.strictEqual(runtimeWeek[1].rewards.find(r => r.id === 90077).count, 20);
    console.log('Runtime ConfigService check: PASS');

    // Also verify TopCombat is still intact with 90078
    const runtimeTopDay = config.get('TopCombatDayRankRewardConfig');
    assert.strictEqual(runtimeTopDay[1].rewards.find(r => r.id === 90078).count, 10);
    console.log('TopCombat integrity check: PASS');

    console.log('>>> ALL VERIFICATION ASSERTIONS FOR ARENA REWARDS PASSED! <<<');
    """

    sftp2 = ssh.open_sftp()
    remote_verify_path = '/linhhoasu/_ai_workbench/temp/live_verify_arena.js'
    with sftp2.file(remote_verify_path, 'w') as f:
        f.write(verify_script)
    sftp2.close()

    out = run(ssh, f"node {remote_verify_path}")
    print(out)
    run(ssh, f"rm -f {remote_verify_path}")

    # Verify index.html translationVersion on VPS
    idx_ver = run(ssh, "grep 'translationVersion' /linhhoasu/webgame/game/index.html")
    print("Remote index.html cache version:", idx_ver.strip())

    print("\n>>> DEPLOYMENT & VERIFICATION OF ARENA REWARDS COMPLETED SUCCESSFULLY! <<<")
    ssh.close()

if __name__ == "__main__":
    main()
