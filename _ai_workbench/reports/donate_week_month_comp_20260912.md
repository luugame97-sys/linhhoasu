# Bù Tích Donate tuần/tháng — 12/09/2026

- Đối soát toàn bộ delivery Donate tuần/tháng đã `sent`: 157 lượt, 15 nhân vật.
- Tính chênh lệch theo từng delivery gốc, gom theo nhân vật và chỉ bù 5 item mới `7/8/20/60/61`; không bù ngày và không cộng lại phần đã có.
- Đã tạo 15 delivery idempotent `925–939`; tất cả bridge xác nhận `sent`, không còn `pending_delivery`.
- Mốc lớn được tự chia batch theo cap item để không vượt giới hạn gửi thư.
- `/ready` S1 `8080=200`, S2 `8083=200`; không restart process.

Backup remote: `/linhhoasu/_ai_workbench/backups/donate_week_month_comp_20260912/`

Evidence: `_ai_workbench/temp/donate_week_month_preview_20260912.json`, `_ai_workbench/temp/donate_week_month_apply_20260912.json`, `_ai_workbench/temp/donate_week_month_verify_20260912.json`.
