import sys
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

import datetime
import paramiko
import time

NEW_HOST = '103.116.104.165'
OLD_HOST = '103.116.105.154'
USER = 'root'
PASS = 'anhduc11'

EXPECTED_DB_SHA = "1f87ac61b3aa8d67a6b09c3c6ce083992fed4de128ad167c1151f2b2de6b7e71"
EXPECTED_SOURCE_SHA = "9552d907e787a6b572ac96ba0145d3281d28d2dd535f4e9779ff1eb556a90535"

def run_ssh(ssh, cmd, timeout=600):
    print(f"\n[EXEC @ {ssh.get_transport().getpeername()[0]}] {cmd}")
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode('utf-8', errors='replace').strip()
    err = stderr.read().decode('utf-8', errors='replace').strip()
    code = stdout.channel.recv_exit_status()
    if out:
        print(out)
    if err:
        print(f"[STDERR/INFO] {err}")
    if code != 0:
        raise RuntimeError(f"Command '{cmd}' failed (code {code}): {err}")
    return out

def main():
    print(f"=== BẮT ĐẦU MIGRATION GIAI ĐOẠN 1: CÀI ĐẶT MÔI TRƯỜNG & CHUYỂN DỮ LIỆU ===")
    
    ssh_new = paramiko.SSHClient()
    ssh_new.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh_new.connect(NEW_HOST, username=USER, password=PASS, timeout=30)

    try:
        # 0. Sửa cdrom repo trong apt
        print("\n--- 0. Sửa cdrom repo trong apt ---")
        run_ssh(ssh_new, "sed -i '/cdrom/d' /etc/apt/sources.list /etc/apt/sources.list.d/* 2>/dev/null || true")

        # 1. Cài đặt các gói công cụ mạng & sshpass trên New VPS
        print("\n--- 1. Cài đặt sshpass & rsync trên VPS MỚI ---")
        run_ssh(ssh_new, "apt-get update -y && apt-get install -y sshpass rsync curl")

        # 2. Cài đặt Node.js 20 LTS & PM2 trên New VPS
        print("\n--- 2. Cài đặt Node.js 20 LTS & PM2 ---")
        run_ssh(ssh_new, "curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt-get install -y nodejs")
        run_ssh(ssh_new, "node -v")
        run_ssh(ssh_new, "npm -v")
        run_ssh(ssh_new, "npm install -g pm2")
        run_ssh(ssh_new, "pm2 -v")

        # 3. Mở cổng UFW
        print("\n--- 3. Mở cổng tường lửa UFW (81, 88) ---")
        run_ssh(ssh_new, "ufw allow 81/tcp && ufw allow 88/tcp")
        run_ssh(ssh_new, "ufw status | grep -E '(81|88)'")

        # 4. Tạo thư mục chuyển dữ liệu
        print("\n--- 4. Chuẩn bị thư mục /backup/migration ---")
        run_ssh(ssh_new, "mkdir -p /backup/migration /linhhoasu")

        # 5. Kéo trực tiếp 2 file backup từ Old VPS sang New VPS
        print("\n--- 5. Chuyển trực tiếp 2 file backup từ VPS CŨ sang VPS MỚI ---")
        scp_db = (
            f"sshpass -p '{PASS}' scp -o StrictHostKeyChecking=no "
            f"root@{OLD_HOST}:/linhhoasu/_ai_workbench/backups/db_final_20260930_004700.tar.gz /backup/migration/"
        )
        run_ssh(ssh_new, scp_db, timeout=300)

        scp_source = (
            f"sshpass -p '{PASS}' scp -o StrictHostKeyChecking=no "
            f"root@{OLD_HOST}:/linhhoasu/_ai_workbench/backups/game_source_final_20260930_004700.tar.gz /backup/migration/"
        )
        run_ssh(ssh_new, scp_source, timeout=600)

        # 6. Kiểm tra SHA-256 trên New VPS
        print("\n--- 6. Kiểm tra toàn vẹn mã băm SHA-256 trên VPS MỚI ---")
        run_ssh(ssh_new, "ls -lh /backup/migration/")
        db_sha = run_ssh(ssh_new, "sha256sum /backup/migration/db_final_20260930_004700.tar.gz | cut -d' ' -f1").strip()
        source_sha = run_ssh(ssh_new, "sha256sum /backup/migration/game_source_final_20260930_004700.tar.gz | cut -d' ' -f1").strip()

        print(f"DB SHA256:     {db_sha}")
        print(f"Expected DB:   {EXPECTED_DB_SHA}")
        assert db_sha == EXPECTED_DB_SHA, "DB SHA256 MISMATCH!"

        print(f"Source SHA256:   {source_sha}")
        print(f"Expected Source: {EXPECTED_SOURCE_SHA}")
        assert source_sha == EXPECTED_SOURCE_SHA, "SOURCE SHA256 MISMATCH!"

        print("\n=== GIAI ĐOẠN 1 HOÀN TẤT THÀNH CÔNG 100%! BẢN SAO LƯU TOÀN VẸN TUYỆT ĐỐI ===")

    finally:
        ssh_new.close()

if __name__ == '__main__':
    main()
