import sys
if hasattr(sys.stdout, 'reconfigure'): sys.stdout.reconfigure(encoding='utf-8', errors='replace')
import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('103.116.104.165', username='root', password='anhduc11')

# 1. Backup 0.default.conf
print("1. Backing up 0.default.conf...")
ssh.exec_command('if [ -f /www/server/panel/vhost/nginx/0.default.conf ]; then mv /www/server/panel/vhost/nginx/0.default.conf /www/server/panel/vhost/nginx/0.default.conf.bak; fi')

# 2. Backup game.lhs.conf
print("2. Backing up game.lhs.conf...")
ssh.exec_command('cp /www/server/panel/vhost/nginx/game.lhs.conf /www/server/panel/vhost/nginx/game.lhs.conf.bak_20260930')

# 3. Create new game.lhs.conf
new_conf = """server {
    listen 81 default_server;
    listen 80 default_server;
    listen 443 ssl http2 default_server;
    server_name _ linhhoasu.lol www.linhhoasu.lol;
    root /linhhoasu/webgame/game;
    index index.html;
    include enable-php-74.conf;

    # ===== SSL Certificate for linhhoasu.lol =====
    ssl_certificate     /www/server/panel/vhost/cert/linhhoasu.lol/fullchain.pem;
    ssl_certificate_key /www/server/panel/vhost/cert/linhhoasu.lol/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers EECDH+CHACHA20:EECDH+CHACHA20-draft:EECDH+AES128:RSA+AES128:EECDH+AES256:RSA+AES256:EECDH+3DES:RSA+3DES:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_tickets on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;
    add_header Strict-Transport-Security "max-age=31536000" always;

    # Redirect HTTP requests on port 443 to HTTPS
    error_page 497 https://$host$request_uri;

    # ===== Cổng web nhúng cùng origin để iframe/postMessage hoạt động chuẩn =====
    location = /web-panel {
        return 301 /web-panel/;
    }

    location ^~ /web-panel/ {
        rewrite ^/web-panel/(.*)$ /$1 break;
        proxy_pass http://127.0.0.1:88;
        proxy_http_version 1.1;
        proxy_set_header Host 127.0.0.1:88;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Prefix /web-panel;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_redirect http://127.0.0.1:88/ /web-panel/;
        proxy_redirect http://103.116.104.165:88/ /web-panel/;
        proxy_read_timeout 3600s;
    }

    # ===== Static Webgame =====
    location / {
        try_files $uri $uri/ /index.html;
    }

    location /update/ {
        alias /linhhoasu/webgame/game/update/;
        expires 7d;
        add_header Cache-Control "public, immutable";
    }

    location /js/ {
        alias /linhhoasu/webgame/game/js/;
        expires 7d;
        add_header Cache-Control "public, immutable";
    }

    # ===== WebSocket Game Servers =====
    location /ws {
        proxy_pass http://127.0.0.1:9200;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 3600s;
    }

    location /ws-s2 {
        proxy_pass http://127.0.0.1:9201;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 3600s;
    }

    location /ws-s3 {
        proxy_pass http://127.0.0.1:9202;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 3600s;
    }

    location /ws-s4 {
        proxy_pass http://127.0.0.1:9203;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 3600s;
    }

    location /ws-s5 {
        proxy_pass http://127.0.0.1:9204;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 3600s;
    }

    location /ws-s6 {
        proxy_pass http://127.0.0.1:9205;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 3600s;
    }

    # ===== HTTP API =====
    location /gameMsg.do {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /admin/ {
        proxy_pass http://127.0.0.1:8082/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /dist-api/ {
        proxy_pass http://127.0.0.1:3001/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /dist/ {
        proxy_pass http://127.0.0.1:3001/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    access_log /www/wwwlogs/game-lhs-access.log;
    error_log  /www/wwwlogs/game-lhs-error.log;
}
"""

print("3. Writing new game.lhs.conf...")
sftp = ssh.open_sftp()
with sftp.open('/www/server/panel/vhost/nginx/game.lhs.conf', 'w') as f:
    f.write(new_conf.replace('\r\n', '\n'))
sftp.close()

# 4. Test nginx syntax
print("4. Testing nginx syntax...")
_, o, e = ssh.exec_command('nginx -t')
stdout = o.read().decode('utf-8')
stderr = e.read().decode('utf-8')
print("nginx -t output:")
print(stdout)
print(stderr)

if "successful" in stderr or "successful" in stdout:
    print("5. Syntax OK, reloading nginx...")
    _, o, e = ssh.exec_command('nginx -s reload')
    print("Reload status:", o.channel.recv_exit_status())
else:
    print("ERROR: nginx syntax check failed! Restoring backup...")
    ssh.exec_command('cp /www/server/panel/vhost/nginx/game.lhs.conf.bak_20260930 /www/server/panel/vhost/nginx/game.lhs.conf')
    if ssh.exec_command('[ -f /www/server/panel/vhost/nginx/0.default.conf.bak ]')[1].channel.recv_exit_status() == 0:
        ssh.exec_command('mv /www/server/panel/vhost/nginx/0.default.conf.bak /www/server/panel/vhost/nginx/0.default.conf')

ssh.close()
print("Done!")
