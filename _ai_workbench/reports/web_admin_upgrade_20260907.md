# Session Report — Quản trị tài khoản và giao diện

## 1. Tóm tắt công việc

Đã phát hành lúc **00:37:26 GMT+7 ngày 07/09/2026** phần quản trị/giao diện; không thay đổi ví, cấu hình phần thưởng Donate hoặc gửi bù. Yêu cầu bổ sung đổi cách gọi phía người chơi đã được áp dụng: **Web quản lý tài khoản Linh Họa Sư**; nhãn WebGM/GM Panel chỉ giữ ở khu vực kỹ thuật/quản trị.

| Yêu cầu | Kết quả |
|---|---|
| Menu lọc tài khoản | Tất cả, đang khóa, hoạt động, có VIP, VIP1, VIP2, chưa VIP; khóa hết thời hạn không bị hiển thị như còn khóa |
| Tìm kiếm tự hiểu | Tài khoản, ID WebGM, UID, tên đầy đủ nhân vật; tự thử qua API xác thực server, không cần chọn kiểu |
| Server trên đầu trang | Chuyển toàn phiên admin; bỏ bộ chọn server trùng ở quản lý người chơi; xoay CSRF/context, tab cũ phải tải lại |
| Tổng tiền SePay | Tổng toàn thời gian và khoảng đang xem, số giao dịch, Donate Xu/VIP, 50 giao dịch chi tiết gần nhất; chọn account chính xác để xem riêng |
| Thẻ lỗi/cảnh báo | Bấm thẻ để lọc đúng nhóm và cuộn tới bảng; số tổng vẫn phản ánh tập log trước khi chọn thẻ |
| Nút lên đầu trang | Nút nhỏ, mờ, dùng chung login/player/admin; hỗ trợ vùng cuộn lồng bên trong và reduced motion |
| Hạn GiftCode | Form tạo có ngày giờ hết hạn GMT+7; danh sách hiển thị hạn; server kiểm ngày hợp lệ, để trống giữ không giới hạn |
| Trạm GM gõ tài khoản | Tự nhận diện sau khi nhập, hiện tên/account/UID/server; nhiều kết quả phải chọn; server tái xác minh trước thao tác |
| Countdown Donate | Ngày/tuần/tháng theo GMT+7, lấy mốc thời gian server; hết kỳ yêu cầu tải lại, không tự nhận quà |
| Đổi/phân bố quà, gửi bù, tăng tháng20 triệu | Chưa áp dụng do tỷ lệ mâu thuẫn và cần chốt cách xử lý điểm kỹ năng đã tiêu; xem mục6 |

Tìm tên nhân vật là tìm chính xác theo API hiện hữu, không đoán tên gần giống. Tài khoản hỗ trợ tìm một phần; ID và UID là định danh chính xác. Không tuyên bố hỗ trợ mọi alias/playerId ngoài hợp đồng API đã kiểm tra. Danh sách quản lý vẫn là các tài khoản đã đồng bộ vào web; không tự tạo tài khoản web mới khi tìm thấy role trong game.

## 2. File/thư mục đã thay đổi

Production `/linhhoasu/webgame/gm/`, tổng12 file:

- Thêm `admin_management.php`, `web_experience.php`, `assets/js/admin-management.js`, `assets/js/web-experience.js`, `assets/css/web-experience.css`.
- Sửa `admin/admin_api.php`, `admin/index.php`, `assets/js/admin.js`, `index.php`, `login.php`, `api/user_api.php`.
- `config.php` chỉ thêm thay nhãn WebGM trong thông báo JSON phía người chơi; giữ nguyên các chức năng bảo mật/ban/routing của lần phát hành trước.

Snapshot/candidate/evidence: `_ai_workbench/temp/web_admin_upgrade_20260907/`. Tools snapshot, test backend/monitor/switch/JS, render/serve preview, release/verify trong `_ai_workbench/tools/`. Backup VPS `/linhhoasu/_ai_workbench/backups/web_admin_upgrade_20260906_173626/`, backup báo cáo local `_ai_workbench/backups/web_admin_upgrade_reports_20260907/`.

