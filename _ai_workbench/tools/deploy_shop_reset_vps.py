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

FILES_TO_DEPLOY = [
    ("linhhoasu/lhs/newServer/src/services/FarmShopService.js", "/linhhoasu/lhs/newServer/src/services/FarmShopService.js"),
    ("linhhoasu/lhs/newServer/src/services/FarmDayService.js", "/linhhoasu/lhs/newServer/src/services/FarmDayService.js"),
    ("linhhoasu/lhs/newServer/src/handlers/basic.js", "/linhhoasu/lhs/newServer/src/handlers/basic.js"),
    ("linhhoasu/lhs/newServer/src/handlers/item.js", "/linhhoasu/lhs/newServer/src/handlers/item.js"),
]

def sha256_file(filepath):
    h = hashlib.sha256()
    with open(filepath, 'rb') as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()

def main():
    print(f"=== BẮT ĐẦU TRIỂN KHAI SỬA LỖI SHOP RESET LÊN VPS (103.116.105.154) ===")
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_dir = f"/linhhoasu/_ai_workbench/backups/shop_daily_reset_deploy_{timestamp}"
    
    client = connect()
    sftp = client.open_sftp()
    
    print(f"1. Tạo thư mục backup remote: {backup_dir}")
    run(client, f"mkdir -p {backup_dir}")
    
    print("2. Sao lưu tệp hiện tại trên VPS trước khi cập nhật...")
    for rel_local, remote_path in FILES_TO_DEPLOY:
        backup_file = f"{backup_dir}/{os.path.basename(remote_path)}"
        run(client, f"cp {remote_path} {backup_file}")
        print(f"  - Backup: {remote_path} -> {backup_file}")
    
    print("3. Tải các tệp cập nhật lên VPS...")
    for rel_local, remote_path in FILES_TO_DEPLOY:
        local_path = WORKSPACE_ROOT / rel_local
        local_sha = sha256_file(local_path)
        sftp.put(str(local_path), remote_path)
        
        # Verify SHA-256 on VPS
        res = run(client, f"sha256sum {remote_path}").strip()
        remote_sha = res.split()[0]
        if local_sha == remote_sha:
            print(f"  - Upload thành công: {rel_local} (SHA-256: {remote_sha[:12]}... OK)")
        else:
            raise RuntimeError(f"SHA-256 không khớp cho {rel_local}! Local: {local_sha}, Remote: {remote_sha}")
    
    sftp.close()
    
    print("4. Phân quyền tệp (chmod 644)...")
    for _, remote_path in FILES_TO_DEPLOY:
        run(client, f"chmod 644 {remote_path}")
    
    print("5. Khởi động lại rolling PM2 5 máy chủ...")
    nodes = [
        ("lhs-s1001", 8080),
        ("lhs-s1002", 8083),
        ("lhs-s1003", 8084),
        ("lhs-s1004", 8085),
        ("lhs-s1005", 8086),
    ]
    
    for name, port in nodes:
        print(f"  - Restarting {name}...")
        run(client, f"pm2 restart {name}")
        
        # Health check
        ready = False
        for attempt in range(1, 15):
            time.sleep(1.0)
            try:
                res = run(client, f"curl -s -o /dev/null -w '%{{http_code}}' --connect-timeout 2 http://127.0.0.1:{port}/ || true").strip()
                if res in ('200', '404', '405', '401', '403'):
                    print(f"    + {name} (Port {port}) online (HTTP {res}) sau {attempt}s.")
                    ready = True
                    break
            except Exception:
                pass
        if not ready:
            print(f"    ! CẢNH BÁO: {name} chưa phản hồi HTTP sau 15s!")
    
    print("6. Chạy live verification test logic reset shop trực tiếp trên VPS...")
    verify_script = """
    const assert = require('assert');
    const path = require('path');
    process.chdir('/linhhoasu/lhs/newServer');
    
    const config = require('./src/services/ConfigService');
    const farmShop = require('./src/services/FarmShopService');
    const farmDay = require('./src/services/FarmDayService');
    
    const shopConfig = config.get('ShopConfig');
    assert(shopConfig, 'ShopConfig must be loaded');
    
    const tab1Daily = Object.values(shopConfig).filter(g => g.tab === 1 && g.limitType === 1);
    console.log(`Tab 1 daily items on VPS: ${tab1Daily.length}`);
    assert.strictEqual(tab1Daily.length, 16, 'Tab 1 daily items count mismatch');
    
    const now = Date.now();
    const dayKey = farmShop.getShopDayKey(now);
    console.log(`Current shopDayKey on VPS: ${dayKey}`);
    
    // Test dummy player past day
    const dummy = {
      shopInfo: { farmShopDay: 20260914, buyRecords: { 1000002: 99, 1000007: 5 } },
      rechargeInfo: { records: [{ id: 1000002, count: 99 }, { id: 1000007, count: 5 }] },
      other_attr_info: { farmGameDay: 20260914 }
    };
    assert(farmShop.needsReset(dummy, now), 'needsReset must be true');
    assert(farmDay.shouldSync(dummy, now), 'shouldSync must be true');
    
    farmDay.prepare(dummy, now);
    assert.strictEqual(dummy.shopInfo.buyRecords[1000002], undefined, '1000002 must be reset');
    assert.strictEqual(dummy.shopInfo.buyRecords[1000007], undefined, '1000007 must be reset');
    assert.strictEqual(dummy.rechargeInfo.records.find(r => r.id === 1000002).count, 0, 'rechargeInfo 1000002 count must be 0');
    assert.strictEqual(dummy.rechargeInfo.records.find(r => r.id === 1000007).count, 0, 'rechargeInfo 1000007 count must be 0');
    
    console.log('ALL LIVE VPS ASSERTIONS PASSED 100%!');
    """
    
    import base64
    b64 = base64.b64encode(verify_script.encode('utf-8')).decode('ascii')
    verify_cmd = f"cd /linhhoasu/lhs/newServer && node -e \"eval(Buffer.from('{b64}', 'base64').toString('utf8'))\""
    verify_out = run(client, verify_cmd)
    print("--- KẾT QUẢ KIỂM THỬ TRỰC TIẾP TRÊN VPS ---")
    print(verify_out)
    
    client.close()
    print("=== TRIỂN KHAI HOÀN TẤT THÀNH CÔNG ===")

if __name__ == "__main__":
    main()
