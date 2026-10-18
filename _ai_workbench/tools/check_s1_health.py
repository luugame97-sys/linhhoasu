import sys
import time
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')
sys.dont_write_bytecode = True

WB = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(WB / 'tools'))
sys.path.insert(0, str(WB / 'temp/pydeps'))
from snapshot_web_multiserver_20260906 import connect, run

def main():
    ssh = connect()
    try:
        cmd = """
        echo "=== PM2 STATUS ==="
        pm2 status lhs-s1001
        echo "=== CURL HEALTH 8080 ==="
        curl -s http://127.0.0.1:8080/health | head -c 200; echo ""
        echo "=== HTTP CODE ==="
        curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8080/health; echo ""
        """
        print(run(ssh, cmd))
    finally:
        ssh.close()

if __name__ == '__main__':
    main()
