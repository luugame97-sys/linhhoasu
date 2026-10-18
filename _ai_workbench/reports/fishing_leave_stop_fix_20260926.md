# Fix dừng auto-câu khi rời phòng — 26/09/2026

## Kết quả

- Khi bấm quay lại/rời phòng, client tắt `isAutoFish`, vô hiệu hóa generation/callback đang chờ và gửi đúng RPC `4051` một lần.
- Bản v2 sửa lỗi wrapper tự đặt cờ pending trước khi gọi `cs_fish_map_leave()`, khiến chính wrapper bỏ qua RPC `4051`.
- Timer `autoDealAllFish` còn sót sau ACK bị chặn khi auto-câu đã tắt. `FishMapClear` không mở cờ pending sớm trong lúc chờ ACK.
- Server xác thực membership theo identity của session. Sau khi rời phòng, `4000` và hai nhánh `4008` tự động (`auto:1`, `autoPower:true`) trả `FISH_ROOM_REQUIRED` trước khi trừ mồi, bán/trang bị cá, tạo receipt hoặc save.

## File chính

- `linhhoasu/webgame/game/js/lhs-fishing-leave-stop-v1.js` — addon client, version/cache `20260926_fishing_leave_stop_v2`.
- `linhhoasu/webgame/game/index.html` — nạp addon sau bundle game với cache-bust v2.
- `linhhoasu/lhs/newServer/src/services/FishingRoomService.js` — `isMember(session)` identity check.
- `linhhoasu/lhs/newServer/src/handlers/fish.js` — guard `4000` và auto `4008`.
- `_ai_workbench/tools/test_fishing_leave_stop_20260926.js` — regression contract.

## Kiểm chứng

- `node --check` pass cho `fish.js`, `FishingRoomService.js` và addon client.
- Regression client/server: **10/10 PASS**, `productionWrites=0`; có ca back-exit, stale ACK, membership, pending fish, auto-deal và auto-power.
- Background fishing suite: **4/4 PASS**, `productionWrites=0` (warning Mongoose `isNew` là warning cũ, không thuộc thay đổi này).

## An toàn triển khai

- Backup trước sửa chọn lọc: `_ai_workbench/backups/fishing_leave_stop_fix_20260926_pre/` (`fish.js`, `game.index.html`).
- Rollout CAS thành công theo evidence `_ai_workbench/temp/fishing_leave_stop_20260926/deploy_20260926_142809.json`; backup remote `/linhhoasu/_ai_workbench/backups/fishing_leave_stop_20260926_20260926_142809`.
- Reload rolling `lhs-s1006` → `lhs-s1001`; readiness **6/6 = 200**, PM2 tất cả online. Served index/addon và 4 file runtime khớp candidate hash; HTTP public `:81` trả index `200`, addon v2 `200`.
- Contract server-only chạy trên runtime VPS: **4/4 PASS**, `productionWrites=0`, `playerWrites=0`, `dbWrites=0`. Không sửa player/reward/DB/nginx.
- Lần thử đầu tự rollback vì contract phụ thuộc `acorn` không có trên runtime production; rollback hash/readiness PASS, sau đó chạy lại bằng contract server-only và triển khai thành công.
