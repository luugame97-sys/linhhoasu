# Đối chiếu ô ghép và ghép nhanh Tinh Linh Cozy — 05/10/2026 14:26 ICT

## Kết luận

- Ảnh người dùng gửi thể hiện 6 cột × 8 hàng = 48 ô trên bàn ghép, riêng 3 vị trí xuất chiến. Không suy ra 48 ô miễn phí, giá mở ô hoặc thuật toán backend chỉ từ ảnh.
- Bản mình live: initialField=8, fieldMax=16, 8 giá mở ô `[100,150,200,250,300,350,400,450]`. Đã có handler ghép batch3314 và client sendAutoCompose, cờ hiển thị petAutoCompose; startup mặc định0. Không xác nhận cờ của một phiên đang chạy từ giá trị mặc định này.
- Có thể áp dụng bàn 48 ô và ghép nhanh riêng theo kiến trúc hiện có. Chưa sửa source/config gameplay hoặc deploy.

## Cơ chế tham khảo xác minh được

Nguồn native Cozy lưu20/09/2026 (`_ai_workbench/temp/cozy_rip`), không phải chứng minh phiên bản mới nhất:

- `petInfo.field` là số ô đã mở; slot≥0 thuộc bàn ghép, slot -1..-3 thuộc 3 vị trí xuất chiến. Component ô được lấy từ các children của skin, vì vậy config tăng số ô chưa tạo được UI.
- Auto thường mở trứng24/25 khi còn ô, ghép cặp qua3302, rồi xử lý pet EXP qua3311; lặp cho đến hết thao tác. Mặc định mục tiêu4, menu4/5. Loại pet khóa, pet cấp>1, pet EXP khỏi ghép cặp thường và pet phẩm≥mục tiêu.
- Checkbox bỏ hoạt ảnh/ghép nhanh chỉ hiện khi `AppInfo.params.petAutoCompose==1`; thanh tiến độ5giây rồi gửi một request3314 với quality, nhận danh sách pet kết quả. Ghép nhanh đã có trong native cũ; không thể khẳng định đây là tính năng Cozy vừa thêm.
- Bản cũ có callback truthy xóa UID trước kiểm result; bản mình có guard ghép thủ công tốt hơn. Không thay guard bằng callback cũ.

## Độ mới và giới hạn truy cập

- Kiểm public `https://tutienky.cozygame.online/` và `/play.html` ngày05/10:HTTP200; shell mới có feature-loader version20261005_protection1. Trang công khai có thời gian cập nhật05/10.
- Feature loader dùng `/api/portal/features/manifest` có phiên đăng nhập; mainJS cũ chuyển307 tới guarded legacy resource, trả401SESSION_EXPIRED khi không có phiên. Không bypass.
- Snapshot Cozy cũ vẫn fieldMax16, nên không giải thích bàn48ô trong ảnh. Chưa có code/config phiên mới để xác minh giá mở ô, số ô khởi đầu, tốc độ ghép/cap mới hoặc server settlement.
- Đã đề nghị người dùng mở phiên Cozy hợp lệ/gửi ảnh menu ghép tự động; không xin mật khẩu.

## Khả năng áp dụng và rủi ro đã kiểm thử

- Live pet.js hash `e6653487c1ad4c1ba71cf816fd6f3357dc9b282d68bd1e7c91f5cfe1200d7f46`; client main hash `1ae070b19d593ca120eeaf86856d0bc85b0b9ed71d5847e65be7139c966e0e9a`.
- RAM thử field48 + handler3314 thật:34pet→9pet, giữ pet khóa/cấp20/đang xuất chiến/phẩm9. Bản mình chặn auto theo ngưỡng tối đa8, vòng128; Hỗn Độn vẫn ở luồng riêng.
- RAM thử **chỉ đổi fieldMax16→48**: mua ô17 thành công nhưng trừ0Nguyên bảo vì fieldConsume[8] không có. Phải bổ sung policy/giá và fail-closed khi thiếu config; không tăng trần bằng một cờ đơn lẻ.
- Callback buyField3308 hiện tăng field client khi response truthy; sendAutoCompose3314 cũng dùng truthy rồi thay toàn bộ pets. Cần guard result/pets/field authoritative, pending/retry receipt và save confirmation trước khi public quick-merge.
- Bàn48ô cần client tạo thêm component/lưới6×8, scale desktop/mobile, drag/hit-test, tọa độ/swap và native animation. Giữ UID/slot đã mở, không reset/đổi phẩm/rate hoặc tự cấp ô đã trả phí.
- Đề xuất bước triển khai: manifest delta hẹp (UI + field config/cost + muaô + ghép nhanh), QA RAM rollback/retry/fullbag/battle/locked/q9–10, native mobile/desktop rồi canary. Chưa chọn số ô miễn phí hay giá ô mới khi chưa có cơ chế Cozy xác thực hoặc policy người dùng.

Evidence: `_ai_workbench/temp/cozy_pet_grid_20261005/{current_runtime.json,feasibility.json,pet.live.js}`; probe `_ai_workbench/tools/audit_pet_grid_feasibility_20261005.js`. Probe mock save trong RAM, productionWrites=0/networkAttempts=0; không ghép/tiêu tài nguyên player thật, không restart.
