# WebGM báo cáo trạng thái khóa và lời nhắn admin (01/09/2026)

## 1. Tóm tắt công việc

- Bổ sung báo cáo chi tiết ngay trong popup **Kỷ luật tài khoản game**.
- Hiển thị riêng hai thẻ **Tài khoản game** và **Tài khoản WebGM**.
- Trạng thái chỉ đọc; mở popup không thay đổi khóa hoặc dữ liệu người chơi.

## 2. Nội dung hiển thị

- Trạng thái đang khóa/đang hoạt động.
- Thời hạn còn lại được đổi sang phút/giờ/ngày dễ đọc.
- Tiêu đề từ metadata, ví dụ `Thiên Đạo Ban Lệnh`.
- Mã xử lý và người thực hiện.
- **Lý do nguyên bản** lưu trong bản ghi khóa.
- **Lời nhắn gốc của admin**, ưu tiên `adminMessage/originalMessage/message/notice` trong metadata; nếu chưa có trường riêng thì dùng nguyên văn lý do.
- Thông báo hệ thống đầy đủ.
- Thời gian mở khóa đặt nhỏ ở cuối thẻ.

## 3. File production đã thay đổi

- `/linhhoasu/webgame/gm/admin/admin_api.php`
- `/linhhoasu/webgame/gm/admin/index.php`
- `/linhhoasu/webgame/gm/assets/js/admin.js`

## 4. Kiểm tra

- Contract render: 6/6 PASS, gồm escape dữ liệu admin để chống chèn HTML.
- Node syntax: PASS.
- PHP lint staging production: PASS.
- API thật `get_account_discipline_status` cho `zerovip28n`: PASS; trả title, reason, adminMessage, code, bannedBy, meta, system message và unlock time.
- HTTP: admin `302`, JS `200`, game `/ready` `200`.
- Không restart game/WebGM và không thay đổi bản ghi khóa.

## 5. Hash và backup

- `admin_api.php`: `f1e2846c53aa015b72013cf9a56ffac174494a91ccabc17b40bc39bd666676d6`
- `index.php`: `a95b170bb2c58d0c801c32a38ed67350913e05694700711daee909c9f5b70d42`
- `admin.js`: `ee399762e29789f1f7bab87e7f2166992b9dac5c54fc3e8815fca15cb50bdc29`
- Backup: `/linhhoasu/_ai_workbench/backups/webgm_player_lock_report_pre_20260901_132744/`

## 6. Trạng thái hiện tại

- Đã triển khai production.
- Browser QA chuyển đúng về trang đăng nhập do chưa có phiên admin; chưa tự nhập credential.
- Admin cần `Ctrl+F5`, mở **Quản lý người chơi → Chọn chức năng → Kỷ luật tài khoản** để xem giao diện mới.
