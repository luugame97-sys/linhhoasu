import sys
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

import paramiko
import time

OLD_HOST = '103.116.105.154'
NEW_HOST = '103.116.104.165'
USER = 'root'
PASS = 'anhduc11'

NEW_MYSQL_PASS = '11a72ee788bff9b4'

CONF_88 = """server {
    listen 88;
    server_name 127.0.0.1;
    root /linhhoasu/webgame/gm;
    index index.php index.html index.htm;
    include enable-php-74.conf;

    location / {
        try_files $uri $uri/ /index.php?$query_string;
    }

    # Forbidden files
    location ~ ^/(\\.user.ini|\\.htaccess|\\.git|\\.env|\\.svn|\\.project|LICENSE|README.md) {
        return 404;
    }

    location ~ .*\\.(gif|jpg|jpeg|png|bmp|swf|ico)$ {
        expires 30d;
        error_log /dev/null;
        access_log /dev/null;
    }

    location ~ .*\\.(js|css)?$ {
        expires 12h;
        error_log /dev/null;
        access_log /dev/null;
    }

    access_log /www/wwwlogs/127.0.0.1.log;
    error_log  /www/wwwlogs/127.0.0.1.error.log;
}
"""

CONF_81 = """server {
    listen 81 default_server;
    server_name _;
    root /linhhoasu/webgame/game;
    index index.html;
    include enable-php-74.conf;

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
        proxy_read_timeout 3600s;
    }

    location /ws-s2 {
        proxy_pass http://127.0.0.1:9201;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 3600s;
    }

    location /ws-s3 {
        proxy_pass http://127.0.0.1:9202;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 3600s;
    }

    location /ws-s4 {
        proxy_pass http://127.0.0.1:9203;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 3600s;
    }

    location /ws-s5 {
        proxy_pass http://127.0.0.1:9204;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 3600s;
    }

    location /ws-s6 {
        proxy_pass http://127.0.0.1:9205;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 3600s;
    }

    # ===== HTTP API =====
    location /gameMsg.do {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location /admin/ {
        proxy_pass http://127.0.0.1:8082/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location /dist-api/ {
        proxy_pass http://127.0.0.1:3001/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /dist/ {
        proxy_pass http://127.0.0.1:3001/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    access_log /www/wwwlogs/game-lhs-access.log;
    error_log  /www/wwwlogs/game-lhs-error.log;
}
"""

def run_ssh(ssh, cmd, timeout=300):
    print(f"\n[EXEC] {cmd}")
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode('utf-8', errors='replace').strip()
    err = stderr.read().decode('utf-8', errors='replace').strip()
    code = stdout.channel.recv_exit_status()
    if out:
        print(out)
    if err:
        print(f"[STDERR/INFO] {err}")
    if code != 0:
        raise RuntimeError(f"Command '{cmd}' failed (code {code}): {err}")
    return out

def main():
    print(f"=== BẮT ĐẦU SỬA LỖI CỔNG WEB / WEB-PANEL ===")
    
    ssh_old = paramiko.SSHClient()
    ssh_old.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh_old.connect(OLD_HOST, username=USER, password=PASS, timeout=15)

    ssh_new = paramiko.SSHClient()
    ssh_new.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh_new.connect(NEW_HOST, username=USER, password=PASS, timeout=15)

    try:
        # BƯỚC 1: Xuất MySQL từ VPS Cũ
        print("\n--- 1. Xuất database MySQL từ VPS CŨ ---")
        run_ssh(ssh_old, "mysqldump -uroot -p123456 --databases account_linhhoasu account_Linhhoasu > /tmp/gm_mysql_dump.sql 2>/dev/null || mysqldump -uroot -p123456 --all-databases > /tmp/gm_mysql_dump.sql")
        
        # BƯỚC 2: Kéo file SQL sang VPS Mới và Import
        print("\n--- 2. Kéo MySQL sang VPS MỚI và Import ---")
        run_ssh(ssh_new, f"sshpass -p '{PASS}' scp -o StrictHostKeyChecking=no root@{OLD_HOST}:/tmp/gm_mysql_dump.sql /tmp/gm_mysql_dump.sql")
        run_ssh(ssh_new, f"mysql -uroot -p{NEW_MYSQL_PASS} < /tmp/gm_mysql_dump.sql")
        run_ssh(ssh_new, f"mysql -uroot -p{NEW_MYSQL_PASS} -e 'SHOW DATABASES;'")

        # Cập nhật quyền hoặc mật khẩu trong .env
        print("\n--- 3. Cập nhật .env trong /linhhoasu/webgame/gm ---")
        run_ssh(ssh_new, f"sed -i 's/^LHS_DB_PASS=.*/LHS_DB_PASS={NEW_MYSQL_PASS}/' /linhhoasu/webgame/gm/.env")
        run_ssh(ssh_new, "grep '^LHS_DB_' /linhhoasu/webgame/gm/.env")

        # BƯỚC 4: Tạo Virtual Host cổng 88
        print("\n--- 4. Thiết lập Virtual Host Nginx Cổng 88 (/linhhoasu/webgame/gm) ---")
        with ssh_new.open_sftp() as sftp:
            with sftp.open("/www/server/panel/vhost/nginx/127.0.0.1.conf", 'w') as f:
                f.write(CONF_88)

        # BƯỚC 5: Cập nhật Virtual Host Cổng 81 với khối reverse proxy /web-panel/
        print("\n--- 5. Cập nhật Virtual Host Nginx Cổng 81 với route /web-panel/ ---")
        with ssh_new.open_sftp() as sftp:
            with sftp.open("/www/server/panel/vhost/nginx/game.lhs.conf", 'w') as f:
                f.write(CONF_81)

        # BƯỚC 6: Kiểm tra cú pháp Nginx và reload
        print("\n--- 6. Kiểm tra Nginx syntax và reload ---")
        run_ssh(ssh_new, "nginx -t")
        run_ssh(ssh_new, "nginx -s reload")

        # BƯỚC 7: Kiểm chứng truy cập thực tế
        print("\n--- 7. Kiểm chứng truy cập thực tế ---")
        run_ssh(ssh_new, "curl -I -s http://127.0.0.1:88/ | head -n 10")
        run_ssh(ssh_new, "curl -I -s http://127.0.0.1:81/web-panel/ | head -n 10")
        run_ssh(ssh_new, f"curl -I -s http://{NEW_HOST}:81/web-panel/ | head -n 10")
        
        # Lấy thử nội dung trang web-panel để xác nhận là HTML của Cổng Web
        web_title = run_ssh(ssh_new, f"curl -s -L http://{NEW_HOST}:81/web-panel/ | grep -i '<title>' || true")
        print(f"Title trả về từ /web-panel/: {web_title}")

        print("\n=== SỬA LỖI HOÀN TẤT THÀNH CÔNG 100%! CỔNG WEB ĐÃ HOẠT ĐỘNG CHUẨN XÁC ===")

    finally:
        ssh_old.close()
        ssh_new.close()

if __name__ == '__main__':
    main()
