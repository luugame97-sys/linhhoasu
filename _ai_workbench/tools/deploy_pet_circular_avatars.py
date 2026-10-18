import os, sys, time, hashlib
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from snapshot_web_multiserver_20260906 import connect, run

def sha256_file(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()

def main():
    print("Connecting to VPS...")
    ssh = connect()
    sftp = ssh.open_sftp()
    
    timestamp = time.strftime('%Y%m%d_%H%M%S')
    backup_dir = f"/linhhoasu/_ai_workbench/backups/pet_circular_avatars_{timestamp}"
    run(ssh, f"mkdir -p {backup_dir}")
    print(f"Created backup dir: {backup_dir}")
    
    # 1. Backup current files
    for remote_path in [
        "/linhhoasu/webgame/game/js/main.min_drop100.js",
        "/linhhoasu/webgame/game/index.html"
    ]:
        fname = os.path.basename(remote_path)
        run(ssh, f"cp -p {remote_path} {backup_dir}/{fname}.before")
        print(f"Backed up {remote_path}")
        
    # 2. Upload avatar images
    local_avatar_dir = "linhhoasu/webgame/game/update/resource/assets/atlas_ui/0_common/icon/pet"
    remote_avatar_dirs = [
        "/linhhoasu/webgame/game/update/resource/assets/atlas_ui/0_common/icon/pet",
        "/linhhoasu/webgame/game/assets/atlas_ui/0_common/icon/pet"
    ]
    
    for rdir in remote_avatar_dirs:
        run(ssh, f"mkdir -p {rdir}")
        
    pids = ['810101', '810201', '810301', '810401', '810501']
    for pid in pids:
        local_f = os.path.join(local_avatar_dir, f"head_{pid}.png")
        for rdir in remote_avatar_dirs:
            remote_f = f"{rdir}/head_{pid}.png"
            sftp.put(local_f, remote_f)
            print(f"Uploaded {local_f} -> {remote_f} ({os.path.getsize(local_f)} bytes)")
            
    # 3. Upload main.min_drop100.js
    local_js = "linhhoasu/webgame/game/js/main.min_drop100.js"
    remote_js = "/linhhoasu/webgame/game/js/main.min_drop100.js"
    print("Uploading main.min_drop100.js...")
    sftp.put(local_js, remote_js)
    
    # 4. Upload index.html
    local_html = "linhhoasu/webgame/game/index.html"
    remote_html = "/linhhoasu/webgame/game/index.html"
    print("Uploading index.html...")
    sftp.put(local_html, remote_html)
    
    sftp.close()
    
    # 5. Verify remote hashes
    print("\n--- Verifying Remote Hashes ---")
    local_js_hash = sha256_file(local_js)
    remote_js_hash = run(ssh, f"sha256sum {remote_js}").split()[0]
    print(f"JS Hash: local={local_js_hash} remote={remote_js_hash} match={local_js_hash == remote_js_hash}")
    assert local_js_hash == remote_js_hash, "JS hash mismatch!"
    
    local_html_hash = sha256_file(local_html)
    remote_html_hash = run(ssh, f"sha256sum {remote_html}").split()[0]
    print(f"HTML Hash: local={local_html_hash} remote={remote_html_hash} match={local_html_hash == remote_html_hash}")
    assert local_html_hash == remote_html_hash, "HTML hash mismatch!"
    
    # Check JS syntax on VPS
    syntax_check = run(ssh, f"node -c {remote_js} && echo 'SYNTAX OK'")
    print(f"VPS Node syntax check: {syntax_check.strip()}")
    assert 'SYNTAX OK' in syntax_check, "JS syntax error on VPS!"
    
    ssh.close()
    print("\nDeploy completed successfully!")

if __name__ == '__main__':
    main()
