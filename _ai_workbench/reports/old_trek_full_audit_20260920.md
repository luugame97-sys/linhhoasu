# Audit toàn bộ Hoang Cổ Mê Hàng (OldTrek) — 20/09/2026

## Phạm vi và trạng thái

- Read-only đối với production: không sửa source, không ghi Mongo, không restart.
- Đã đọc source local, cấu hình 62 bảng `OldTrek`, bundle client native, log runtime và Mongo live S1–S5 qua SSH fingerprint đã xác nhận.
- Runtime live hiện chạy đúng hash local của `old-trek.js` (`c81ab9df...`), `OldTrekScheduleService.js` (`0f86a90b...`) và PM2 `lhs-s1001`–`lhs-s1005` đều online.
- Test lịch hiện có `_ai_workbench/tools/test_oldtrek_schedule.js`: 4/4 PASS. Đây chỉ là test scheduler/shape, không phải nghiệm thu gameplay.

## Đính chính tiền đề

Audit lịch cũ nói sự kiện đang `PREPARE`/không có kỳ mở không còn phản ánh runtime sau bản scheduler mới. Probe live lúc 20/09/2026 22:15 GMT+7 trả:

- `stage=2 (ON)`, `matchId=2`, `totalSeason=2`, `isDepartAllowed=true`.
- Season hiện tại bắt đầu 20/09 00:00 GMT+7 và kết thúc 27/09 00:00 GMT+7.
- `OldTrekOpenConfig[2]` gốc vẫn là kỳ đã hết hạn (03/06–06/07/2026); scheduler mới đang bypass lịch bảng bằng anchor 7 ngày. Đây là policy mới, không phải lịch gốc.

Vì vậy triệu chứng hiện tại không còn là “nút bị khóa do stage=1”; lỗi chính nằm ở implementation gameplay/server contract.

## Lỗi xác nhận

### P0 — Không có engine chạy hành trình/event native

`old-trek.js` chỉ đọc/ghi `currentEvent`, nhưng không có code chọn event, roll dice, tick theo thời gian, áp weather/effect, battle watcher, offline event hoặc tạo cabin item. `rg` toàn bộ `src` cho thấy 62 bảng OldTrek chỉ được dùng thực tế ở một số bảng base/destination/task/sailor/pass/arena score; các bảng event/effect/weather/NPC/minigame/rank reward gần như không được server gọi.

Hệ quả: client gọi `7001` chỉ tăng `dist` theo `equalDis * multi`; không thể phát sinh event để `7002` xử lý. Mongo live cũng xác nhận hai chuyến đang chạy thật (S1 và S3) có `dist=0`, `currentEvent=null`, `cabin=[]`, `taskRecord={}` ngay sau khi được khởi tạo; toàn bộ S1–S5 chỉ có dữ liệu `season=1`.

Bằng chứng source: `old-trek.js:844–868`, `old-trek.js:872–918`, `old-trek.js:972–978`.

### P0 — `7001` làm mất quãng đường đã trôi qua và không tạo event

Client native tính `getCurDistance()` từ `dist + (serverTime - lastUpdateTime) * speed`; server `7001` lại dùng `trekData.dist` cũ, cộng cố định `equalDis * multi`, rồi ghi đè `lastUpdateTime`. Harness sau 3 giờ: client distance trước accelerate `600`, sau ACK còn `200` thay vì ít nhất `800`. Vì vậy reload/accelerate có thể làm lùi hành trình; event/cabin cũng không được tạo.

Bằng chứng client `main.min_drop100.js` hàm `getCurDistance`; server `old-trek.js:844–868`.

### P0 — `7000` bypass cost/unlock khi client gửi yêu cầu bắt đầu

Nhánh `7000` chỉ kiểm tra `isDepartAllowed`, sau đó gọi `startSailing(destId, diff)`. Server không kiểm tra destination đã unlock, không trừ `cfg.costs`, không kiểm tra player đang có chuyến khác và không kiểm tra power/season theo destination. Các kiểm tra hiện nằm ở client không phải authority.

Bằng chứng: `old-trek.js:505–536`; đối chiếu chi phí/unlock native ở `old-trek.js:983–996` và cấu hình `OldTrekDestinationConfig`.

### P0 — `7009` sweep/ra khơi nhanh bỏ qua gate mở destination

