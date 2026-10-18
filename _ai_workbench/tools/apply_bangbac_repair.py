"""Restore Bàng Bác (S5) gems in safe window."""
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
from repair_mount_gem_precision_20260920 import REMOTE_SCRIPT_TEMPLATE

def main():
    ssh = connect()
    try:
        print("=== PHỤC HỒI CHO BÀNG BÁC (S5 - LHS-S1005) ===")
        print("[1/4] Dừng tạm thời PM2 lhs-s1005...")
        run(ssh, "pm2 stop lhs-s1005")
        time.sleep(1)

        print("[2/4] Thực thi phục hồi MongoDB CAS...")
        node_script = REMOTE_SCRIPT_TEMPLATE.replace('__IS_APPLY__', 'true')
        node_script = node_script.replace('__TARGET_ACCOUNTS__', json.dumps(['xxxxxx']))
        output = run(ssh, 'node', input_text=node_script)
        if 'REPAIR_RESULT_START' in output and 'REPAIR_RESULT_END' in output:
            res = json.loads(output.split('REPAIR_RESULT_START')[1].split('REPAIR_RESULT_END')[0].strip())
            print("Kết quả:", json.dumps(res, ensure_ascii=False, indent=2))
        else:
            print("Output:", output)

        print("[3/4] Khởi động lại PM2 lhs-s1005...")
        run(ssh, "pm2 start lhs-s1005")
        time.sleep(5)

        print("[4/4] Kiểm tra health S5 cổng 8086...")
        code = run(ssh, 'curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8086/health; echo ""').strip()
        print(f"HTTP Code S5: {code}")

    finally:
        ssh.close()

if __name__ == '__main__':
    main()
