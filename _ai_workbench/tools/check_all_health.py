import sys
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
        echo "=== PM2 ALL STATUS ==="
        pm2 status
        echo "=== HTTP HEALTH PROBES ==="
        for port in 8080 8083 8084 8085 8086; do
            code=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:$port/health || echo "ERR")
            echo "Port $port: $code"
        done
        """
        print(run(ssh, cmd))
    finally:
        ssh.close()

if __name__ == '__main__':
    main()