Sweep trả thưởng ngay có thể là semantics native, nhưng server không kiểm tra destination đã unlock/đã nhận first reward trước khi chạy. Client có `isDestUnlock()` nhưng server chỉ đọc `id/diff`, trừ cost rồi settle. Vì vậy client giả có thể sweep destination 2+ khi `dest` chỉ có destination 1.

Bằng chứng: `old-trek.js:983–1010`.

### P0 — `7005` kết thúc chuyến khi chưa tới đích

`7005` chỉ cần `trekData.uid` đúng (hoặc bỏ trống) là gọi `buildOldTrekSettlement()`. Không kiểm tra `dist + elapsed speed >= cfg.distance`, stable/event đang xử lý hay stage. Harness RAM tái hiện: `distanceBeforeFinish=0`, vẫn nhận `339 x50000` và cộng `totalDistance=2400`.

Bằng chứng: `old-trek.js:954–964`; client native xác định đến đích bằng `getCurDistance() >= destination.distance`.

### P0 — Arena OldTrek là stub/thắng cố định

- `7050` luôn tạo một robot cố định score `self-10`.
- `7051` nhận enemy từ client, tạo battle result cố định `win=1`, cộng đúng `+10`, cấp reward thắng; không kiểm tra vé `arenaCost`, không kiểm tra enemy snapshot/score, không kiểm tra stage/protection/replay/concurrency.
- `7060` cũng dùng battle result cố định, không mô phỏng combat thật.
- `7059` bị route sang `compat.handleOldTrekArenaInfo7059`, chỉ trả `result/arenaEnemy/weather/score` tối thiểu, không trả đầy đủ arena state mà client OldTrek khởi tạo.

Bằng chứng: `old-trek.js:1408–1431`, `old-trek.js:1458–1465`, `compat.js:913–928`, route `handlers/index.js:652–665`.

Probe handler mock read-only tái hiện: `7050` luôn enemy `000...002`; `7051` luôn `win=1`, score `1010`, reward `331 x100`; enemy battle profile bị thay bằng profile mặc định.

### P0 — Pass và growth package không có luồng mua/trao thưởng hoàn chỉnh

- `7044` tự tạo `passRecord` mới với `buyRecord: 1`, sau đó cho claim free rewards; không có server handler nào cập nhật bit mua pass/super pass từ payment.
- `7035` chỉ set `freeClaim` và trả `buildRewardInfo()` rỗng; không đọc `OldTrekSailorGiftConfig`/`OldTrekSailorGiftOpenConfig`, nên claim gói thủy thủ không trao quà.

Bằng chứng: `old-trek.js:1330–1360`, `old-trek.js:1214–1230`; toàn bộ `src` chỉ có các tham chiếu `passRecords` trong `old-trek.js`, không có payment/claim service OldTrek khác.

### P0 — Rank/leaderboard không phải bảng xếp hạng

`7046` và `7052` luôn trả một phần tử là chính người chơi, `rank=1`; `7049` lấy `dbid` từ request và không tra cứu profile. Không có query Mongo/Redis, snapshot cutoff, tie-break hay rank reward settlement. `7053` chỉ nhận score local và phát first reward theo bitmask.

Bằng chứng: `old-trek.js:1379–1406`, `old-trek.js:1433–1454`.

### P0 — Reward/settlement không có idempotency và nhiều nhánh tin client

Các nhánh reward gọi trực tiếp `addRewardToPlayer()` rồi save player; không có event key/receipt/claim ledger. `7002` lấy `rewards`, `itemUpdate`, `taskUpdate`, `effects`, `check` từ `currentEvent` trong DB nhưng không xác thực event UID/once-only. `7044` tự tạo pass record nếu chưa có và claim dựa trên `buyRecord` đã lưu; `7031`, `7032`, `7041`, `7053`, `7064` không có receipt chống retry.

Bằng chứng: `old-trek.js:615–635`, `old-trek.js:871–918`, `old-trek.js:1184–1200`, `old-trek.js:1289–1305`, `old-trek.js:1330–1360`, `old-trek.js:1440–1454`, `old-trek.js:1478–1492`.

### P1 — Nâng cấp/thủy thủ/formation thiếu giới hạn native và kiểm tra trạng thái

