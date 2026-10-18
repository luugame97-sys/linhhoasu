# Audit hồi quy giao diện Ngoại quan — 23/09/2026

## Kết luận

- Kiểm trực tiếp trình duyệt game ở viewport 584×726: panel Ngoại quan, Thời trang, Danh hiệu, Ảnh đại diện và Danh thiếp đều hiển thị/chuyển tab được; không tái hiện lỗi layout trong ảnh.
- Ảnh người dùng gửi là vùng crop chỉ chứa thanh tab dưới cùng, nên không đủ bằng chứng rằng toàn panel bị vỡ. Thanh tab trong full screenshot vẫn đúng bố cục native.
- Console không có TypeError/ReferenceError/layout exception. Có 1 lỗi audio autoplay của trình duyệt (không liên quan giao diện) và cảnh báo thiếu LanguageConfig `28371`, `128370`.

## Đối chiếu thay đổi client

- `lhs-avatar-default-fix-v1.js`: chỉ chèn lựa chọn avatar mặc định `id=0` vào list Ảnh đại diện; không sửa layout/tab container. Đã thấy addon ready và tab avatar render.
- `lhs-demon-boss-task-text-v1.js`: chỉ đổi `TaskConfig.textId`/LanguageConfig cho task Yêu Vương; không chạm Ngoại quan. Log hiện chạy hai lần (count100 rồi200), cần tối ưu idempotency nhưng không gây layout.
- `lhs-theme2-fallback-v1.js`: chỉ map theme2 sang resource theme1; không đổi panel bounds/tab.
- `lhs-fashion-gear-v1.js`: chỉ wrap danh sách cần/bè và component thời trang; không wrap thanh tab chính.
- `lhs-fashion-content-v1.js`: có lỗi timing tiềm ẩn: `apply()` chỉ đợi `GlobalManager`, không đợi `GlobalManager.Config`. Nếu Config chưa load, mapping tên 28371/128370 bị bỏ qua; điều này khớp console warning nhưng không giải thích layout bị cắt.

## Trạng thái

- Audit read-only; không sửa/deploy/ghi player trong lượt này.
- Nếu người dùng xác nhận lỗi thật là tên/nhãn thời trang mất hoặc hiện ID, sửa riêng timing của `lhs-fashion-content-v1.js`. Không rollback avatar/theme chỉ dựa trên ảnh crop.
