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
    ("linhhoasu/webgame/game/js/main.min_drop100.js", "/linhhoasu/webgame/game/js/main.min_drop100.js"),
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
    backup_dir = f"/linhhoasu/_ai_workbench/backups/subgames_8_deploy_{ts}"
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

    print("\n>>> 3. Uploading patched bundle & index.html...")
    for local_rel, remote_path in FILES_TO_DEPLOY:
        local_path = WORKSPACE_ROOT / local_rel
        local_sha = sha256_file(local_path)
        print(f"  Uploading {local_path} (sha: {local_sha[:12]}...) -> {remote_path}")
        sftp.put(str(local_path), remote_path)
        remote_sha_after = run(ssh, f"sha256sum {remote_path}").split()[0]
        if local_sha != remote_sha_after:
            raise RuntimeError(f"SHA mismatch on {remote_path}! Local: {local_sha}, Remote: {remote_sha_after}")
        print(f"  Verified SHA match: {remote_sha_after[:12]}... OK")

    run(ssh, "chmod 644 /linhhoasu/webgame/game/js/main.min_drop100.js")
    run(ssh, "chmod 644 /linhhoasu/webgame/game/index.html")
    run(ssh, "chown www:www /linhhoasu/webgame/game/js/main.min_drop100.js 2>/dev/null || true")
    run(ssh, "chown www:www /linhhoasu/webgame/game/index.html 2>/dev/null || true")
    sftp.close()

    print("\n>>> 4. Reloading Nginx...")
    nginx_test = run(ssh, "nginx -t 2>&1")
    print("  Nginx test:", nginx_test.strip())
    run(ssh, "nginx -s reload")
    print("  Nginx reloaded successfully.")

    print("\n>>> 5. Live verification test on remote VPS...")
    # Verify main.min_drop100.js patch
    check_code = run(ssh, "grep -c 'e=e.splice(0,O.min(8,e.length))' /linhhoasu/webgame/game/js/main.min_drop100.js")
    print("  getGameList 8 items match count:", check_code.strip())
    assert check_code.strip() == "1", "VPS main.min_drop100.js must contain e=e.splice(0,O.min(8,e.length))"

    check_layout = run(ssh, "grep -c 't.requestedColumnCount=Math.min(4,e)' /linhhoasu/webgame/game/js/main.min_drop100.js")
    print("  requestedColumnCount 4 match count:", check_layout.strip())
    assert check_layout.strip() == "1", "VPS main.min_drop100.js must contain t.requestedColumnCount=Math.min(4,e)"

    check_ver = run(ssh, "grep 'translationVersion' /linhhoasu/webgame/game/index.html")
    print("  Remote index.html cache version:", check_ver.strip())

    # Verify HTTP 200 via curl on local game port 81 (nginx)
    http_code = run(ssh, "curl -s -o /dev/null -w '%{http_code}' 'http://127.0.0.1:81/js/main.min_drop100.js?v=20260920_full_8_subgames_v1'").strip()
    print("  HTTP served code for patched main.min_drop100.js (port 81):", http_code)
    assert http_code in ("200", "304"), f"HTTP status should be 200/304, got {http_code}"

    print("\n>>> DEPLOYMENT & VERIFICATION OF 8 SUBGAMES COMPLETED SUCCESSFULLY! <<<")
    ssh.close()

if __name__ == "__main__":
    main()
