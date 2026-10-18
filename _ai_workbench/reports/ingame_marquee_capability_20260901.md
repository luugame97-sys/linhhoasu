# Khả năng tạo thông báo chạy ngang trong game (01/09/2026)

## 1. Kết luận

**Có thể làm bằng UI native của game.** Client đã có sẵn:

- `MarqueeWin`, `MarqueeCell`, `MarqueeLine`.
- `MarqueeModel.addMarquee()` và hàng đợi `marqueeData`.
- Một dòng chạy từ phải sang trái, tốc độ cấu hình `90`, vị trí bắt đầu Y khoảng `130`.
- Tự ẩn trong một số màn hình đặt `BLOCK_MARQUEE`, đúng hành vi native.

## 2. Luồng protocol hiện có

1. Server có `WSServer.broadcast(tag, data)` để gửi tới toàn bộ người chơi online.
2. `chat.pushWorldChat()` đã broadcast tag `1601`.
3. Client `ChatModel` đăng ký `regNetMsg(1601, doWorldChatAdd)`.
4. Nếu payload là system notice có `MessageConfig.notice=1`, client gọi `MarqueeModel.addMarquee()` và mở `MarqueeWin`.

## 3. Khoảng trống hiện tại

- Server đã có `pushSystemBroadcast(content)`, nhưng hiện tạo entry với `msgType=14`.
- Client xử lý `msgType > 0` bằng `parseSpecialMsg`, nên payload này chủ yếu đi vào chat và không đặt `isNotice=1` để chạy marquee.
- 69 template `MessageConfig` có marquee đều là câu cố định theo tính năng; chưa có template chung chỉ chứa `{0}` để admin nhập nội dung tùy ý.

Vì vậy: **khung chạy ngang đã có, nhưng chưa có contract admin tùy ý hoàn chỉnh.**

### Ghi chú contract đã xác minh lại

- `MsgTypeToChatShowType[16] = 19` trên client; chat type `19` là nhánh gọi `MarqueeModel.addMarquee()` trực tiếp.
- Không dùng server `msgType=19` cho tính năng mới vì client map giá trị đó thành chat type `22`, không phải marquee.
- Contract triển khai đúng là server gửi `msgType=16` với `content` là TextFlow markup đã whitelist (`<font color=... size=...>`).

## 4. Phương án chuẩn

Giữ nguyên UI native và bổ sung contract server-authoritative:

1. Tạo một `MessageConfig` riêng cho thông báo quản trị, ví dụ nội dung `{0}`, `notice=1`, `worldShow=1`, không có link.
2. Đồng bộ row này vào config client và config server cùng hash/version.
3. Thêm internal HMAC API, ví dụ `/api/internal/broadcast/marquee`:
   - Chỉ admin/WebGM gọi được.
   - Plain text, giới hạn 200 ký tự.
   - Số lần lặp 1–5, khoảng cách tối thiểu, rate-limit.
   - Ghi audit người gửi, nội dung, thời gian, số người nhận.
4. Server broadcast tag `1601` với system notice `msgType=0`, `noticeId` riêng và `params=[nội dung]`.
5. Tích hợp form WebGM: nội dung, số lượt, khoảng cách, xem trước, xác nhận.

## 5. Acceptance nên có

- Thông báo chạy ngang native trên client đang online.
- Không hiện thành JSON hoặc lỗi format trong chat.
- Không chạy trùng khi retry API.
- Nội dung HTML bị escape/sanitize, không nhận link tùy ý.
- Rate-limit chống spam.
- Người offline không nhận thông báo tức thời; nếu cần thông báo khi đăng nhập phải thêm lịch phát/persistence riêng.
- Không ảnh hưởng popup khóa, gameplay, map hoặc bot.

## 6. Trạng thái

- Phiên này chỉ audit source/config; chưa phát thông báo test, chưa sửa client/server/WebGM và chưa restart.
- File liên quan:
  - `linhhoasu/webgame/game/js/main.min_a6195824.js`
  - `linhhoasu/lhs/newServer/src/net/WSServer.js`
  - `linhhoasu/lhs/newServer/src/handlers/chat.js`
  - `linhhoasu/lhs/newServer/src/services/MessageService.js`
