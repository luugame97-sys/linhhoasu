# Session Report — WebGM nhiều máy chủ

## 1. Tóm tắt công việc

Xác minh và sửa điểm danh nhận Xu lặp khi chuyển server. Ví Xu thuộc tài khoản chung nhưng khóa cũ là tài khoản + server + ngày. Baseline được tái hiện bằng API thật trên database fixture: cùng tài khoản nhận hai lần ở S1/S2. Candidate dùng một quyền nhận theo tài khoản + ngày GMT+7, giao dịch nguyên tử cùng ví, lịch sử và nhật ký.

Giữ mức quà cấu hình thực tế 5.001 Xu/lần (không tự đổi thành 5.000). Snapshot ban đầu có 18 account-day nhận thêm một lượt, tổng 90.018 Xu; không quy kết cố ý lợi dụng và không thu hồi tiền. Không sửa game/backend/client, không restart game, không tác động dịch vụ khác.

Các luồng được rà soát và xử lý: login/CSRF/tab cũ, route API theo server, quyền nhân vật, VIP, điểm danh, Webshop retry, GiftCode, Tích Donate, SePay và trang admin. Không tuyên bố mọi luồng đã được nghiệm thu upstream thực tế.

## 2. File/thư mục đã thay đổi

Source production `/linhhoasu/webgame/gm/`: thêm `daily_checkin.php`, `reward_delivery.php`, `web_context.php`, `assets/js/web-context.js`; sửa `index.php`, `login.php`, `api/user_api.php`, `api/sepay_webhook.php`, `admin/admin_api.php`, `admin/index.php`, `assets/js/index.js`, `assets/js/admin.js`. `config.php` chỉ thay đúng các đoạn đã so hash, không lấy config đã che thông tin hoặc `.env` local ghi đè.

Schema mới `daily_checkin_account_claims`, `web_reward_deliveries`; giữ nguyên toàn bộ bảng, hàng lịch sử và số dư cũ. Backfill chọn hàng điểm danh đầu tiên theo ID; không xóa các hàng nhận thêm. Source chưa đồng bộ vào `F:\WebSite\gm\Linhhoasu` vì checkout đó cũ và chưa kiểm tra thay đổi của người dùng.

Tool snapshot/audit/test/stage/release/verify/config-transform nằm trong `_ai_workbench/tools/`. Baseline, candidate và evidence nằm trong `_ai_workbench/temp/web_multiserver_20260906/`. Backup source/config/schema/history ở VPS `/linhhoasu/_ai_workbench/backups/web_multiserver_20260906_170250/`, quyền hạn chế; không đưa secret vào ZIP hoặc báo cáo.

## 3. Lỗi đã gặp & giải pháp

| Lỗi | Nguyên nhân | Cách xử lý | Cách tránh lặp lại |
|---|---|---|---|
| Đổi server nhận thêm Xu | Ví toàn tài khoản, khóa nhận theo server | Receipt tài khoản/ngày; khóa ví chung; lookup cả lịch sử cũ | Test nhiều session/server/process và ngày mới |
| Tab cũ thao tác nhầm server/tài khoản | Login giữ CSRF cũ, API lấy session vừa đổi | Xoay CSRF; token trang gắn account/uin/server; bắt tải lại, không tự phát lại giao dịch | Test S1→S2, đổi account, mất token, form logout |
| Thiếu API server mới tự rơi về S1 | Mặc định endpoint 8080 cho mọi server | Server >1 cần API riêng; server lạ/thiếu route bị từ chối | Không chỉ thêm tên server ở giao diện |
| Thu hồi VIP S2 làm mất VIP S1 | UPDATE auth_codes thiếu used_server_id | Khóa account, cập nhật đúng server; cache VIP tổng lấy MAX | Fixture một account có VIP khác nhau trên hai server |
| GiftCode vượt max_uses | Chỉ tăng used_count sau gửi; không giữ lượt khi pending | Khóa nguồn, tính lượt đã gửi + đang giữ; outbox unique | Nhiều tài khoản/server tranh lượt cuối |
| Mất phản hồi làm quà kẹt hoặc đổi nội dung khi retry | Marker không có trạng thái/snapshot/nhân vật gốc | Outbox giữ nguyên role/server/quà/kỳ/key; nút quà chờ giao | Retry sau timeout, qua kỳ, sửa/tắt cấu hình |
| Nhật ký lỗi nhưng delivery báo hoàn tất | gm_audit_log best-effort | Finalize thất bại giữ pending; retry chỉ hoàn tất nhật ký, không gửi lại mail đã xác nhận | Inject audit failure và kiểm số lần gửi |
| Xóa GiftCode mất nguồn lịch sử | DELETE hàng cấu hình | Chuyển thành tắt mã, giữ lịch sử | Nút Tắt; không tự xóa ledger |
| Webhook bỏ giao dịch hoặc ghi sai khi thiếu định danh | Ưu tiên merchant code trước provider id, lỗi DB trả 200 | Giữ reference cũ; namespace provider ID/relay ID + marker; bind receipt; xung đột lịch sử trả 409; DB lỗi 500 | Không tự đổi/migrate receipt đã xử lý; test retry và account/server/amount/action |
| Webhook có thể cộng giao dịch tiền ra | Không xét transferType | Chặn trường explicit khác in; giữ ngoại lệ relay không gửi trường này | Đối chiếu payload upstream thực tế trước siết bắt buộc |
| Test migration lỗi 1137 | MySQL TEMP không cho đọc lại cùng bảng trong self-join | Backfill INSERT IGNORE SELECT ORDER BY id một lần đọc | Chạy test trên MySQL 5.7 thật, không chỉ MariaDB |
| Lệnh read-only lỗi quoting PowerShell | Escape kiểu shell khác làm pipe chạy local | Chuyển lệnh SSH vào tool có tên dưới workbench | Không nhồi command nhiều lớp escape |
| Gọi publish quá sớm | Chưa qua đủ110 giây từ HTTP gate đã xác minh | Guard từ chối publish/verify/open, giữ gate tới khi đủ điều kiện | Tính tuổi gate trước chuyển pha, không bỏ guard |
| Hậu kiểm in tiếng Việt lỗi GBK | stdout Windows mặc định không phải UTF-8 | stdout.reconfigure UTF-8, chạy lại thành công | Phân biệt lỗi in báo cáo với mutation/kiểm chứng thực |

