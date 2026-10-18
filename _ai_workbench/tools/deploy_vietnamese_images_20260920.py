"""Deploy Vietnamese UI images and KTX textures to VPS."""
import sys
sys.stdout.reconfigure(encoding='utf-8')
import os
import hashlib
from datetime import datetime
from pathlib import Path

sys.path.insert(0, r'i:/Linhhoasu/server/server/_ai_workbench/tools')
from snapshot_web_multiserver_20260906 import connect

LOCAL_ARCHIVE = Path(r'i:/Linhhoasu/server/server/_ai_workbench/temp/cozy_images_review/vietnamese_images_4641.tar.gz')
EXPECTED_SHA = '80e681c8ae63390a590f293f60353ab4cf61b29788b59d140772b39b9e6b8b1e'

def run_cmd(ssh, command, timeout=300):
    stdin, stdout, stderr = ssh.exec_command(command, timeout=timeout)
    output = stdout.read().decode('utf-8')
    err = stderr.read().decode('utf-8')
    status = stdout.channel.recv_exit_status()
    if status != 0:
        raise RuntimeError(f"Command failed (exit {status}): {command}\n{err}")
    return output

def main():
    print(f"=== BẮT ĐẦU TRIỂN KHAI ẢNH VIỆT HÓA LÊN VPS (103.116.105.154) ===", flush=True)
    if not LOCAL_ARCHIVE.exists():
        raise FileNotFoundError(f"Local archive not found: {LOCAL_ARCHIVE}")
    
    local_size = LOCAL_ARCHIVE.stat().st_size
    print(f"File nén cục bộ: {LOCAL_ARCHIVE.name} ({local_size:,} bytes, {local_size / 1024 / 1024:.2f} MB)", flush=True)
    
    ssh = connect()
    print("1. Đã kết nối SSH thành công tới VPS.", flush=True)
    
    df_out = run_cmd(ssh, "df -h / | tail -n 1")
    print(f"   Dung lượng đĩa VPS: {df_out.strip()}", flush=True)
    
    # Step 1: Remote selective backup
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_dir = f"/linhhoasu/_ai_workbench/backups/images_pre_vietnamese_{ts}"
    print(f"2. Tạo thư mục backup remote: {backup_dir}", flush=True)
    run_cmd(ssh, f"mkdir -p {backup_dir}")
    
    print("   Đang tạo backup chọn lọc (các thư mục lang_cn và spine/ui hiện tại)...", flush=True)
    backup_cmd = (
        f'(find /linhhoasu/webgame/game/update/resource/assets/atlas_ui -type d -name "lang_cn"; '
        f' [ -d /linhhoasu/webgame/game/update/resource/assets/spine/ui ] && echo /linhhoasu/webgame/game/update/resource/assets/spine/ui) '
        f'| tar -cf {backup_dir}/pre_vietnamese_images.tar -T -'
    )
    run_cmd(ssh, backup_cmd, timeout=120)
    backup_size = run_cmd(ssh, f"stat -c %s {backup_dir}/pre_vietnamese_images.tar").strip()
    print(f"   Đã lưu backup an toàn ({int(backup_size):,} bytes, ~{int(backup_size)/1024/1024:.1f} MB).", flush=True)
    
    # Step 2: Upload archive via SFTP
    remote_tmp = "/linhhoasu/_ai_workbench/temp/vietnamese_images_4641.tar.gz"
    run_cmd(ssh, "mkdir -p /linhhoasu/_ai_workbench/temp")
    print(f"3. Đang tải lên {LOCAL_ARCHIVE.name} ({local_size / 1024 / 1024:.2f} MB) qua SFTP...", flush=True)
    
    last_reported = [0]
    def upload_progress(transferred, total):
        pct = int(transferred / total * 100)
        if pct >= last_reported[0] + 20 or pct == 100:
            last_reported[0] = pct
            print(f"   SFTP tiến độ: {pct}% ({transferred / 1024 / 1024:.1f}/{total / 1024 / 1024:.1f} MB)", flush=True)
            
    sftp = ssh.open_sftp()
    sftp.put(str(LOCAL_ARCHIVE), remote_tmp, callback=upload_progress)
    sftp.close()
    print("   Tải lên hoàn tất!", flush=True)
    
    # Step 3: Verify SHA256 on VPS
    print("4. Kiểm tra mã SHA-256 trên VPS...", flush=True)
    vps_sha = run_cmd(ssh, f"sha256sum {remote_tmp}").split()[0]
    print(f"   Local SHA: {EXPECTED_SHA}", flush=True)
    print(f"   VPS   SHA: {vps_sha}", flush=True)
    if vps_sha != EXPECTED_SHA:
        raise ValueError(f"MÃ HASH KHÔNG KHỚP! Local: {EXPECTED_SHA} vs VPS: {vps_sha}")
    print("   -> SHA-256 khớp tuyệt đối 100%!", flush=True)
    
    # Step 4: Extract into webgame and lhs
    print("5. Giải nén vào /linhhoasu/webgame/game/update/resource/ ...", flush=True)
    run_cmd(ssh, f"tar -xzf {remote_tmp} -C /linhhoasu/webgame/game/update/resource/", timeout=180)
    
    print("   Giải nén vào /linhhoasu/lhs/update/resource/ ...", flush=True)
    run_cmd(ssh, f"tar -xzf {remote_tmp} -C /linhhoasu/lhs/update/resource/", timeout=180)
    
    # Step 5: Fix permissions
    print("6. Cập nhật phân quyền (www:www 755)...", flush=True)
    run_cmd(ssh, "chown -R www:www /linhhoasu/webgame/game/update/resource/assets/atlas_ui /linhhoasu/webgame/game/update/resource/assets/spine/ui 2>/dev/null || true")
    run_cmd(ssh, "chmod -R 755 /linhhoasu/webgame/game/update/resource/assets/atlas_ui /linhhoasu/webgame/game/update/resource/assets/spine/ui 2>/dev/null || true")
    run_cmd(ssh, "chown -R www:www /linhhoasu/lhs/update/resource/assets/atlas_ui /linhhoasu/lhs/update/resource/assets/spine/ui 2>/dev/null || true")
    run_cmd(ssh, "chmod -R 755 /linhhoasu/lhs/update/resource/assets/atlas_ui /linhhoasu/lhs/update/resource/assets/spine/ui 2>/dev/null || true")
    
    # Step 6: Live verification
    print("7. Chạy kiểm chứng thực tế (Live verification) trên VPS...", flush=True)
    test_files = [
        ("assets/atlas_ui/0_common/bm/lang_cn/common_bm_yiguoqi_8c3845f9.png", 19205),
        ("assets/atlas_ui/0_common/bm/lang_cn/common_bm_huodong_6004328d.png", 3322),
        ("assets/atlas_ui/0_common/bm/lang_cn/common_bm_gongxihuode_ac09857b.png", 57021),
    ]
    
    all_ok = True
    for rel_path, expected_bytes in test_files:
        full_p = f"/linhhoasu/webgame/game/update/resource/{rel_path}"
        actual_bytes = int(run_cmd(ssh, f"stat -c %s {full_p}").strip())
        status = "PASS" if actual_bytes == expected_bytes else "FAIL"
        print(f"   [{status}] {Path(rel_path).name}: actual {actual_bytes} bytes (expected {expected_bytes})", flush=True)
        if actual_bytes != expected_bytes:
            all_ok = False
            
    # HTTP Check
    http_probe = run_cmd(ssh, "curl -sI http://127.0.0.1:81/update/resource/assets/atlas_ui/0_common/bm/lang_cn/common_bm_yiguoqi_8c3845f9.png | head -n 5")
    print(f"   Nginx probe:\n{http_probe.strip()}", flush=True)
    if "200 OK" not in http_probe:
        all_ok = False
        print("   [WARNING] HTTP Probe did not return 200 OK", flush=True)
    else:
        print("   [PASS] Nginx phản hồi HTTP 200 OK!", flush=True)

    # Step 7: Clean remote tmp tarball
    run_cmd(ssh, f"rm -f {remote_tmp}")
    print("8. Đã dọn file nén tạm trên VPS.", flush=True)
    
    ssh.close()
    
    if all_ok:
        print("\n=== TRIỂN KHAI THÀNH CÔNG 100% ===", flush=True)
    else:
        print("\n=== TRIỂN KHAI CÓ CẢNH BÁO ===", flush=True)

if __name__ == '__main__':
    main()
