# Thông báo chạy ngang native trong game (01/09/2026)

## 1. Kết quả

- Đã triển khai tính năng vào WebGM production tại `http://103.116.105.154:88`.
- Thông báo đi qua UI native của game, không dùng HTML overlay bên ngoài.
- Client hiện có sẵn đường xử lý: server `msgType=16` → client chat type `19` → `MarqueeModel.addMarquee()`.
- Đã chốt TextFlow hotfix: màu/cỡ/viền dùng cú pháp native `|C:...&S:...&R:...&K:...&T:...`, đúng với `TextFlowMaker` của bundle hiện tại.
- Đã phát hiện một số lần thử live qua WebGM trong log: client cũ xử lý `msgType=16` như QiXi và `JSON.parse()` nội dung TextFlow, gây `Unexpected token '|'` khi khởi tạo chat.
- Đã chặn route khẩn cấp với mã `MARQUEE_CLIENT_PATCH_REQUIRED`, restart `lhs-s1001` để xóa lịch sử packet lỗi trong bộ nhớ và xác nhận client sạch không còn lỗi này.
- Tính năng gửi marquee đang **tạm khóa an toàn**; không dùng nút gửi cho tới khi client decoder được patch đúng contract.

## 2. Chức năng WebGM

Tab mới: **Thông báo chạy ngang**.

- Nội dung tối đa 200 ký tự.
- Xem trước trước khi gửi và hộp thoại xác nhận riêng.
- Màu chữ và màu viền.
- Cỡ chữ 18–40.
- Font nằm trong allowlist native: mặc định, sans-serif, serif, monospace, Arial, Verdana, Tahoma, Times New Roman.
- Đậm, nghiêng, gạch chân.
- Viền chữ 0–4.
- Phát 1–5 lần; nếu nhiều lần, khoảng cách 10–300 giây.
- Chỉ gửi tới kết nối game đang online tại thời điểm phát; người offline không nhận lại thông báo này.

## 3. Bảo vệ và giới hạn

- WebGM yêu cầu session admin + CSRF như các thao tác khác.
- WebGM giới hạn 5 lần gửi/60 giây.
- Game internal API yêu cầu API key + HMAC-SHA256 + timestamp + nonce chống replay.
- Event key được tạo cho mỗi lần gửi, chống retry trùng trong 5 phút.
- Nội dung được loại control character, đổi `|` thành ký tự an toàn và escape markup; không cho chèn HTML tùy ý.
- Màu, font, cỡ, viền đều được canonical hóa/giới hạn ở backend; không tin dữ liệu frontend.
- Restart dịch vụ sẽ hủy các lượt phát đang chờ; tính năng phát lại sau restart chưa được bật.

## 4. File production đã thay đổi

### Game

- `/linhhoasu/lhs/newServer/src/handlers/chat.js`
- `/linhhoasu/lhs/newServer/src/net/HTTPServer.js`
- `/linhhoasu/lhs/newServer/src/net/WSServer.js`

### WebGM

- `/linhhoasu/webgame/gm/config.php`
- `/linhhoasu/webgame/gm/admin/admin_api.php`
- `/linhhoasu/webgame/gm/admin/index.php`
- `/linhhoasu/webgame/gm/assets/js/admin.js`

## 5. Kiểm thử

| Kiểm tra | Kết quả |
|---|---|
| Contract native marquee local | PASS, 22 checks |
| Node syntax game handlers | PASS |
| Node syntax WebGM JS | PASS |
| PHP lint trên VPS | PASS cho `config.php`, `admin_api.php`, `index.php` |
| Hash candidate/live 7 file | 7/7 khớp |
| `lhs-s1001` | online, PID `19964` |
| Game readiness/WebSocket | `ready=200`, `ws=200` |
| WebGM admin/JS | `302` / `200` |
| Route không có auth | `401 UNAUTHORIZED` |
| Route có HMAC nhưng text rỗng | `400 MARQUEE_TEXT_REQUIRED` — không phát thông báo |
| Route sau safety gate | `503 MARQUEE_CLIENT_PATCH_REQUIRED` — không phát packet |
| Process restart | Chỉ `lhs-s1001`; `lhs-dist`, `lhs-admin`, `lhs-real-bots` không restart |

Evidence hậu kiểm: `_ai_workbench/temp/marquee_broadcast_prod_verify_20260901.json` và `_ai_workbench/temp/marquee_broadcast_route_test_20260901.json`.

## 6. Backup và rollback

- Backup remote ban đầu: `/linhhoasu/_ai_workbench/backups/marquee_broadcast_pre_20260901_153303/`.
- Backup TextFlow hotfix: `/linhhoasu/_ai_workbench/backups/marquee_textflow_pre_20260901_154901/`.
- Backup emergency safety gate: `/linhhoasu/_ai_workbench/backups/marquee_route_disabled_pre_20260901_161055/`.
- Stage remote: `/linhhoasu/_ai_workbench/temp/marquee_broadcast_20260901_153303/`.
- Tool deploy có hash precondition, staging syntax check và rollback file + restart nếu bước triển khai thất bại.

## 7. Cách sử dụng

1. Đăng nhập WebGM `:88` bằng tài khoản admin.
2. Mở tab **Thông báo chạy ngang**.
3. Nhập nội dung, chọn màu/cỡ/kiểu chữ và số lần chạy.
4. Bấm **Xem trước** để kiểm tra bố cục.
5. Bấm **Gửi vào game**, đọc lại hộp thoại rồi xác nhận.

Chưa gửi thử live sau safety gate. Chỉ mở lại gửi sau khi đã patch client `parseQiXiMsg`/decoder và QA packet trên client sạch.
