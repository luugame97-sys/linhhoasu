# Hướng dẫn đổi đường dẫn và port Admin Linh Họa Sư

Tài liệu này áp dụng cho stack đang dùng:

- Admin Node: `/linhhoasu/lhs/LHS-admin/server.js`
- Script khởi động: `/linhhoasu/start.sh`
- Nginx vhost: `/www/server/panel/vhost/nginx/game.lhs.conf`
- Đường dẫn public mẫu: `/gmhoalinhsu/`
- Port admin nội bộ mẫu: `9097`

## 1. Mô hình hoạt động

```text
http://IP:81/gmhoalinhsu/
        |
        +--> Nginx location /gmhoalinhsu/
                |
                +--> http://127.0.0.1:9097/
                        |
                        +--> lhs-admin (Node)
```

Đường dẫn public và port nội bộ là hai cấu hình khác nhau. Đổi `proxy_pass` mà không đổi port Node sẽ trả `502 Bad Gateway`.

## 2. Backup trước khi đổi

```bash
stamp=$(date +%Y%m%d_%H%M%S)
backup=/linhhoasu/_ai_workbench/backups/admin_path_port_$stamp
mkdir -p "$backup"
cp -a /linhhoasu/start.sh "$backup/start.sh"
cp -a /www/server/panel/vhost/nginx/game.lhs.conf "$backup/game.lhs.conf"
```

## 3. Đổi port Admin

Trong `/linhhoasu/start.sh`, đặt port mong muốn, ví dụ `9097`:

```bash
LHS_ADMIN_PORT=9097 \
GAME_ADMIN_ORIGIN='http://127.0.0.1:8080' \
DIST_ADMIN_ORIGIN='http://127.0.0.1:3001' \
pm2 start server.js --name lhs-admin
```

Nếu Admin đã tồn tại trong PM2, `pm2 restart --update-env` có thể giữ environment cũ. Khi đó tạo lại riêng entry Admin:

```bash
pm2 delete lhs-admin
cd /linhhoasu/lhs/LHS-admin
LHS_ADMIN_PORT=9097 \
GAME_ADMIN_ORIGIN='http://127.0.0.1:8080' \
DIST_ADMIN_ORIGIN='http://127.0.0.1:3001' \
pm2 start server.js --name lhs-admin
pm2 save
```

Không cần restart `lhs-s1001`, `lhs-dist`, MongoDB, Redis hoặc Nginx ở bước này.

## 4. Đổi đường dẫn public Nginx

Ví dụ đường dẫn public là `/gmhoalinhsu/` và port Node là `9097`:

```nginx
location /gmhoalinhsu/ {
    proxy_pass http://127.0.0.1:9097/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

Dấu `/` cuối `proxy_pass` là chủ ý: Nginx bỏ tiền tố `/gmhoalinhsu/` trước khi gửi request vào Admin ở `/`.

Kiểm tra và reload:

```bash
/www/server/nginx/sbin/nginx -t
/www/server/nginx/sbin/nginx -s reload
```

## 5. Kiểm tra sau khi đổi

```bash
pm2 status
ss -lntp | grep -E ':9097|:8082'
curl -I http://127.0.0.1:9097/
curl -I http://IP:81/gmhoalinhsu/
```

Kết quả đúng:

- `lhs-admin` là `online`.
- Có listener `127.0.0.1:9097` hoặc `[::]:9097`.
- Port cũ `8082` không còn listener nếu đã chuyển hoàn toàn.
- URL public trả `HTTP 200`, không phải `502`.

## 6. Rollback

```bash
pm2 delete lhs-admin
cd /linhhoasu/lhs/LHS-admin
LHS_ADMIN_PORT=8082 \
GAME_ADMIN_ORIGIN='http://127.0.0.1:8080' \
DIST_ADMIN_ORIGIN='http://127.0.0.1:3001' \
pm2 start server.js --name lhs-admin
pm2 save
```

Khôi phục vhost từ backup, chạy lại `nginx -t` rồi `nginx -s reload`.

## 7. Lỗi thường gặp

| Triệu chứng | Nguyên nhân | Cách xử lý |
|---|---|---|
| `502 Bad Gateway` | Nginx trỏ port không có listener | So khớp `proxy_pass` với `ss -lntp` |
| Đã sửa `start.sh` nhưng vẫn chạy port cũ | PM2 giữ environment của process cũ | `pm2 delete lhs-admin` rồi `pm2 start` với `LHS_ADMIN_PORT` mới |
| Admin mở nhưng asset/API lỗi | Dùng sai dấu `/` cuối `proxy_pass` hoặc route không strip prefix | Giữ `proxy_pass ...:PORT/;` như mẫu |
| Nginx reload lỗi | Cấu hình syntax sai | Chỉ reload sau khi `nginx -t` báo successful |

## 8. Cấu hình hiện tại đã nghiệm thu

- Public path: `/gmhoalinhsu/`
- Admin internal port: `9097`
- `lhs-admin`: online
- Local admin: HTTP 200
- Public admin: HTTP 200
- Backup remote: `/linhhoasu/_ai_workbench/backups/admin_path_port_20260829_1710/`
