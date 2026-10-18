# Fix lỗi bản vẽ thuyền OldTrek — 11/10/2026

## Đã sửa

- Reward router nhận diện `OldTrekShipDressConfig` và chuyển reward `300002/300003` vào `oldTrekInfo.shipSkins`, không thêm vào túi như item thường.
- Đường mua shop `1210`, nhận mail và các reward path dùng chung đều gửi lại payload `7000` để client cập nhật danh sách thuyền.
- Sửa idempotent: thuyền đã sở hữu không cộng lặp; item thuyền lỗi trong túi chỉ được chuyển một lần.

## Triển khai

- Đã deploy source candidate rolling S1–S8; source hash runtime:
  - `RewardGrantService.js` `2b86c938…`
  - `handlers/item.js` `931e2200…`
  - `handlers/mail.js` `310cea60…`
  - `handlers/old-trek.js` `50a21d8a…`
- S1–S8 readiness sau rolling restart: **8/8 HTTP 200**, PM2 online.
- Backup deploy gần nhất nằm dưới `/linhoasu/_ai_workbench/backups/oldtrek_ship_fix_20261111_*`.

## Bù dữ liệu

- Quét toàn bộ S1–S8 theo các shop thuyền `13000201/13000202` và receipt tương ứng.
- Chỉ một role đủ điều kiện: S3 `u_Wk_1003_30e104_1789301370774` (`ĐôngHoàngTháiNhất`).
- Đã chuyển `300002` vào `shipSkins`, trừ item lỗi `300002 x1` khỏi túi để không tồn kép, ghi marker `oldTrekShipFix20261111`.
- CAS: **0 miss**; player writes: **1**; migration idempotent.
- Hậu kiểm sau bù: **anomalies=0**, không còn player có giao dịch thuyền mà thiếu `shipSkins`; marker count `1`.

## Kiểm thử

- Ship reward/shop migration: **8 checks PASS**, production/network writes trong fixture `0`.
- OldTrek CAS: PASS; domain: **27 tests PASS**; pass/reward: **8 checks PASS**; JS syntax PASS.
- Evidence: `_ai_workbench/temp/oldtrek_ship_fix_20261111/migration.json`.
