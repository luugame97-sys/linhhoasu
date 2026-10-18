# Triển khai công thức PK tùy chỉnh v1 — 22/09/2026

## Đã triển khai

- Ruleset `custom-pvp-v1` đã bật cho Arena và Đỉnh Phong/CrossArena trên S1–S5 bằng cờ server; PVE giữ legacy.
- Backup chọn lọc trước triển khai: `/linhhoasu/_ai_workbench/backups/custom_combat_v1_20260922`.
- Rolling restart theo thứ tự S2 → S1 → S3 → S4 → S5. Tất cả tiến trình online, cờ process = `1`, `/ready` Mongo/Redis = OK.
- Evidence: `_ai_workbench/temp/combat_parity_20260922/custom_release.json`, `custom_activation.json`, `post_activation.json`.

## Kiểm chứng

- Snapshot cặp thật ZâmCaCa/FoxPlayer: 12.400 trận replay mô phỏng (hai chiều, nhiều seed), không còn trận 0 sát thương do né vô hạn.
- Packet/recovery: 200 trường hợp PASS; timeout giữ đúng HP ratio và lý do thắng, không dựng kill giả khi đăng nhập lại; không hồi máu hai lần.
- Core/contract: `test-custom-combat-v1.js`, `test-custom-combat-rules.js` (13 nhóm), `test-custom-combat-packets.js`, `test-core-gameplay-contract.js` PASS.
- `productionWrites=0` trong probe/triển khai; không claim reward, không tạo trận mới bằng account người chơi.
- Hậu kiểm logs không thấy `CUSTOM_COMBAT`/`COMBAT_ATTR`/`SIMULATION_FAILED`. Các cảnh báo Mongo/WSServer đã có trước và không phải lỗi ruleset.

## Giới hạn cần nói rõ

- Đây là công thức tùy chỉnh để PK ổn định, không phải công thức gốc 100%.
- LC cao không bị ép thắng; build né/kháng/crit/counter vẫn có khắc chế. Cặp ZâmCaCa/FoxPlayer trong fixture mẫu cho thấy ZâmCaCa thắng khi dùng snapshot cũ, nhưng chưa phải live E2E trận người chơi.
- Chưa tự động đánh bằng tài khoản thật, không dùng vé/ghi điểm để “test”. Cần người dùng thực hiện một trận thực tế và gửi receipt/screenshot nếu muốn đối chiếu tiếp.
- Nguồn Curios/ValhallaFormation/SpecSpirit còn thiếu reader trong calculator; ruleset chỉ dùng attrs snapshot server hiện có, không tự bù chỉ số.
- Nếu phát sinh lỗi, rollback code theo backup trên, không rollback DB/player.
