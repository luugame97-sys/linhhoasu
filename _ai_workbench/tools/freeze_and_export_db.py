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

def run_ssh_cmd(ssh, cmd, check_err=True):
    print(f"\n[EXEC] {cmd}")
    stdin, stdout, stderr = ssh.exec_command(cmd)
    out = stdout.read().decode('utf-8', errors='replace').strip()
    err = stderr.read().decode('utf-8', errors='replace').strip()
    status = stdout.channel.recv_exit_status()
    if out:
        print(out)
    if err:
        print(f"[STDERR/INFO] {err}")
    if check_err and status != 0:
        raise RuntimeError(f"Command '{cmd}' failed with status {status}: {err}")
    return out, err, status

def main():
    timestamp = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
    backup_base = "/linhhoasu/_ai_workbench/backups"
    export_dir_name = f"db_migration_{timestamp}"
    export_dir = f"{backup_base}/{export_dir_name}"
    archive_path = f"{backup_base}/{export_dir_name}.tar.gz"

    print(f"=== BẮT ĐẦU ĐÓNG BĂNG DỮ LIỆU & XUẤT DATABASE [{timestamp}] ===")
    print(f"Connecting to VPS {HOST}...")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username=USER, password=PASS, timeout=30)

    try:
        # BƯỚC 1: ĐÓNG BĂNG (FREEZE) DỮ LIỆU
        print("\n--- BƯỚC 1: Đóng băng dữ liệu game qua PM2 ---")
        run_ssh_cmd(ssh, "pm2 stop all")
        
        # Kiểm tra trạng thái PM2 sau khi stop
        out, _, _ = run_ssh_cmd(ssh, "pm2 jlist")
        import json
        pm2_data = json.loads(out)
        online_procs = [p['name'] for p in pm2_data if p.get('pm2_env', {}).get('status') == 'online']
        stopped_procs = [p['name'] for p in pm2_data if p.get('pm2_env', {}).get('status') == 'stopped']
        
        print(f"Số tiến trình đã STOPPED: {len(stopped_procs)} ({', '.join(stopped_procs)})")
        if online_procs:
            print(f"[CẢNH BÁO] Vẫn còn tiến trình online: {online_procs}")
            run_ssh_cmd(ssh, "pm2 stop all --force")
        else:
            print("[XÁC NHẬN] 100% tiến trình game đã dừng! Dữ liệu đã đóng băng an toàn.")

        # BƯỚC 2: ĐỒNG BỘ REDIS VÀO DISK
        print("\n--- BƯỚC 2: Đồng bộ bộ nhớ Redis xuống Disk ---")
        run_ssh_cmd(ssh, "redis-cli save")
        run_ssh_cmd(ssh, "ls -lh /www/server/redis/dump.rdb")

        # BƯỚC 3: TẠO THƯ MỤC XUẤT BACKUP
        print(f"\n--- BƯỚC 3: Chuẩn bị thư mục xuất dữ liệu: {export_dir} ---")
        run_ssh_cmd(ssh, f"mkdir -p {export_dir}/mongodb {export_dir}/redis")

        # Copy Redis dump.rdb
        print("\n--- Sao chép Redis snapshot ---")
        run_ssh_cmd(ssh, f"cp /www/server/redis/dump.rdb {export_dir}/redis/dump.rdb")
        run_ssh_cmd(ssh, f"ls -lh {export_dir}/redis/dump.rdb")

        # BƯỚC 4: DUMP MONGODB
        print("\n--- BƯỚC 4: Xuất toàn bộ MongoDB bằng mongodump ---")
        # Dump all databases
        run_ssh_cmd(ssh, f"mongodump --out {export_dir}/mongodb")

        # Thống kê chi tiết các databases đã dump
        print("\n--- Thống kê chi tiết các Database đã dump ---")
        run_ssh_cmd(ssh, f"du -sh {export_dir}/mongodb/*")

        # BƯỚC 5: NÉN ARCHIVE VÀ TÍNH SHA-256
        print(f"\n--- BƯỚC 5: Nén file archive {archive_path} ---")
        run_ssh_cmd(ssh, f"tar -czvf {archive_path} -C {backup_base} {export_dir_name}")
        run_ssh_cmd(ssh, f"ls -lh {archive_path}")
        
        print("\n--- Tạo mã kiểm tra tính toàn vẹn SHA-256 ---")
        run_ssh_cmd(ssh, f"sha256sum {archive_path} > {archive_path}.sha256")
        run_ssh_cmd(ssh, f"cat {archive_path}.sha256")

        # BƯỚC 6: XÁC MINH TRẠNG THÁI CUỐI CÙNG
        print("\n--- BƯỚC 6: Kiểm tra xác minh cuối cùng ---")
        run_ssh_cmd(ssh, "pm2 list")

        print(f"\n=== HOÀN TẤT THÀNH CÔNG 100% ===")
        print(f"Archive file:   {archive_path}")
        print(f"Checksum file:  {archive_path}.sha256")
        print(f"Raw export dir: {export_dir}")

    finally:
        ssh.close()

if __name__ == '__main__':
    main()
