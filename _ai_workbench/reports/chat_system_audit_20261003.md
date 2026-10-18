# Audit chat liên server, chat thế giới và chat hệ thống — 03/10/2026

## Phạm vi và bằng chứng

- Read-only source/live/hash/log audit, không gửi tin nhắn thử, không ghi player/DB/Redis.
- Live hash và file snapshot: `_ai_workbench/temp/chat_audit_20261003/audit.json`.
- S1–S6 process online; readiness Mongo/Redis `6/6 PASS`.
- Client native xác nhận: gửi chat thế giới qua RPC `1600`; nhận push chat qua tag `1601`; `1601` cũng được dùng để block/unblock người chơi.

## Lỗi đã xác nhận

### P0 — Chat thế giới không liên server

- `handlers/chat.js:185–192` gọi `runtimeBus.getWsServer().broadcast(1601, ...)`, chỉ broadcast trong một process/node.
- `historyMap` của chat là `Map` trong bộ nhớ process, không có Redis persistence hoặc fan-out cross-server.
- `CrossBus.js` có `publish/subscribe` nhưng source hiện không có nơi gọi `CrossBus.subscribe`; bus hiện không nối vào chat.
- Hệ quả: người ở S1 không chắc thấy tin nhắn từ S2–S6; history sau restart/process split cũng khác nhau.

### P1 — Tag block/unblock bị đụng với route chat

- Native client `ChatModel.sendBlockPlayer()` gửi `RPC 1601 {playerId,isBlock}`.
- `handlers/index.js` lại đăng ký `1601` vào `task.handleChatSend`, hàm này tạo chat push thay vì đổi block list.
- Hệ quả: block/unblock có thể không hoạt động, có thể sinh push chat rỗng/không đúng payload và log outbound `1601` gây nhiễu.

### P1 — Chat hệ thống mất history khi reconnect

- `buildChatInitPacket()` trả `sysList: []` cố định dù `historyMap` có channel system.
- `pushSystemBroadcast()` chỉ lưu vào `historyMap`/`MessageService.runtimeState` của process hiện tại rồi broadcast local.
- Hệ quả: người chơi vào lại game không nhận lại system chat cũ; S1–S6 không có cùng lịch sử.

### P2 — Fan-out và latency chưa có kiểm soát đủ

- Log live ghi nhiều `normalized outbound show rows tag=1601`; S2/S3 có `slow send tag=1600` khoảng 3,7–3,8 giây.
- `handleSendChat()` không có giới hạn độ dài/nội dung/rate-limit rõ ràng trong handler; cần khóa ở server trước khi đưa chat vào bus/fan-out.

## Kế hoạch fix chuẩn

### Bước 1 — Tách đúng protocol

1. Đổi route `1601` thành handler block/unblock riêng; giữ `1601` chỉ là server push, không dùng chung request.
2. Trả ACK block/unblock đúng kết quả và không tạo chat entry.
3. Thêm regression cho block, unblock, chat world send và push.

### Bước 2 — Chat bus liên server

1. Tạo namespace Redis riêng cho chat, có `messageId`, `originNode`, `channel`, `entry`, `createdAt` và TTL.
2. Mỗi process subscribe một lần khi app start; bỏ qua message có `originNode` trùng để tránh vòng lặp.
3. `handleSendChat()` ghi history authoritative rồi publish bus; subscriber fan-out đến client local.
4. Dùng stream/trim để replay history giới hạn, không phụ thuộc `Map` process.

### Bước 3 — Chat hệ thống

1. Lưu system entry vào cùng chat stream với channel `1`.
2. `1600` init trả đúng `list` và `sysList` theo giới hạn; không trả `sysList: []` cố định.
3. Đồng bộ `MessageService` với stream hoặc bỏ runtime-only duplicate state.

### Bước 4 — Guard và hiệu năng

1. Giới hạn độ dài UTF-8, rate theo `userId/channel`, chống spam cùng nội dung và payload JSON quá lớn.
2. Fan-out theo batch/backpressure; đo `publish`, queue wait, send latency và dropped recipients.
3. Không để bot/local-fallback dùng chung đường gửi mà không gắn `origin=bot` và quota riêng.

### Bước 5 — Rollout/rollback

1. Test VM + Redis fake: 6 node origin/subscriber, duplicate, subscriber restart, reconnect history, malformed message, block route.
2. Canary một node S6, kiểm tra chat giữa S6 và một node khác bằng QA session được ủy quyền.
3. Rolling S5→S1, read-back stream, recipient counts, duplicate count, p95 send latency.
4. Rollback theo hash/CAS từng file; không xóa chat history hoặc player data.

## Tiêu chí hoàn tất

- World chat từ mỗi S1–S6 đến đúng các node còn lại, không duplicate.
- System chat hiển thị ngay và replay đúng sau reconnect.
- Block/unblock không tạo chat packet và trả ACK đúng.
- Không còn `1600` slow send vượt ngưỡng đã chốt; có metric fan-out và error code.
- Test và QA E2E pass; không dùng HTTP 200/readiness đơn lẻ làm bằng chứng chat hoạt động.

## Đã triển khai chat bus và system history — 03/10/2026

- Chat world/system dùng Redis global bus `lhs:chat:v1`, 6 subscriber, dedupe/history replay; block route `1601` đã tách đúng.
- Rate-limit/payload guard thêm ở server. VM contract PASS; S1–S6 readiness PASS.
- Receipt: `_ai_workbench/temp/chat_fix_20261003/deployment.json`; postcheck: `_ai_workbench/temp/chat_fix_20261003/postcheck.json`.
- Chưa authenticated E2E S1↔S6.
