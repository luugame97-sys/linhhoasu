"""Narrow read-only process/config inventory for safe WebGM source promotion."""
import json
from snapshot_web_multiserver_20260906 import OUT, connect, run

ssh = connect()
try:
    info = run(ssh, r"""ps -eo pid,ppid,args | grep '[p]hp-fpm'
grep -nE '^(listen|request_terminate_timeout|pm.status_path|pm.max_children|slowlog|request_slowlog_timeout)' /www/server/php/74/etc/php-fpm.conf /www/server/php/74/etc/php-fpm.d/*.conf 2>/dev/null || true
grep -nE '^(opcache.enable|opcache.validate_timestamps|opcache.revalidate_freq|max_execution_time|default_socket_timeout)' /www/server/php/74/etc/php.ini
curl -sS --max-time 10 -o /dev/null -w 'web=%{http_code}\n' http://127.0.0.1:88/login.php
curl -sS --max-time 10 -o /dev/null -w 's1=%{http_code}\n' http://127.0.0.1:8080/ready
curl -sS --max-time 10 -o /dev/null -w 's2=%{http_code}\n' http://127.0.0.1:8083/ready
""")
    (OUT/'runtime_preflight.txt').write_text(info,encoding='utf-8')
    print(info)
finally:
    ssh.close()
