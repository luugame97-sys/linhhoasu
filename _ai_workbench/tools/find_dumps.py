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
        find /linhhoasu /data /root /var -maxdepth 4 -type f \\( -name "*.bson" -o -name "*.dump" -o -name "*mongodump*" -o -name "*player*json" \\) 2>/dev/null | head -50 || true
        """
        print(run(ssh, cmd))
    finally:
        ssh.close()

if __name__ == '__main__':
    main()