- `7022`, `7029`, `7034`, `7038` nhận slot/leader/skill/line từ client; không kiểm tra đầy đủ sailor sở hữu, slot khóa, duplicate line, skill đã mở hoặc đang sailing.
- `7024`, `7028` nâng level theo request/cost nhưng không kiểm tra cấp thuyền, giới hạn slot native và revision chống hai request đồng thời.
- `7033` kiểm tra cost/cấp nhưng không kiểm tra job/season/skill prerequisite đầy đủ.
- `7042` đổi skin chỉ dựa vào `shipSkins` và config; không có receipt/lock.

Bằng chứng: `old-trek.js:1048–1119`, `old-trek.js:1138–1160`, `old-trek.js:1202–1230`, `old-trek.js:1307–1312`.

Harness còn tái hiện: formation nhận sailor ID không sở hữu vào slot khóa; nâng sailor level `301` dù `OldTrekSailorLevelUpConfig` chỉ có đến `300`; claim gói thủy thủ chỉ set `freeClaim` nhưng reward rỗng; speed-up quảng cáo `ad=1` được chấp nhận không có proof; refresh lại sau ngày mới không reset daily-free; cache reward pending bị xóa khi refresh.

### P1 — Client và server không có contract lỗi nhất quán

Nhiều lỗi trả `result=1` hoặc object rỗng, không có mã lỗi/retryable/field authoritative. Khi `7000` không mở, response lồng `data: { result, data:null, effects:[] }` khác shape với response info bình thường. Điều này khiến client khó phân biệt retry, hết kỳ, thiếu cost, stale state.

Bằng chứng: `old-trek.js:510–536`, `old-trek.js:539–579`, `old-trek.js:836–843`.

### P1 — Read path ghi Mongo và dễ tạo race/stale save

`handleOldTrekInfo()` gọi `savePlayer()` cả khi chỉ đọc info. Gần như mọi action cũng save toàn bộ player document, không có OldTrek-specific revision/CAS. Hai request đồng thời có thể ghi đè sailor/formation/reward/arena state.

Bằng chứng: `old-trek.js:522–536`, `old-trek.js:912–918`, `old-trek.js:1507–1510`; cơ chế save chung ở `PlayerService.js:302+` không thay thế CAS theo từng OldTrek state.

### P1 — Task/pass dùng sai nguồn tiến độ và timezone

`7044` claim pass dựa trên `info.totalDistance`, trong khi client tính pass level theo `getDesTotalDest()` (task type `TOTAL_DIST` của destination). Người chơi có thể claim pass từ global distance dù destination chưa đạt mileage. `7064` dùng `new Date().toISOString()` (UTC) thay vì ngày game GMT+7, nên mốc reset cầu nguyện lệch 7 giờ.

Bằng chứng: `old-trek.js:1330–1360`, `old-trek.js:1478–1492`; client `main.min_drop100.js` `getPassLevel/getDesTotalDest`.

### P1 — Rollover reset sai theo mục tiêu nghiệp vụ nếu dùng scheduler 24/7

`rolloverPlayerSeason()` reset score, distance, map, log và chuyến đang chạy; nhưng không có snapshot/settlement rank trước reset, không gửi rank mail, không đóng receipt cũ, không freeze roster. Do đó mở mùa mới zero-downtime có thể làm mất dữ liệu xếp hạng mùa trước và không có phần thưởng cuối mùa.

Bằng chứng: `OldTrekScheduleService.js:86–119`.

### P1 — Dữ liệu live hiện chưa chứng minh chức năng hoạt động

Mongo live read-only:

| Server | Players | Có `oldTrekInfo` | `sailing=true` | `trekData != null` | `currentEvent != null` | Season |
|---|---:|---:|---:|---:|---:|---|
| S1 | 2.512 | 2.084 | 1 | 1 | 0 | 1 |
| S2 | 879 | 861 | 0 | 0 | 0 | 1 |
| S3 | 786 | 775 | 1 | 1 | 0 | 1 |
| S4 | 732 | 723 | 0 | 0 | 0 | 1 |
| S5 | 623 | 616 | 0 | 0 | 0 | 1 |

Hai chuyến live đang chạy có `dist=0`, `currentEvent=null`, `cabin=[]`; đây là bằng chứng trực tiếp rằng scheduler mở được entry nhưng gameplay loop chưa chạy.

