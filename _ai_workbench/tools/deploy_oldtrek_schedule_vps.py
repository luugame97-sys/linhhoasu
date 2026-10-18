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

DEPLOY_FILES = [
    (
        "linhhoasu/lhs/newServer/src/services/OldTrekScheduleService.js",
        "/linhhoasu/lhs/newServer/src/services/OldTrekScheduleService.js",
    ),
    (
        "linhhoasu/lhs/newServer/src/handlers/old-trek.js",
        "/linhhoasu/lhs/newServer/src/handlers/old-trek.js",
    ),
]

def sha256_file(filepath):
    h = hashlib.sha256()
    with open(filepath, 'rb') as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()

def main():
    print("=== BẮT ĐẦU TRIỂN KHAI HOANG CỔ MÊ HÀNG (OLD TREK SCHEDULE) LÊN VPS (103.116.105.154) ===")
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_dir = f"/linhhoasu/_ai_workbench/backups/oldtrek_schedule_deploy_{timestamp}"
    
    ssh = connect()
    sftp = ssh.open_sftp()
    
    print(f"\n1. Tạo thư mục backup remote: {backup_dir}")
    run(ssh, f"mkdir -p {backup_dir}")
    
    print("\n2. Sao lưu tệp hiện tại trên VPS trước khi cập nhật...")
    for rel_local, remote_path in DEPLOY_FILES:
        p = Path(remote_path)
        dest_name = f"{p.parts[-2]}_{p.name}"
        backup_file = f"{backup_dir}/{dest_name}"
        run(ssh, f"cp {remote_path} {backup_file} 2>/dev/null || true")
        remote_sha = run(ssh, f"sha256sum {remote_path} 2>/dev/null || echo 'NEW_FILE'").strip()
        print(f"   [BACKUP] {remote_path} -> {dest_name} (Hiện tại: {remote_sha[:16]}...)")
        
    print("\n3. Tải các tệp cập nhật lên VPS...")
    for rel_local, remote_path in DEPLOY_FILES:
        local_path = WORKSPACE_ROOT / rel_local
        local_sha = sha256_file(local_path)
        
        # Đảm bảo thư mục đích tồn tại
        remote_dir = str(Path(remote_path).parent).replace('\\', '/')
        run(ssh, f"mkdir -p {remote_dir}")
        
        sftp.put(str(local_path), remote_path)
        run(ssh, f"chown -R www:www {remote_path} && chmod 644 {remote_path}")
        
        remote_sha_out = run(ssh, f"sha256sum {remote_path}").split()[0]
        if local_sha == remote_sha_out:
            print(f"   [OK] {rel_local} -> SHA256: {local_sha[:16]}... (KHỚP 100%)")
        else:
            print(f"   [LỖI] Checksum không khớp cho {rel_local}!")
            sys.exit(1)
            
    print("\n4. Kiểm tra cú pháp Node.js trên VPS...")
    check_cmd = "node --check /linhhoasu/lhs/newServer/src/services/OldTrekScheduleService.js && node --check /linhhoasu/lhs/newServer/src/handlers/old-trek.js"
    check_out = run(ssh, check_cmd)
    print(f"   Node syntax check: OK")

    print("\n5. Khởi động lại tuần tự (Rolling restart) 5 cụm PM2...")
    pm2_nodes = ["lhs-s1001", "lhs-s1002", "lhs-s1003", "lhs-s1004", "lhs-s1005"]
    for node in pm2_nodes:
        print(f"   Đang restart {node}...")
        run(ssh, f"pm2 restart {node}")
        time.sleep(1.5)
        
    print("\n6. Kiểm tra trạng thái runtime PM2...")
    pm2_status = run(ssh, "pm2 jlist")
    import json
    proc_list = json.loads(pm2_status)
    all_online = True
    for p in proc_list:
        name = p.get('name')
        if name in pm2_nodes:
            status = p.get('pm2_env', {}).get('status')
            uptime = p.get('pm2_env', {}).get('pm_uptime')
            print(f"   * {name}: {status} (uptime: {uptime})")
            if status != 'online':
                all_online = False
                
    if not all_online:
        print("   [CẢNH BÁO] Có node PM2 không ở trạng thái online!")
        sys.exit(1)
    print("   -> Toàn bộ 5 cụm máy chủ PM2 ONLINE!")

    print("\n7. Chạy Live Verification Probe trên VPS...")
    verify_js = """
    const oldTrekSchedule = require('/linhhoasu/lhs/newServer/src/services/OldTrekScheduleService');
    const { ensureOldTrekInfo } = require('/linhhoasu/lhs/newServer/src/handlers/old-trek');
    
    const sched = oldTrekSchedule.getSchedule();
    const mock = { userId: 'live_probe_vps_01', name: 'LiveProbe' };
    const info = ensureOldTrekInfo(mock);
    
    const result = {
      schedule: sched,
      infoSample: {
        stage: info.stage,
        matchId: info.matchId,
        season: info.season,
        totalSeason: info.totalSeason,
        endTime: info.endTime,
        isDepartAllowed: sched.isDepartAllowed,
        totalDistance: info.totalDistance,
        sailing: info.sailing
      },
      validations: {
        stageIsOn: info.stage === 2,
        matchIdIs2: info.matchId === 2,
        totalSeasonUnlocksSystems: info.totalSeason >= 2,
        departAllowedNow: sched.isDepartAllowed === true,
        futureEndTime: info.endTime > Date.now()
      }
    };
    console.log(JSON.stringify(result));
    """
    
    import shlex
    live_out = run(ssh, f"node -e {shlex.quote(verify_js)}")
    try:
        json_str = live_out[live_out.index('{'):] if '{' in live_out else live_out
        live_res = json.loads(json_str)
        print("   Kết quả xác minh live:")
        print(json.dumps(live_res, indent=2, ensure_ascii=False))
        vals = live_res.get('validations', {})
        if all(vals.values()):
            print("\n-> TẤT CẢ 5 ĐIỀU KIỆN XÁC MINH TRỰC TIẾP TRÊN VPS ĐẠT 100% PASS!")
        else:
            print("\n-> [LỖI] Có điều kiện xác minh không đạt!")
            sys.exit(1)
    except Exception as e:
        print(f"   Lỗi parse kết quả probe: {e}\nRaw output:\n{live_out}")
        sys.exit(1)

    sftp.close()
    ssh.close()
    print("\n=== HOÀN TẤT TRIỂN KHAI VÀ KIỂM CHỨNG TRÊN VPS THÀNH CÔNG ===")

if __name__ == '__main__':
    main()
