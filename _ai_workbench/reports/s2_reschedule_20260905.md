# Session Report — Dời S2 sang 17:00 ngày 05/09/2026

## 1. Tóm tắt công việc

- Theo yêu cầu mới, dời S2 từ 17:00 ngày 04/09 sang **17:00 ngày 05/09/2026, UTC+7**.
- Timestamp mới `1788602400000` (UTC `2026-09-05T10:00:00Z`).
- Giữ S2 public trong danh sách, khóa đăng nhập trước giờ mới và tự cho phép vào đúng giờ, không cần thao tác mở lại.

## 2. File/thư mục đã thay đổi

- Production: chỉ sửa `openTime` của `serverId=1002` trong `lhs_s1001.gameservers` (nguồn identity đang được dùng) và đồng bộ timestamp của bản legacy trong `lhs_s1002.gameservers`.
- Các cờ public/status và mọi trường khác giữ nguyên. Không sửa gameplay source, bot, Nginx, WebGM hay dữ liệu Player.
- Tool hỗ trợ: `_ai_workbench/tools/reschedule_s2_20260905.js`, `_ai_workbench/tools/run_reschedule_s2_20260905.py`.
- Evidence: `_ai_workbench/temp/s2_reschedule_apply_20260904_040757.json`.

## 3. Lỗi đã gặp & giải pháp

| Rủi ro | Nguyên nhân | Cách xử lý | Cách tránh lặp lại |
|---|---|---|---|
| Đổi DB S2 nhưng lịch public vẫn cũ | S2 dùng identity DB lhs_s1001 | Xác minh PM2 identityDb rồi cập nhật bản ghi authoritative | Không tái sử dụng tool private-canary cũ cho lịch public |
| Ghi đè thay đổi đồng thời | Admin có thể cập nhật cấu hình | Compare-and-set theo ID, lịch và trạng thái cũ; có backup trước mutation | Readback toàn bản ghi, chỉ cho phép khác openTime |

## 4. Kỹ năng / kinh nghiệm mới

- Lịch nằm trong database được đọc trên mỗi lần kiểm tra; không cần cron hoặc restart.
- Test ranh giới bằng thời gian truyền vào hàm gate, không đổi đồng hồ VPS hay mở sớm server.
- Các báo cáo/tool triển khai ngày 04/09 là lịch sử; lịch mới trong báo cáo này thay thế mốc cũ. Không chạy lại các script triển khai lịch cũ.

## 5. Trạng thái hiện tại

- Readback hai bản ghi S2: openTime đúng `1788602400000`; bản ghi identity giữ `running=true/status=1`.
- S1 toàn bản ghi không đổi. Toàn bộ process LHS giữ nguyên PID/status/restart counter.
- Live trên 8080 và 8083: S2 hiển thị state=4 và giờ mới; native HTTP auth bị SERVER_NOT_OPEN; REST login HTTP 403 với cùng giờ mới; /ready HTTP 200.
- WebSocket qua Nginx /ws-s2 bị SERVER_NOT_OPEN với cùng giờ mới.
- Production gate test: mốc cũ 04/09 17:00 bị khóa; trước giờ mới 1 ms bị khóa; đúng giờ mới 05/09 17:00 cho phép.
- Backup production trước ghi: `/linhhoasu/_ai_workbench/backups/s2_reschedule_20260904_040757/before.json` (quyền 600).
- Không cần restart hoặc thay đổi cấu hình bot.

## 6. Bước tiếp theo

1. Chủ server không cần thao tác gì để mở lúc 17:00 ngày 05/09/2026.
2. Người chơi đang giữ danh sách cũ nên tải lại để thấy lịch mới.
3. Sau giờ mới, kiểm tra login/tạo role/relog thực tế; không dùng mốc cũ 04/09 trong thông báo khai mở.
