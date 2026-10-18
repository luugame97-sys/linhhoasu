import sys
from pathlib import Path
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, str(Path(__file__).resolve().parent))
from snapshot_web_multiserver_20260906 import connect, run

ssh = connect()
try:
    print("=== SEARCHING FOR DB BACKUPS / DUMPS ON VPS ===")
    out = run(ssh, 'find /linhhoasu/_ai_workbench/backups -type d -name "*mongo*" -o -name "*dump*" -o -name "*player*" 2>/dev/null | head -n 30')
    print(out)
    out2 = run(ssh, 'find / -maxdepth 3 -name "*mongodump*" -o -name "*backup*.tar*" 2>/dev/null | head -n 30')
    print(out2)
finally:
    ssh.close()
