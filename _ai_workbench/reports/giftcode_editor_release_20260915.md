# Mở sửa giftcode và popup chọn item — 15/09/2026

## Kết quả

- Đã triển khai WebGM cho phép sửa mã, danh sách quà, giới hạn lượt, hiển thị, trạng thái và hạn dùng kể cả khi `used_count > 0`.
- Popup sửa không còn ô JSON thô/readonly. Popup dùng lại danh mục của màn tạo code, có tìm item, nhập số lượng, nút Thêm, thẻ quà và nút Xóa từng item.
- Thêm lại cùng ID sẽ cộng số lượng; không cho lưu danh sách rỗng hoặc ID/số lượng không hợp lệ.
- Sửa chỉ tác động các lượt nhận mới. Lịch sử `giftcode_logs`, `used_count`, thư và snapshot đơn quà đã tạo trước đó được giữ nguyên; tài khoản đã nhận vẫn không nhận lại cùng giftcode ID.
- API sửa hỗ trợ tối đa 250 item, khớp `reward_delivery.php`; khi giao vẫn chia thành các thư tối đa 20 item. Màn tạo code mới giữ giới hạn cũ 20 item.

## File production

- `/linhhoasu/webgame/gm/admin/admin_api.php`
  - SHA trước: `a97cbb15f1845b3f3a6b4b0163dc3063b17441e37481bf775807c6fb9405a575`
  - SHA sau: `5e7cd758e5b89ae51e348240a156064e77116a6a7c1ff0f98436198db1774140`
- `/linhhoasu/webgame/gm/assets/js/admin.js`
  - SHA trước: `83392b7e8b5f2af30eedbc1f2c4cc4a96f81587c4b51d8818c14cdc355c5a398`
  - SHA sau: `c630dede93f6119e6dfa96a517e7267ce94ac29b9c8948605b50e664fe43826b`

Backup: `/linhhoasu/_ai_workbench/backups/giftcode_editor_20260915_061734/`.

## Kiểm chứng

- Node syntax và 22 UI/source contract: PASS.
- PHP 7.4 lint và parser 11 checks: PASS; sửa giữ được tối đa 250 item, tạo mới vẫn tối đa 20.
- QA API live bằng dòng tạm có `used_count=3`: đổi code + quà thành `29011×1, 29012×2`, `used_count` vẫn bằng 3; PASS và đã dọn sạch row/log/rate-limit QA.
- Served `admin.js` chứa marker popup mới; trang admin trả redirect đăng nhập bình thường.
- PM2 restart counters trước/sau giống nhau; không restart game/WebGM service, không sửa player hoặc giftcode thật.

Evidence: `_ai_workbench/temp/giftcode_edit_20260915/deploy_20260915_061734.json`.

## Sử dụng

Admin tải lại trang WebGM, vào **Tạo mã quà tặng**, chọn biểu tượng bút ở code cần sửa. Nếu tab đã mở từ trước, dùng `Ctrl+F5` một lần.
