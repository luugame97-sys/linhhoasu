# Triển khai tính năng khóa tài khoản game có thời hạn – 01/09/2026

## Trạng thái

Đã triển khai **cơ chế thử nghiệm và giao diện quản lý**, chưa khóa bất kỳ tài khoản người chơi nào.

- VPS: `103.116.105.154`
- WebGM: `http://103.116.105.154:88`
- QA account dùng xem trước: `testweb01`
- `accountMutation=false`
- `banCommitCalled=false`

## Chức năng đã có

- Khóa theo số ngày hoặc vĩnh viễn ở lớp Account game.
- Lưu `banUntil`, `banReason`, `banCode`, `bannedAt`, `bannedBy`, `banMeta`, `banHistory`.
- Tự mở khóa khi hết hạn.
- Tăng `authVersion` và thu hồi token của account khi khóa/mở khóa.
- Login đúng mật khẩu nhận mã `ACCOUNT_TEMP_BANNED`/`ACCOUNT_BANNED` cùng thông báo tiếng Việt.
- WebSocket đang online được gửi tag lỗi kèm lý do rồi đóng.
- WebGM có modal riêng “Kỷ luật tài khoản game”, tách biệt “Khóa WebGM”.
- Modal mặc định xem trước; commit cần bấm xác nhận lần hai.
- WebGM gọi backend game qua internal HMAC, không truy cập Mongo trực tiếp.

## Kiểm thử

- AccountBanService in-memory: **21 checks PASS**.
- HTTPServer timed-ban endpoint contract: **13 checks PASS**.
- Node syntax: game 7 file và WebGM JS PASS.
- PHP syntax trên VPS: `config.php`, `admin_api.php` PASS.
- HMAC WebGM → game preview với `testweb01`: HTTP 200, `dryRun=true`, `preview=true`.
- Preview không thay đổi account; commit-ban không được gọi.
- `/ready`: HTTP 200, Mongo/Redis healthy.
- `/health`: HTTP 200, PID `23654`.
- Chỉ restart `lhs-s1001`; `lhs-dist`, `lhs-admin`, `lhs-real-bots` không bị restart.

## File production đã triển khai

| File | SHA-256 |
|---|---|
| `/linhhoasu/lhs/newServer/src/services/AccountBanService.js` | `93cf37929eda4db42d5cfa9e7d828609a85404b77ebb2abf5540526d45601e91` |
| `/linhhoasu/lhs/newServer/src/db/models/Account.js` | `77315dc8b89e15deb3a979586d9ffdec60ce41ccc66ace781a1335fbaf237616` |
| `/linhhoasu/lhs/newServer/src/services/AccountService.js` | `f1e6f565c0dfde13c21f256387a42a2cd978cc72eb857e671ae5f35dc096a0b9` |
| `/linhhoasu/lhs/newServer/src/handlers/account.js` | `326c1773c09318dfdbfa3de9b5a54719d770f71d98c54f511cb5a52106a61910` |
| `/linhhoasu/lhs/newServer/src/handlers/serverList.js` | `714750d206e204599602c8c843eda6ff5aec6cf7a41ec4c660b23b9a66c134ec` |
| `/linhhoasu/lhs/newServer/src/net/HTTPServer.js` | `92b0fffdd377af9f7c3279491b6530b5836c6ceba4e435c6f8f76077b14b2d0f` |
| `/linhhoasu/lhs/newServer/src/net/WSServer.js` | `9c7e82f49fdbc13934b4262da00823bf7b9f91a5b64a7b70fd910c535269cc8f` |
| `/linhhoasu/lhs/newServer/src/handlers/activity.js` | `d4d01c76bad282f7baa0cf98f207c3fcf1e42aa80c5de01762c64e9a30a859f6` |
| `/linhhoasu/webgame/gm/config.php` | `2c950c21f122ec01365f1b7a3494a898e3f8f36d13cd238206ad503394685debf` |
| `/linhhoasu/webgame/gm/admin/admin_api.php` | `03e8e886822ee6f66d99896fdf7d4af848c5a80510226ddaf0c0da7c720e5db91` |
| `/linhhoasu/webgame/gm/admin/index.php` | `2a2eca885ca456b606e3c83efdc65fe625b114a4f548e9bafffc1ec1851980894` |
| `/linhhoasu/webgame/gm/assets/js/admin.js` | `431e7f708d1f9222cb6a219339cf8bbc47e7e04f8694f0e826a66f298607ad` |

Backup source:

- `/linhhoasu/_ai_workbench/backups/timed_ban_feature_pre_20260901_102823/`

Snapshot PM2 đầy đủ có secret đã được xóa; chỉ giữ backup source cần rollback.

## Cách dùng WebGM

1. Mở `http://103.116.105.154:88/admin/index.php` và đăng nhập admin.
2. Vào **Quản lý người chơi**.
3. Bấm **Khóa game** ở đúng nhân vật. Nút này khác với **Khóa WebGM**.
4. Nhập số ngày và lý do → **Xem trước khóa**.
5. Kiểm tra thời điểm mở khóa, lý do và target → bấm **Xác nhận khóa game**.
6. Để mở khóa, mở lại modal và bấm **Mở khóa game** rồi xác nhận.

Trong phiên này không thực hiện bước 5 cho bất kỳ người chơi thật nào.

## Việc còn lại trước khi xử lý 36 tài khoản

- Bạn đăng nhập WebGM và kiểm tra modal trên `testweb01` (chỉ xem trạng thái/xem trước).
- Chọn chính sách tier hoặc 100 ngày đồng loạt.
- Tạo preview batch 36 người, kiểm lại tên/số lần bug/lý do.
- Chỉ sau khi bạn duyệt batch mới commit khóa thật.
