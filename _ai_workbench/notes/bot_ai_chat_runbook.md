# Runbook hội thoại bot theo ngữ cảnh / AI

## Trạng thái production

- `BOT_AI_CHAT_ENABLED=1`: bộ điều phối hội thoại tập trung đang bật.
- Chế độ hiện tại: `local-fallback` vì VPS chưa có GPU/Ollama và chưa cấu hình nhà cung cấp AI.
- Chat ngẫu nhiên cũ của 580 bot thật được server ACK nhưng không phát ra; chat ngẫu nhiên của bot ảo cũng bị tắt khi coordinator hoạt động.
- Coordinator chọn speaker từ bot thật đang có session/Player; bot ảo chỉ là fallback. Tin được lưu vào history channel 0 và broadcast Thế giới cho mọi người chơi thật online ở mọi map.
- Bot chỉ bắt đầu chủ đề tự động khi có ít nhất một map có người thật. Bot không tự kích hoạt từ câu của bot khác nên không thể tạo vòng lặp vô hạn.
- Ambient toàn server có khóa tối thiểu 30 giây; trong mỗi chủ đề hai bot thật nói nối nhau.
- 40% chủ đề đủ điều kiện dùng lại kho 35 nhân vật/104 câu thoại cũ; phần còn lại dùng hội thoại tự nhiên mới.
- Bot thật được gán ổn định 24 profile avatar/hệ/phái/ngoại trang; bấm avatar chat mở đúng hồ sơ Player thật.

## Cách bật mô hình AI thật

1. Chọn một endpoint tương thích OpenAI Chat Completions. URL phải là endpoint đầy đủ, ví dụ `https://.../v1/chat/completions`.
2. Trong block `lhs-s1001.env` của `ecosystem.config.js`, đặt:

   ```text
   BOT_AI_CHAT_PROVIDER_ENABLED=1
   BOT_AI_CHAT_API_URL=https://.../v1/chat/completions
   BOT_AI_CHAT_MODEL=<model-id>
   ```

3. Chỉ lưu khóa bí mật trong `/linhhoasu/lhs/newServer/.env`, không commit hoặc đưa vào báo cáo:

   ```text
   BOT_AI_CHAT_API_KEY=<secret>
   ```

4. Backup rồi restart riêng `lhs-s1001` bằng `--update-env`; không restart `lhs-real-bots`, `lhs-dist` hoặc `lhs-admin`.
5. Kiểm tra `/health`:

   - `runtime.botConversation.mode` phải là `ai+local`.
   - `providerConfigured=true`, `modelConfigured=true`.
   - `providerSuccess` tăng sau khi người chơi hỏi bot.
   - `providerFailures` không tăng liên tục.

## Giới hạn an toàn/cost

- Tối đa mặc định 8 request AI/phút cho toàn server, không phải cho từng bot.
- Một map chờ ít nhất 20 giây giữa hai câu trả lời; một người chơi chờ ít nhất 45 giây.
- Timeout 8 giây; lỗi provider tự fallback local, không chặn chat người chơi.
- Ba lỗi provider liên tiếp mở circuit breaker 5 phút.
- Chỉ gửi tối đa 6 câu chat công khai gần nhất; email, số điện thoại, URL và token bị che trước khi ra ngoài.
- Ambient bot–bot luôn dùng kịch bản local để không phát sinh chi phí AI nền.

## Rollback nhanh

- Đặt `BOT_AI_CHAT_ENABLED=0` rồi restart riêng `lhs-s1001` để tắt toàn bộ coordinator.
- Hoặc chỉ đặt `BOT_AI_CHAT_PROVIDER_ENABLED=0` để giữ hội thoại local nhưng ngừng mọi request ra nhà cung cấp.
- Backup trước triển khai: `/linhhoasu/_ai_workbench/backups/bot_ai_chat_pre_20260902_120300/`.
