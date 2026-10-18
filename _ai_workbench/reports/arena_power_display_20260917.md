# Lực chiến đối thủ Võ Đạo Hội — 17/09/2026

## Kết quả

Đã xác nhận và sửa lỗi đơn vị lực chiến đối thủ; deploy cùng bản trên S1–S4. Hậu kiểm live17:36 GMT+7:4ready200, hash đúng, SDK/WebSocket từng server PASS. Không đổi BattleService, thuộc tính chiến đấu, điểm/thưởng, client bundle, HUD hoặc cấu hình kết toán.

| Nhân vật trong ảnh | Trước sửa | Sau sửa, raw native từ cùng attrs |
|---|---:|---:|
| FoxPlayer |14.848.390|1.484.839.012|
| FangZi |1.979.503|197.950.314|
| Tiểu Quỷ |855.390|85.539.058|

Các nhân vật này có attrs trước/sau không đổi. Số được tính từ attrs và trọng số thật, không lấy số đã làm tròn rồi nhân100.

## Nguyên nhân và thay đổi

- `BattleService.calcPowerScore` trả `floor(weightedSum/100)`; native client `CSe.calPowerByAttr` trả `ceil(weightedSum)`.
- Dòng tự thân trên Arena đọc `RoleModel.calAllPower()`, còn dòng đối thủ, top3 và danh sách đọc `data.power` từ server. Patch format trước chỉ hiển thị đầy đủ chữ số, chưa sửa lỗi trộn đơn vị trong DTO đối thủ. Đợt sửa Arena trước cũng chưa bao phủ bước này.
- Thêm phép tính thuần `ArenaReadModelService.displayPower`, khớp hàm native trích trực tiếp từ main đang phục vụ; AttrConfig client/server có cùng hash trọng số.
- `power` của public Arena/CrossArena row và hồ sơ người khác dùng raw native; `powerScore` và private battle snapshot vẫn giữ legacy. Chỉ số và simulator không đổi.
- Bao phủ rank/top3/challenge/robot, thẻ kết quả trận, replay ledger cũ và mới; CrossArena đọc lại từ attrs của roster cũ mà không migration DB.
- Không hook hay khóa `RoleModel.calAllPower()` vào một cache server, tránh lỗi HUD đứng yên sau nâng cấp như bản thử trước đây.

## Kiểm chứng

-647 checks mới PASS trên local, staging VPS và installed:200 bộ attrs ngẫu nhiên so với hàm native, làm tròn, metadata/attr không tính power, raw lớn hơn32bit, snapshot thực trong ảnh, hồ sơ, robot và replay; kiểm input/legacy score không đổi.
- Hồi quy18 Arena recovery +43 CrossArena +19 settlement PASS; core714bảng PASS.
- SDK/WebSocket live:10 nhóm mỗi server, đủS1–S4. Rank/top/challenge đúng unit; hồ sơ và cả2 thẻ trận khớp `calPowerByAttr`; replay không trừ thêm vé/phát thêm thưởng; Mongo read-back và relog PASS.
- QA chỉ dùng account và đối thủ riêng. Residue QA0 ở từng node; không sửa player thật. Mỗi game node restart1 lần, không rollback; bot/admin/dist không đổi PID/restart.
- Client/index và BattleService giữ nguyên hash; không cần cập nhật lại addon frontend.

## Phạm vi chính xác

Đây là sửa **đơn vị hiển thị từ snapshot thuộc tính server**, không thay cách gom thuộc tính chiến đấu để ép khớp mọi bonus client. Dòng self/HUD vẫn do native `RoleModel` tính như trước. Không dùng số Talo trong ảnh để bù hoặc nhân dữ liệu; không tuyên bố đã hoàn tất đối chiếu từng category giữa `RoleModel.getAllAttr()` và `BattleService.calcPlayerPower()`.

Không có ảnh tài khoản vanduc97 sau hotfix trong lượt này; bằng chứng live là packet SDK/WS và read-back. Người chơi mở lại Võ Đạo Hội hoặc F5 để lấy dữ liệu mới.

## Artifact / rollback

- Source: `src/services/ArenaReadModelService.js`, `src/handlers/arena.js`, `src/handlers/basic.js`, `src/services/CrossArenaService.js`.
- BackupVPS: `/linhhoasu/_ai_workbench/backups/arena_power_20260917_102801`.
- Evidence: `_ai_workbench/temp/arena_power_20260917/{audit,post-live,release}.json`.
- Release runner: `_ai_workbench/tools/release_arena_power_20260917.py`; giữ CAS/backup/chờ ready trước QA và rollback chỉ node đã restart.
- Test: `scripts/test-arena-power-display.js`; hồi quy Arena trước được cập nhật để phân biệt `power` hiển thị và `powerScore` legacy.
