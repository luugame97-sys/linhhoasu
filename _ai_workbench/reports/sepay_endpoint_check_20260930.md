# Kiểm tra kết nối webhook SePay — 30/09/2026

- Phạm vi cuối người dùng: chỉ cần kiểm tra endpoint đã thông với SePay. Không sửa webhook/Nginx, không gửi payload thanh toán thử, không cộng tiền.
- Lúc 20:25:47 ICT, GET qua DNS public và Cloudflare tới `https://lhs.mg365.fun/api/sepay_webhook.php` trả HTTP/2 200, `{"success":true,"message":"SePay webhook LHS ready"}`; TLS verify result `0`, thời gian phản hồi khoảng 0,56 giây.
- Nginx vhost `lhs.mg365.fun` root `/linhhoasu/webgame/gm`, PHP 7.4; endpoint PHP tồn tại và lint PASS. Đường `/api/sepay_webhook.php` trên domain game `linhhoasu.lol` khác route và trả 404, không phải URL người dùng đưa.
- Access log xác nhận POST tới endpoint lúc 20:23:29 ICT từ `171.244.35.2`, HTTP 200; địa chỉ nằm trong danh sách webhook SePay ở https://docs.sepay.vn/tich-hop-webhooks.html. Đây là bằng chứng kết nối inbound, không dùng HTTP 200 để khẳng định từng giao dịch đã được cộng Xu.
- Read-only ledger lúc 20:24:58 ICT có 332 receipt `SEPAY-%`; 3 receipt trong 24 giờ, gần nhất 10:16:38 ICT. Không có `failed/manual_review/partial` của nguồn SePay trong 7 ngày ở snapshot. Phân biệt 15 receipt admin với receipt webhook.
- Webhook 60.000đ lúc 20:00:27, nội dung `QR - U10UABLJ`, bị `syntax_not_matched`; **người dùng xác nhận đây là giao dịch khác**, không dùng trường hợp này làm nguyên nhân cho giao dịch đang báo. Webhook `SEPAY TEST WEBHOOK` lúc 20:11:36 cũng được ghi nhận nhưng bỏ qua cú pháp; không do phiên này gửi.
- Kết luận: URL public và luồng webhook từ SePay đang thông. Không chẩn đoán/bù giao dịch cụ thể vì người dùng đã thu hẹp phạm vi.
- Evidence: `_ai_workbench/temp/live_spine_sepay_audit_20260930.json`, `_ai_workbench/temp/sepay_details_20260930.json`.
