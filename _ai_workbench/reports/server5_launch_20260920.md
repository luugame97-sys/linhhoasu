# Mở máy chủ S5 — 20/09/2026

- Đã tạo production `serverId=1005`, tên `S5`, page `MEGAME365`; bản ghi Mongo giữ `running=true`, `status=1`, `isNew=true`, `openTime=1789873200000` = **10:00 Asia/Bangkok ngày 20/09/2026**.
- Đã thêm runtime `lhs-s1005` (HTTP `8086`, WS `9204`, Mongo `lhs_s1005`, Redis prefix `s1005:`), tuyến `/ws-s5`, route liên máy chủ S1–S4 → S5, và slot S5 trong WebGM. Bot S5 chạy launcher có time gate, đang chờ tới giờ mở.
- Backup production: `/linhhoasu/_ai_workbench/backups/server5_launch_20260920`; evidence: `_ai_workbench/temp/server5_launch_20260920/evidence.json`.

## Kiểm chứng

- Readiness HTTP `8080/8083/8084/8085/8086`: tất cả `200`, Mongo/Redis `true`; PM2 `lhs-s1001..lhs-s1005` và `lhs-real-bots-s5` đều `online`; `pm2 save` đã ghi dump.
- QA native/read-only: `SERVER5_LAUNCH_QA` **PASS** trên các cổng nội bộ và public `81`; danh sách trả URL `103.116.105.154:81/ws-s5`, state trước mở `4`; RPC/REST/WS đều trả `SERVER_NOT_OPEN` cùng `openTime`; không tạo account/player (`0/0`).
- Boundary logic `OPEN-1` bị khóa, đúng `OPEN` được mở; launcher gate unit test **PASS**; `nginx -t` **PASS**.
- Trong lần triển khai đầu, probe readiness chạy trước khi HTTP listener S5 hoàn tất; retry có giới hạn sau đó đạt `200`, không có thay đổi dữ liệu ngoài phạm vi.

## Còn lại

- Chưa đến 10:00 nên chưa thực hiện đăng nhập người thật sau mở; time gate sẽ tự mở, không cần cron hay restart.
