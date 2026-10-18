# Triển khai fix Võ Đạo Hội – trạng thái 12/09/2026

## Đã thay đổi local

- `linhhoasu/lhs/newServer/src/handlers/arena.js`
  - BXH `2600` đọc Top-N từ Redis, tách khỏi challenge list.
  - State ngày/cooldown/bảo hộ; validate target và challenge version.
- Consume vé item 10, phí refresh item 2, lock theo player và receipt idempotency Redis; memory receipt chỉ bật cho test, production fail-closed khi Redis không sẵn sàng. Cap daily không ép mặc định vì config official chưa định nghĩa.
  - Snapshot attrs đối thủ thật; bỏ fallback silent sang target khác.
  - Score/reward config-driven, inventory delta, log player và `ArenaFightLog`.
  - Refresh trả metadata/cooldown và packet đồng bộ item.
- `linhhoasu/lhs/newServer/src/services/RankService.js`: rebuild rank từ Mongo projection.
- `linhhoasu/lhs/newServer/src/services/ArenaSettlementService.js`: settlement day/week idempotent qua mail `eventKey`; scheduler chỉ bật khi `ARENA_SETTLEMENT_ENABLED=1`.
- `linhhoasu/lhs/newServer/src/db/models/ArenaFightLog.js`: audit log unique theo `fightId`.
- `linhhoasu/lhs/newServer/src/handlers/account.js`: sync cả score 0 và retry rank pending.
- `linhhoasu/lhs/newServer/src/services/PlayerService.js`: khởi tạo vé item 10 cho player mới từ `ConstConfig`.
- `linhhoasu/lhs/newServer/src/app.js`: rebuild rank lúc boot và gắn settlement scheduler có feature flag.
- `linhhoasu/webgame/game/js/lhs-arena-v1.js` + `game/index.html`: client patch rank authoritative, refresh merge/pending guard, gửi challenge version, sửa self-rank sau render.
- Manifest/hash: `_ai_workbench/temp/vo_dao_hoi_fix_20260912/manifest.json` (`DEPLOYED_S1_S2_SERVER_QA_PASS_PLAYER_NATIVE_QA_PENDING`).
- Tool triển khai/QA: `_ai_workbench/tools/deploy_vo_dao_hoi_release.py`, `_ai_workbench/tools/upload_vo_dao_hoi_release.py`, `_ai_workbench/tools/qa_vo_dao_hoi_live_20260913.js` (credential không lưu trong file).

## Kiểm thử đã chạy

- `node --check`: arena, raid, account, RankService, ArenaSettlementService, PlayerService, app và client patch — PASS.
- `_ai_workbench/tools/test_server_input_freeze_contract.js` — PASS.
- `_ai_workbench/tools/test_vo_dao_hoi_fix_20260912.js` — PASS (13 checks).
- `_ai_workbench/tools/test_vo_dao_hoi_e2e_local_20260912.js` — PASS: mock flow mở 2600 → fight player thật, ticket `2→1`, daily count `0→1`, rank response authoritative.
- `npm run test:core-contract --prefix linhhoasu/lhs/newServer` — PASS (714 tables).
- `npm test -- --runInBand --passWithNoTests` — không có Jest test hiện hữu; lệnh kết thúc code 0 nhờ `--passWithNoTests`.

## Đã triển khai production có kiểm soát

- Fingerprint SSH khớp `SHA256:9hrzv0d3h/tdyep0ma+RUFi99n7YGXjQt3J4fI99osQ`.
- Backup remote: `/linhhoasu/_ai_workbench/backups/vo_dao_hoi_fix_20260913_predeploy`; CAS trước swap khớp đúng hash baseline.
- Đã deploy đúng 9 file, sau đó restart scoped `lhs-s1002` (restart `116→117`) và `lhs-s1001` (`1434→1435`); không restart các process khác.
- `/ready` S1/S2 đều `200`, Mongo/Redis healthy; hash disk/live sau deploy khớp manifest.
- Static public `:81/index.html` trả `lhs-arena-v1.js?v=20260912_arena_contract_v1`, patch HTTP `200`, hash khớp.
- Redis↔Mongo readback: S1 `331/331`, S2 `97/97`; top score rows khớp.
- Live server QA S2 PASS: tạo QA self/target → mở 2600 → snapshot target → đánh → vé `2→1`, lượt `0→1`, rank response, protect persisted, fight log tồn tại; cleanup readback players/accounts/logs/rank QA đều `0`.
- Slow-tail mẫu mới sau deploy: S1 3 mẫu p95 `578ms`, max `644ms`; S2 3 mẫu p95 `1123ms`, max `1560ms`. Đây chưa phải soak đủ dài.
- Hậu kiểm/soak lưu tại `_ai_workbench/temp/vo_dao_hoi_fix_20260912/live-postcheck.json`: 10 phút ready failures `0`, RSS ổn định, QA residue `0`, không có fatal/Arena error tail.

## Chưa được phép coi là hoàn tất 100%

- Chưa QA bằng tài khoản người chơi thật/native browser qua toàn bộ UI và relog.
- Score formula fallback (`10 + floor(diff/100)`, clamp 50) và policy hồi vé chưa có sign-off official; settlement `ARENA_SETTLEMENT_ENABLED` vẫn tắt.
- Exactly-once xuyên nhiều process/crash chưa có fault-injection Mongo transaction; receipt Redis có fail-closed nhưng chưa có outbox đầy đủ.
- Cần theo dõi tiếp 20–30 phút và xác minh settlement 23:00 trước khi mở payout.
- Chưa có native E2E tài khoản thật cho mở → refresh → đánh thắng/thua → relog.
- Chưa chạy rank DB↔Redis diff hoặc restore drill production.
- Score formula, giới hạn lượt/ngày, policy hồi vé và mapping reward thắng/thua vẫn cần game-design sign-off.
- Candidate đang dùng công thức đề xuất `clamp(10 + floor((điểm đối thủ - điểm mình)/100), 1, 50)` với dấu theo thắng/thua; **không còn ép cap 10 trận/ngày** vì config official chưa định nghĩa cap và ticket item10 mới là giới hạn đã thấy trong client. Công thức vẫn cần game-design sign-off.
- Lock hiện tại là per-process + receipt Redis; chưa có bài test CAS/transaction nhiều process với Mongo thật. Không coi mock E2E là chứng minh exactly-once xuyên crash/reconnect.
- Target protection và audit log được ghi detached; cần fault-injection/outbox gate trước khi gọi là bền vững hoàn toàn.
- Settlement scheduler đang **tắt mặc định**; chỉ bật sau dry-run, đối soát và duyệt payout.

## Rollback local

Backup trước thay đổi: `_ai_workbench/backups/vo_dao_hoi_fix_20260912_local/`.

Không phục hồi mù trên production. Khi rollback phải tắt feature flag, drain request, CAS/hash đối chiếu, giữ receipt/outbox và lập reconciliation ledger nếu đã phát sinh cost/reward.
