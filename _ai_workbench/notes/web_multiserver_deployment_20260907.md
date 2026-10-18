# Bản vá WebGM đa máy chủ — 07/09/2026

Đây là gói delta của WebGM đang chạy tại `/linhhoasu/webgame/gm`, không phải bộ cài game/web mới. Đã phát hành 00:05:55 GMT+7 ngày 07/09/2026. Không chạy lại SQL/source mù trên production hoặc trên snapshot cũ.

## Thành phần và giới hạn

- `source/`: 12 file WebGM thay đổi/thêm mới; không có `.env` hoặc config thật.
- `migrations/`: hai bảng mới, backfill quyền điểm danh từ lịch sử, không thay đổi ví cũ.
- `tools/web_multiserver_config_context_patch.py`: transform đúng baseline của config hiện hữu; từ chối khi đoạn cần sửa không khớp. Không phải tool tự triển khai.
- `manifest.json`: SHA-256 mỗi thành phần; không chứa tài khoản/token/dữ liệu người chơi.

## Cấu hình bắt buộc trong config hiện hữu

Ngoài transform routing/schema, thêm sau include `webshop_bundle.php`:

```php
require_once __DIR__ . '/daily_checkin.php';
require_once __DIR__ . '/reward_delivery.php';
require_once __DIR__ . '/web_context.php';
```

Schema cần hoàn tất trước nạp config/pages/API mới. Mọi source phải giữ UTF-8. Cần PHP 7.4+ 64-bit/PDO MySQL, InnoDB và cấu hình giờ database +07:00; đã thử đúng PHP7.4.33/MySQL5.7.44.

## Thêm một máy chủ, ví dụ S3

Tăng `LHS_SERVER_COUNT` và khai báo đủ ID/KEY/NAME/API_BASE của slot3 trong `.env` VPS. API_BASE phải trỏ đúng node S3; không dùng mặc định S1. KEY phải ổn định/duy nhất và khớp khóa server được lưu trong ledger; không đổi KEY của S1/S2 sau khi có giao dịch.

Chung account/SQL ví Xu; riêng gameplay DB/nhân vật/role theo server. Internal API cần giữ đúng key/HMAC và remote allowlist hiện hữu. Không restart dịch vụ game khác hay dùng cùng port/DB gameplay. Kiểm role ownership, login, VIP S3, điểm danh cross-server, đơn Webshop nhỏ, quà pending/retry và webhook của tài khoản test được cho phép.

## Đưa bản vá lên máy khác

1. Inventory ownership/process/route/schema và lấy source hiện hành; backup source/config/ledger trên VPS, không mang secret vào ZIP.
2. Chạy fixture PHP/MySQL phù hợp; kiểm hash baseline và toàn bộ delta.
3. Gate endpoint user/admin/payment trước session/config; webhook tạm trả 503 để retry, không báo giao dịch thành công giả. Xác minh gate qua FPM thật.
4. Drain request cũ theo FPM status và wall-clock terminate timeout thực tế, không dùng thời gian chờ giả định. VPS đợt này timeout100 giây, đã chờ hơn110 giây.
5. Migration giữ lịch sử; xác minh InnoDB, collation, unique receipt, số hàng và no missing claim. Không drop/clear bảng cũ.
6. Đưa helper → config patched → pages/assets → API mới cuối cùng. Hash/syntax/HTTP/CSRF/route và process identity hậu kiểm.

## Rollback

Không rollback nguyên API cũ khi có `web_reward_deliveries.pending_delivery`, không xóa hai bảng mới, không reset ngày hoặc hoàn Xu khi không biết thư đã gửi. Giữ gate các luồng liên quan và đối soát pending trước khi quyết định phiên bản rollback hiểu receipt mới.

SePay: receipt reference cũ giữ nguyên; provider id dùng namespace/marker mới. Va chạm với receipt lịch sử trả409 chờ đối soát, không đoán là giao dịch mới. Không tự đổi token/HMAC/provider settings. Thông tin nhận không có transferType vẫn giữ ngoại lệ relay cũ; cần payload được phép kiểm tra trước khi bắt buộc trường này.

## Kiểm chứng

Báo cáo `web_multiserver_20260907.md/.html` và evidence `temp/web_multiserver_20260906/`. Test fixture không thay thế upstream chuyển khoản, thiết bị/native nghiệm thu của người dùng. Gói không chứa backup, log credential, tài khoản QA hoặc node_modules.
