import sys
if hasattr(sys.stdout, 'reconfigure'): sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'): sys.stderr.reconfigure(encoding='utf-8', errors='replace')

import os
import paramiko

HOST = '103.116.104.165'
USER = 'root'
PASS = 'anhduc11'

FILES = [
    (
        r'I:\Linhhoasu\server\server\_ai_workbench\temp\gm_login\login.php',
        '/linhhoasu/webgame/gm/login.php'
    ),
    (
        r'I:\Linhhoasu\server\server\_ai_workbench\temp\gm_login\login.js',
        '/linhhoasu/webgame/gm/assets/js/login.js'
    ),
    (
        r'I:\Linhhoasu\server\server\_ai_workbench\temp\gm_login\login.css',
        '/linhhoasu/webgame/gm/assets/css/login.css'
    ),
]

def run_ssh(ssh, cmd):
    print(f"\n>>> {cmd}")
    _, stdout, stderr = ssh.exec_command(cmd)
    out = stdout.read().decode('utf-8', errors='replace').strip()
    err = stderr.read().decode('utf-8', errors='replace').strip()
    if out:
        print(out)
    if err:
        print(f"[STDERR] {err}")
    return out

def main():
    print(f"Connecting to VPS {HOST}...")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username=USER, password=PASS, timeout=15)

    # 1. Create remote backup directory
    backup_dir = '/linhhoasu/_ai_workbench/backups/login_compact_20260930'
    run_ssh(ssh, f"mkdir -p {backup_dir}")

    # 2. Backup existing files
    for _, remote_path in FILES:
        fname = os.path.basename(remote_path)
        run_ssh(ssh, f"cp {remote_path} {backup_dir}/{fname}.bak 2>/dev/null || true")

    # 3. Upload modified files
    print("\nUploading modified files via SFTP...")
    sftp = ssh.open_sftp()
    for local_path, remote_path in FILES:
        if not os.path.exists(local_path):
            raise FileNotFoundError(f"Local file not found: {local_path}")
        print(f"Uploading {local_path} -> {remote_path}")
        sftp.put(local_path, remote_path)
    sftp.close()
    print("Upload completed.")

    # 4. Check syntax
    run_ssh(ssh, "php -l /linhhoasu/webgame/gm/login.php")
    run_ssh(ssh, "node -c /linhhoasu/webgame/gm/assets/js/login.js")

    # 5. Verify public endpoint
    print("\nVerifying public login.php...")
    run_ssh(ssh, "curl -sI https://linhhoasu.lol/web-panel/login.php")

    # Check that serverSliderTrack is completely gone
    slider_check = run_ssh(ssh, "curl -s https://linhhoasu.lol/web-panel/login.php | grep -F 'serverSliderTrack' || echo 'SLIDER_REMOVED_OK'")
    print(f"Slider check: {slider_check}")

    # Check that brand-info is present
    brand_check = run_ssh(ssh, "curl -s https://linhhoasu.lol/web-panel/login.php | grep -F 'brand-info' || echo 'BRAND_INFO_NOT_FOUND'")
    print(f"Brand check: {brand_check}")

    ssh.close()
    print("\nDeploy compact login completed successfully!")

if __name__ == '__main__':
    main()
