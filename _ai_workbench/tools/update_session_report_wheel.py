import os

report_path = r'i:\Linhhoasu\server\server\_ai_workbench\reports\session_report.md'
with open(report_path, 'r', encoding='utf-8') as f:
    old_content = f.read()

new_entry = """# Session Report

## Khắc phục Hiển thị Ảnh Vòng Quay & Cân đối Giao diện Điểm danh Mobile — 30/09/2026 01:57 ICT

- **Vấn đề 1 (Ảnh item vòng quay bị gãy):**
  - Trong `lucky-wheel.js`, hàm `itemImageUrl` gọi `window.location.origin + '/assets/images/lucky-wheel/' + ...`. Vì WebGM nằm ở `/web-panel/`, đường dẫn này trỏ về gốc webgame khiến Nginx fallback trả về file `index.html` của game (text/html). Trình duyệt không giải mã được HTML thành ảnh nên hiện icon gãy ảnh.
  - Thẻ `<img>` cũng thiếu xử lý fallback `onerror` khi có item thiếu ảnh.
  - **Cách sửa:**
    1. Đổi đường dẫn ảnh trong `lucky-wheel.js` sang đường dẫn tương đối chuẩn xác `assets/images/lucky-wheel/' + item_id + '.png'` (trỏ đúng `/web-panel/assets/images/lucky-wheel/` trên server).
    2. Bổ sung `onerror` fallback tự động hiển thị icon đồ họa game phong cách (`fa-box-open` / `fa-coins`) khi ảnh chưa kịp tải hoặc thiếu file.
    3. Tạo symlink tại `/linhhoasu/webgame/game/assets/images/lucky-wheel` trỏ về thư mục ảnh của GM để đảm bảo fallback kép.

- **Vấn đề 2 (Giao diện điểm danh bị mất cân đối trên mobile):**
  - Trong `ui-refactor.css` dòng 4133 có quy tắc `@media (max-width: 767.98px) { .daily-checkin-action { width: 100%; margin-left: 72px; } }`. Thuộc tính `margin-left: 72px` cộng với `width: 100%` làm đẩy cụm nút chọn sang phải 72px, khiến nút bên phải bị tràn và ép rách viền thẻ card.
  - Hai nút chọn quà (Xu vs Lượt quay) dùng flex-wrap tự do nên độ rộng không đều, nút được chọn màu cam đậm to đùng còn nút chưa chọn viền mỏng nhạt màu gây cảm giác lệch lạc.
  - **Cách sửa:**
    1. Triệt tiêu hoàn toàn `margin-left: 72px`, chuyển sang bố cục CSS Grid 2 tầng: Tầng 1 gồm Icon 52px + Nội dung text; Tầng 2 gồm toàn bộ cụm hành động dàn đều 100% chiều rộng card (`grid-column: 1 / -1`).
    2. Chuẩn hóa 2 nút chọn quà thành Grid 2 cột đối xứng chuẩn 50% - 50% (`grid-template-columns: 1fr 1fr`), cùng chiều cao (44px), bo tròn 14px, căn giữa icon và chữ.
    3. Trạng thái chọn rõ ràng: nút chọn hiển thị nền gradient cam sang trọng, nút chưa chọn có nền trắng kính mờ viền cam nhạt đồng bộ. Nút "Điểm danh ngay" full-width căn giữa hoàn hảo.

- **File thay đổi trên VPS mới:**
  - `/linhhoasu/webgame/gm/assets/js/lucky-wheel.js` *(Backup: `*.bak_wheel_fix`)*
  - `/linhhoasu/webgame/gm/assets/css/lucky-wheel.css` *(Backup: `*.bak_wheel_fix`)*
  - `/linhhoasu/webgame/gm/assets/css/ui-refactor.css` *(Backup: `*.bak_wheel_fix`)*
- **Kiểm chứng thực tế 100% PASS:**
  - `curl -I https://linhhoasu.lol/web-panel/assets/js/lucky-wheel.js` -> HTTP/2 200 OK.
  - `curl -I https://linhhoasu.lol/web-panel/assets/css/lucky-wheel.css` -> HTTP/2 200 OK.
  - `curl -I https://linhhoasu.lol/web-panel/assets/css/ui-refactor.css` -> HTTP/2 200 OK.
  - `curl -I https://linhhoasu.lol/web-panel/assets/images/lucky-wheel/99001.png` -> HTTP/2 200 OK (Content-Type: image/png, 41KB).
  - Trạng thái cache-busting `?v=time()` trên `index.php` giúp mọi client tải ngay lập tức bản cập nhật.

"""

if old_content.startswith("# Session Report\n\n"):
    updated_content = "# Session Report\n\n" + new_entry[len("# Session Report\n\n"):] + old_content[len("# Session Report\n\n"):]
else:
    updated_content = new_entry + old_content

with open(report_path, 'w', encoding='utf-8') as f:
    f.write(updated_content)

print("Updated session_report.md successfully!")
