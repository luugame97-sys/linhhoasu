import sys
if hasattr(sys.stdout, 'reconfigure'): sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'): sys.stderr.reconfigure(encoding='utf-8', errors='replace')

import os
import json
import paramiko

HOST = '103.116.104.165'
USER = 'root'
PASS = 'anhduc11'

FILES = [
    (
        r'I:\Linhhoasu\server\server\linhhoasu\webgame\game\register.html',
        '/linhhoasu/webgame/game/register.html'
    ),
    (
        r'I:\Linhhoasu\server\server\linhhoasu\lhs\newServer\src\net\HTTPServer.js',
        '/linhhoasu/lhs/newServer/src/net/HTTPServer.js'
    ),
    (
        r'I:\Linhhoasu\server\server\linhhoasu\lhs\newServer\src\handlers\serverList.js',
        '/linhhoasu/lhs/newServer/src/handlers/serverList.js'
    ),
    (
        r'I:\Linhhoasu\server\server\linhhoasu\lhs\newServer\ecosystem.config.js',
        '/linhhoasu/lhs/newServer/ecosystem.config.js'
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
    backup_dir = '/linhhoasu/_ai_workbench/backups/optional_invite_20260930'
    run_ssh(ssh, f"mkdir -p {backup_dir}")

    # 2. Backup existing files
    for _, remote_path in FILES:
        fname = os.path.basename(remote_path)
        run_ssh(ssh, f"cp {remote_path} {backup_dir}/{fname}.bak 2>/dev/null || true")

    # 3. Upload files via SFTP
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
    run_ssh(ssh, "node -c /linhhoasu/lhs/newServer/src/net/HTTPServer.js")
    run_ssh(ssh, "node -c /linhhoasu/lhs/newServer/src/handlers/serverList.js")
    run_ssh(ssh, "node -c /linhhoasu/lhs/newServer/ecosystem.config.js")

    # 5. Reload PM2 lhs-s1001 with --update-env
    print("\nReloading PM2 lhs-s1001 with updated environment...")
    run_ssh(ssh, "pm2 reload lhs-s1001 --update-env")
    run_ssh(ssh, "pm2 status lhs-s1001")

    # 6. Verify registration without invite code
    print("\nVerifying registration API without invite code...")
    test_account = "test_noinv_" + os.urandom(3).hex()
    test_payload = json.dumps({
        "accountId": test_account,
        "password": "Password123456",
        "confirmPassword": "Password123456"
    })
    run_ssh(ssh, f"curl -s -X POST http://127.0.0.1:8080/api/user/register -H 'Content-Type: application/json' -d '{test_payload}'")

    # 7. Verify public register.html
    print("\nChecking public register.html...")
    run_ssh(ssh, "curl -sI https://linhhoasu.lol/register.html")
    run_ssh(ssh, "curl -s https://linhhoasu.lol/register.html | grep -F 'Mã mời (không bắt buộc)' || echo 'NOT_FOUND'")

    ssh.close()
    print("\nAll done!")

if __name__ == '__main__':
    main()
