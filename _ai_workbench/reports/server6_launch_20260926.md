# Tạo và đặt lịch mở S6 — 26/09/2026

- Đã tạo production `serverId=1006`, tên `S6`, page `MEGAME365`; Mongo giữ `running=true`, `status=1`, `isNew=true`, `openTime=1790424000000` = **19:00 ngày 26/09/2026, Asia/Bangkok**.
- Đã thêm runtime `lhs-s1006` (HTTP `8087`, WS `9205`, Mongo `lhs_s1006`, Redis prefix `s1006:`), tuyến `/ws-s6`, route S1–S5 → S6, và slot S6 trong WebGM. Bot S6 chạy launcher có time gate, đang chờ tới giờ mở.
- Backup production: `/linhhoasu/_ai_workbench/backups/server6_launch_20260926/`.
- Evidence: `_ai_workbench/temp/server6_launch_20260926/evidence.json` và `qa_output.json`.

## Kiểm chứng

- Readiness HTTP `8080/8083/8084/8085/8086/8087`: **6/6 = 200**, Mongo/Redis đều `true`; PM2 `lhs-s1001..lhs-s1006` và `lhs-real-bots-s6` online; `pm2 save` đã ghi dump.
- QA native/read-only `SERVER6_LAUNCH_QA`: **PASS** trên các cổng nội bộ và public `81`; danh sách trả URL `103.116.105.154:81/ws-s6`, state trước mở `4`; RPC/REST/WS đều trả `SERVER_NOT_OPEN` cùng `openTime`; không tạo account/player (`roles=0`, `players=0`, probe residue `0/0`).
- Boundary `OPEN-1` bị khóa, đúng `OPEN` được mở trong unit test; `nginx -t` **PASS**.

## Ghi chú

- Lần chạy đầu bị client timeout sau khi đã áp dụng candidate và restart route; metadata vẫn giữ khóa (`running=false/status=0`) cho tới khi bước finalize CAS publish hoàn tất. Không có player/account S6 phát sinh.
- Không restart toàn bộ hệ thống; chỉ khởi động S6, bot S6 và restart rolling S1–S5 để thêm route S6.
