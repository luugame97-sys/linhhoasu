# Kế hoạch tích hợp GiftCode — WebGM là nguồn chính — 10/10/2026

## Trạng thái triển khai — 10/10/2026

- Đã deploy bridge game → WebGM và rolling restart S1–S8. WebGM PHP giữ reservation/outbox/lease/mail; RPC `1750` gọi bridge trước nhánh legacy. Mã legacy đã nhận được reconcile vào `giftcode_logs` khi game retry, không phát quà WebGM lần nữa.
- Đã thêm collision fail-closed: nếu game thấy mã legacy tồn tại và mã đó cũng có trong WebGM, player chưa có ledger legacy sẽ nhận `collision` và không chọn ngầm kho MySQL; nếu player đã có ledger legacy thì chỉ reconcile. Mã chỉ có trong Mongo vẫn trả `not_found` từ bridge để giữ nhánh legacy.
- HMAC, nonce table `web_internal_nonces`, role/server lookup và unknown-code path đã kiểm chứng; không redeem code hợp lệ, không ghi player/mail/reward trong lượt này.
- Backup: `/linhhoasu/_ai_workbench/backups/giftcode_bridge_20261010_164924`; receipt: `_ai_workbench/temp/giftcode_bridge_20261010/release.json`.
- **Còn stop gate:** chưa có QA identity nên chưa thể nghiệm thu game→web/web→game với một mã hợp lệ; 11 collision lịch sử vẫn cần đối soát/migrate riêng trước khi tuyên bố hợp nhất hoàn toàn. WebGM admin chưa có collision precheck xuyên Mongo, nên chưa bật tuyên bố canonical hoàn toàn cho mã mới.

## Mục tiêu đã chốt

- WebGM là nơi duy nhất tạo, sửa, tắt và xem thống kê giftcode dùng chung.
- Người chơi nhập cùng một mã ở WebGM hoặc trong game.
- Một claim thành công duy nhất cho mỗi `giftcode + account + server`; nhập lại ở kênh còn lại không phát thêm quà.
- Giữ luồng MySQL reservation, delivery, lease, retry và mail hiện tại của WebGM.
- Không thu hồi hoặc phát lại lịch sử cũ trong đợt tích hợp.

## Hiện trạng làm baseline

- WebGM MySQL là đường đang ổn định: bảng `giftcodes`, `giftcode_logs` có unique `(account_name, server_id, giftcode_id)`, `web_reward_deliveries` có unique `(kind, account_name, server_id, source_id, claim_period)`, delivery chia lô và có event key.
- WebGM hiện gọi game `/api/internal/mail/send` để lưu thư; đây là đường phải tái sử dụng.
- RPC game `1750` hiện đọc Mongo `RedemptionCode`/`GiftCodeConfig` rồi grant trực tiếp, nên phải thêm nhánh WebGM canonical trước nhánh legacy.
- Live chưa có `/api/internal/player/giftcode-context`; cây local có candidate cùng tên nhưng không được deploy nguyên cây.

## Kiến trúc mục tiêu

```text
WebGM admin
   │ tạo/sửa/tắt
   ▼
MySQL giftcodes  ── canonical code + reward snapshot + limits
   │
   ├─ WebGM submit_giftcode ── reservation/outbox ── game mail
   │
   └─ Game RPC 1750 ── HMAC bridge ── reservation/outbox ── game mail
                                      │
                                      └─ cùng giftcode_logs + web_reward_deliveries
```

Game Mongo `RedemptionCode` chỉ giữ vai trò legacy trong giai đoạn chuyển tiếp. Không cho một mã tồn tại đồng thời ở hai nguồn; collision phải bị từ chối.

## Trình tự triển khai

### Pha 0 — Chụp baseline và khóa phạm vi

1. Read-only snapshot source live, PHP/Node hash, Nginx route, HMAC config, schema/index MySQL, Mongo `RedemptionCode`, PM2/readiness S1–S8.
2. Export chọn lọc `giftcodes`, `giftcode_logs`, `web_reward_deliveries`, `giftcode_delivery_batches` vào backup mã hóa/quyền hạn chế; không xuất plaintext code trong báo cáo.
3. Lập collision report giữa MySQL `giftcodes` và Mongo `RedemptionCode` bằng hash mã; không in mã dùng được.
4. Đóng băng việc tạo mã legacy trong game admin ở mức UI/API cho các mã mới; giữ route đọc cũ để rollback.

