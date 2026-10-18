import sys
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

import datetime
import os
import paramiko
import time

HOST = '103.116.105.154'
USER = 'root'
PASS = 'anhduc11'

def run_ssh(ssh, cmd, timeout=300, check_code=True):
    print(f"\n[EXEC] {cmd}")
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode('utf-8', errors='replace').strip()
    err = stderr.read().decode('utf-8', errors='replace').strip()
    code = stdout.channel.recv_exit_status()
    if out:
        print(out)
    if err:
        print(f"[STDERR/INFO] {err}")
    if check_code and code != 0 and code != -1:
        raise RuntimeError(f"Command '{cmd}' failed (code {code}): {err}")
    return out

def main():
    timestamp = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
    backup_base = "/linhhoasu/_ai_workbench/backups"
    
    db_dir = f"{backup_base}/db_final_{timestamp}"
    db_archive = f"{backup_base}/db_final_{timestamp}.tar.gz"
    source_archive = f"{backup_base}/game_source_final_{timestamp}.tar.gz"
    
    print(f"=== BẮT ĐẦU ĐÓNG BĂNG THỰC SỰ & TẠO GÓI MIGRATION CUỐI CÙNG [{timestamp}] ===")
    
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username=USER, password=PASS, timeout=30)
    
    try:
        # 1. Đảm bảo đóng băng triệt để 100%
        print("\n--- BƯỚC 1: Xác nhận đóng băng tuyệt đối toàn bộ tiến trình ---")
        run_ssh(ssh, "pm2 stop all", check_code=False)
        run_ssh(ssh, "killall -9 node 2>/dev/null || true", check_code=False)
        run_ssh(ssh, "pgrep -a node || echo 'XÁC NHẬN: 100% không còn tiến trình Node nào chạy'")

        # 2. Redis Sync
        print("\n--- BƯỚC 2: Đồng bộ Redis bộ nhớ xuống disk ---")
        run_ssh(ssh, "redis-cli save")
        run_ssh(ssh, "ls -lh /www/server/redis/dump.rdb")

        # 3. Tạo thư mục dump database
        print("\n--- BƯỚC 3: Xuất mới toàn bộ MongoDB & Redis ---")
        run_ssh(ssh, f"mkdir -p {db_dir}/mongodb {db_dir}/redis")
        run_ssh(ssh, f"cp /www/server/redis/dump.rdb {db_dir}/redis/dump.rdb")
        run_ssh(ssh, f"mongodump --out {db_dir}/mongodb")
        
        # Nén Database archive
        print("\n--- BƯỚC 4: Nén Database Final Archive ---")
        run_ssh(ssh, f"tar -czf {db_archive} -C {backup_base} db_final_{timestamp}")
        run_ssh(ssh, f"sha256sum {db_archive} > {db_archive}.sha256")
        
        # 5. Đóng gói Mã Nguồn Game sạch (Server + Web Client)
        print("\n--- BƯỚC 5: Đóng gói Mã Nguồn Game sạch (Loại bỏ _ai_workbench và rác) ---")
        tar_cmd = (
            f"tar --exclude='_ai_workbench' "
            f"--exclude='backup_*' "
            f"--exclude='logs/*.log' "
            f"--exclude='*~' "
            f"-czf {source_archive} "
            f"-C /linhhoasu lhs webgame start.sh setup.sh fixcentos7.sh"
        )
        run_ssh(ssh, tar_cmd, timeout=600)
        run_ssh(ssh, f"sha256sum {source_archive} > {source_archive}.sha256")

        # 6. Thống kê kết quả
        print("\n--- BƯỚC 6: Thống kê dung lượng và mã kiểm tra SHA-256 ---")
        run_ssh(ssh, f"ls -lh {db_archive} {source_archive}")
        run_ssh(ssh, f"cat {db_archive}.sha256")
        run_ssh(ssh, f"cat {source_archive}.sha256")

        print(f"\n=== HOÀN TẤT THÀNH CÔNG 100% ===")
        print(f"1. Database Final: {db_archive}")
        print(f"2. Source Final:   {source_archive}")

    finally:
        ssh.close()

if __name__ == '__main__':
    main()
