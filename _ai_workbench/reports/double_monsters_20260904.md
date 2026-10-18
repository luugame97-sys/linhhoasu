# Tăng gấp đôi quái map thường — 04/09/2026

## 1. Tóm tắt công việc

- Đã triển khai tăng mật độ quái ở toàn bộ 58 map cày thường cho cả S1 và S2.
- Số slot quái authoritative tăng từ `1.233` lên `2.466`, đúng hệ số `2×`.
- Server nhân đôi danh sách slot trong `MapMonsterService`; client chỉ dựng thêm quái tại `CommonMapRaid.initMapCreeps`.
- Không sửa parser map dùng chung nên dungeon, event và các map không thuộc luồng cày thường không bị nhân đôi.
- Giữ nguyên index quái cũ; quái clone nối ở nửa sau, lệch 64 px và được giới hạn trong biên map. Client/server dùng cùng thuật toán nên handle khớp.
- Marker `_lhsDensity2` ngăn việc quay lại map nhân tiếp thành `4×`.

## 2. File/thư mục đã thay đổi

### Source chính

- `linhhoasu/lhs/newServer/src/services/MapMonsterService.js`: nhân đôi slot map thường và công bố metric `originalSlots`, `densityMultiplier`.
- `linhhoasu/webgame/game/js/main.min_a6195824.js`: dựng quái clone ở map cày thường.
- `linhhoasu/webgame/game/index.html`: đổi cache marker sang `20260904_double_monsters1`.
- `linhhoasu/lhs/newServer/src/services/EquipService.js` và `src/handlers/item.js`: chỉ đồng bộ source local với đúng hash auto-equip đang chạy trên production; không phải thay đổi production của tính năng tăng quái.

### Tool, evidence và backup

- Tool deploy: `_ai_workbench/tools/deploy_double_monsters_20260904.py`.
- Tool audit read-only: `_ai_workbench/tools/audit_double_monsters_postdeploy_20260904.py`.
- Contract: `_ai_workbench/tools/test_double_monsters_contract.js`, `test_map_bot_contract.js`.
- Evidence deploy: `_ai_workbench/temp/double_monsters_deploy_20260904_055038.json`.
- Evidence hậu kiểm độc lập: `_ai_workbench/temp/double_monsters_postdeploy_20260904.json`, SHA-256 `ec00824eb7707a4e8dbbf6032ff7cb58d96c7ed5c4341a79c97bec55d03f722f`.
- Log test local: `_ai_workbench/logs/double_monsters_tests_20260904_1404.log`, SHA-256 `093a1d85f6e1013242606cbd68bb08319ec4be2b792465633799e2d291c3d362`.
- Backup production: `/linhhoasu/_ai_workbench/backups/double_monsters_20260904_055038/`.
- Backup local: `_ai_workbench/backups/double_monsters_local_pre_20260904_125928/`.

## 3. Lỗi đã gặp & giải pháp

| Lỗi | Nguyên nhân | Cách xử lý | Cách tránh lặp lại |
|---|---|---|---|
| Lần deploy đầu hậu kiểm clone log thất bại | Output Node có dòng `[Config]` trước JSON nên parser đọc nhầm | Tool fail-closed, tự rollback đủ ba file và khôi phục 1.233 slot; đổi parser sang marker `CLONE_HITS=` rồi triển khai lại | Mọi probe có module sinh log phải parse theo marker riêng, không giả định stdout chỉ có JSON |
| Test bảo toàn auto-equip local ban đầu FAIL | `item.js` và `EquipService.js` local còn bản cũ, trong khi production đã có auto-equip | Xác minh hash production read-only, backup local, đồng bộ đúng snapshot production rồi chạy lại PASS | Sau mỗi deploy phải đối chiếu hash production và source local của toàn bộ file liên quan |
| Không ghi được test log vào `_ai_workbench/logs/` | `logs` đang là một file PM2 cũ thay vì thư mục | Di chuyển file cũ sang backup, tạo đúng thư mục và giữ bản log cũ tại `logs/legacy_pm2_20260827.log` | Giữ cấu trúc `_ai_workbench` đúng loại file/thư mục ngay từ đầu |
| `New-Item -LiteralPath` không hợp lệ | Cmdlet `New-Item` dùng `-Path`, không hỗ trợ tham số đó trong môi trường hiện tại | File cũ đã được chuyển an toàn vào backup; tạo thư mục bằng `-Path` rồi xác minh hash hai bản giống nhau | Dùng `-LiteralPath` cho lệnh hỗ trợ; với `New-Item`, dùng đường dẫn đã resolve và kiểm tra nằm trong workspace |

## 4. Kỹ năng / kinh nghiệm mới

- Mật độ quái phải được quyết định ở server và client chỉ phản chiếu cùng danh sách/index; chỉ sửa client sẽ làm target không hợp lệ.
- Giữ slot gốc ở đầu mảng giúp bot/người chơi cũ không bị đổi handle; clone nối sau giúp rollout tương thích.
- Khi production dùng chung, mọi deploy cần hash baseline, backup, restart đúng process, readiness, bot hồi đủ và rollback tự động nếu hậu kiểm không đạt.
- Không dùng số bot online làm bằng chứng duy nhất; phải có log bot thật claim thành công index thuộc nửa clone.

## 5. Trạng thái hiện tại

- Production: PASS.
- S1: `580/580` bot thật, `580` bot ảo, `2.466/1.233` slot, multiplier `2`, `invalid=0`; hậu kiểm ghi nhận `3.209 claims / 3.199 completed`.
- S2: `580/580` bot thật, `580` bot ảo, `2.466/1.233` slot, multiplier `2`, `invalid=0`; hậu kiểm ghi nhận `314 claims / 313 completed`.
- Có 20 mẫu bot đánh thành công quái clone; ví dụ map `10032`, index `27` trong khi map có `22` slot gốc.
- `/ready`: S1 `200`, S2 `200`; sáu process liên quan đều `online`.
- `lhs-dist` và `lhs-admin` không bị restart; PID lần lượt giữ `30824` và `30856`.
- Hash production/server local khớp:
  - `MapMonsterService.js`: `e72a6104b07febea7db43519b0b0c1b7510db27c01000269d3d955a080c54df1`.
  - `main.min_a6195824.js`: `e0dc168341c2883e9c45bb147507e9ab06e52111e325a52b5dbe586aca494513`.
  - `index.html`: `a41a73ba2608cbffd5cc2775f424a8a6d31eb5889217114f4a26621ff689bd70`.
- Served bundle cổng 81 có đúng hash/marker; 120 dòng error log gần nhất không có `uncaught`, `unhandled`, lỗi cú pháp/type/reference hoặc `invalid_target`.
- Test PASS: syntax server/client; contract tăng quái 16 kiểm tra; map/bot combat; auto-equip client 10 kiểm tra; auto-equip handler 10 kiểm tra; core gameplay nạp đủ 714 bảng.
- Chưa thực hiện QA trực quan bằng nhân vật người chơi thật; live bot đã chứng minh server/client target clone hoạt động.

## 6. Bước tiếp theo

1. Người chơi đang mở game nên `Ctrl+F5` hoặc mở lại game để nhận bundle có marker mới.
2. Theo dõi `runtime.mapMonsters.invalid`; kỳ vọng tiếp tục bằng `0` khi có tải người chơi thật.
3. Không cần thao tác thêm để duy trì 2×; cấu hình đã được PM2 lưu và cả S1/S2 đang chạy.