Không đổi gameplay server/client, không sửa auth/VIP của người thật, không gửi thư QA vào game, không chuyển tiền, không chỉnh bảng Donate/GiftCode đã có. Không ghi global memory hoặc tạo tool tại root. Workspace không phải Git repository; dùng snapshot/hash để bảo vệ baseline.

## 3. Lỗi đã gặp & giải pháp

| Lỗi/vấn đề | Nguyên nhân | Cách xử lý | Chống tái diễn |
|---|---|---|---|
| Bộ chọn server trùng, hành động bị khóa khi xem khác phiên | Server xem và server admin tách rời | Một menu topbar chuyển phiên thật, CSRF mới, tải lại | Kiểm old-tab context và server từng mutation |
| Tìm tên/UID không ra | Chỉ SQL account/id | Resolver các loại định danh qua internal API, lọc đúng server | Không trust frontend hoặc tự chọn nếu nhiều kết quả |
| Khóa/VIP lọc sai phạm vi | Ví chung, VIP theo server; timed ban có thể đã hết | Query entitlement theo server, tính hạn ban tại thời điểm query | Fixture S1 VIP2/S2 VIP1, expired ban |
| Ký tự gạch dưới trong search thành wildcard | SQL LIKE mặc định `_`/`%` là mẫu | Escape bằng `!`, prepared statements | Test literal underscore và injection |
| Response tìm kiếm cũ ghi đè kết quả mới | Nhiều request về không đúng thứ tự | Request sequence, bỏ response cũ | Không dùng kết quả cũ để gửi GM |
| Tổng SePay bị tính đôi nếu cộng log sự kiện | Ledger và log success cùng mô tả giao dịch | Chỉ tổng hợp sepay_logs; status tabs không thay số tiền đã nhận | Test ledger10k + notice không thành20k |
| Lỗi/cảnh báo đếm chồng | failed có thể đi cùng warning | Nhóm error ưu tiên, warning loại error | Tab manual_review/ignored/failed |
| Form GiftCode không có hạn dùng | Backend có trường nhưng form tạo không nhập | datetime-local + parser ngày GMT+7 | Test ngày30/02 bị từ chối |
| GM đang xác nhận nhưng mục tiêu bị đổi | Đọc input sau khi mở xác nhận | Chốt payload/role và kiểm lại mục tiêu trước gửi | Không tự gửi lại khi không rõ kết quả |
| Tab admin cũ chưa có UI mới | Cache/page cũ vẫn có token hợp lệ | Header phiên bản UI; bắt tải lại trước xử lý | Deploy assets/pages trước API mới |
| Patch API đầu thất bại | CRLF từ PowerShell không khớp chunk | Chuẩn hóa newline trước apply_patch; thao tác đầu không sửa dở | Kiểm syntax/diff sau patch |
| Browser element stale | Text accessibility được render lại | Đọc lại state, dùng phần tử mới | Không click lặp trên index cũ |

Nội dung mới giữ UTF-8. Không sửa thủ công các file mã hóa cũ ngoài phạm vi. Frontend được kiểm bằng skill computer-use trên dữ liệu QA; kỹ năng này giúp xác nhận hành vi thực tế của filter, thẻ log, target preview và nút lên đầu trang.

## 4. Kỹ năng / kinh nghiệm mới

Server chọn ở admin là quyền tác động, không chỉ là bộ lọc trang; đổi server phải vô hiệu ngữ cảnh của tab cũ. Tìm tự hiểu chỉ được hiển thị/chọn dựa trên dữ liệu API server, không đoán chủ nhân của UID. Lọc tài khoản và nạp tiền không được làm biến đổi trạng thái ban hoặc số dư.

Tổng tài chính phải từ ledger duy nhất; log retry/cảnh báo có thể nhiều dòng cho một giao dịch. Tìm riêng SePay bằng account/id được ràng buộc account chính xác để không lẫn account tên gần nhau. Chi tiết giới hạn50 dòng, tổng tiền vẫn tính toàn tập theo phạm vi chọn.

Countdown lấy mốc server GMT+7, dùng thời gian chạy đơn điệu của trang; không tin đồng hồ hệ điều hành người dùng. Tuần làm mới00:00 thứ Hai, tháng làm mới00:00 ngày1. Sau hết kỳ UI yêu cầu reload; claim vẫn tự kiểm server.

