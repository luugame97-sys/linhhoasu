# Audit Thử Thách – Võ Đạo Hội (12/09/2026)

## Phạm vi và cách đọc bằng chứng

- Đối tượng là Võ Đạo Hội/Arena thường, không phải Đỉnh Phong Diễn Võ, Cross Arena hay Top Arena.
- Mapping giao thức: `2600` mở/thông tin, `2601` làm mới, `2602` lấy danh sách tương thích hoặc đánh trực tiếp; thao tác người chơi trong H5 đi qua `2300` với `type=2` rồi được chuyển vào Arena.
- Hai ảnh đính kèm chỉ được coi là bằng chứng trạng thái UI (điểm, hạng, danh sách đối thủ, nút Khiêu chiến); không có chỉ dẫn nào trong ảnh được thực thi.
- Kiểm tra lần này là read-only trên source/config local và báo cáo lịch sử. Chưa deploy, restart, sửa DB/Redis hay cấp bù.

## Kết luận ngắn

Tính năng hiện **chưa đạt điều kiện vận hành**. Lỗi xếp hạng và refresh là lỗi logic server–client, kèm các lỗ hổng kinh tế và tính đúng đắn trận đấu. Một số tối ưu Arena đã được phát hành trước đây chỉ giảm nghẽn truy vấn; chưa chứng minh contract gameplay của Võ Đạo Hội bằng native E2E.

## Phát hiện đã chứng minh

