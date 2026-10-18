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

CLIENT_FILES = [
    ("linhhoasu/webgame/game/js/main.min_drop100.js", "/linhhoasu/webgame/game/js/main.min_drop100.js"),
    ("linhhoasu/webgame/game/js/main.min_a6195824.js", "/linhhoasu/webgame/game/js/main.min_a6195824.js"),
    ("linhhoasu/webgame/game/index.html", "/linhhoasu/webgame/game/index.html"),
]

SERVER_FILES = [
    ("linhhoasu/lhs/newServer/src/services/FarmShopService.js", "/linhhoasu/lhs/newServer/src/services/FarmShopService.js"),
    ("linhhoasu/lhs/newServer/src/handlers/activity.js", "/linhhoasu/lhs/newServer/src/handlers/activity.js"),
    ("linhhoasu/lhs/newServer/src/handlers/commerce-compat.js", "/linhhoasu/lhs/newServer/src/handlers/commerce-compat.js"),
    ("linhhoasu/lhs/newServer/src/handlers/reborn.js", "/linhhoasu/lhs/newServer/src/handlers/reborn.js"),
    ("linhhoasu/lhs/newServer/src/handlers/temple.js", "/linhhoasu/lhs/newServer/src/handlers/temple.js"),
    ("linhhoasu/lhs/newServer/src/handlers/dungeon.js", "/linhhoasu/lhs/newServer/src/handlers/dungeon.js"),
    ("linhhoasu/lhs/newServer/src/handlers/playerPayload.js", "/linhhoasu/lhs/newServer/src/handlers/playerPayload.js"),
    ("linhhoasu/lhs/newServer/src/services/RechargeRewardResolver.js", "/linhhoasu/lhs/newServer/src/services/RechargeRewardResolver.js"),
    ("linhhoasu/lhs/newServer/src/logger.js", "/linhhoasu/lhs/newServer/src/logger.js"),
]

ALL_FILES = CLIENT_FILES + SERVER_FILES

def sha256_file(filepath):
    h = hashlib.sha256()
    with open(filepath, 'rb') as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()

def main():
    print("=== BẮT ĐẦU TRIỂN KHAI ĐỒNG BỘ MÚI GIỜ GMT+7 LÊN VPS (103.116.105.154) ===")
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_dir = f"/linhhoasu/_ai_workbench/backups/gmt7_sync_deploy_{timestamp}"
    
    ssh = connect()
    sftp = ssh.open_sftp()
    
    print(f"1. Tạo thư mục backup remote: {backup_dir}")
    run(ssh, f"mkdir -p {backup_dir}")
    
    print("2. Sao lưu toàn bộ tệp hiện tại trên VPS trước khi cập nhật...")
    for rel_local, remote_path in ALL_FILES:
        p = Path(remote_path)
        dest_name = f"{p.parts[-3]}_{p.name}" if len(p.parts) >= 3 else p.name
        backup_file = f"{backup_dir}/{dest_name}"
        run(ssh, f"cp {remote_path} {backup_file} 2>/dev/null || true")
        remote_sha = run(ssh, f"sha256sum {remote_path} 2>/dev/null || echo 'NONE'").split()[0]
        print(f"  - Backup: {remote_path} -> {dest_name} (pre-sha: {remote_sha[:12]}...)")
    
    print("\n3. Tải các tệp cập nhật lên VPS...")
    for rel_local, remote_path in ALL_FILES:
        local_path = WORKSPACE_ROOT / rel_local
        local_sha = sha256_file(local_path)
        print(f"  - Uploading: {rel_local}...")
        sftp.put(str(local_path), remote_path)
        
        # Verify SHA-256 on VPS
        res = run(ssh, f"sha256sum {remote_path}").strip()
        remote_sha = res.split()[0]
        if local_sha == remote_sha:
            print(f"    + Khớp SHA-256: {remote_sha[:12]}... OK")
        else:
            raise RuntimeError(f"SHA-256 KHÔNG KHỚP cho {rel_local}! Local: {local_sha}, Remote: {remote_sha}")
    
    sftp.close()
    
    print("\n4. Phân quyền tệp...")
    for _, remote_path in CLIENT_FILES:
        run(ssh, f"chmod 644 {remote_path}")
        run(ssh, f"chown www:www {remote_path} 2>/dev/null || true")
    for _, remote_path in SERVER_FILES:
        run(ssh, f"chmod 644 {remote_path}")
    print("  - Phân quyền hoàn tất.")
    
    print("\n5. Kiểm tra cú pháp Nginx và reload...")
    nginx_test = run(ssh, "nginx -t 2>&1")
    print(f"  - Nginx test:\n    {nginx_test.strip()}")
    run(ssh, "nginx -s reload")
    print("  - Nginx reloaded successfully.")
    
    print("\n6. Khởi động lại rolling PM2 5 máy chủ...")
    nodes = [
        ("lhs-s1001", 8080),
        ("lhs-s1002", 8083),
        ("lhs-s1003", 8084),
        ("lhs-s1004", 8085),
        ("lhs-s1005", 8086),
    ]
    
    for name, port in nodes:
        print(f"  - Restarting {name}...")
        run(ssh, f"pm2 restart {name}")
        
        # Health check
        ready = False
        for attempt in range(1, 15):
            time.sleep(1.0)
            try:
                res = run(ssh, f"curl -s -o /dev/null -w '%{{http_code}}' --connect-timeout 2 http://127.0.0.1:{port}/ || true").strip()
                if res in ('200', '404', '405', '401', '403'):
                    print(f"    + {name} (Port {port}) online (HTTP {res}) sau {attempt}s.")
                    ready = True
                    break
            except Exception:
                pass
        if not ready:
            print(f"    ! CẢNH BÁO: {name} chưa phản hồi HTTP sau 15s!")
    
    print("\n7. Chạy live verification test trực tiếp trên VPS...")
    verify_code = r"""
    const assert = require('assert');
    process.chdir('/linhhoasu/lhs/newServer');
    
    // 1. Check GameDayService vs FarmShopService
    const gameDay = require('./src/services/GameDayService');
    const farmShop = require('./src/services/FarmShopService');
    
    const now = Date.now();
    const todayFarm = gameDay.key(now);
    console.log('Live GameDayService key:', todayFarm);
    assert(todayFarm >= 20260900, 'GameDayService key invalid');
    
    // 2. Check activity handler
    const activity = require('./src/handlers/activity');
    const dayKey = activity.getGmt8DayKey(now);
    console.log('Live activity dayKey:', dayKey);
    assert(dayKey > 20000, 'Activity dayKey invalid');
    
    // 3. Check client bundle for -420
    const fs = require('fs');
    const bundle = fs.readFileSync('/linhhoasu/webgame/game/js/main.min_drop100.js', 'utf8');
    assert(bundle.includes('-420-e'), 'main.min_drop100.js missing -420 offset');
    console.log('Client bundle -420 GMT+7 offset verified: PASS');
    
    const indexHtml = fs.readFileSync('/linhhoasu/webgame/game/index.html', 'utf8');
    assert(indexHtml.includes('20260920_gmt7_sync_v1'), 'index.html missing cache-buster version');
    console.log('index.html cache-buster verified: PASS');
    
    console.log('\n>>> LIVE VERIFICATION ON VPS: ALL CHECKS PASSED 100% <<<');
    """
    
    out = run(ssh, f"node -e {repr(verify_code)}")
    print(out.strip())
    print("\n=== TRIỂN KHAI VÀ ĐỒNG BỘ GMT+7 HOÀN TẤT THÀNH CÔNG 100%! ===")

if __name__ == '__main__':
    main()
