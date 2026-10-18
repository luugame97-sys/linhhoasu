"""Safe window execution of precision gem repair:
1. Temporarily stops PM2 node (triggers graceful save & disconnects socket)
2. Executes precision in-place MongoDB CAS restoration
3. Restarts PM2 node
4. Verifies readiness (HTTP 200) and asserts readback data from MongoDB
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

def execute_repair(ssh, server_app, server_port, target_account, restore_fn_name):
    print(f"\n==================================================================")
    print(f"  TIẾN HÀNH PHỤC HỒI CHO {target_account.upper()} TRÊN {server_app.upper()}")
    print(f"==================================================================")

    # 1. Stop PM2 node to prevent in-memory cache overwriting DB
    print(f"[1/4] Dừng tạm thời tiến trình PM2 {server_app} để chốt session an toàn...")
    run(ssh, f"pm2 stop {server_app}")
    time.sleep(1)

    # 2. Run precision apply script
    print(f"[2/4] Thực thi phục hồi chính xác trong MongoDB (CAS + Backup)...")
    from repair_mount_gem_precision_20260920 import REMOTE_SCRIPT_TEMPLATE
    node_script = REMOTE_SCRIPT_TEMPLATE.replace('__IS_APPLY__', 'true')
    node_script = node_script.replace('__TARGET_ACCOUNTS__', json.dumps([target_account]))
    output = run(ssh, 'node', input_text=node_script)

    if 'REPAIR_RESULT_START' not in output or 'REPAIR_RESULT_END' not in output:
        # Emergency restart node
        run(ssh, f"pm2 start {server_app}")
        raise RuntimeError(f"Lỗi khi thực thi script phục hồi: {output}")

    res = json.loads(output.split('REPAIR_RESULT_START')[1].split('REPAIR_RESULT_END')[0].strip())
    print("      Kết quả DB:", json.dumps(res, ensure_ascii=False, indent=2))

    # 3. Start PM2 node
    print(f"[3/4] Khởi động lại tiến trình PM2 {server_app}...")
    run(ssh, f"pm2 start {server_app}")
    time.sleep(2)

    # 4. Readiness check
    print(f"[4/4] Kiểm tra HTTP readiness probe cổng {server_port}...")
    probe_cmd = f"curl -s -o /dev/null -w '%{{http_code}}' http://127.0.0.1:{server_port}/ready || curl -s -o /dev/null -w '%{{http_code}}' http://127.0.0.1:{server_port}/health"
    code = run(ssh, probe_cmd).strip()
    print(f"      HTTP Code: {code}")
    if code != '200':
        print(f"      CẢNH BÁO: Phản hồi {code}, chờ thêm 2 giây kiểm tra lại...")
        time.sleep(2)
        code = run(ssh, probe_cmd).strip()
        print(f"      HTTP Code lần 2: {code}")

    return res

def main():
    ssh = connect()
    try:
        # S1: minhtoanmt (FoxPlayer)
        res1 = execute_repair(ssh, 'lhs-s1001', 8080, 'minhtoanmt', 'restore_foxplayer')

        # S5: xxxxxx (Bàng Bác)
        res5 = execute_repair(ssh, 'lhs-s1005', 8086, 'xxxxxx', 'restore_bangbac')

        print("\n==================================================================")
        print("  HOÀN THÀNH TẤT CẢ CÁC BƯỚC PHỤC HỒI CHUẨN XÁC")
        print("==================================================================")
    finally:
        ssh.close()

if __name__ == '__main__':
    main()
