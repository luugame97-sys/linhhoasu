# Hoang Cổ Mê Hàng — Phase 3 hardening / event contract defer (21/09/2026)

## Đã thực hiện

- Giữ server event engine ở trạng thái **OFF**; không tự đặt luật chọn event/tần suất/xác suất khi `OldTrekCommonEventConfig` không có weight/trigger policy rõ ràng.
- `7002` không còn tin event/reward-shaped payload từ client:
  - UID sai: `OLD_TREK_EVENT_UID_INVALID`.
  - Event không có: `OLD_TREK_EVENT_NOT_FOUND`.
  - UID đúng nhưng chưa có event policy/ledger: `OLD_TREK_EVENT_POLICY_REQUIRED`.
  - Không xóa event, không ghi log, không trao reward trong các nhánh bị từ chối.
- `7001` trả event pending/update authoritative và chặn thao tác tiếp theo khi event đang chờ.
- `7005` dùng UID bắt buộc, kiểm pending event và receipt retry.
- Save path OldTrek phase 1/3 chạy qua `PlayerMutationService`; save không xác nhận trả lỗi, không báo thành công giả.
- `checkpointTrek` dùng native base speed, pass speed privilege và stable debuff cho boost; chống clock rollback.
- Server receipt tạm cho settlement retry trong RAM/player state; chưa bật reward ledger chính thức cho event.

## Đính chính đối chiếu client

- Client native dùng `TaskType.Score = 4` cho difficulty unlock; server/test đã sửa lại theo đúng native. Không dùng `TOTAL_DIST=5` cho gate này.
- Local hiện đã có `OldTrekMusicMaster`, `OldTrekPinball`, `OldTrekSpotDiff`; chỉ `OldTrekPuzzle` còn thiếu so với CN mới. Chưa port Puzzle.

## Test

- `test_oldtrek_travel_hardening_20260921.js`: **13/13 PASS**, gồm retry, concurrent finish, ambiguous save, pass speed, stable debuff, invalid multi, pending event, sweep gate, event payload rejection.
- `test_oldtrek_core_fix_phase1_20260921.js`: **9/9 PASS**.
- `test_oldtrek_event_engine_phase3_20260921.js`: **8/8 PASS** (engine deferred/contract rejection).
- `test_oldtrek_schedule.js`: **4/4 PASS**.
- Node syntax: PASS.
- `realPlayerWrites=0`, `networkAttempts=0` trong harness.

## Production

- Server hash live/candidate: `3d5afc1b3338fd68cffca8d1da7c7be694dd2a43f25ea25983402b40c4819d35`.
- Backup: `/linhhoasu/_ai_workbench/backups/oldtrek_phase3_event_contract_20260921_005345`.
- S1–S5 online; readiness `8080/8083/8084/8085/8086 = 200`.
- Feature flag engine giữ tắt; không phát event/reward mới.

## Client error guard

- Đã thêm `lhs-oldtrek-errors-v1.js` để callback native không chạy success khi server trả lỗi `7000/7001/7002/7004/7005/7009`.
- Index production đã có reference guard nhưng addon ban đầu bị thiếu; đã upload bổ sung và xác minh HTTP/hash:
  - addon SHA-256 `9c739b1ea49055e531931dd629c849c91b614e37eb573985af9381b4d24b66b7`.
  - backup index: `/linhhoasu/_ai_workbench/backups/oldtrek_guard_20260921_005306`.
- Không restart service cho client asset release.

## Chưa làm

- Chưa bật event engine.
- Chưa tạo reward/event ledger durable.
- Chưa port Puzzle.
- Chưa sửa sailor/formation/skill, arena/rank, rollover/settlement.

## Bước kế tiếp

Thiết kế durable `eventLedger/rewardLedger` và fixture event policy từ client Trung trước khi bật bất kỳ event sampler nào.
