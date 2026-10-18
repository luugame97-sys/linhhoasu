import sys
sys.path.insert(0, '_ai_workbench/tools')
from snapshot_web_multiserver_20260906 import connect, run

if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

ssh = connect()
print(run(ssh, "cat /www/server/panel/vhost/nginx/game.lhs.conf"))
ssh.close()
