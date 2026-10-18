import sys
sys.path.insert(0, '_ai_workbench/tools')
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')
from snapshot_web_multiserver_20260906 import connect, run

ssh = connect()
print(run(ssh, 'pm2 status'))
print("Port 8086 code:", run(ssh, 'curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8086/ready || true'))
ssh.close()
