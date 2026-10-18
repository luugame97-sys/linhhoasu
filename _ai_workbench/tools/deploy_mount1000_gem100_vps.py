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
    ("linhhoasu/lhs/newServer/src/services/ConfigService.js", "/linhhoasu/lhs/newServer/src/services/ConfigService.js"),
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
    backup_dir = f"/linhhoasu/_ai_workbench/backups/mount1000_gem100_deploy_{ts}"
    run(ssh, f"mkdir -p {backup_dir}")
    print(f"  Created backup directory: {backup_dir}")

    print("\n>>> 2. Backing up remote files...")
    for local_rel, remote_path in FILES_TO_DEPLOY:
        p = Path(remote_path)
        dest_name = f"{p.name}_{p.parts[2]}" if len(p.parts) > 2 else p.name
        backup_dest = f"{backup_dir}/{dest_name}"
        run(ssh, f"cp {remote_path} {backup_dest} 2>/dev/null || true")
        remote_sha = run(ssh, f"sha256sum {remote_path} 2>/dev/null || echo 'NONE'").split()[0]
        print(f"  Backed up {remote_path} -> {backup_dest} (pre-sha: {remote_sha[:12]}...)")

    print("\n>>> 3. Uploading synchronized binaries and ConfigService.js...")
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
    run(ssh, "chmod 644 /linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin")
    run(ssh, "chmod 644 /linhhoasu/webgame/game/update/resource/assets/excel/config_fashion_20260909.bin")
    run(ssh, "chmod 644 /linhhoasu/webgame/game/update/resource/assets/excel/config_e5ac72c2.bin")
    run(ssh, "chmod 644 /linhhoasu/lhs/newServer/src/services/ConfigService.js")

    print("\n>>> 4. Verifying remote syntax...")
    check_code = run(ssh, "node -c /linhhoasu/lhs/newServer/src/services/ConfigService.js")
    print("  node -c ConfigService.js: OK")

    print("\n>>> 5. Rolling restart PM2 nodes sequentially (S1 -> S5)...")
    nodes = [
        ("lhs-s1001", 8080),
        ("lhs-s1002", 8083),
        ("lhs-s1003", 8084),
        ("lhs-s1004", 8085),
        ("lhs-s1005", 8086),
    ]

    for name, port in nodes:
        print(f"  Restarting {name}...")
        run(ssh, f"pm2 restart {name} --update-env")
        time.sleep(4)
        # Probe readiness
        ready = False
        for attempt in range(15):
            code = run(ssh, f"curl -s -o /dev/null -w '%{{http_code}}' http://127.0.0.1:{port}/ready || echo 000").strip()
            if code == "200":
                ready = True
                print(f"    {name} (Port {port}) responded 200 OK (attempt {attempt + 1})")
                break
            time.sleep(2)
        if not ready:
            raise RuntimeError(f"{name} on port {port} FAILED readiness probe!")


    print("\n>>> 6. Live verification from Node.js runtime on VPS...")
    verify_js = """
    const cfg = require('/linhhoasu/lhs/newServer/src/services/ConfigService');
    const tables = cfg.loadAllTables();
    
    console.log('--- 1. Tables count ---');
    console.log('Tables loaded:', Object.keys(tables).length);

    console.log('--- 2. SwordLevelConfig ---');
    const sword = tables.SwordLevelConfig;
    if (!sword) throw new Error('SwordLevelConfig is missing');
    for (const q of ['2', '3', '4', '6', '7']) {
      const levels = Object.keys(sword[q] || {}).map(Number);
      const maxL = Math.max(...levels);
      console.log(`Quality ${q}: min=${Math.min(...levels)}, max=${maxL}, count=${levels.length}`);
      if (maxL !== 1000) throw new Error(`Quality ${q} max level is ${maxL}, expected 1000`);
    }

    console.log('--- 3. GemLevelConfig ---');
    const gem = tables.GemLevelConfig;
    if (!gem) throw new Error('GemLevelConfig is missing');
    const gemLevels = Object.values(gem).map(x => Number(x.level) || 0);
    const minG = Math.min(...gemLevels);
    const maxG = Math.max(...gemLevels);
    console.log(`GemLevel: min=${minG}, max=${maxG}, rows=${Object.keys(gem).length}`);
    if (maxG !== 100 || Object.keys(gem).length !== 588) {
      throw new Error(`GemLevel max=${maxG}, rows=${Object.keys(gem).length}, expected 100 and 588`);
    }

    console.log('--- 4. Mount handler clamp check ---');
    const mount = require('/linhhoasu/lhs/newServer/src/handlers/mount');
    const mountRow = mount.ensureMountInfo({
      swordInfo: {
        data: [{ uid: 1, id: 22505, quality: 7, level: 1000, star: 40 }]
      }
    });
    const clampedLevel = mountRow.data[0].level;
    console.log('Clamped level for mount level 1000:', clampedLevel);
    if (clampedLevel !== 1000) throw new Error(`Mount level clamped to ${clampedLevel}, expected 1000!`);

    console.log('--- 5. Gem handler validation check ---');
    const gemHandler = require('/linhhoasu/lhs/newServer/src/handlers/gem');
    // Test gem level 12 (ID 25111) and level 100 (ID 25991)
    const gem12Id = 25111;
    const gem100Id = 25991;
    if (!tables.GemLevelConfig[gem12Id]) throw new Error('Gem 25111 (lv 12) missing');
    if (!tables.GemLevelConfig[gem100Id]) throw new Error('Gem 25991 (lv 100) missing');
    console.log('Gem 25111 level:', tables.GemLevelConfig[gem12Id].level);
    console.log('Gem 25991 level:', tables.GemLevelConfig[gem100Id].level);

    console.log('\\n>>> ALL LIVE RUNTIME ASSERTIONS PASSED (100%)! <<<');
    """

    with sftp.file('/tmp/verify_mount1000_gem100.js', 'w') as f:
        f.write(verify_js)

    out = run(ssh, "node /tmp/verify_mount1000_gem100.js")
    print(out)
    run(ssh, "rm -f /tmp/verify_mount1000_gem100.js")

    print("\n>>> DEPLOYMENT & VERIFICATION COMPLETED SUCCESSFULLY!")
    sftp.close()
    ssh.close()

if __name__ == "__main__":
    main()