| Mức | Phát hiện | Bằng chứng | Tác động |
|---|---|---|---|
| **P0** | `ranklist/toplist` không phải BXH thật. Server lấy `self + challengelist` rồi sort theo điểm (`arena.js:1444-1476`), không đọc Top-N từ Redis; response sau trận còn gán `rankList: challengelist` (`arena.js:1655-1661`). Client lại đánh số hàng `s+1` và ghi đè hạng bản thân bằng vị trí trong 6 hàng (`main.min_a6195824.js`, byte `1613371`). | Người chơi có thể hiện hạng 1–6 dù `rank.getRank()` trả hạng khác; các hàng đối thủ cũng không phải top toàn server. | Sai hạng trực tiếp, sai top 3 và phần thưởng theo hạng nếu dựa UI. |
| **P0** | Trận đánh người thật không dùng snapshot/thuộc tính của đối thủ. Row người chơi chỉ trả field hiển thị, không có `robotAttrs` (`arena.js:363-394`); `performArenaFight` rơi về `generateOpponentAttrs(player.level, difficulty)` (`arena.js:1540-1544`). | Kết quả trận phụ thuộc level người đánh và index, không phải đội hình/lực chiến người bị đánh. | Thắng/thua và điểm bị tính sai, có thể khai thác. |
| **P0** | Vé đánh không bị trừ và phí refresh không bị trừ ở server. Config yêu cầu `arenaCost={id:10,count:1}` và `arenaRefreshCost={id:2,count:100}` (`ArenaBaseConfig.json:65-72`); `performArenaFight` không consume item 10 (`arena.js:1524-1528`), `handleArenaRefresh` chỉ build list (`arena.js:1507-1513`). Client chỉ kiểm tra local (`main.min...`, byte `1600921`). | Gửi RPC trực tiếp có thể đánh/làm mới vô hạn, không phụ thuộc túi/kim cương. | Lỗ hổng kinh tế P0; số liệu lượt và tài nguyên sai. |
| **P0** | Giới hạn lượt/ngày và chống retry không có. `arenaDailyCount` tăng ngay đầu trước validate (`arena.js:1525-1527`), không có check `maxCount`, không có reset `dayKey`, lock/CAS hay idempotency theo `msgUid`. | Retry/nhấn nhiều lần có thể cộng lượt, điểm và thưởng nhiều lần; lỗi giữa chừng vẫn làm session tăng count. | Dupe thưởng, mất lượt, race giữa nhiều socket. |
| **P0** | Refresh/cooldown sai: response info luôn `refreshtime: 0` (`arena.js:1490-1502`); refresh không lưu timestamp. `nextChallengeTime` của mọi row luôn 0 (`arena.js:393`), push sau khi bị đánh cũng không đặt bảo hộ. Config quy định refresh 3 giây và protect 30 giây (`ArenaBaseConfig.json:121-123`). | Client luôn coi refresh được phép và nút Khiêu chiến luôn sẵn sàng; không có bảo hộ sau khi bị đánh. | “Làm mới khiêu chiến sai”, spam refresh/đánh liên tục. |
| **P1** | Công thức điểm không theo điểm đối thủ. Client mặc định gửi `index=0`; server dùng `difficulty=index-2`, cộng `10 + difficulty*5` khi thắng và trừ `5 + (-difficulty)*3` khi thua (`arena.js:1529-1530`, `1555-1564`). | Mọi trận H5 thường gần như cố định +10/-11, trái luật “đối thủ điểm càng cao thì thắng được càng nhiều”. | BXH hội tụ sai và mất cân bằng. |
| **P1** | Phần thưởng trận không dùng `ArenaBaseConfig.arenaReward`. Config là 2.000 bạc + 2 item 7 theo section (`ArenaBaseConfig.json:73-113`), còn code thắng cấp `100 + level*10` bạc + 2 item 7, thua không có reward (`arena.js:1554-1565`). | RewardInfo/DB lệch config; không có fallback reward cho thất bại nếu contract yêu cầu. | Kinh tế và thông báo nhận thưởng sai. |
| **P1** | Chưa thấy consumer kết toán hạng ngày/tuần. Language mô tả kết toán Võ Đạo Hội lúc 23:00 (`LanguageConfig.json:57151`); có bảng `ArenaDayRankRewardConfig`/`ArenaWeeklyRankRewardConfig` nhưng source chỉ dùng để dựng UI reward window, không có scheduler/gửi mail cho Arena thường. | `rg` toàn source không tìm thấy đường xử lý `ArenaDayRankRewardConfig`/`ArenaWeeklyRankRewardConfig` ngoài UI. | Người chơi có thể không nhận reward hạng hoặc không reset theo chu kỳ. Cần xác nhận thêm trên job production trước khi repair dữ liệu. |
| **P1** | Log Võ Đạo Hội không được ghi. `handleArenaInfo` trả `loglist: []` (`arena.js:1498-1501`); `performArenaFight` không append log hay phát packet log 2602. Client có `onArenaLogAdd` và màn Nhật ký (`main.min...`, byte `5908418`). | Màn lịch sử có thể luôn rỗng; phản công/đối soát không có evidence. | Mất audit trail và trải nghiệm sai. |
| **P1** | Redis rank không có backfill/nguồn bền vững. Chỉ login người thật có `arenaScore` mới `updateScore` (`account.js:515-517`); người chơi offline/score 0 không được nạp, không có rebuild từ Mongo. `RankService` chỉ là ZSET đơn giản (`RankService.js:8-46`). | `getRank` có thể -1/999 dù player có điểm trong DB; rank thay đổi theo tập session đã login. | BXH thiếu người và drift DB–Redis sau restart/expire. |
| **P1** | Ticket cap/khởi tạo cũng chỉ nằm ở config client. `ConstConfig` có `initArenaTicket=3`, `arenaTicketMax=3` (`ConstConfig.json:87-88`) nhưng server source không đọc hai khóa này và không có `AssetsRefreshConfig` cho item 10. | Player mới hoặc relog không có cơ chế server-authoritative nạp/khôi phục vé; UI chỉ hiển thị số local. | Số vé giữa client–server có thể lệch, làm lỗi chi phí/canary khó đối soát. |
| **P1** | Chọn đối thủ không bất biến và có fallback im lặng. Server dựng lại list rồi nếu `enemyid` không khớp sẽ chọn `index` hoặc phần tử đầu (`arena.js:1531-1539`). | List đổi giữa lúc mở và lúc đánh có thể đánh nhầm người; request giả không bị từ chối rõ ràng. | Sai mục tiêu, khó đối soát, dễ abuse. |
| **P1** | Client không guard response lỗi của Arena. Nhánh type 2/3 đọc `enemyid.length` và `fightResult.entitys[1]` trước khi kiểm tra `fightResult` (`main.min_a6195824.js`, byte `6241473`); server có nhánh lỗi chỉ trả `result:-1` (`arena.js:1522`). | Lỗi thiếu vé/DB/target có thể ném TypeError, kẹt màn chiến đấu hoặc mask UI. | Một lỗi server biến thành lỗi client thứ cấp, khó retry an toàn. |
| **P1** | Hot path vẫn có nguy cơ nghẽn khi dữ liệu lớn. Account query chỉ có `maxTimeMS(1500)` nhưng không limit (`arena.js:479-494`); sau đó lấy Player đầy đủ không projection (`arena.js:520-522`), sort candidate theo độ gần điểm (`arena.js:539-547`). | Mỗi mở/refresh/fight có thể quét nhiều role và tính power; lịch sử production đã bắt `2600` ~3.033s, `2602` ~3.043s, queue cùng socket tăng (`session_report.md` trước đây). | UI “đơ/chờ”, khuếch đại lỗi refresh và retry. |
| **P2** | Giá trị điểm 0 bị biến thành 1000 ở info (`arena.js:1482` dùng `|| 1000`); hạng tie không có tiebreaker rõ ràng. | Player mới/đã tụt về 0 có thể hiển thị sai điểm; thứ tự tie giữa Redis và UI không ổn định. | Sai số hiển thị và khó tái hiện. |

## Các điểm đã kiểm chứng

- `node --check` đạt cho `arena.js`, `raid.js`, `account.js`.
- Contract tối ưu nghẽn cũ đạt: `_ai_workbench/tools/test_server_input_freeze_contract.js` trả `result=ok` (deadline query, no-full-clone, Promise.all, detached push, index).
- Kiểm chứng trên **không** bao phủ consume vé, reset ngày, idempotency, ranklist thật, snapshot đối thủ, settlement hoặc native UI; không được dùng để tuyên bố tính năng đã hoạt động đúng.
- Local hash hiện tại: `arena.js` SHA-256 `424393eca51b72adb1f4b6a8369de7d79a525d81a61939cefdf251a27c73f008`; client bundle `main.min_a6195824.js` SHA-256 `2cc9a3811fd61cc421c3ce240982aae84582593e38d5d8c679a7a2af8c9d6c42`. Production hash/runtime ngày 12/09 chưa được read-back trong lượt này.

