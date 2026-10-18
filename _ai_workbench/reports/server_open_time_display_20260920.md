# Sửa hiển thị thời gian mở server — 20/09/2026

- Đã đổi hiển thị từ `2026Năm9Nguyệt20Ngày` sang **`10:00 20/09/2026`**.
- Sửa hàm định dạng riêng cho dòng `Thời gian mở server`, không đổi `openTime`, trạng thái server hoặc logic time gate.
- Production bundle đang được index sử dụng: `/linhhoasu/webgame/game/js/main.min_drop100.js`; cache key trong `index.html` đổi từ `20260915_drop100_restore_v2` sang `20260920_server_open_time_v1` để trình duyệt tải bản mới.
- Local source tương ứng đã cập nhật tại `linhhoasu/webgame/game/js/main.min_a6195824.js` và `index.html`.

## Kiểm chứng

- Candidate và production đều chạy test timezone `Asia/Ho_Chi_Minh`: `1789873200000` → `10:00 20/09/2026`.
- Served bundle hash khớp candidate: `45707b493820f489955d8322d09bd0a171d44ee0b4074f3d957425f0abdcead5`.
- `nginx -t` PASS; không restart PM2/game và không ghi DB/player.
- Backup: `/linhhoasu/_ai_workbench/backups/server_open_time_display_20260920/`; evidence: `_ai_workbench/temp/server_open_time_display_20260920/evidence.json`.
