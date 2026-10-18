import sys
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, r'i:/Linhhoasu/server/server/_ai_workbench/tools')
from snapshot_web_multiserver_20260906 import connect, run

ssh = connect()
print('=== NGINX CONF FILES ===')
print(run(ssh, 'ls -la /www/server/panel/vhost/nginx/'))

print('\n=== VHOST DETAILS ===')
out = run(ssh, "cat /www/server/panel/vhost/nginx/*.conf")
for line in out.splitlines():
    if any(k in line for k in ['server_name', 'root', 'listen', 'proxy_pass', 'location /']):
        print(line)

print('\n=== GAME.LHS.CONF ===')
print(run(ssh, "cat /www/server/panel/vhost/nginx/game.lhs.conf"))

ssh.close()