## 5. Trạng thái hiện tại

Đã triển khai và hậu kiểm:

- 24 backend checks trên PHP7.4.33/MySQL5.7.44 với TEMP clone schema: lọc/search/expiry/finance/countdown.
- 9 checks chạy đúng handler monitor với schema thật được shadow bằng TEMP: exact account, SQL tổng tiền, tab lỗi/cảnh báo, phân trang.
- 8 checks session chuyển server bằng handler thật: giữ identity/admin, xoay CSRF, chặn context tab cũ, reject server lạ.
- 12 checks JS: scroll đa vùng, countdown, form expiry, request race, target payload, same-origin header, branding.
- Browser QA: chọn “Đang bị khóa” chỉ còn tài khoản khóa; chọn SePay hiện tổng và chi tiết; bấm thẻ Lỗi trả dòng failed/error; gõ qa_alice hiện đúng tên/UID/server. Preview không có kết nối ngân hàng/game thật.
- Live read-only:412 tài khoản web;5 khóa đang hiệu lực; S1 có1 VIP, S2 chưa có VIP tại snapshot. Cùng account thực được tìm bằng account/UID/tên ở cả hai server; tổng finance khớp SQL trực tiếp. Không xuất danh tính/tài khoản ra báo cáo.
- 12/12 source hash đúng. Login/JS/CSS200, player/admin guest302; ready8080/8083 đều200. Sáu process PM2 giữ PID/restart, không restart game hoặc PHP-FPM.
- Browser live trang đăng nhập hiển thị đúng “Web quản lý tài khoản Linh Họa Sư”, không còn GM Panel/WebGM trong nhãn người chơi. Không đăng nhập người thật hoặc thử mutation trên tài khoản thật.

Giới hạn: không live gửi GM, không đổi server trong phiên admin người thật, chưa nghiệm thu thiết bị vật lý; UI thử bằng fixture rồi kiểm source/HTTP/live read-only. Quà Donate/gửi bù chưa thực hiện. Endpoint lookup hiện hữu dùng tên đầy đủ/UID chính xác; chưa thêm tìm gần đúng tên hoặc playerId khác userId.

## 6. Bước tiếp theo

Admin tải lại trang để nhận header phiên bản mới; menu server ở topbar đổi phiên toàn bộ trang. Quản lý người chơi lọc theo menu; SePay chọn nguồn, nhập account/id chính xác và khoảng thời gian. GiftCode mới có thể đặt hạn hoặc để trống không giới hạn.

### Cần chốt trước thay quà và gửi bù

Snapshot read-only có50 mốc active;15 mốc tuần400.000–5.000.000đ liên quan41 claim lịch sử; mốc tháng hiện tối đa10.000.000đ. Item5 là Điểm kỹ năng, item65 là Đùi Gà, item4 là Bánh Bao/Baozi.

- Điểm kỹ năng→Đùi Gà: ví dụ5.000→500 là chia10 nhưng10.000→10.000 là giữ nguyên. Đề xuất thống nhất chia10 (10.000→1.000), chưa áp dụng.
- Bánh Bao tuần: user nêu x10 và10.000→100.000, nhưng15.000→1.500.000 là x100. Đề xuất x10 (15.000→150.000), chưa áp dụng.
- Gửi bù: đối chiếu mail/outbox/claim theo account+server+milestone+period. Không dùng số claim×cấu hình mới để khẳng định phần thiếu khi cấu hình cũ có thể khác; trừ đúng phần đã cấp, key bù duy nhất tránh lặp.
- Đổi điểm đã nhận: cần chốt phần điểm đã tiêu có giữ nguyên, chỉ đổi số còn, hay phương án khác. Không tự âm điểm, reset kỹ năng hoặc thu từ nguồn khác.
- Tháng20 triệu: sau chốt tỷ lệ mới, đề xuất thêm các mốc12/14/16/18/20 triệu và cân đối phần thưởng gia tăng theo mức nạp; giữ mốc/claim lịch sử, không đổi ID để mở nhận lại. Cần duyệt bảng quà trước áp production.

Chưa phát sinh thay đổi số dư/phần thưởng trong phiên này. Không tự mở automation, không tự thu hồi hoặc gửi bù khi chưa rõ quy tắc.
