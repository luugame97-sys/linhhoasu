# Tinh chỉnh Tích Donate ngày 12/09/2026

## Kết quả

- Cập nhật **50/50 mốc đang bật** thuộc ngày/tuần/tháng.
- Với mỗi mốc `A` đồng, hệ thống now đặt/upsert:
  - item `7` Mảnh pháp tướng = `A`
  - item `20` Tinh túy = `A`
  - item `60` Mảnh pháp bảo = `A`
  - item `8` Tinh linh pháp tướng = `A/10`
  - item `61` Hồn pháp bảo = `A/10`
- Giữ nguyên toàn bộ phần thưởng khác trong từng mốc; update dùng CAS theo `id + reward_items`.

## Đền bù hôm nay

- Chỉ xét delivery Donate `status=sent` tạo trong ngày 12/09/2026; không xử lý các ngày trước.
- 11 lượt claim của 3 nhân vật được gom thành 3 thư bù idempotent: delivery `920`, `921`, `922`.
- Cả 3 thư đã bridge xác nhận `sent`, mỗi thư có đúng chênh lệch còn thiếu; người chơi chưa claim thư tại thời điểm hậu kiểm.

## Kiểm chứng

- Readback SQL: 50 mốc đều có đúng 5 item và công thức số lượng; không còn mismatch.
- Readback Mongo: 3 thư bù tồn tại, đúng event key và attachment; không tạo thư trùng.
- `/ready`: S1 `8080=200`, S2 `8083=200`; không restart process trong lượt này.
- Bridge lần đầu bị từ chối vì cap Donate cũ `999999`; đã nới cap có CAS/backup cho ID `7,20,60` lên `10000000`, ID `8,61` lên `1000000`, rồi retry cùng delivery ID thành công.

## Backup / công cụ

- Backup remote: `/linhhoasu/_ai_workbench/backups/donate_item_milestones_20260912/`
- Công cụ cập nhật: `_ai_workbench/tools/donate_item_milestones_20260912.php`
- Công cụ retry: `_ai_workbench/tools/retry_donate_item_comp_20260912.php`
- Công cụ cap: `_ai_workbench/tools/deploy_donate_item_caps_20260912.py`
- Evidence local: `_ai_workbench/temp/donate_preview_20260912.json`, `_ai_workbench/temp/donate_apply_20260912.json`, `_ai_workbench/temp/donate_verify_catalog_20260912.json`, `_ai_workbench/temp/donate_verify_mails_20260912.json`
