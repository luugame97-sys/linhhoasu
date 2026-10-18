# Khắc phục lỗi login do bundle sai — 15/09/2026

- Triệu chứng: Chrome `TypeError: Cannot read properties of undefined (reading 'quality')` tại `EquipListItem.dataChanged` khi bấm Đăng nhập.
- Nguyên nhân: live `index.html` trỏ `main.min_a6195824.js`, trong khi player/config runtime dùng extension trang bị level 46–100; `AssetsConfig[equip.id]` không có row tương ứng.
- Fix: đổi duy nhất manifest main sang `main.min_drop100.js?v=20260915_drop100_restore_v2`; giữ nguyên addon auto-sale, healthbar v6 và server/player data.
- Backup: `/linhhoasu/_ai_workbench/backups/index_main_bundle_guard_20260915_004520`.
- Verification: index SHA `30252289deb5c7463c28e0a29d8c70284ae65f4cfc2acccfaa513ae35322e423`; served main config SHA `32789554f25db0a06ee614e45b47356f8e800a23b0955386029ff0e6630a3e46`; guard 7/7 PASS; `/ready` 8080/8083/8084 = 200; browser không còn TypeError quality.
- Regression prevention: release scripts bắt buộc reject stale `main.min_a6195824.js` và yêu cầu đúng drop100 bundle marker trước CAS/deploy.
