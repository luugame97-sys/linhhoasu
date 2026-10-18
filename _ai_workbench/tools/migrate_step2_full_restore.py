import sys
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

import datetime
import paramiko
import time

NEW_HOST = '103.116.104.165'
USER = 'root'
PASS = 'anhduc11'

NGINX_CONF = """server {
    listen 81 default_server;
    server_name _;
    root /linhhoasu/webgame/game;
    index index.html;
    include enable-php-74.conf;

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

def run_ssh(ssh, cmd, timeout=600, check=True):
    print(f"\n[EXEC] {cmd}")
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode('utf-8', errors='replace').strip()
    err = stderr.read().decode('utf-8', errors='replace').strip()
    code = stdout.channel.recv_exit_status()
    if out:
        print(out)
    if err:
        print(f"[STDERR/INFO] {err}")
    if check and code != 0:
        raise RuntimeError(f"Command '{cmd}' failed (code {code}): {err}")
    return out

def main():
    print(f"=== BẮT ĐẦU MIGRATION GIAI ĐOẠN 2: KHÔI PHỤC DATABASE & KHỞI CHẠY VPS MỚI ===")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(NEW_HOST, username=USER, password=PASS, timeout=30)

    try:
        # BƯỚC 1: Giải nén mã nguồn game sạch
        print("\n--- BƯỚC 1: Giải nén mã nguồn Game sạch vào /linhhoasu ---")
        run_ssh(ssh, "tar -xzf /backup/migration/game_source_final_20260930_004700.tar.gz -C /linhhoasu")
        run_ssh(ssh, "chmod +x /linhhoasu/*.sh")
        run_ssh(ssh, "ls -la /linhhoasu")

        # BƯỚC 2: Giải nén gói Database
        print("\n--- BƯỚC 2: Giải nén gói sao lưu Database ---")
        run_ssh(ssh, "mkdir -p /backup/migration/db_extracted")
        run_ssh(ssh, "tar -xzf /backup/migration/db_final_20260930_004700.tar.gz -C /backup/migration/db_extracted")
        run_ssh(ssh, "ls -lh /backup/migration/db_extracted/db_final_20260930_004700")

        # BƯỚC 3: Khôi phục Redis
        print("\n--- BƯỚC 3: Khôi phục Redis snapshot ---")
        run_ssh(ssh, "redis-cli shutdown || /etc/init.d/redis stop || pkill -9 redis-server || true", check=False)
        time.sleep(2)
        run_ssh(ssh, "cp /backup/migration/db_extracted/db_final_20260930_004700/redis/dump.rdb /www/server/redis/dump.rdb")
        run_ssh(ssh, "chown redis:redis /www/server/redis/dump.rdb")
        run_ssh(ssh, "/etc/init.d/redis start")
        time.sleep(2)
        run_ssh(ssh, "redis-cli ping")
        run_ssh(ssh, "redis-cli dbsize")

        # BƯỚC 4: Khôi phục MongoDB
        print("\n--- BƯỚC 4: Khôi phục MongoDB với mongorestore ---")
        run_ssh(ssh, "mongorestore --drop /backup/migration/db_extracted/db_final_20260930_004700/mongodb")
        run_ssh(ssh, "mongosh --eval 'db.adminCommand({listDatabases: 1})'")

        # BƯỚC 5: Cấu hình Nginx Vhost cổng 81
        print("\n--- BƯỚC 5: Thiết lập cấu hình Nginx Vhost cổng 81 ---")
        vhost_path = "/www/server/panel/vhost/nginx/game.lhs.conf"
        with ssh.open_sftp() as sftp:
            with sftp.open(vhost_path, 'w') as f:
                f.write(NGINX_CONF)
        run_ssh(ssh, "nginx -t")
        run_ssh(ssh, "nginx -s reload")

        # BƯỚC 6: Khởi chạy Game Server bằng PM2
        print("\n--- BƯỚC 6: Khởi chạy Game Server với PM2 ---")
        run_ssh(ssh, "cd /linhhoasu/lhs/newServer && pm2 start ecosystem.config.js")
        time.sleep(5)
        run_ssh(ssh, "cd /linhhoasu/lhs/LHS-dist && pm2 start src/app.js --name lhs-dist")
        time.sleep(5)
        run_ssh(ssh, "cd /linhhoasu/lhs/LHS-admin && LHS_ADMIN_PORT=9097 GAME_ADMIN_ORIGIN='http://127.0.0.1:8080' DIST_ADMIN_ORIGIN='http://127.0.0.1:3001' pm2 start server.js --name lhs-admin")
        time.sleep(5)
        run_ssh(ssh, "cd /linhhoasu/lhs/newServer && pm2 start scripts/manage-bot-fleet.js --name lhs-bot-fleet-supervisor -- --apply")
        run_ssh(ssh, "pm2 save")

        # BƯỚC 7: Kiểm tra tổng thể sau khởi chạy
        print("\n--- BƯỚC 7: Kiểm tra tổng thể toàn bộ dịch vụ ---")
        run_ssh(ssh, "pm2 list")
        run_ssh(ssh, "ss -tulpn | grep -E '(81|8080|9200|9201|9202|9203|9204|9205)'")
        run_ssh(ssh, "curl -I -s http://127.0.0.1:81/ | head -n 5")
        run_ssh(ssh, f"curl -I -s http://{NEW_HOST}:81/ | head -n 5")

        print(f"\n=== MIGRATION HOÀN TẤT THÀNH CÔNG 100%! GAME ĐANG HOẠT ĐỘNG TRÊN VPS MỚI ===")

    finally:
        ssh.close()

if __name__ == '__main__':
    main()
