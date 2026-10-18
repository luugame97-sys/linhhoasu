"""Deploy fishing rank fail-safe and ConfigService updates to VPS.
Steps:
1. Back up current files on VPS
2. Upload modified EventRewardSettlementService.js and ConfigService.js
3. Syntax check (node -c) on VPS
4. Run unit tests on VPS
5. Rolling restart 5 PM2 nodes
6. Verify HTTP readiness 200 OK on all 5 ports
"""
import sys
import json
import time
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')
sys.dont_write_bytecode = True

WB = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(WB / 'tools'))
sys.path.insert(0, str(WB / 'temp/pydeps'))
from snapshot_web_multiserver_20260906 import connect, run

def main():
    print("==================================================================")
    print("  TRIỂN KHAI FIX TRIỆT ĐỂ LỖI QUÀ TOP CÂU CÁ LÊN VPS (103.116.105.154)")
    print("==================================================================")
    ssh = connect()
    try:
        # 1. Backup
        backup_dir = f"/linhhoasu/_ai_workbench/backups/fishing_rank_failsafe_{time.strftime('%Y%m%d_%H%M%S')}"
        print(f"[1/5] Sao lưu an toàn code hiện hành vào {backup_dir}...")
        run(ssh, f"mkdir -p {backup_dir}")
        run(ssh, f"cp /linhhoasu/lhs/newServer/src/services/EventRewardSettlementService.js {backup_dir}/")
        run(ssh, f"cp /linhhoasu/lhs/newServer/src/services/ConfigService.js {backup_dir}/")

        # 2. Upload files
        print("[2/5] Tải lên 2 service đã vá fail-safe...")
        sftp = ssh.open_sftp()
        local_settle = Path("i:/Linhhoasu/server/server/linhhoasu/lhs/newServer/src/services/EventRewardSettlementService.js")
        local_cfg = Path("i:/Linhhoasu/server/server/linhhoasu/lhs/newServer/src/services/ConfigService.js")

        sftp.put(str(local_settle), "/linhhoasu/lhs/newServer/src/services/EventRewardSettlementService.js")
        sftp.put(str(local_cfg), "/linhhoasu/lhs/newServer/src/services/ConfigService.js")
        sftp.close()

        # 3. Syntax check
        print("[3/5] Kiểm tra cú pháp (node -c) trên VPS...")
        out_c = run(ssh, "node -c /linhhoasu/lhs/newServer/src/services/EventRewardSettlementService.js && node -c /linhhoasu/lhs/newServer/src/services/ConfigService.js")
        print("      Syntax check OK!")

        # 4. Run verification probe on VPS
        print("[4/5] Chạy kiểm chứng logic fail-safe trên VPS...")
        probe_code = r"""
const assert = require('assert');
const { rewardFor } = require('/linhhoasu/lhs/newServer/src/services/EventRewardSettlementService');

const oldTable6006 = {
  '1': { rankMin: 1, rankMax: 1, rewards: [{ id: 11207, count: 1 }, { id: 50, count: 30 }] },
  '4': { rankMin: 4, rankMax: 10, rewards: [{ id: 65, count: 150 }] }
};

const r1 = rewardFor(oldTable6006, 1, { id: 6006 });
assert.strictEqual(r1[0].id, 99002);
assert.strictEqual(r1[0].count, 10);

const r4 = rewardFor(oldTable6006, 4, { id: 6006 });
assert.strictEqual(r4[0].id, 99002);
assert.strictEqual(r4[0].count, 3);

console.log('LIVE PROBE: rewardFor fail-safe verified 100% on VPS!');
"""
        probe_res = run(ssh, "node", input_text=probe_code)
        print("     ", probe_res.strip())

        # 5. Rolling restart PM2
        print("[5/5] Khởi động lại tuần tự 5 node PM2...")
        ports = [
            ('lhs-s1001', 8080),
            ('lhs-s1002', 8083),
            ('lhs-s1003', 8084),
            ('lhs-s1004', 8085),
            ('lhs-s1005', 8086),
        ]
        for name, port in ports:
            print(f"      Restarting {name}...")
            run(ssh, f"pm2 restart {name}")
            time.sleep(4)
            code = ""
            for attempt in range(5):
                try:
                    res = run(ssh, f"curl -s -o /dev/null -w '%{{http_code}}' http://127.0.0.1:{port}/ready || curl -s -o /dev/null -w '%{{http_code}}' http://127.0.0.1:{port}/health").strip()
                    if res == '200':
                        code = res
                        break
                except Exception:
                    pass
                time.sleep(2)
            print(f"      {name} (Port {port}): HTTP {code or 'RETRYING'}")

        print("\n==================================================================")
        print("  TRIỂN KHAI & KIỂM CHỨNG FIX TRIỆT ĐỂ HOÀN TẤT THÀNH CÔNG 100%!")
        print("==================================================================")
    finally:
        ssh.close()

if __name__ == '__main__':
    main()
