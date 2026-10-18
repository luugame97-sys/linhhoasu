# Audit TopArena / Đại hội Thiên Hạ Đệ Nhất Luận Đạo — 27/09/2026

## Phạm vi và an toàn

- Read-only source/config/live inventory; các fixture dùng `savePlayer`/CrossEvent stub trong RAM.
- Không tạo tài khoản, không gọi RPC production, không ghi Mongo/Redis/player (`productionWrites=0`).
- Live inventory lúc `2026-09-27T12:17:58Z`: S1–S4 PM2 online, readiness 4/4 HTTP 200, không có match lỗi TopArena trong log tail.

## Lỗi đã xác minh

1. `handlers/arena.js:3114-3247` không trừ `TopArenaBaseConfig.auditionCost` (item 180), không kiểm vé/số lượt/giai đoạn/khóa thuộc tính. Thưởng thắng bị hardcode item 2 `200 + level*20`, không dùng `auditionReward`/`auditionFailReward`. RAM fixture với item 180 = 0: hai lần đánh đều `result=0`, thắng, nhận item 2 x2600, vé vẫn 0.
2. Chọn đối thủ sai: `arena.js:3141-3147` lấy `sharedTarget` theo chỉ số sau khi lọc roster, không đối chiếu `requested enemyid`. Fixture yêu cầu B với index 0 trả entity `dbid=B` nhưng tên/level/power của A.
3. Combat không dùng snapshot thuộc tính: `arena.js:3150-3155` gọi `generateOpponentAttrs(level, rankDelta)`; `buildTopArenaRobotShowInfo` (1903-1929) sinh power giả, bỏ qua `TopArenaRobotConfig` và thuộc tính khóa trước Top 64.
4. Luồng vòng loại/knockout chưa có authoritative state: rank mặc định 200, trần custom 2000; room tự sinh 8 robot (2080-2092), rank payload chỉ 20 dòng (1989-2017), không có chuyển 8→4→2→1 hoặc winner/round settlement dùng chung.
5. Dự đoán `6213` (4054-4084) nhận `count` tùy ý, không kiểm giai đoạn, min/max/odds, tài nguyên, receipt/CAS. Fixture count `999999` trả `result=0`, roomGuess tăng 999999, currency/items không đổi.
6. Pass `6220` (4298-4317) hardcode item1 x20 + item2 x500, không đọc `TopArenaPassConfig` (chỉ day 1–4/5), không khóa ngày/claim receipt. Gọi hai lần tăng passRecord 1→2 và trả thưởng giống nhau. Live S1 có passRecord tới 36, S2 tới 25.
7. `6216` chỉ đánh dấu worship nhưng chưa có phase gate; `6221` (4320-4346) tự chèn log thắng giả khi log rỗng.
8. Settlement `CrossEventSettlementService.rewardsFor` chỉ chọn `TopArenaBattleRankRewardConfig`; chưa kết toán/phát `TopArenaBetRankRewardConfig`, `TopArenaHotRankRewardConfig`, pass/bettor ledger. Live C1 đang mở nhưng `crosseventsettlements` TopArena chưa có bản ghi.
9. Live roster hiện không đầy đủ: C1 TopArena chỉ có 4 `CrossEventEntry` S1 (score 1803–1807), trong khi `topArenaInfo` có 13 player S1 và 5 player S2; entry chỉ được upsert sau fight, nên người đã vào nhưng chưa đánh không nằm trong roster cuối kỳ.

## Đối chiếu client native và runtime hiện tại

- Bundle native `TopArenaModel` dùng stage `1` cho vòng loại, `2–5` cho các vòng tiến cấp và `6` cho settlement; `checkGuessOpen()` chỉ mở ở stage `3`, battle/room dùng stage `4–5`, còn settlement dùng stage `6`. Client cũng dùng `playerInfo.round`, `playerInfo.pass` và `playerInfo.passRecord[day]` (bitmask nhận thưởng theo ngày).
- Server `CrossEventScheduleService.topInfo()` hiện chỉ trả stage `1/2`, `round: 1`; packet `6200` gửi `round: -1` và `passRecord` dạng số. Vì vậy sau mốc promotion, client không thể chuyển đúng 64→8→chung kết/settlement; pass UI/claim state cũng không tương thích native.
- Tại thời điểm kiểm tra `2026-09-27T12:39:04Z`, cycle TopArena C1 là `2026-09-21 00:00`–`2026-09-28 00:00` GMT+7, `matchId=10001`, `topInfo.stage=2`, dù ảnh UI thể hiện các mốc đến `Cấp 8/Thành thạo` ngày 25–26/09. Đây là bằng chứng metadata runtime không theo kịp lịch vòng, không phải lỗi cache đơn thuần.
- Audit readiness live lúc `2026-09-27T12:36:30Z`: S1–S5 HTTP 200; S6/8087 trả mã `000` và body cũ. PM2 S6 vẫn `online`, nhưng cần xử lý readiness riêng trước khi xem là đủ điều kiện rollout đồng loạt.