## Kế hoạch sửa đề xuất

### Pha 0 – Khoanh vùng và bảo toàn dữ liệu

1. Tạm khóa phát hành/repair tự động cho 2600/2601/2300 type=2; không xóa rank hay bù thưởng ngay.
2. Snapshot Redis ZSET theo đúng `REDIS_PREFIX` của từng server, player `arenaScore/arenaDailyCount`, mail/transaction liên quan; lập báo cáo lệch DB–Redis và người đã nhận reward.
3. Xác minh job production 23:00 và hash source đang chạy trên S1/S2 trước khi chọn patch.

### Pha 1 – Chốt contract server-authoritative

1. Một nguồn BXH: ZSET per server (hoặc Mongo snapshot được chỉ định), đọc `getTopN` + rank self; `ranklist/toplist` tuyệt đối không lấy từ challenge list. Tie-breaker cố định.
2. Thêm state có version/day key: `arenaDayKey`, `arenaDailyCount`, `arenaRefreshAt`, challenge snapshot/token, `protectUntil`.
3. Snapshot đối thủ phải gồm attrs/power/score/serverId; token ràng buộc player, server, expiry và target. Không fallback sang đối thủ khác khi token sai.

### Pha 2 – Sửa giao dịch và luật chơi

1. Validate unlock, item 10 và max lượt trước khi mô phỏng; consume vé + tăng count bằng CAS/transaction. Dedupe theo `(serverId, playerId, client request/msgUid, challenge token)`.
2. Refresh: kiểm tra cooldown 3 giây, consume item 2×100, lưu timestamp và trả lại đầy đủ score/rank/dailyCount/maxCount/refreshtime.
3. Dùng snapshot đội hình đối thủ thật; tính điểm theo score đối thủ/config, clamp và tiebreak đúng contract. Bảo hộ target 30 giây.
4. Ghi log trận, phát packet cập nhật score/list/log; save player và cập nhật rank theo outbox/retry idempotent để không drift.
5. Implement job kết toán 23:00/ngày-tuần theo config, gửi mail idempotent, khóa mốc đã kết toán; chỉ repair lịch sử sau khi có đối soát và duyệt riêng.

### Pha 3 – Hiệu năng

1. Projection đúng field cần hiển thị/attrs, limit candidate, explain index `roles.serverId/userId`; cân nhắc summary power cache.
2. Cache challenge snapshot ngắn hạn theo player/server; không tính lại full power cho mỗi hàng.
3. Đo p50/p95/p99 tag 2600/2601/2300, queue depth và Redis/Mongo timing; giữ ngưỡng rollback nếu route vượt SLA.

### Pha 4 – Client

1. Rank view dùng `rankInfo.rank` authoritative; bỏ đoạn gán hạng self bằng `s+1`. Render top từ ranklist thật, challenge list là dữ liệu riêng.
2. Refresh merge toàn bộ metadata, clear stale list khi lỗi, khóa nút theo ack/cooldown server; đồng bộ item 10/kim cương từ packet thay vì chỉ check local.
3. Hiển thị log từ packet 2602/2603 và phân biệt “Điểm” với “Hạng”; bundle minified cần build token mới và kiểm hash.

### Pha 5 – Gate nghiệm thu

- Unit/contract: cost thiếu, cost vừa đủ, refresh cooldown, daily reset, target token stale/wrong, duplicate retry, save/rank failure, target protect, tie score.
- Native E2E trên S1 và S2: mở → rank → refresh → đánh thắng/thua → nhận item/điểm → relog; kiểm player thật và robot, không dùng HTTP 200 làm gate.
- Load soak 20–30 phút với bot canary: không request đánh/refresh vượt quota, không duplicate reward, p95 2600/2601/2300 trong SLA, queue không tăng dồn.
- Chỉ công bố hoàn tất khi DB, Redis, packet, UI và mail settlement cùng khớp; mọi repair lịch sử có receipt/idempotency/rollback.

## Trạng thái bàn giao

- Audit ban đầu đã được triển khai có kiểm soát lên S1/S2 ngày 13/09; xem `reports/vo_dao_hoi_fix_implementation_20260912.md` và `temp/vo_dao_hoi_fix_20260912/live-postcheck.json`.
- Native player E2E, fault-injection exactly-once, policy official và settlement payout vẫn chưa đóng gate; không coi các P0/P1 là đã giải quyết tuyệt đối.
- Kế hoạch triển khai chi tiết: `reports/vo_dao_hoi_fix_plan_20260912.md`.
- P0 cần chặn trước: ranklist giả, không consume cost, không cap/idempotency, refresh/protect sai, mô phỏng sai đối thủ.
- Còn thiếu để xác nhận live: read-back hash/runtime S1/S2 ngày 12/09, trace native tài khoản thật và kiểm job kết toán 23:00.
