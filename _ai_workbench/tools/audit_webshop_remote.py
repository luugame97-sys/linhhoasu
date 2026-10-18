import getpass, os, re, json, paramiko

ssh=paramiko.SSHClient(); ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('103.116.105.154',username='root',password=getpass.getpass('VPS password (not logged): '),look_for_keys=False,allow_agent=False,timeout=15)
def run(cmd):
    _,o,e=ssh.exec_command(cmd); out=o.read().decode('utf-8','replace'); err=e.read().decode('utf-8','replace'); code=o.channel.recv_exit_status(); return code,out,err
try:
    commands={
      'FILES': "find /linhhoasu/webgame/gm -maxdepth 4 -type f | grep -Ei '(shop|store|product|order|payment|sepay|webhook|recharge|purchase|api)' | sort | head -300",
      'DIRS': "find /linhhoasu/webgame/gm -maxdepth 3 -type d | sort | head -200",
      'NGINX': "grep -RniE 'web-panel|webgame/gm|fastcgi|proxy_pass' /www/server/panel/vhost/nginx /etc/nginx 2>/dev/null | head -180",
      'PHP_ERRORS': "tail -n 250 /www/wwwlogs/php-error.log /www/server/php/74/var/log/php-fpm.log /var/log/php-fpm/error.log 2>/dev/null | grep -Ei 'fatal|warning|error|exception|sepay|shop|order|payment' | tail -100",
      'NGINX_ERRORS': "tail -n 350 /www/wwwlogs/*error*.log /var/log/nginx/error.log 2>/dev/null | grep -Ei 'web-panel|gm|shop|order|payment|sepay|php' | tail -120",
      'HTTP': "for u in /web-panel/ /web-panel/api/user_api.php /web-panel/api/sepay_webhook.php /web-panel/admin/index.php; do printf '%s ' \"$u\"; curl -sS -o /dev/null -w '%{http_code} %{time_total} %{content_type}\\n' http://127.0.0.1:81$u; done",
      'PHP_SYNTAX': "find /linhhoasu/webgame/gm -type f -name '*.php' -print0 | xargs -0 -n1 php -l 2>&1 | grep -v 'No syntax errors' | head -100; echo checked=$(find /linhhoasu/webgame/gm -type f -name '*.php' | wc -l)",
    }
    for title,cmd in commands.items():
        code,out,err=run(cmd); print('###'+title); print(out); print(err if code and err else '')
finally: ssh.close()
