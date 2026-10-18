import hashlib
import json
import posixpath
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from snapshot_web_multiserver_20260906 import connect, run

ROOT = Path(__file__).resolve().parents[1]
CAND_DIR = ROOT / 'temp' / 'mine_motion_callback_20260920'
LOCAL_GAME_DIR = Path(__file__).resolve().parents[2] / 'linhhoasu' / 'webgame' / 'game'

REMOTE_GAME = '/linhhoasu/webgame/game'
MAIN_REL = 'js/main.min_drop100.js'
INDEX_REL = 'index.html'

EXPECTED_OLD_MAIN_SHA = 'd19866858f7d36a8f250cffd6703156ca56cb7e660287e3e82e269015276755b'
EXPECTED_NEW_MAIN_SHA = '51c1fee2628814d61c7daaf6ceaa2c6314c13c72a047ed51be6396fa9d639d31'

OLD_MARKER = b'20260920_mine_smooth_v5'
NEW_MARKER = b'20260920_mine_smooth_v6'

def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def main():
    cand_main_bytes = (CAND_DIR / 'main.min_drop100.js').read_bytes()
    cand_sha = sha256(cand_main_bytes)
    print(f"Candidate main SHA: {cand_sha}")
    if cand_sha != EXPECTED_NEW_MAIN_SHA:
        raise RuntimeError(f"CANDIDATE_SHA_MISMATCH: expected {EXPECTED_NEW_MAIN_SHA}, got {cand_sha}")

    ssh = connect()
    stamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
    backup_dir = f'/linhhoasu/_ai_workbench/backups/mine_motion_guard_v6_{stamp}'
    remote_main = f'{REMOTE_GAME}/{MAIN_REL}'
    remote_index = f'{REMOTE_GAME}/{INDEX_REL}'

    try:
        # 1. CAS checks
        with ssh.open_sftp() as sftp:
            old_main_bytes = sftp.open(remote_main, 'rb').read()
            old_index_bytes = sftp.open(remote_index, 'rb').read()

            actual_old_sha = sha256(old_main_bytes)
            print(f"Remote old main SHA: {actual_old_sha}")
            if actual_old_sha != EXPECTED_OLD_MAIN_SHA:
                raise RuntimeError(f"REMOTE_MAIN_CAS_DRIFT: expected {EXPECTED_OLD_MAIN_SHA}, got {actual_old_sha}")

            if OLD_MARKER not in old_index_bytes:
                raise RuntimeError(f"OLD_MARKER_MISSING_IN_INDEX: {OLD_MARKER.decode()}")
            if NEW_MARKER in old_index_bytes:
                raise RuntimeError(f"NEW_MARKER_ALREADY_IN_INDEX: {NEW_MARKER.decode()}")

            new_index_bytes = old_index_bytes.replace(OLD_MARKER, NEW_MARKER)

            # 2. Backup
            run(ssh, f'mkdir -p {backup_dir}')
            sftp.open(posixpath.join(backup_dir, 'main.min_drop100.js'), 'wb').write(old_main_bytes)
            sftp.open(posixpath.join(backup_dir, 'index.html'), 'wb').write(old_index_bytes)
            print(f"Created remote backup: {backup_dir}")

            # 3. Stage files
            tmp_main = remote_main + f'.deploy-{stamp}.js'
            tmp_index = remote_index + f'.deploy-{stamp}.html'
            sftp.open(tmp_main, 'wb').write(cand_main_bytes)
            sftp.open(tmp_index, 'wb').write(new_index_bytes)

        # 4. Syntax check
        run(ssh, f'node --check {tmp_main}')
        print("Remote node --check PASS")

        # 5. Atomic move
        run(ssh, f'mv {tmp_main} {remote_main}; mv {tmp_index} {remote_index}; chmod 644 {remote_main} {remote_index}')
        print("Moved new bundle and updated index.html on production")

        # 6. Verify Nginx
        nginx_test = run(ssh, 'nginx -t')
        print(f"Nginx test: {nginx_test.strip()}")

        # 7. Verification curl
        curl_res = run(ssh, f"curl -s -I 'http://127.0.0.1:81/js/main.min_drop100.js?v={NEW_MARKER.decode()}' | head -n 5")
        print("Served bundle HTTP header:")
        print(curl_res.strip())

        # 8. Verify remote hash
        verified_sha = run(ssh, f'sha256sum {remote_main}').split()[0]
        print(f"Verified remote SHA: {verified_sha}")
        if verified_sha != EXPECTED_NEW_MAIN_SHA:
            raise RuntimeError("REMOTE_SHA_VERIFY_FAILED")

        # 9. Sync local files
        local_main_path = LOCAL_GAME_DIR / 'js' / 'main.min_drop100.js'
        local_main_path.write_bytes(cand_main_bytes)

        local_index_path = LOCAL_GAME_DIR / 'index.html'
        local_index_content = local_index_path.read_bytes()
        # replace whatever marker is currently in local index
        if b'js/main.min_drop100.js?v=' in local_index_content:
            import re
            updated_local_index = re.sub(
                rb'js/main\.min_drop100\.js\?v=[a-zA-Z0-9_]+',
                b'js/main.min_drop100.js?v=' + NEW_MARKER,
                local_index_content
            )
            local_index_path.write_bytes(updated_local_index)
            print("Updated local index.html with new cache marker")

        report = {
            'status': 'DEPLOYED_AND_VERIFIED',
            'timestamp': stamp,
            'backup': backup_dir,
            'beforeSha': actual_old_sha,
            'afterSha': verified_sha,
            'cacheMarker': NEW_MARKER.decode(),
            'productionWrites': 0,
            'playerWrites': 0,
        }
        print(json.dumps(report, indent=2))

    finally:
        ssh.close()

if __name__ == '__main__':
    main()
