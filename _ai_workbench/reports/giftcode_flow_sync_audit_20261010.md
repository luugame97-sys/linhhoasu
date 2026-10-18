# Audit luồng GiftCode game và WebGM — 10/10/2026

## Kết luận

Hai luồng hiện **chưa đồng bộ** và không nên chỉ sao chép bảng mã giữa hai hệ. Có thể tích hợp hai chiều theo kiểu bridge từng pha mà vẫn giữ WebGM đang chạy, nhưng cần giải quyết đồng thời kho mã, bộ đếm/lượt nhận, recipient và chính sách phần thưởng trùng.

## Bằng chứng live

- VPS `103.116.104.165`, kiểm tra read-only lúc `2026-10-10 15:55:42 ICT`: S1–S8 đều PM2 `online`.
- WebGM MySQL: `giftcodes=32`, `is_active=1` là `30`, `giftcode_logs=8404`, `web_reward_deliveries` giftcode `pending_delivery=0`, `sent=6454`.
- Game Mongo `RedemptionCode` theo DB: S1 `7` (active `5`, disabled `2`), S2 `2` (active `0`), S3 `2` (active `0`), S4–S6 mỗi server `1` disabled, S7–S8 `0`.
- Live route game đăng ký RPC `1750`; live source có `/api/internal/mail/send` và `/api/admin/redeem-codes`, **không có** `/api/internal/player/giftcode-context`. Endpoint context trong cây local là candidate chưa deploy.
- Live source hashes: `activity.js 40055ea0…`, `HTTPServer.js 101d796a…`, `RedemptionCode.js 361c7eaa…`, WebGM `user_api.php 30a69c04…`, `reward_delivery.php a1854870…`.

## Khác nhau hiện tại

| Nội dung | Nhập trong game | Nhập WebGM |
|---|---|---|
| Điểm vào | RPC tag `1750` | `POST api/user_api.php` action `submit_giftcode` |
| Kho mã | Mongo `RedemptionCode` của node/server, sau đó `GiftCodeConfig` hoặc env fallback | MySQL `giftcodes` |
| Kiểm tra trùng | `player.activityInfo.giftCodeRecords[CODE]` + `RedemptionCode.usedBy`/`perUserLimit` | `giftcode_logs`, `web_reward_deliveries`, legacy delivery batches, khóa MySQL theo mã |
| Giới hạn | Game kiểm `maxUses`, `perUserLimit`, `startsAt`, `expiresAt`; bộ đếm Mongo tăng sau khi player đã persist | Web giữ cả lượt pending, snapshot reward, lease 2 phút, retry và event key |
| Cấp quà | `grantRewardRows()` trực tiếp vào player, persist, trả packet `1202` và native sync | Tạo delivery snapshot, chia lô tối đa 20, gọi `/api/internal/mail/send`, người chơi nhận qua mail sau |
| Recipient | Nhân vật game của session hiện tại | Role mặc định của phiên WebGM/server đang chọn; popup hiện chưa truyền context nhân vật game đã xác minh |
| Quản trị mã | `admin-users.html` gọi `/api/admin/redeem-codes` | WebGM `admin_api.php` ghi `giftcodes` |

## Rủi ro nếu nối thẳng

1. Một code tồn tại ở cả MySQL và Mongo có thể bị cấp hai lần; hai bộ đếm không biết nhau.
2. Popup game có thể nhận vào nhân vật khác với nhân vật người dùng đang chơi. Audit ngày 04/10 đã thấy 146/500 delivery gần nhất trỏ khác role game login gần nhất; đây là sai điểm nhận, không phải bằng chứng mất quà.
3. Direct grant và mail claim có chính sách duplicate ngoại quan khác nhau: mail đi qua `grantMailFashion`/`swaps`, còn game giftcode đi qua `grantRewardRows`. Audit trước đã tái hiện chênh lệch này ở các ID Fashion có `swaps`.
4. Web delivery đã có outbox/lease/event key; bỏ qua nó để game tự ghi MySQL hoặc tự gửi mail sẽ phá retry và chống trùng đang có.
5. Cây local có `giftcode-context` nhưng live chưa có route đó; deploy nguyên cây local sẽ kéo theo drift không liên quan.

## Phương án tích hợp giữ WebGM hoạt động

### Pha 1 — Compatibility bridge, không đổi hành vi WebGM hiện tại

- Giữ MySQL `giftcodes` + `web_reward_deliveries` là đường cũ cho claim WebGM.
- Thêm API nội bộ HMAC, có `code`, `accountId`, `serverId`, `userId/roleId`, `eventKey`; API chỉ phục vụ lookup/reserve/claim, không nhận account hoặc UID tự do từ browser.
- Game RPC `1750` khi không tìm thấy code trong `RedemptionCode` mới gọi bridge MySQL; bridge dùng chính `lhs_reward_reserve_gift`/`lhs_reward_dispatch`, nên vẫn giữ lease, snapshot, event key và thư hiện tại.
- WebGM khi MySQL không có mã mới gọi bridge game để kiểm tra `RedemptionCode`; recipient phải do phiên WebGM chọn rõ server + tên + UID. Đường cũ không đổi nếu bridge tắt hoặc timeout.
- Code trùng giữa hai kho phải fail-closed với mã lỗi collision, không tự chọn một nguồn.

### Pha 2 — Đồng bộ recipient và reward contract

- Popup game lấy context backend đã xác minh từ session game; hiển thị server/tên/UID và chặn claim nếu context WebGM khác nhân vật.
- Chuẩn hóa một claim ledger duy nhất theo `(codeId, accountId, serverId, userId, eventKey)` với unique constraint; không dùng `usedCount` đơn lẻ làm chống trùng.
- Tách reward snapshot khỏi kênh nhận. Direct game và mail claim phải dùng cùng policy native/Fashion/swaps; nếu chưa hợp nhất policy thì cross-channel nên phát qua mail để tránh hai kết quả khác nhau.

### Pha 3 — Chuyển quyền sở hữu dữ liệu mã

- Chọn một store canonical sau khi bridge ổn định; migrate có mapping/receipt/CAS, không xóa MySQL logs hoặc Mongo `usedBy`.
- Giữ adapter đọc legacy và cờ rollback trong một cửa sổ theo dõi; chỉ tắt một kho khi đối soát code, lượt, recipient và delivery đạt 0 mismatch.

## Đánh giá

- **Có thể làm:** Có, tích hợp hai chiều mà không làm gián đoạn WebGM nếu triển khai bridge fail-closed, giữ nguyên đường MySQL hiện tại, có feature flag/rollback và không đổi recipient ngầm.
- **Không an toàn:** copy `giftcodes` sang `RedemptionCode`, copy `used_count` sang `usedCount`, hoặc cho game ghi trực tiếp MySQL mà không dùng reservation/event key.
- **Chưa triển khai:** audit này chỉ đọc source/runtime/DB counts; không sửa code, không tạo mã, không redeem và không gửi thư thử.
