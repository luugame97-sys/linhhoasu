# Hoàn tác toàn bộ tính năng thông báo chạy ngang (01/09/2026)

## 1. Kết luận

- Đã xác minh lỗi vào game phát sinh trực tiếp từ packet marquee vừa triển khai.
- Nguyên nhân: server gửi TextFlow `|C:...` bằng `msgType=16`; client hiện tại coi `msgType=16` là gói QiXi và chạy `JSON.parse()`, gây `Unexpected token '|'` khi khởi tạo chat.
- Theo yêu cầu, đã gỡ toàn bộ tính năng marquee khỏi game server và WebGM, khôi phục đúng snapshot/hash trước triển khai.

## 2. File đã hoàn tác

### Game

- `/linhhoasu/lhs/newServer/src/handlers/chat.js`
- `/linhhoasu/lhs/newServer/src/net/HTTPServer.js`
- `/linhhoasu/lhs/newServer/src/net/WSServer.js`

### WebGM

- `/linhhoasu/webgame/gm/config.php`
- `/linhhoasu/webgame/gm/admin/admin_api.php`
- `/linhhoasu/webgame/gm/admin/index.php`
- `/linhhoasu/webgame/gm/assets/js/admin.js`

Kết quả: 7/7 file khớp SHA-256 snapshot trước marquee. Không còn marker `broadcast/marquee`, `MARQUEE_`, `buildMarqueeMarkup`, `_marqueeTimers`, tab WebGM hoặc JavaScript gửi marquee.

## 3. Hậu kiểm

| Kiểm tra | Kết quả |
|---|---|
| SHA-256 snapshot trước/sau rollback | 7/7 khớp |
| Node syntax game source | PASS |
| PHP lint WebGM trước swap | PASS |
| Marker marquee còn lại | Không có |
| Endpoint marquee | Không còn route; request không auth dừng ở middleware `401` |
| `lhs-s1001` | online, PID `32283` |
| Game/WS | `ready=200`, `ws=200` |
| WebGM | HTTP `302` đúng luồng đăng nhập |
| Browser sạch | Không còn `Unexpected token '|'`; chỉ còn cảnh báo autoplay thông thường |
| Process restart | Chỉ `lhs-s1001`; process khác giữ nguyên PID |

## 4. Backup

- Snapshot gốc dùng rollback: `/linhhoasu/_ai_workbench/backups/marquee_broadcast_pre_20260901_153303/`.
- Snapshot trạng thái ngay trước rollback: `/linhhoasu/_ai_workbench/backups/marquee_rollback_before_20260901_161918/`.

## 5. Trạng thái cuối

- Tính năng thông báo chạy ngang đã bị gỡ hoàn toàn, không còn xuất hiện trong WebGM.
- Các fix khác như đăng nhập account không phân biệt hoa/thường được giữ nguyên vì snapshot marquee được tạo sau các fix đó.
- Không thay đổi database, vật phẩm, tài khoản hoặc nhân vật.
- Người chơi đang giữ tab lỗi cần đóng tab cũ rồi mở lại hoặc `Ctrl+F5` để tạo phiên client sạch.

Evidence: `_ai_workbench/temp/marquee_rollback_prod_verify_20260901.json`.
