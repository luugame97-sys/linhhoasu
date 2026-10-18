# Kế hoạch gộp S1–S4 (bản thiết kế, chưa triển khai)

Ngày lập: 2026-09-28 ICT  
Phạm vi: S1/S2/S3/S4, game server, MongoDB, Redis, WebGM, game web, PM2 và nginx.  
Trạng thái: **read-only; chưa có migration, restart, ghi DB hay thay đổi web**.

## 1. Kết luận và hiện trạng đã kiểm chứng

Không thể gộp bằng cách đổi một biến môi trường hoặc import thẳng bốn database. Hiện chưa có merge service trong source; S1–S4 là bốn process/port và bốn game database riêng:

| Server | Process | HTTP/WS | Game DB | Identity DB |
|---|---|---|---|---|
| S1/1001 | `lhs-s1001` | 8080/9200 | `lhs_s1001` | cùng DB mặc định |
| S2/1002 | `lhs-s1002` | 8083/9201 | `lhs_s1002` | `lhs_s1001` |
| S3/1003 | `lhs-s1003` | 8084/9202 | `lhs_s1003` | `lhs_s1001` |
| S4/1004 | `lhs-s1004` | 8085/9203 | `lhs_s1004` | `lhs_s1001` |

Snapshot read-only ngày 28/09/2026:

- Player: S1 `2691`, S2 `885`, S3 `788`, S4 `738`, tổng `5102`.
- `userId` và `playerId` không trùng giữa bốn DB; tên trùng chéo `1754` giá trị.
- S1 còn `8` player có `serverId=1002` và `6` player có `serverId=1003`; phải điều tra/quarantine, không tự sửa.
- Account/role là dữ liệu dùng chung trong `lhs_s1001`; không copy Account từ S2–S4 như thể đó là database identity riêng.
- WebGM `config.php` và nginx không có đầy đủ trong checkout; phải đọc live, backup và kiểm chứng riêng.

Bằng chứng: `_ai_workbench/temp/s1_s4_merge_readonly_20260928.json`, `_ai_workbench/reports/session_report.md` mục “Audit khả năng gộp S1–S4”.

## 2. Quyết định cần chốt trước khi viết migration

1. Gộp thành một vũ trụ thật hay chỉ gộp menu/web. Kế hoạch này giả định **một vũ trụ thật**.
2. Chọn canonical server ID. Khuyến nghị tạo ID đích mới (ví dụ `TARGET_SERVER_ID`, quyết định sau), giữ URL S1–S4 làm alias trong thời gian chuyển tiếp; ít rủi ro hơn ghi đè S1. Nếu bắt buộc dùng S1/1001, giữ nguyên các bước nhưng rollback khó hơn.
3. Quy tắc tên trùng: giữ tên S1; các tên nguồn còn lại đổi theo suffix xác định (ví dụ `·S2`), lưu mapping cũ và thông báo người chơi. Không rename ngẫu nhiên.
4. Quy tắc guild trùng tên/ID, người lãnh đạo, thành viên và đơn đăng ký.
5. Quy tắc event/arena/competition đang mở, mail chưa nhận, reward pending và transaction trùng. Không tự bù hoặc phát lại.
6. Thời gian bảo trì, người có quyền mở gate/rollback và thời gian giữ database nguồn read-only (khuyến nghị tối thiểu 30 ngày).

Nếu một mục chưa chốt, chỉ được audit/dry-run, chưa được apply.

## 3. Các giai đoạn và thời gian dự kiến

Ước lượng dưới đây là cho một kỹ sư có quyền VPS, sau khi chốt policy; không tính thời gian chờ phê duyệt hoặc xử lý conflict bất thường.

| Giai đoạn | Nội dung và đầu ra | Cổng dừng | Thời gian |
|---|---|---|---:|
| 0. Chốt policy | Target ID, name/guild/event/reward policy, downtime, rollback owner | Thiếu policy thì dừng | 2–4 giờ |
| 1. Inventory live | PM2/env/ports, nginx, WebGM/MySQL, Mongo collections/indexes, Redis prefixes, scheduler/bot | Snapshot + hash + counts đầy đủ | 4–8 giờ |
| 2. Xây migration tool | Manifest, dry-run, collision map, CAS, receipt, resume/rollback, audit log | Dry-run không ghi và không còn conflict chưa phân loại | 1–2 ngày |
| 3. Rehearsal/staging | Restore bản sao, chạy migration, test login/mail/guild/economy, test restore | Restore staging thành công, source snapshot không đổi | 1–2 ngày |
| 4. Web/runtime canary | Target route, alias S1–S4, WebGM, game list, WS, cache-bust; test bằng fixture/QA | `/ready`, HTTP/WS, login fixture và admin read-only PASS | 1 ngày |
| 5. Final window | Freeze, backup cuối, apply, index, verify, mở dần | Mọi invariant và smoke test PASS | 2–4 giờ bảo trì |
| 6. Theo dõi sau mở | 60–120 phút theo dõi lỗi; 2–3 ngày đối soát nhẹ | Không có duplicate reward/lost mail/role mismatch | 1–3 ngày lịch |

