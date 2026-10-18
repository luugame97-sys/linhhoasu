# Xác minh phản ánh hungyen96 không thấy thư ở S2

## 1. Tóm tắt công việc

Nguyên văn phản ánh: “Mình nhận hết code vs cả mua 200k vé mà ko thấy thư”. Theo dữ liệu production đọc lại lúc **19:53:09 ngày05/09/2026 (UTC+7)**, đã có đầy đủ thư và dấu nhận trên đúng nhân vật S2. **Không xác nhận được giả thuyết không chơi S1 nên S2 không nhận quà**, và không có bằng chứng giao dịch chưa giao để phát bù ở thời điểm audit.

Điều này không phủ định việc người chơi từng không thấy thư ngay lúc giao dịch. Chưa có screenshot/trace client ở thời điểm đó để kết luận hiển thị, độ trễ hay đang xem sai server. Không quy lỗi hoặc ý định cho người chơi.

## 2. File/thư mục đã thay đổi

- Không sửa game, DB, ví, code, đơn hàng, thư hoặc nhân vật; không restart hay đăng nhập thay người chơi.
- Tool read-only trong `_ai_workbench/tools/`: `inspect_hungyen96_s2.py`, `audit_hungyen96_web_ledger.php`, `audit_hungyen96_mail.py`, `verify_hungyen96_claims_20260905.py`.
- Evidence riêng dưới `_ai_workbench/temp/hungyen96_s2_20260905/`: `audit.json`, `mail_audit.json`, `web_ledger.json`, `claims_verified.json`. Source snapshot config không được đưa vào gói bàn giao vì có thể chứa cấu hình nhạy cảm.
- Báo cáo MD/HTML này và cập nhật session_report.md/.html. Backup báo cáo trước sửa: `_ai_workbench/backups/hungyen96_audit_reports_20260905/`.

## 3. Bằng chứng và kết luận

| Nhóm | SQL WebGM | Mongo S2 | Dấu nhận trong player ledger |
|---|---|---|---|
| Giftcode | 5 code có claim; 5 batch sent, không last_error | 5 thư đúng userId S2, read=true, claimed=true | Khớp cả5mailId |
| Webshop | Đơn1495, server1002, status paid, total_price200.000Xu, item1001, quantity200 | 1thư chứa1001×2.000, read=true, claimed=true | Khớp mailId |
| Tích nạp | 24claim mốc theo server1002 | 24thư đúnguserId S2, read=true, claimed=true | Khớp cả24mailId |
| Tổng | 30 giao nhận liên quan | 30thư,0chưa nhận,0hết hạn | 30/30mailId |

### Đơn “200k vé”

- Đơn Webshop **1495** tạo lúc **19:34:09**, tổng giá ghi nhận **200.000 Xu Web**. Không suy đây là200.000VNĐ.
- SQL quantity200 là số lượng mua; thư thực tế có **2.000 vé item1001**.
- Thư tạo19:34:09.404; hiện claimed=true và có mailId trong mailClaimLedger. `updatedAt` của thư là19:42:36 — đây là mốc cập nhật bản ghi, không phải log riêng chứng minh thao tác bấm nhận chính xác tại giây đó.
- InventoryS2 lúc kiểm có **1.610 vé1001**. Không tự kết luận390vé chênh lệch đã tiêu cho gói nào vì chưa truy ledger tiêu vé.

### Quà code và mốc

- Năm batch giftcode được nối với thư bằng eventKey server-authoritative: SHA256(account|server|giftcodeId|batchNo). Tất cả tìm thấy và đã nhận.
- Hai mươi bốn mốc được nối bằng SHA256(account|server|milestoneId|claimPeriod). Tất cả tìm thấy và đã nhận.
- Kiểm bổ sung hệ Hồn ngọc S2 có30viên cấp5; điều này hỗ trợ việc phần quà code có30placeholder đã được resolve, nhưng không dùng số lượng trùng để gán nguồn một cách tuyệt đối khi không có transaction ledger từngviên.
- S1 không có thư liên quan của các role tài khoản trong lần đọc. Các thư trên đều thuộc roleS2 đúng account, không gửi nhầm S1.

### Tài khoản và routing

- Tài khoản có metadata và player thật ở cảS1 vàS2, trạng tháiaccount hoạt động. RoleS1 level5 lúc đọc có thể được khởi tạo từ login mặc định; không đồng nghĩa người dùng chủ động chơiS1.
- `lhs_api_base(1002)` trỏ8083; `lhs_roles_for_account` gọi lookup theo server_key và lọc cảserverId/accountId. `hk_default_session_role` được dùng chung bởi code/Webshop/tích nạp.
- Mốc “24thư” ở kiểm tra đầu không phải kết quả cuối: người chơi tiếp tục nhận mốc trong khi audit. Snapshot sau và đối chiếu đầy đủ xác nhận30thư,30ledger. Không dùng hai snapshot khác thời điểm để kết luận thiếu6thư.

## 4. Kỹ năng / kinh nghiệm mới

- Tách “WebGM báo thành công”, “mail đã tạo”, “mail claimed”, “player claim ledger” và “inventory hiện tại”. Mỗi lớp chứng minh một phần, không lấy một cờsuccess để khẳng định tất cả.
- Phản ánh “không thấy thư” không đồng nghĩa “server chưa tạo thư”. Cần thời điểm phản ánh để so với log/snapshot, không tự phát bù gây trùng.
- SQL chỉ truy vấn SELECT trong read-only transaction; Mongo chỉ find/count. Không gọi route submit_giftcode/buy_shop_item/claim_mail.

## 5. Trạng thái hiện tại

- Xác minh giao/nhận:30/30thư và ledger,0unclaimed,0expired, đúngroleS2.
- Không có bằng chứng tài khoản này bị mất toàn bộ quà vì thiếuS1; cũng chưa chứng minh mọi tài khoản chỉ cóS2 đều không thể gặp lỗi khác.
- Chưa xác định tình trạng UI tại thời điểm người chơi báo lỗi. Chưa audit toàn bộ lịch sử tiêu vé hoặc mọi nguồn ngoài các giao dịch được nêu.
- Chưa phát bù/hoànXu/resetcode hoặc đánh dấu thư. Không cần mutation cho kết luận này.

## 6. Bước tiếp theo

1. Gửi người chơi đối chiếu vé1001 hiện tại và thời điểm họ từng không nhìn thấy thư; hỏi có bấm“nhận tất cả” hoặc đăng nhập lại sau khi phản ánh không, không mặc định họ đã làm thao tác nào.
2. Nếu vẫn báo thiếu, xin ảnh server/nhân vật/túi vé và giờ thao tác; không xin mật khẩu hoặc code còn dùng được.
3. Khi điều tra tiếp, kiểm hiển thị thư/đúngserver và trace đồng bộ1100/1102/1103. Chỉ xét bù nếu có giao dịch chưa giao hoặc nhận sai được chứng minh, trừ các khoản đã nhận để tránhdoublegrant.
