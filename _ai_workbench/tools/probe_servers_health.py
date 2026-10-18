import sys
sys.stdout.reconfigure(encoding='utf-8')
from pathlib import Path
WB = Path('_ai_workbench')
sys.path.insert(0, str(WB / 'tools'))
sys.path.insert(0, str(WB / 'temp/pydeps'))
from snapshot_web_multiserver_20260906 import connect, run

ssh = connect()
try:
    print(run(ssh, 'pm2 status'))
    for p in [8080, 8083, 8084, 8085, 8086]:
        code = run(ssh, f'curl -s -o /dev/null -w "%{{http_code}}" http://127.0.0.1:{p}/ready').strip()
        print(f'Port {p}: HTTP {code}')
finally:
    ssh.close()
