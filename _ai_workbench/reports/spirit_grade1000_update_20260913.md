# Mở rộng Pháp bảo Spirit bậc 40→1000 — 13/09/2026

- Đã giữ nguyên bậc 1–39; bậc 40 giữ nguyên chỉ số và bổ sung bridge cost `61×600` cho bước 40→41 (vì bậc 40 cũ là max, chưa có gradeConsume).
- Thêm bậc 41–1000 theo tuyến tính giống Pháp tướng: levelUp dùng item `60` (Mảnh pháp bảo), gradeUp dùng item `61` (Hồn pháp bảo). Bậc 1000 không có bậc 1001.
- Bậc 1000: levelConsume `60×5.985`, addLevelAttrs `{1:50.200,2:6.024,3:1.004}`, fullAttrs `{1:167.415.752.500,2:20.089.890.300,3:3.348.315.050}`.

## Tổng nguyên liệu

| Phạm vi | Item 60 — Mảnh pháp bảo | Item 61 — Hồn pháp bảo |
|---|---:|---:|
| Từ **đã max bậc 40** lên max bậc 1000 | **19.953.729.600** | **27.274.560** |
| Từ bậc 1 level 1/exp 0 lên max bậc 1000 | 19.954.753.600 | 27.280.537 |

Tổng tính theo handler: mỗi grade cần `steps × levelConsume.count`, với `steps = addAttrs / addLevelAttrs`; tiến bậc chỉ trả item61 của grade hiện tại. Không tính số dư item của người chơi, không tự cộng item và không migration player.

## Kiểm chứng/deploy

- Candidate builder: `_ai_workbench/tools/build_spirit_grade1000_20260913.js`.
- Test candidate + handler: **3999 assertions PASS**, 3 config parity, frame khác byte-exact; core contract 714 PASS.
- Server, client config cơ sở, client fashion config và handler `spirit.js` đã deploy sau backup `/linhhoasu/_ai_workbench/backups/spirit_grade1000_20260913_pre`.
- Post-check live: config runtime đọc được đúng 1000 row, bậc 40 bridge cost 600, bậc 1000 đúng, `/ready` S1/S2/S3 = 200, process online, index marker `20260913_spirit_grade1000_v1`, error markers rỗng. Evidence: `_ai_workbench/temp/spirit_grade1000_20260913/deploy.json`.
- Native player E2E tại 40→41/999→1000 chưa chạy vì không có tài khoản QA đủ hàng triệu/tỷ vật liệu; không dùng tài khoản thật để ép cấp.
