# Bot phase 1 runbook

## Mục tiêu

Bot ảo server-side chỉ tạo cảm giác đông trong map thường. Không tạo account, session, dữ liệu Mongo/Redis hoặc online count giả.

## Cấu hình canary

Đặt trong môi trường của process game, chỉ bật sau khi đã backup và có cửa sổ rollback:

```text
BOT_ENABLED=1
BOT_MAP_IDS=all
BOT_MAP_LINE=0
BOT_COUNT_PER_MAP=5
BOT_MAX_TOTAL=290
BOT_MOVE_INTERVAL_MS=10000
BOT_CHAT_ENABLED=1
BOT_CHAT_SCOPE=map
BOT_CHAT_INTERVAL_MIN_MS=240000
BOT_CHAT_INTERVAL_MAX_MS=600000
```

`BOT_ENABLED=0` là mặc định an toàn. `BOT_CHAT_SCOPE=world` sẽ phát chat toàn server; `map` chỉ phát cho người thật cùng map/line.

## Kiểm tra sau khi bật

1. Gọi `/health` và xác nhận `runtime.bots.enabled=true`, `botCount=290`, `mapIds` có 58 map type 1.
2. Đăng nhập một tài khoản thật, vào một map type 1 bất kỳ và đúng line; xác nhận 5 bot xuất hiện.
3. Chờ tối thiểu 15 giây; xác nhận bot nhận packet di chuyển, không có lỗi client.
4. Chờ 60–180 giây; xác nhận tối đa một bot phát chat, không spam.
5. Theo dõi CPU/RAM/event-loop/WS queue và log trong 20–30 phút.
6. Nếu có lỗi, đặt `BOT_ENABLED=0` trong ecosystem và restart riêng process game; không restart các dịch vụ khác.

## Phạm vi chưa bật

Bot không đánh quái, không làm nhiệm vụ, không nhận thưởng, không vào guild/rank/recharge và không được tính là người chơi thật.

## Pool tên nhân vật

- Danh sách runtime: `src/data/name.txt`.
- Thay file này rồi restart `lhs-s1001` để nạp lại pool; không cần sửa Mongo.
- Tên bot lấy tuần tự trong pool. Nhân vật mới chỉ dùng pool khi client gửi tên mặc định/rỗng; tên người chơi tự nhập được giữ nguyên.
- Service loại dòng bắt đầu bằng `#`, dòng trống, tên trùng và tên vượt quá 24 ký tự.