## Kiểm thử

- `node --check`: `arena.js`, `CrossEventScheduleService.js`, `CrossServerEventService.js`, `CrossEventSettlementService.js`, `lhs-cross-events-v2.js` — PASS.
- `test-parallel-events-client.js`: 13 checks PASS.
- `test-competitions-v3.js`: 43 checks PASS (CrossArena, không chứng minh TopArena).
- `test-parallel-events.js`: FAIL ở assertion cũ S4 phải ngoài pool; cấu hình hiện tại `serverPool.autoInclude` cho phép 1001–1099, nên test cần cập nhật, không phải bằng chứng TopArena runtime hỏng.

## Hướng sửa an toàn (chưa triển khai)

- Xác định một state/roster TopArena dùng chung theo cycle; chốt eligibility, 512/64 roster và locked snapshot trước `attrsLockTime`; CAS transition round/winner.
- Khi fight, xác thực `cycleKey`, phase, target ID thuộc roster/room; dùng đúng locked attrs/power của target; atomic debit item 180 và receipt idempotent; thưởng lấy đúng config.
- Dự đoán/pass/worship dùng phase + giới hạn config + ledger/receipt, kiểm tài nguyên và không tạo log giả.
- Settlement snapshot riêng battle/hot/bet/pass, phát mail theo eventKey deterministic; bổ sung test RAM, Mongo/WS read-only rồi mới backup/CAS deploy.
- Trước khi sửa gameplay cần chốt mapping stage/round theo `Room_Config` và cách migrate dữ liệu `topArenaInfo` cũ; không đổi trực tiếp `round/passRecord` của người chơi production nếu chưa có snapshot/CAS/rollback.

## Đối chiếu client Cozy (read-only)

- Bản Cozy `_ai_workbench/temp/cozy_rip/main.min_a6195824.js` dùng cùng các RPC TopArena (`2350`, `6200–6203`, `6210–6218`, `6220–6221`), nên không có một giao thức khác có thể port trực tiếp để thay thế server state.
- Client Cozy chỉ có hai điểm hữu ích để tham khảo: guard `lhsTopArenaPlayerIdentity` chỉ coi `enemyid` số và tồn tại trong `TopArenaRobotConfig` là robot (tránh biến `playerId` thật thành robot), và xóa cache `TopArenaModel` khi cycle đổi.
- Contract stage của client: `stage > 1` mới gọi match info; stage `3` mở dự đoán; stage `4/5` tải room; stage `5` đánh vòng; stage `6` tải show/settlement. Server `CrossEventScheduleService.topInfo()` hiện chỉ sinh stage `1/2`, nên các phase sau không thể vận hành đúng dù RPC trả thành công.
- Kết luận: Cozy hữu ích cho guard identity/cache và cách client tiêu thụ response; không nên port nguyên bundle hoặc dùng nó làm bằng chứng server combat/settlement đã đúng.

## Mismatch config đã xác minh

- `arena.js:55–56` đặt `TOP_ARENA_DEFAULT_RANK=200`, `TOP_ARENA_MAX_RANK=2000`, trong khi config native đặt `auditionInitialRank=999`, `auditionMatchEnemyNum=5`, `auditionMatchEnemyRange=[2000,2000,2000,2000,2000]` và `TopArenaRobotRuleConfig` chỉ phủ rank 1–999.
- `buildTopArenaRankList()` sinh 6 đối thủ quanh rank (offset -3..+3), không đọc `auditionMatchEnemyNum`/`auditionMatchEnemyRange`; `buildTopArenaRobotShowInfo()` cũng hardcode power/name/equip/fashion thay vì lấy `TopArenaRobotConfig` (ID 1–60).
- Đây là mismatch có thể tái hiện từ source/config, gây hiển thị rank/robot không tồn tại hoặc power sai. Trước khi sửa cần chốt dùng config native hay đặc tả custom, không tự trộn hai hệ.

- Cozy `TopArenaMainView` tạo các tab theo `matchMode` 512 → 64 → 8 và chỉ chuyển sang tab kết quả khi `stage=6`; `onStageUpdate` dùng stage `2–4` cho các vòng. Điều này khớp bố cục ảnh người dùng gửi, nhưng không khớp `topInfo()` hiện chỉ trả stage `1/2`, round `1`.
- Với cycle live `C1` bắt đầu `2026-09-20T17:00Z`, các offset config cho ra promotion `09-23T05:00Z`, attrs lock `09-24T17:00Z`, settle `09-26T05:10Z`, end `09-27T17:00Z`. Tại lúc audit `09-27T12:20Z`, stage native phải là giai đoạn kết toán (6), nhưng server vẫn trả stage 2.