Live source/client audit và harness: `_ai_workbench/tools/audit_oldtrek_live_20260920.py`, `_ai_workbench/tools/audit_oldtrek_contract_20260920.js`, evidence `_ai_workbench/temp/oldtrek_live_audit_20260920.json` và `_ai_workbench/temp/oldtrek_contract_audit_20260920.json`. Harness cô lập tái hiện **28/28** case, `productionPlayerWrites=0`, `networkAttempts=0`. `bid-king.js` live lệch local đúng một tùy chọn save (`returnSaved:false`), không thay đổi kết quả logic các case; cần CAS/hash lại nếu triển khai sửa.

## Chưa đủ bằng chứng để kết luận

- Lỗi hiển thị asset/Spine, bản đồ, mini-game UI và cache client cần native browser/device E2E; source hiện có đủ asset/config không chứng minh render đúng.
- Tỷ lệ/RNG event, công thức weather/effect, NPC và battle native cần contract chính thức hoặc client capture; không được tự đoán từ tên bảng.
- Không kết luận player nào đã mất reward vì chưa có ledger/mail/claim history OldTrek.

## Hướng fix chi tiết (chưa thực hiện)

### Bước 1 — Chốt contract và lịch

1. Quyết định giữ policy scheduler 7 ngày hay khôi phục `OldTrekOpenConfig`; không trộn hai nguồn.
2. Định nghĩa rõ stage `OFF/PREPARE/ON/WAITING_TO_SETTLE/RESULT`, server timezone, `matchId`, cutoff depart/settle, season key.
3. Viết contract request/response cho toàn bộ tag client gọi (`7000–7059`, `7060–7065`), gồm `code`, `retryable`, `revision`, `seasonKey`, `eventUid`.

### Bước 2 — Tách engine state machine server-authoritative

1. Tạo `OldTrekStateService`/`OldTrekEventService`: tick theo `lastUpdateTime`, tốc độ/độ bền, distance, event selection, dice, weather, effect duration, cabin, battle và offline settle.
2. Chỉ server được sinh event/reward; client chỉ gửi intent (`eventUid`, action, param, expected revision).
3. Kiểm tra destination/difficulty/season/stage/cost trước mọi mutation.
4. Bổ sung fixture cho toàn bộ 62 bảng; bảng nào không hỗ trợ thì fail-closed, không trả success giả.

### Bước 3 — Làm thật arena/rank/settlement

1. Arena: snapshot đối thủ server-side, trừ `arenaCost`, lock theo player, battle simulator/native contract, replay receipt và protection window.
2. Rank: projection Mongo/Redis theo season, loại bot, tie-break deterministic, snapshot cutoff.
3. Settlement: roster immutable, eventKey/mail deterministic, claim ledger, retry sau crash; rollover chỉ sau khi settlement hoàn tất.
4. Xóa route stub `7059` hoặc hợp nhất vào handler thật; không để hai implementation cạnh tranh.

### Bước 4 — CAS/idempotency và dữ liệu

1. Thêm `oldTrekStateRevision`, `seasonKey`, `receiptLedger`, `eventLedger`, `settlementLedger`.
2. Mỗi mutation dùng CAS theo `userId + seasonKey + revision`; retry cùng request trả lại response cũ.
3. Không save Mongo trên read path; dùng dirty flag và queue save có thứ tự.
4. Chỉ repair player sau snapshot/backup, đối soát ledger/mail trước; không phát bù theo số dư hiện tại.

### Bước 5 — Kiểm thử và phát hành

1. Unit/contract: từng tag, cost, duplicate, stale revision, replay, disconnect, timeout, rollover, rank tie.
2. Integration Mongo/Redis: crash giữa mutation và save, retry, settlement/claim/relog.
3. Native E2E: login → open → recruit → formation → start → accelerate → event → battle → end → pass/task/rank → relog; chạy player thật QA namespace, không dùng account thật.
4. Deploy rolling có backup/CAS/hash, readiness từng node, log invariant, `productionWrites=0` cho smoke; chỉ bật reward/settlement sau cutoff test.

## Kết luận

Sự kiện không hỏng ở một điểm duy nhất. Bản hiện tại là một “compatibility shell”: mở được menu và lưu một phần state, nhưng thiếu event engine, offline/tick, battle/rank/settlement native và idempotency. Vì vậy phần lớn chức năng có thể hiện nút nhưng không thể hoạt động chuẩn xác. Không nên tiếp tục vá từng tag hoặc mở reward production trước khi hoàn thành state machine + contract + ledger nói trên.
