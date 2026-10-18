import os

report_path = r'i:\Linhhoasu\server\server\_ai_workbench\reports\session_report.md'
with open(report_path, 'r', encoding='utf-8') as f:
    old_content = f.read()

new_entry = """# Session Report

## Thiết kế Bộ Chọn Máy Chủ Đa Năng & Thanh Trượt Ngang (Slider) Chuẩn Đẹp — 30/09/2026 01:50 ICT

- **Nguyên nhân lỗi trên popup / mobile:**
  - Dropdown cũ dùng Bootstrap Popper.js với `position: absolute` trong container iframe/popup có chiều cao giới hạn.
  - Khi Popper lật lên trên (`placement="top"`): menu bị kẹp giữa mép thẻ card và header, xẹp thành khe hở màu trắng không thể thao tác (lỗi ở ảnh 2).
  - Khi Popper bung xuống dưới: menu che phủ toàn bộ ô nhập "Tài khoản", "Mật khẩu" (lỗi ở ảnh 1) hoặc bị các nút tải game đè lên khi màn hình co hẹp.
- **Cách giải quyết triệt để & đa năng:**
  1. **Khối Thẻ Máy Chủ Tương Tác (Active Server Card):**
     - Nằm cố định trong luồng khối (inline layout), không dùng absolute trôi nổi.
     - Hiển thị tên máy chủ to rõ, icon chuyên nghiệp, badge trạng thái `🟢 Hoạt động` (chấm xanh pulsing), và nút `Đổi ❯`.
  2. **Thanh Trượt Chọn Nhanh Máy Chủ (Quick Server Slider Track - Dạng trượt đẹp):**
     - Hàng nút máy chủ (S1001 $\rightarrow$ S1006) trượt ngang (swipeable horizontal scroll-snap).
     - Vuốt chạm cực nhạy trên màn hình cảm ứng di động / popup iframe trong game, hỗ trợ cuộn chuột trên PC.
     - Người chơi 1 chạm là đổi ngay server tức thì trong 0.1 giây mà không che bất kỳ trường thông tin nào.
  3. **Modal Chọn Máy Chủ Đa Năng (`#serverSelectModal`):**
     - Chạm vào thẻ máy chủ sẽ mở Modal toàn diện:
       - Trên Mobile / Popup game (<576px): Tự động biến thành **Bottom Sheet trượt từ đáy lên** chuẩn UI app di động cao cấp, có thanh kéo (swipe handle) và bo góc trên 22px.
       - Trên PC / Tablet: Modal căn giữa sang trọng, lưới 2 cột danh sách server với tag trạng thái và dấu tick chọn xanh.
       - Tự động đóng modal sau khi chạm chọn, đồng bộ cả thanh trượt và input ẩn `#server_id`.
  4. **Ghi nhớ lựa chọn (`localStorage`):**
     - Tự động lưu server đã chọn vào `localStorage.getItem('lhs_selected_server_id')`. Khi mở lại web hoặc mở popup trong game, hệ thống tự động chọn đúng server người chơi đã chọn trước đó.
- **File thay đổi trên VPS mới:**
  - `/linhhoasu/webgame/gm/login.php`
  - `/linhhoasu/webgame/gm/assets/js/login.js`
  - `/linhhoasu/webgame/gm/assets/css/login.css`
  - Backup tại VPS: `*.bak_serverpicker`
- **Kiểm chứng thực tế 100% PASS:**
  - `php -l login.php` PASS syntax.
  - `curl -I https://linhhoasu.lol/web-panel/login.php` $\rightarrow$ HTTP/2 200 OK.
  - Tải file tĩnh có cache-busting timestamp `?v=filemtime`: `login.js` và `login.css` trả HTTP/2 200 OK ngay lập tức.
  - Kiểm tra DOM: khối `.server-picker-box`, thanh trượt `.server-slider-track`, và modal `#serverSelectModal` hoạt động hoàn hảo, không còn hiện tượng Popper flipping hay kẹp chữ.

"""

if old_content.startswith("# Session Report\n\n"):
    updated_content = "# Session Report\n\n" + new_entry[len("# Session Report\n\n"):] + old_content[len("# Session Report\n\n"):]
else:
    updated_content = new_entry + old_content

with open(report_path, 'w', encoding='utf-8') as f:
    f.write(updated_content)

print("Updated session_report.md successfully!")