UTF-8 được giữ; các đoạn tiếng Việt mới không phát hiện mojibake. Các warning cố ý từ thử audit/payment failure là fixture, không phải log lỗi production.

## 4. Kỹ năng / kinh nghiệm mới

| Dữ liệu/luồng | Phạm vi đúng |
|---|---|
| Ví Xu, tài khoản, quyền điểm danh mỗi ngày | Toàn tài khoản dùng chung mọi máy chủ |
| Nhân vật, VIP WebGM, GiftCode claim, Donate milestone, Webshop/GM delivery | Tài khoản + máy chủ; recipient được xác minh server-side |
| Giao dịch ngân hàng | Định danh giao dịch duy nhất toàn hệ thống; ledger giữ server chỉ định |
| Lịch sử tiêu/nạp hiển thị | Theo account + server đã đăng nhập; không tin server trong POST |

Khóa ví `FOR UPDATE` và receipt unique là hai lớp bảo vệ; không giữ khóa SQL trong lúc gọi API gửi mail. Outbox giữ slot kể cả mất phản hồi, rồi finalize sau bridge xác nhận. Schema preflight từ 10 truy vấn riêng xuống một truy vấn, kiểm đủ 13 bảng. Trang admin cache lookup role theo account/server trong từng request; không cache số dư/quyền lâu dài.