Tổng thời gian an toàn: **6–10 ngày làm việc**, với một cửa sổ người chơi không đăng nhập khoảng **2–4 giờ**. Nếu conflict tên/guild hoặc policy reward chưa rõ, cộng thêm thời gian tương ứng; không rút ngắn bằng cách import trực tiếp.

## 4. Trình tự migration đề xuất

1. Bật maintenance/read-only gate cho S1–S4 và WebGM; từ chối login/RPC ghi mới, chờ session drain.
2. Dừng virtual/real bot, scheduler arena/event/reward, webhook/outbox worker và cron có khả năng ghi; lưu cursor/lease.
3. Chụp backup cuối cùng của bốn game DB, identity DB dùng chung, WebGM/MySQL, Redis, PM2/nginx và static assets.
4. Sinh `mergeId`, manifest hash/count và các mapping:
   - `sourceServerId + sourceDb + sourceCollection + sourceId -> targetId`;
   - player/user/role/name/guild/mail/order/fight/settlement;
   - conflict nào được tự xử lý, conflict nào quarantine.
5. Migrate dữ liệu cấu hình/reference theo nguồn đã duyệt (`GameServer`, config, redemption/product) mà không ghi đè bản dùng chung nếu payload khác.
6. Migrate Player bằng insert idempotent; giữ toàn bộ Mixed fields, thêm metadata `mergeId/originServerId` hoặc lưu mapping ở collection audit riêng; không xoá nguồn.
7. Cập nhật Account roles/activeRoleByServer trong identity DB theo mapping. Thao tác này phải document-level CAS; không restore toàn bộ identity DB nếu rollback vì S5/S6 cũng dùng DB này.
8. Migrate Guild và cập nhật mọi embedded reference trong Player/Guild (leader/member/application/name/power).
9. Migrate Mail, reward outbox/receipt, Transaction, BattleLog/ArenaFightLog và các collection append-only. Dedupe chỉ khi payload giống hệt; collision khác payload phải dừng/quarantine.
10. Giữ immutable `ArenaSettlement`, `EventRewardSettlement`, `CrossEventSettlement`, `CrossEventEntry`, `CrossArenaAction` theo cycle/event cũ; chỉ remap khi policy đã duyệt, không đổi lịch sử để “làm đẹp” số liệu.
11. Tạo/rebuild index đích, kiểm tra validator/TTL; không dùng `dropDatabase` hoặc drop index unique để ép import.
12. Redis: snapshot phục vụ rollback; xoá/rebuild cache/session theo prefix đích sau khi invalidating session. Redis không được coi là nguồn dữ liệu duy nhất.
13. Chỉ sau khi dữ liệu PASS mới đổi PM2/env, game list, WebGM server map, nginx HTTP/WS route và cache marker. Giữ alias `/ws`, `/ws-s2`, `/ws-s3`, `/ws-s4` trong grace period nếu policy cần.
14. Khởi động target, kiểm tra readiness/process/log, mở login theo từng bước; S2–S4 cũ giữ stopped/read-only.

## 5. Bảng rủi ro dữ liệu và cách xử lý

| Dữ liệu | Rủi ro | Cách an toàn |
|---|---|---|
| Player | unique `userId/playerId/name`; tên trùng 1754; residue `serverId` | mapping trước, rename deterministic/quarantine, CAS/hash từng document |
| Account/roles | identity dùng chung `lhs_s1001`, ảnh hưởng S5/S6 | không copy DB nguồn; cập nhật role có receipt và rollback từng document |
| Guild | `guildId`, `name` unique; embedded member refs | map ID trước, cập nhật leader/member/application, kiểm tra leader tồn tại |
| Mail | unique `(userId,eventKey)`, trạng thái claimed/pending | giữ claimed/read/expire; dedupe exact; collision dừng |
| Transaction | `orderId` unique, audit tài chính | giữ toàn bộ audit; cùng order phải cùng payload, khác payload dừng |
| Arena/event/reward | immutable roster, cursor, mail có thể phát lại | đóng cycle hoặc giữ source cycle; không phát bù tự động |
| Cross collections | nằm trên identity DB, cycle/player unique | không nhân bản; cập nhật pool/schedule sau policy |
| Bot | bot ảo/worker và player bot có lifecycle riêng | dừng worker trước freeze; không tính bot như người thật; recreate theo policy |
| Redis | session/cache không bền vững, prefix S1–S4 | snapshot, invalidate/rebuild; không dùng Redis để khôi phục Player |
| WebGM/MySQL | bảng `server_id` cho claim/reward/order/log | backup schema+data, remap idempotent, kiểm tra pending delivery |
| nginx/static | route WS/cache sai làm login hoặc game lỗi | backup `nginx -T`, hash file, reload có kiểm tra, giữ alias/rollback |

