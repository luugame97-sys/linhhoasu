# Hoang Cổ Mê Hàng P1–P11 — native-compatible approximation release (21/09/2026)

## Kết luận trạng thái

Đã triển khai bản **compatible approximation** theo thứ tự P1–P11 trên code/runtime. Đây không phải công thức server Trung gốc 100%; phần tự thiết kế được đánh dấu trong `oldTrekGameplayPolicy.json`.

`P11` native full E2E chưa đạt vì browser QA hiện chỉ ở màn hình login; không tự nhập credential/player thật. Do đó trạng thái tổng thể là `DEPLOYED_APPROXIMATION / NATIVE_E2E_PENDING`, không gọi là bản gốc hoàn toàn.

## P1–P11

| Phase | Trạng thái | Nội dung |
|---|---|---|
| P1 | PASS | Baseline, backup, CAS, feature flags, contract scope. |
| P2 | PASS | `checkpointTrek`, elapsed distance, stable debuff, pass speed, rollback-safe timestamp. |
| P3 | DEPLOYED | `7000/7005/7009`, `7002`, event UID/revision, event chain, dice/check, battle event, minigame score policy. |
| P4 | DEPLOYED | Durable-in-player `eventLedger/rewardLedger/trekReceipts/actionLedger`, request replay and save-CAS. |
| P5 | DEPLOYED | Music Master/Pinball/Spot Difference dùng native UI; Puzzle approximation 3x3 proof server-side. |
| P6 | DEPLOYED | Sailor ownership, slot/line/leader/skill checks, morale, level/star caps, daily reset GMT+7, growth package. |
| P7 | DEPLOYED | Arena snapshot, deterministic approximate battle, ticket/cooldown, real roster rank projection, replay record. |
| P8 | DEPLOYED | Season archive, paid-pass retention, settlement roster/mail/claim-ledger, cutoff scheduler. Scheduler flag đã bật nhưng season hiện tại chưa tới cutoff. |
| P9 | PARTIAL | Crash/replay/CAS/Mongo QA đã PASS; reward cutoff chưa quan sát live vì chưa tới kỳ kết toán. |
| P10 | PARTIAL | Client error guard + Puzzle addon đã upload; web assets không restart. |
| P11 | PENDING | Native login → OldTrek → full interaction chưa chạy vì thiếu thao tác xác thực/player thật. |

## Automated / isolated evidence

- `test-oldtrek-events.js`: 490 assertions, 464 root variants, invalid edges 0.
- `test-oldtrek-domain.js`: 27 tests.
- `test-oldtrek-travel_hardening_20260921.js`: 13 tests.
- `test-oldtrek-settlement.js`: 8 groups.
- `test-oldtrek-puzzle.js`: 4 seeds + 4 invalid proofs.
- `test-oldtrek-pass.js`: 8 products / duplicate / token / typed sailor.
- `test-oldtrek-cas.js`: 2 CAS groups.
- `test-oldtrek-mongo.js`: 7 Mongo QA groups on isolated DB, dropped afterward.
- Core table contract: 717 tables PASS.
- All tests used `productionWrites/playerWrites=0` except the separately controlled production deployment itself; no real player mutation was used for smoke.

## Production release

- Candidate server hash: `old-trek.js` `9b4cda8a...`; full deployment rollout completed S1–S5.
- PM2: `lhs-s1001`–`lhs-s1005` online.
- Readiness: `8080`, `8083`, `8084`, `8085`, `8086` all HTTP `200`.
- Runtime flags: `OLD_TREK_EVENT_ENGINE_ENABLED=1`, `OLD_TREK_SETTLEMENT_ENABLED=1`, activation `1789956000000` (21/09/2026 09:00 GMT+7).
- Full backup: `/linhhoasu/_ai_workbench/backups/oldtrek_v2_full_20260921_113730`.
- Client backup: `/linhhoasu/_ai_workbench/backups/oldtrek_client_minigame_20260921_113950`.
- Client addon hashes: error guard v2 `5ff7dc96...`, Puzzle addon `1ffeb549...`; no web/game service restart.

## Policy approximation disclosure

The following values are owner-approved design choices, not recovered original CN server rules:

- event encounter distance `600`;
- event type weights `{1:45, 2:10, 3:10, 4:20, 6:15}`;
- terminal rewards `331 x100` success / `331 x25` failure;
- ship exp `100` per terminal event;
- cargo chance `25%`;
- approximate 3-line battle formula, 20-round cap, rating delta up to 32;
- 3x3 Puzzle approximation for missing CN Puzzle UI.

These are config-versioned and can be replaced later without changing receipts/keys.

## Known limitations / follow-up

- Need user/native QA login to complete P11 and observe at least one real event, minigame, battle, reward retry and relog.
- Need inspect first real OldTrek season cutoff: settlement roster, Mail count, `eventKey`, claim ledger, no duplicate reward.
- Post-restart log contained managed-bot login deadline warnings during the rollout burst and historical EPIPE; no new OldTrek-specific error appeared after 11:41. Treat this as rollout-load evidence, not a gameplay PASS.
- Historical log contains old Redis `Connection is closed` messages from prior restarts; no new OldTrek-specific error was observed in the post-deploy probe, but monitor remains required.
- The policy must not be described as CN-original until an official server contract or packet capture confirms it.
