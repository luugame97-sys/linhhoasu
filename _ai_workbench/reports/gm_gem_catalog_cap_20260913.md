# WebGM catalog/cap Hồn ngọc — 13/09/2026

- Trước deploy, `gmitem.txt` đã có item `60` (Mảnh pháp bảo), `61` (Hồn pháp bảo), nhưng chưa có 540 item Hồn ngọc mới `25101–25996` (type 23–28, level 11–100). Vì vậy admin không thể chọn gửi các item mới.
- Đã thêm đủ **540 dòng catalog** vào `/linhhoasu/webgame/gm/assets/item/gmitem.txt`; ví dụ `25101 = loại 23 cấp 11`, `25996 = loại 28 cấp 100`. Tên catalog dùng để WebGM tự hiển thị, không đổi game config.
- Giới hạn gift generic trước đây: item thường tối đa `999.999`; đã mở riêng item `60/61` lên **1.000.000.000 mỗi item**. Các item khác giữ `999.999`; tiền `1/2/6` giữ `1.000.000.000`.
- Backup: `/linhhoasu/_ai_workbench/backups/gem_gm_catalog_20260913_pre`; deploy có CAS theo hash trước khi ghi.
- Verify: `php -l config.php` PASS; function `gift_reward_amount_limit` đọc đúng allowlist `1,2,6,60,61`; catalog đọc thấy `25101` và `25996`; evidence `_ai_workbench/temp/gem_level100_20260913/gm-deploy.json`.
- Không gửi mail, không tạo giftcode, không cộng item cho player. Admin cần reload WebGM để tải danh mục mới.