## 6. Backup và khôi phục đầy đủ

### Backup bắt buộc

- Mongo: `mongodump --archive --gzip` cho `lhs_s1001`…`lhs_s1004` và một bản riêng cho identity DB; kèm `listCollections`, `listIndexes`, validator, collection counts, SHA-256 và timestamp. Nếu replica set hỗ trợ, dùng oplog/point-in-time; nếu không, phải freeze trước khi dump.
- WebGM/MySQL: dump schema + data của các bảng có `server_id`, reward delivery, order, claim, log; lưu `SHOW CREATE TABLE`/index.
- Redis: `redis-cli --rdb`/RDB snapshot và manifest prefix; không in password/key vào report.
- Runtime/web: ecosystem/PM2 dump, live env đã redact, nginx config, WebGM config live, game/GM static files và hashes.
- Lưu bản backup non-overwrite tại `/linhhoasu/_ai_workbench/backups/s1_s4_merge_<timestamp>/`, copy thêm sang nơi khác và kiểm tra checksum.
- Bắt buộc restore thử vào DB tên staging trước ngày production; backup chưa restore thử không được xem là backup hoàn chỉnh.

### Điều kiện rollback tự động

Rollback ngay nếu có một trong các dấu hiệu: thiếu player/account role/mail; unique conflict chưa quarantine; economy sum thay đổi ngoài policy; reward delivered tăng ngoài receipt; login/WS/readiness lỗi; source hash/count thay đổi trong lúc freeze; queue/latency vượt ngưỡng đã chốt.

### Cách rollback

1. Đóng login/write gate, dừng target và scheduler/bot.
2. Giữ nguyên target DB lỗi để điều tra; không overwrite.
3. Restore target từ archive vào DB mới, verify count/hash/index rồi đổi `MONGO_URI`/route về DB đã restore hoặc DB nguồn.
4. Restore WebGM/nginx/PM2/static từ manifest trước merge; giữ alias cũ.
5. Với identity `lhs_s1001`, **không restore cả database** vì S5/S6 dùng chung; chỉ đảo các document/role/row nằm trong merge receipt bằng CAS. Nếu có thao tác ngoài merge trong cùng cửa sổ, dừng và xử lý PITR/replay có người duyệt.
6. Khởi động S1–S4 theo cấu hình trước merge, kiểm tra readiness/login/mail/GM, rồi đối chiếu source counts/hash.
7. Giữ backup/target lỗi và source DB read-only tối thiểu 30 ngày; chỉ xoá sau sign-off.

## 7. Bộ kiểm thử nghiệm thu

- Tĩnh: `JSON.parse`/syntax Node/PHP, schema/index/TTL, manifest và hash.
- Dữ liệu: count từng collection, unique user/player/name, guild membership/leader, mail eventKey, orderId, settlement/cursor, serverId hợp lệ, source unchanged.
- Kinh tế: tổng currency/item, claimed/unclaimed mail, transaction totals và reward receipts trước/sau khớp theo policy.
- Chức năng: login/logout/reconnect, đổi server alias, load player, bag/equipment/pet/fashion, claim mail, guild, arena read-only, WebGM tìm player và gửi mail trên QA fixture.
- Runtime: PM2 process/PID/restart, `/ready`, `/health`, HTTP/WS public route, nginx error log, Redis/Mongo health, latency/queue trong 60–120 phút.
- Không tạo account/player thật để QA; fixture/synthetic account phải được đánh dấu và cleanup bằng receipt.

## 8. Tự động hóa cho các lần sau

Có thể tự động hóa, nhưng chỉ sau khi policy conflict được khai báo. Tool nên có các lệnh:

```text
merge inventory --source 1001,1002,1003,1004 --target TARGET
merge dry-run --manifest <file>
merge backup --manifest <file>
merge apply --manifest <file> --maintenance-token <token>
merge verify --merge-id <id>
merge resume --merge-id <id>
merge rollback --merge-id <id> --reason <code>
```

Thiết kế bắt buộc: manifest versioned; không chứa secret; dry-run mặc định; backup không overwrite; CAS/hash precondition; idempotent receipt cho từng document; quarantine conflict; bounded retry; checkpoint/resume; report JSON + summary Markdown; tự động dừng khi invariant fail; rollback chỉ allow-list; readiness/process/hash read-back sau mỗi bước. Có thể tái sử dụng pattern audit → backup → CAS → scoped restart → readiness → read-back đang có trong `_ai_workbench/tools`, nhưng hiện chưa có tool merge/restore tổng quát.

## 9. Việc tiếp theo được phép làm ngay (read-only)

1. Chốt 6 policy ở mục 2.
2. Chạy inventory live bổ sung cho nginx, WebGM/MySQL, Redis prefix, scheduler/outbox và tất cả collection chưa có trong snapshot.
3. Sinh dry-run conflict report; chưa apply, chưa restart, chưa xoá DB.
4. Sau khi policy và dry-run được ký duyệt mới xây migration tool và rehearsal staging.

