# Mở max cấp 2000 / chặng tu luyện đầu tiên — 22/09/2026

## Trạng thái triển khai

- Đã mở server-authoritative từ level **1305 → 2000**.
- Cảnh giới cũ 1–45 giữ nguyên dữ liệu; bổ sung 3 cảnh giới custom:
  - 46: Đạo Tổ sơ kỳ — cap1500
  - 47: Đạo Tổ trung kỳ — cap1750
  - 48: Đạo Tổ hậu kỳ — cap2000 (terminal)
- Hệ tên chặng được khai báo nhưng khóa sau cap2000: Phàm Nhân Tu Tiên (1–2000), Tiên Nghịch (2001–4000), Thế Giới Hoàn Mỹ (4001–6000), Đấu Phá Thương Khung (6001–8000), Già Thiên (8001–10000). Chưa mở các chặng sau.
- EXP cấp mới tăng tuyến tính `+200.000` mỗi level sau 1305; level2000 exp `282.121.830`. Đây là công thức custom, không phải bảng Trung chính thức.
- Server kiểm tra task, level cap, EXP, item đan hợp lệ và stage tuần tự; stage 48 không có stage49.
- Đột phá mới dùng receipt/requestId, mutation lock, state read-back/CAS; retry trùng không trừ đan hoặc phát thưởng lần hai.
- `tag600` legacy không bypass được stage mới; `tag3105` không claim thưởng mới lần hai.

## Backup / rollout

- Backup chọn lọc: `/linhoasu/_ai_workbench/backups/role_level2000_20260922`.
- PM2 activation dump backup: `/linhoasu/_ai_workbench/backups/role_level2000_20260922/pm2_dump.before_save`.
- Rolling S2→S1→S3→S4→S5; process flag `ROLE_LEVEL_2000_ENABLED=1`, all online/readiness Mongo+Redis OK; `pm2 save` đã ghi lại flags.
- Không ghi player/reward trong triển khai hoặc QA.

## Kiểm thử

- `test-role-level2000.js`: generator idempotency, collision atomicity, old stages unchanged, max level/stage, language/task/boss references, client data parity, lifecycle hook, packet roundtrip — PASS 9 nhóm.
- `test-cultivation-progression-v2.js`: stage45→46→47→48, thiếu điều kiện, pity/failure, duplicate request, concurrent role lock, save/CAS conflict, legacy tag600, level progression, finite combat/PVE — PASS 9 nhóm, networkAttempts=0.
- `test-core-gameplay-contract.js`: PASS.
- `test-alchemy-material-sources.js`: PASS 17 nhóm, productionWrites=0.
- Live read-back: `levels=2000`, `stages=48`, `maxExp=282121830`, `nextLocked=true`, login metadata `cultivation_2000_v2`, all five nodes active. Evidence `_ai_workbench/temp/role_level2000_20260922/{release,verification,qa,activation_persistence}.json`.

## Giới hạn nghiệm thu

- Chưa login/đột phá bằng tài khoản thật, không tiêu đan/EXP thật. Browser chỉ xác nhận addon hook ready; native account E2E vẫn cần người chơi tự kiểm tra.
- Config dùng item đan hiện có và boss/monster clone từ stage45, không tạo asset mới. Các chặng sau 2000 chỉ là metadata khóa; chưa có gameplay.
