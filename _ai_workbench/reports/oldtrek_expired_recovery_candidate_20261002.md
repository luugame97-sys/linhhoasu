# OldTrek expired mini-game recovery candidate — 02/10/2026

## Phạm vi

Candidate chưa triển khai. Audit live read-only ghi nhận S6 có `currentEvent` mini-game `id=4017`, `miniGameType=1`, deadline đã hết hạn; state vẫn `sailing=true`, nên phiên có thể đứng ở thông báo thao tác chưa hoàn tất cho tới khi đăng nhập lại.

## Candidate

`_ai_workbench/temp/oldtrek_expired_candidate_20261002/server/old-trek.js`

- Thêm `recoverExpiredMiniGame()` chỉ xử lý event có deadline rõ ràng, đã quá hạn và `miniGameType > 0`.
- Gọi trong 7000 khi không có `destId`, và trong 7008.
- Resolve bằng `oldTrekEventService.resolve(... operate:1, param:0)` để dùng cùng event ledger/CAS; áp dụng reward path hiện có và trả `expiredRecovery`.
- Event chưa hết hạn, event không có deadline hoặc event lỗi không bị đụng tới.

## Kiểm chứng

- `node --check` PASS.
- `_ai_workbench/tools/test_oldtrek_expired_recovery_20261002.js` PASS: expired 7000, expired 7008, non-expired, replay/idempotency và CAS miss = 0.

Chưa backup/deploy/ghi production. Cần review payload native, chạy full OldTrek harness rồi mới cân nhắc rollout CAS.
