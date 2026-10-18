# Redesign Quản lý người chơi và Kỷ luật Game/WebGM

## Trạng thái

Đã triển khai trên production `103.116.105.154:88`; chưa khóa tài khoản người chơi thật.

## Giao diện mới

- Mỗi dòng người chơi chỉ còn nút **Chọn chức năng**.
- Popup chức năng: **Quản lý Xu**, **Quản lý VIP**, **Đổi mật khẩu**, **Kỷ luật tài khoản**.
- Popup kỷ luật chọn độc lập:
  - Hành động: **Khóa tài khoản** hoặc **Mở khóa tài khoản**.
  - Phạm vi: **Chỉ game**, **Chỉ WebGM**, **Cả game và WebGM**.
  - Thời hạn: nhập bằng **giây**.
  - Lý do: để trống mặc định, chỉ bắt buộc khi xác nhận khóa.
- Xem trước không mutation; xác nhận lần hai mới áp dụng.
- Nếu thao tác “Cả hai” lỗi một phía, backend rollback phía đã xử lý.

## Backend game

- Lưu thời hạn/lý do/mã xử lý/lịch sử trên Account.
- Tự mở khóa khi hết hạn.
- Tăng `authVersion`, revoke token và kick WebSocket khi khóa.
- Login đúng mật khẩu nhận thông báo tiếng Việt `ACCOUNT_TEMP_BANNED`/`ACCOUNT_BANNED`.
- Internal HMAC endpoints: `ban-status`, `ban`, `unban`.

## Backend WebGM

- Tạo bảng `web_account_bans` và `web_account_ban_history`; hiện cả hai đều 0 bản ghi.
- Khóa WebGM có thời hạn và tự mở; tách khỏi khóa game.
- Có một khóa WebGM legacy `vanduc97` từ trước (không thuộc timed-ban phiên này), giữ nguyên trạng thái.

## Verification sau deploy

- AccountBanService: 21 checks PASS.
- HTTP timed-ban: 13 checks PASS.
- PHP/Node syntax: PASS.
- HMAC preview QA `testweb01`: HTTP 200, `dryRun=true`, không commit.
- Mongo game: 293 account, `banned=0`, `timed=0`, `reason=0`.
- WebGM: `web_account_bans=0`, `web_account_ban_history=0`, `webLocked=1` legacy.
- `/ready`, `/health`: HTTP 200; Mongo/Redis healthy.
- `lhs-s1001`: online PID `3175`; process khác không restart.
- Browser QA: `/admin/index.php` chuyển đúng `/login.php` khi chưa đăng nhập; không tự nhập credential.

## Backup

- `/linhhoasu/_ai_workbench/backups/timed_ban_feature_pre_20260901_110949/`
- `/linhhoasu/_ai_workbench/backups/webgm_admin_api_delta_pre_20260901_112134/`
- `/linhhoasu/_ai_workbench/backups/account_management_header_pre_20260901_111341/`
- `/linhhoasu/_ai_workbench/backups/timed_ban_schema_pre_20260901_105704/`

## Cách dùng

1. Đăng nhập [WebGM](http://103.116.105.154:88/admin/index.php).
2. Vào **Quản lý người chơi** → **Chọn chức năng**.
3. Chọn **Kỷ luật tài khoản**.
4. Chọn Khóa/Mở khóa và phạm vi Game/WebGM/Cả hai.
5. Nếu khóa, nhập số giây và lý do → **Xem trước** → kiểm tra → **Xác nhận**.

Chưa thực hiện bước xác nhận khóa thật cho 36 tài khoản trục lợi.
