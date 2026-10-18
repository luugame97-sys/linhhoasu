# Mở riêng System Hồn thú 231 — 01/10/2026

## Kết quả

- Đã bỏ **duy nhất** điều kiện ngày server `{type:5,value:43,cond:4}` khỏi `SystemConfig[231]`.
- Giữ nguyên hai điều kiện còn lại:
  - mở System 206 (Pet 206);
  - nhân vật cấp `>=135`.
- Không đổi `PetBaseConfig`, `CoercionConfig`, công thức Uy áp, pet handler, PetSoul handler hay dữ liệu người chơi.

## Phạm vi file và bằng chứng

- Thay 4 binary config server/client và `webgame/game/index.html` cache key scoped `20261001_system231_v1`.
- Candidate test **5/5**; mỗi binary giữ nguyên **713 bảng khác**, 94 SystemConfig row khác không đổi; 24 biên điều kiện client/server PASS.
- `SystemConfig[231]` sau deploy đọc trực tiếp từ runtime trên cả 4 binary:
  `[{type:7,value:206,cond:4},{type:3,value:135,cond:4}]`.
- `PetBaseConfig.levelMax=200`, phẩm break `[7,9,10]`, stage50 `limitLevelUp=800` giữ nguyên.
- Backup: `/linhhoasu/_ai_workbench/backups/system231_20261001_130141`.
- Receipt: `_ai_workbench/temp/system231_20261001/deployment.json`.

## Rolling deploy

- S1–S6 restart tuần tự; PID mới lần lượt được read-back và `/ready` Mongo/Redis = true.
- Served hash loopback/public khớp candidate:
  - index `d6f7447f…`;
  - client main `eaa97e8f…`;
  - client fallback `edda8b9c…`.
- Server openTime không đổi; không ghi player/DB, không đổi worker/bot/admin/dist process.
- Có một số `EPIPE`/Mongo timeout nền quanh thời điểm restart ở log WSServer; readiness sau deploy đạt và không có lỗi liên quan `SystemConfig[231]`/PetSoul. Không gán các lỗi nền này cho thay đổi System 231.

## Lưu ý vận hành

- Player đang online có thể còn `systemUnlockInfo` cũ trong snapshot; đăng nhập lại/reload client để tag `10001` refresh unlock state theo điều kiện mới. Không có migration ép ghi hàng loạt player.
- Sau khi tăng sao Hồn thú, nếu màn Chi tiết pet vẫn hiện trần cũ, đóng/mở lại màn đó để refresh UI; lỗi listener refresh đã được tái hiện trong audit trước nhưng chưa nằm trong phạm vi release này.
- Chỉ cấp nhân vật `>=135` và đã mở Pet 206 được mở Hồn thú; các server/client khác ngoài S1–S6 không nằm trong release.