**Stop gate:** baseline/hash/schema không khớp hoặc không xác định được HMAC/route thì dừng, chưa sửa.

### Pha 1 — Bổ sung định danh claim, không đổi hành vi

1. Thêm migration nullable cho `web_reward_deliveries`: `recipient_user_id`, `claim_channel`, `claim_request_id`.
2. Thêm migration nullable cho `giftcode_logs`: `role_id`, `recipient_user_id`, `claim_channel`, `claim_request_id`.
3. Giữ nguyên unique key hiện tại; thêm index tra cứu `claim_request_id` và recipient. Không backfill mù lịch sử cũ; dòng cũ được đánh dấu legacy/null.
4. Khi WebGM claim hiện tại tạo delivery, ghi `role_id`, `recipient_user_id` nếu đã xác minh được và `claim_channel='web'`.
5. Không đổi cách tính `used_count`; vẫn tính lượt đã sent + delivery pending như hiện tại.

**Kiểm thử:** migration trên clone MySQL 5.7, rollback schema, concurrent insert cùng account/server/code, legacy row không bị mất.

### Pha 2 — Tạo bridge nội bộ WebGM

Tạo route chỉ nghe internal/local network, ví dụ `POST /api/internal/giftcode/claim`.

Request tối thiểu do game node ký HMAC:

```json
{
  "code": "...",
  "serverId": "1001",
  "userId": "...",
  "roleId": "...",
  "accountId": "...",
  "requestId": "uuid",
  "channel": "game"
}
```

Bridge phải:

1. Kiểm tra timestamp, nonce/replay, chữ ký, server allowlist và body hash.
2. Xác minh `roleId`, `userId`, `accountId`, `serverId` qua game node; không tin UID do browser gửi.
3. Gọi lại `lhs_reward_reserve_gift()` hiện có để khóa mã, kiểm hạn, max uses, pending reservation và duplicate.
4. Ghi recipient/channel/request id vào delivery.
5. Gọi `lhs_reward_dispatch()` hiện có; không tự gửi mail khác đường.
6. Trả trạng thái chuẩn hóa: `sent`, `pending`, `already_claimed`, `expired`, `out_of_uses`, `invalid`, `identity_mismatch`, `retry_required`.
7. Không trả reward snapshot đầy đủ cho client; client chỉ cần trạng thái và delivery id/event key đã che bớt.

**Idempotency:** cùng `requestId` hoặc cùng `(account,server,giftcode)` phải trả lại delivery cũ; không tạo delivery mới. Timeout sau khi reservation thành công phải retry được.

### Pha 3 — Nối RPC game `1750`

1. Tại `handleActivityGiftCode`, normalize code như hiện tại.
2. Gọi WebGM bridge trước khi đọc `RedemptionCode` legacy.
3. Nếu bridge trả mã WebGM hợp lệ, trả thành công/pending theo delivery; không ghi `activityInfo.giftCodeRecords` cho claim canonical để timeout không khóa nhầm retry.
4. Nếu bridge trả `NOT_FOUND`, mới chạy nhánh legacy `RedemptionCode`/`GiftCodeConfig` trong cửa sổ chuyển tiếp.
5. Nếu bridge trả collision hoặc identity mismatch, fail-closed; không fallback sang kho Mongo.
6. Tách timeout/network error khỏi `invalid code`: lỗi mạng trả `retry_required`, không đánh dấu đã nhận.
7. UI game hiển thị “quà đã vào thư” hoặc “đang chờ giao”, không báo cộng trực tiếp vào túi khi bridge dùng mail.

### Pha 4 — Giữ WebGM là nơi duy nhất tạo mã

