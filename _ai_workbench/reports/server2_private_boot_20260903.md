# Session Report — Dựng nền Server 2 private canary

## 1. Tóm tắt công việc

- Đã tạo database `lhs_s1002` và seed duy nhất cấu hình S2 (`serverId=1002`, `running=false`, `status=0`).
- Đã bật riêng process `lhs-s1002` để kiểm tra boot/health, chưa public server list, chưa thêm Nginx route và chưa cho client vào.
- S2 dùng WS `127.0.0.1:9201`, HTTP `127.0.0.1:8083`, `AGENT_HTTP_PORT=0`; bot S2 chưa bật.
- Đã thêm bind loopback cho HTTP node phụ; S1 vẫn giữ bind và process hiện tại.
- Chưa tạo account/player S2, chưa copy dữ liệu S1, chưa phát quà hay giao dịch.

## 2. File/thư mục đã thay đổi

### Production

- `/linhhoasu/lhs/newServer/ecosystem.config.js`: bật block `lhs-s1002` private, WS 9201, HTTP 8083, agent tắt, WS path dự kiến `/ws-s2`.
- `/linhhoasu/lhs/newServer/src/net/HTTPServer.js`: hỗ trợ host bind theo node.
- `/linhhoasu/lhs/newServer/src/app.js`: node `SERVER_ID=1002` bind HTTP loopback.
- MongoDB: tạo DB `lhs_s1002` và một bản ghi `gameservers` S2 với `running=false`, `status=0`.

### Tool/evidence

- `_ai_workbench/tools/seed_server2_private.js`: seed idempotent cấu hình S2.
- `_ai_workbench/tools/audit_server2_remote.sh`: audit PM2/port/DB/Nginx read-only.
- `_ai_workbench/temp/server2_private_boot_20260903/evidence.json`.
- Backup: `/linhhoasu/_ai_workbench/backups/server2_private_boot_pre_20260903/`.

## 3. Lỗi đã gặp & giải pháp

| Lỗi/rủi ro | Nguyên nhân | Cách xử lý |
|---|---|---|
| HTTP S2 ban đầu bind `0.0.0.0:8083` | HTTPServer hard-code host 0.0.0.0 | Thêm host bind và ép `SERVER_ID=1002` về `127.0.0.1` |
| DB S2 rỗng có thể seed nhầm 12 server | `initializeDefaults()` seed toàn bộ khi collection trống | Seed trước đúng một row S2, để app bỏ qua default seed |
| S2 có thể bị hiểu là đã mở | Process online không đồng nghĩa public | Giữ `running=false`, không Nginx route, kiểm tra TCP ngoài VPS thất bại |

## 4. Kết quả kiểm tra

- `lhs-s1002`: online, restart count 3 sau các lần nạp cấu hình private; không có crash loop.
- WS: `127.0.0.1:9201`.
- HTTP: `127.0.0.1:8083`.
- S2 `/ready`: HTTP 200, Mongo/Redis healthy.
- S1 `/ready`: HTTP 200.
- Từ máy ngoài VPS: TCP `8083=false`, `9201=false`.
- Nginx chưa có `/ws-s2`; `/ws` S1 giữ nguyên.
- DB S2: 0 account, 0 player; chỉ một cấu hình server S2 `running=false/status=0`.
- `lhs-s1001`, `lhs-real-bots`, `lhs-dist`, `lhs-admin` không bị restart trong bước dựng S2.

## 5. Trạng thái hiện tại

**S2 đã được dựng nền và đang chạy private canary. Người chơi chưa thể thấy hoặc vào S2.**

Không được coi process online là đã mở server.

## 6. Gate mở lúc 17:00 ngày 04/09/2026

Lịch mới: `openTime=1788516000000`, tương ứng 17:00 ngày 04/09/2026 theo múi giờ Asia/Bangkok (UTC+7). Trước khi mở public cần hoàn thành: identity/auth dùng chung; route server list trả endpoint S2 riêng; Nginx `/ws-s2`; WebGM/admin theo server; native login → tạo nhân vật → vào thành chính; relog/restart; mail/Webshop/Donate/Giftcode; soak 30–60 phút. Chỉ sau đó mới đặt `running=true`, `status=1`.

## 7. Rollback

1. Đặt `running=false` (đang là false).
2. Dừng riêng `lhs-s1002`.
3. Gỡ route `/ws-s2` nếu đã thêm.
4. Khôi phục source/config từ backup; giữ DB S2 để không mất dữ liệu.

## 8. Evidence

- `_ai_workbench/temp/server2_private_boot_20260903/evidence.json`.
