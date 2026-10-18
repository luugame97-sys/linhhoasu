# Session Report — Dời lịch mở Server 2

## 1. Tóm tắt công việc

- Đã dời `openTime` của S2 (`serverId=1002`) sang **17:00 ngày 04/09/2026, Asia/Bangkok (UTC+7)**.
- Timestamp lưu trong MongoDB: `1788516000000`, tương ứng `2026-09-04T10:00:00Z`.
- Giữ nguyên trạng thái private: `running=false`, `status=0`; chưa public server list, chưa thêm route và chưa cho người chơi vào S2.
- Không restart bất kỳ process nào và không thay đổi S1.

## 2. File/thư mục đã thay đổi

- Production MongoDB `lhs_s1002.gameservers`: chỉ đổi trường `openTime` của bản ghi `serverId=1002`.
- Tool triển khai: `_ai_workbench/tools/deploy_server2_open_time_20260904.py`.
- Tool cập nhật DB có guard: `_ai_workbench/tools/set_server2_open_time_20260904.js`.
- Tool audit backup: `_ai_workbench/tools/audit_server2_schedule_backups.py`.
- Seed private local đã đồng bộ timestamp mới: `_ai_workbench/tools/seed_server2_private.js`.
- Evidence: `_ai_workbench/temp/server2_schedule_20260904_20260903_163915.json`.

## 3. Lỗi đã gặp & giải pháp

| Lỗi | Nguyên nhân | Cách xử lý | Cách tránh lặp lại |
|---|---|---|---|
| Verifier báo `SERVER2_SCHEDULE_VERIFY_FAILED` dù DB đã ghi đúng | Biểu thức Python `status or -1` coi số `0` là falsy | Sửa verifier phân biệt rõ `None` và `0`, sau đó audit/readback lại | Với enum hợp lệ có giá trị `0`, không dùng toán tử fallback theo truthiness |
| Nguy cơ public S2 trước khi đủ điều kiện | `openTime` chỉ là metadata; release S2 vẫn cần identity/routing/native E2E/WebGM | Giữ `running=false/status=0`; chỉ dời lịch, không bật public | Release theo gate và thao tác bật public riêng vào đúng thời điểm |

## 4. Kỹ năng / kinh nghiệm mới

- Thay đổi lịch phải dùng compare-and-set trên đúng `_id`, `serverId`, `running`, `status` và `openTime` cũ để tránh ghi đè cập nhật đồng thời.
- Backup rollback cần được tạo bằng chế độ độc quyền trước mutation và giữ quyền `600`.
- `openTime` không tự thay thế gate release; trạng thái private phải được xác minh độc lập.

## 5. Trạng thái hiện tại

- S2 hiện có `openTime=1788516000000`, `running=false`, `status=0`.
- Backup trước lần ghi đầu: `/linhhoasu/_ai_workbench/backups/server2_schedule_pre_20260903_163836/server_config_before.json`; bản này giữ lịch cũ `1788084000000` và trạng thái private.
- Readback lần cuối: PASS.
- S1 `/ready`: HTTP 200; S2 `/ready`: HTTP 200; MongoDB/Redis healthy.
- PID, trạng thái và restart counter của `lhs-s1001`, `lhs-s1002`, `lhs-real-bots`, `lhs-dist`, `lhs-admin` không đổi.
- Không dịch vụ nào được restart.
- SHA-256 evidence: `ccabcf246ec7aed0af1470ea8d8d6efdaa9ff807ea135a074d0cdeeb87d1ca25`.

## 6. Bước tiếp theo

1. Trước 17:00 ngày 04/09/2026, hoàn tất identity/auth dùng chung, route `/ws-s2`, WebGM theo server, native E2E, relog/restart và soak.
2. Chỉ khi toàn bộ gate PASS mới bật S2 public bằng thao tác release riêng.
3. Nếu gate chưa đạt, tiếp tục giữ `running=false/status=0`; không mở chỉ vì đã tới `openTime`.