SePay yêu cầu phân biệt tiền vào/ra và nhận diện giao dịch ổn định; HTTP không 2xx phục vụ retry. Đã đối chiếu [tài liệu chính thức SePay](https://developer.sepay.vn/vi/sepay-webhooks/tich-hop-webhook). Với MySQL, [locking reads](https://dev.mysql.com/doc/refman/8.4/en/innodb-locking-reads.html) chỉ là nguyên tắc tham chiếu; bằng chứng tương thích đến từ test PHP 7.4/MySQL 5.7 thực tế, không suy phiên bản mới tương đương.

## 5. Trạng thái hiện tại

Đã phát hành, mở lại lúc **00:05:55 GMT+7 ngày 07/09/2026**, checkpoint `temp/web_multiserver_20260906/release.json` có phase=open. Gate từ00:03:24 đến00:05:55, khoảng151 giây. Quy trình: hash baseline → backup → gate ba endpoint trước config/session_start → HTTP kiểm gate → chờ quá request_terminate_timeout=100 giây → kiểm FPM → migration → helper/config/pages/assets → verify khi còn gate → mở API mới cuối cùng.

Hậu kiểm00:13:10: **13/13 hash đúng, ready S1/S2 đều200, PM2 giữ nguyên toàn bộ6 process/PID/restart**. S1 PID17789/restart1383; S2 PID17688/restart53; dist30824/admin30856/bot1600/1576 không đổi. Trang login200, player/admin chưa đăng nhập302, JS200 và hash nội dung HTTP khớp. CSRF thiếu trả reload_required, unknown server fail-closed, routes1001→8080/1002→8083. Đã nhìn trực tiếp trang login bằng browser và mở danh sách S1001/S1002; không nhập thông tin tài khoản.

Migration có689 hàng điểm danh cũ →671 quyền account-day, không xóa hàng hoặc điều chỉnh ví. Snapshot00:11:36 có693 hàng/675 quyền, missing0;4 lượt mới sau mở web, nhóm duplicate lịch sử vẫn18. Legacy GiftCode không thêm batch mới sau cutover;10 giftcode+4 recharge mới sent, không có pending trong snapshot này. Một login failure và một SePay success được ghi nhận; không kết luận toàn log sạch lỗi hoặc kết luận giao dịch đó đã đủ chứng từ ngân hàng.

Đối soát bổ sung snapshot00:13:09: **15 outbox sent/15 batch đều có đúng1 mail lưu trong Mongo đúng userId+eventKey của server**, kiểm SELECT/read-only; không tạo quà/tài khoản QA live. Một số người chơi đã claim thư; đây là quan sát lưu lượng thật, không thay thế bộ nghiệm thu kiểm soát tất cả vật phẩm/thiết bị.

Kiểm thử đã chạy:

- 103 checks daily/API trên MariaDB cô lập: tái hiện baseline, 5 vòng hai tiến trình S1/S2, legacy/retry/rollback/UTC+7/CSRF/context.
- PHP 7.4.33/MySQL 5.7.44: 14 checks daily/migration dùng TEMP clone schema thật; 40 checks delivery fixture; 20 checks payment bằng body xử lý topup thật và TEMP clone account/sepay_logs. Không dùng ví người thật.
- 12 tiến trình tranh một GiftCode: 1 giữ lượt, 11 bị từ chối; pending snapshot/role/key giữ nguyên.
- 21 checks JavaScript UI, 17 checks admin VIP/GiftCode, 14 checks route/schema + 2 kiểm transform, 25 payment guard checks; PHP/JS syntax pass.

Gói delta `temp/web_multiserver_20260906/WebGM_MultiServer_20260907.zip`: 17 entry, CRC/hash PASS, SHA-256 `84df7117aadd80d61be38020f2e1dae7e0960cdc2b6bd230d27e43a65fce5027`; không env/config thật/account/secret. Hướng dẫn thêm server và rollback trong `notes/web_multiserver_deployment_20260907.md` và README của gói. Đã xóa hai schema QA tạm do phiên này tạo ở MariaDB riêng33316; không xóa database production, dữ liệu QA không cần khôi phục. Đã shutdown runtime QA, xác minh PID14100 và listener33316 không còn; giữ datadir trong workbench để truy vết.

Giới hạn: bộ test delivery chủ động dùng network fixture; phiên này chỉ quan sát thư thật của lưu lượng người chơi chứ không tự phát quà. Chưa chuyển tiền upstream hoặc đăng nhập bằng tài khoản người chơi. 425 marker Donate legacy không đủ snapshot/trạng thái nên không tự cấp lại;1.948 batch GiftCode ở snapshot đầu được giữ nguyên (thêm5 batch hợp lệ trướccutover). Thiếu transferType vẫn là ngoại lệ tương thích relay. Payload thiếu định danh ổn định hoặc va chạm namespace/lịch sử sẽ cần đối soát, không cộng mù. Chưa chứng minh zero-bug cho toàn bộ web hoặc khả năng chịu tải quy mô lớn; chưa nghiệm thu panel pending trên thiết bị vật lý.

## 6. Bước tiếp theo

1. Sau phát hành, tải lại WebGM hoặc đăng nhập lại để token trang khớp account/server. Điểm danh chỉ nhận một lần/ngày cho toàn tài khoản.
2. Khi thêm S3: cấu hình `LHS_SERVER_COUNT`, `LHS_SERVER_3_ID`, `LHS_SERVER_3_KEY`, `LHS_SERVER_3_NAME`, `LHS_SERVER_3_API_BASE` đúng node; kiểm loopback/remote allowlist, account dùng chung, role/DB riêng và internal HMAC hiện hữu. Không copy endpoint S1 mù.
3. QA được phê duyệt: cùng account ở hai server, điểm danh rồi đổi server; một Webshop đơn nhỏ và quà chờ giao; xác minh nhân vật nhận chính xác. Một chuyển khoản nhỏ từ upstream và replay cùng receipt cần account/nguồn tiền được chỉ định.
4. Rollback: không drop bảng mới hoặc phục hồi nguyên API cũ khi còn outbox pending. Giữ gate các luồng liên quan, đối soát pending và chọn bản rollback hiểu receipt mới. Không tự reset/thu hồi Xu lịch sử.
