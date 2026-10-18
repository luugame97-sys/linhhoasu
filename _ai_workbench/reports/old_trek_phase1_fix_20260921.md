# Hoang Cổ Mê Hàng — Phase 1 core gate/checkpoint fix (21/09/2026)

## Phạm vi

Đã triển khai lát sửa nền tảng đầu tiên, chưa port mini-game Trung và chưa bật event/rank settlement:

- `7000`: server kiểm tra stage/depart window, không cho chuyến thứ hai, kiểm tra destination/difficulty unlock và cost.
- `7001`: checkpoint elapsed distance trước khi accelerate; chặn accelerate khi event đang chờ hoặc đã tới đích; trả `revision`/`code` lỗi.
- `7005`: checkpoint trước settle và từ chối nếu chưa tới đích; không phát reward sớm.
- `7009`: chặn sweep khi đang sailing hoặc destination chưa unlock.
- Thêm `oldTrekInfo.stateRevision` additive và tăng revision ở các mutation phase 1.
- Difficulty unlock dùng đúng native `TaskType.Score = 4`.

## Kiểm thử local

- `_ai_workbench/tools/test_oldtrek_core_fix_phase1_20260921.js`: **8/8 PASS**.
- `_ai_workbench/tools/test_oldtrek_schedule.js`: **4/4 PASS**.
- `node --check old-trek.js`: PASS.
- Không network, không Mongo/player write trong test local.

Các case đã tái hiện/được chặn: destination lock, double start, elapsed checkpoint, early finish, valid arrival finish, locked sweep, difficulty Score gate.

## Triển khai production

- Backup lần 1: `/linhhoasu/_ai_workbench/backups/oldtrek_phase1_deploy_20260921_002345`.
- Backup lần 2 sau khi sửa gate difficulty: `/linhhoasu/_ai_workbench/backups/oldtrek_phase1_deploy_20260921_002545`.
- CAS trước swap: live hash cũ `c81ab9df8766deccfd4a957e5255182e250ea6df7f25f1bd44dad717fae74aa5`.
- Candidate/live hash sau deploy: `3123ff993be9f59951155ee3e396155d5f5011fb2b3cf83b9673b3f3c65d5220`.
- Rolling restart: `lhs-s1001` đến `lhs-s1005`, tất cả online.
- Readiness hậu kiểm: `8080/8083/8084/8085/8086` đều HTTP `200`.
- Deploy script báo `productionWrites=0`, `playerWrites=0`; không chạy RPC/player smoke mutation.

## Giới hạn còn lại

- Event engine vẫn chưa được triển khai: server chưa sinh event/tick/weather/effect/offline event.
- Arena/rank/settlement vẫn là phần chưa sửa.
- Mini-game Trung vẫn chưa port; client local chưa có Puzzle/Pinball/Music Master/Spot Difference.
- Log có `Connection is closed` đúng thời điểm restart 00:23:47; chưa thấy lỗi OldTrek/SyntaxError mới sau deploy. Cần tiếp tục theo dõi ở bước event engine.

## Bước kế tiếp

Xây `OldTrekStateService`/`OldTrekEventService` với checkpoint dùng chung, event UID, event ledger và contract `7002`; chỉ sau đó mới port mini-game Trung.