1. WebGM admin tiếp tục ghi `giftcodes` như hiện tại.
2. Thêm kiểm tra collision qua bridge trước khi tạo mã mới; mã trùng Mongo legacy bị từ chối.
3. Ẩn/khóa tạo mã dùng chung trong `admin-users.html`; các mã Mongo cũ được gắn `legacy` và không tạo mới.
4. Cho phép sửa/tắt mã chỉ ở WebGM; sửa reward chỉ áp dụng claim mới, snapshot delivery cũ giữ nguyên.
5. Thêm nhãn nguồn trong admin: `canonical_webgm` hoặc `legacy_game`; không xóa lịch sử.

### Pha 5 — Canary theo server

1. Bật feature flag chỉ cho S1 và một account QA được ủy quyền.
2. Tạo một mã tạm từ WebGM với `max_uses=2`, quà nhỏ, hạn ngắn.
3. Case A: nhập game trước, sau đó nhập WebGM; kết quả phải có đúng 1 `giftcode_logs`, 1 `web_reward_deliveries`, 1 mail event key.
4. Case B: nhập WebGM trước, sau đó nhập game; kết quả tương tự.
5. Case C: hai request đồng thời từ web/game; chỉ một reservation thành công.
6. Case D: timeout sau reservation, retry cùng request id; không thêm mail/lượt.
7. Case E: đổi server/đổi role trong WebGM; bridge từ chối identity mismatch.
8. Đọc lại MySQL + Mongo mail + player mail claim ledger; không chỉ dựa HTTP 200.
9. Xóa/disable mã QA sau test và xác nhận không còn player/mail/log QA ngoài receipt.

**Stop gate canary:** bất kỳ mismatch recipient, số mail >1, counter sai hoặc retry tạo claim mới thì tắt flag ngay; WebGM cũ vẫn hoạt động.

### Pha 6 — Mở S2–S8 và xử lý legacy

1. Mở từng server sau khi canary ổn định, mỗi server có cửa sổ quan sát và receipt riêng.
2. Migrate các Mongo legacy còn cần dùng sang mã WebGM với mapping `legacy_code → giftcode_id`; không đổi mã đã phát cho người chơi nếu chưa có ledger.
3. Sau cửa sổ theo dõi, tắt fallback Mongo ở chế độ fail-closed; giữ collection và backup để rollback đọc-only.
4. Không tự chuyển quà lịch sử do sai recipient; xử lý riêng theo xác nhận account và đối soát mail/ledger.

## Kiểm thử bắt buộc trước production

- PHP lint, Node syntax, route/auth contract, HMAC replay/nonce/server mismatch.
- 50–100 request đồng thời cùng code ở hai kênh: đúng một claim.
- max uses `1`, `2`, unlimited; pending reservation giữ slot; retry stale lease.
- Code chưa tới hạn, hết hạn, tắt, không tồn tại, reward rỗng, item không hợp lệ.
- S1–S8 routing: mail đúng `targetServerId`, role đúng UID, account đúng owner.
- Reward contract: item thường, Xu/Bạc/Nguyên bảo, Fashion có `swaps`, native pet/mount/artifact; so sánh direct legacy và mail canonical trước khi bật.
- Player thật chỉ dùng account QA được ủy quyền; không dùng tài khoản người chơi hoặc mã public đang hoạt động.

## Rollback

- Tắt feature flag game bridge; RPC quay về thông báo retry/fallback legacy theo trạng thái đã được chỉ định.
- Giữ nguyên các delivery canonical đã `sent/pending`; không xóa log hoặc thu hồi quà.
- WebGM submit cũ tiếp tục chạy độc lập qua MySQL/outbox.
- Nếu cần khôi phục source, dùng backup/CAS từng file; không rollback toàn bộ PM2/DB.

## Kết quả cần đạt để nghiệm thu

- Mã tạo từ WebGM xuất hiện và nhập được ở cả web/game.
- Nhập web rồi game, hoặc game rồi web, chỉ có một claim và một mail.
- Mọi retry/timeout giữ nguyên recipient và event key.
- Không có mismatch account/server/UID trong read-back.
- WebGM cũ vẫn tạo/sửa/tắt mã và giao quà bình thường trong suốt canary.
