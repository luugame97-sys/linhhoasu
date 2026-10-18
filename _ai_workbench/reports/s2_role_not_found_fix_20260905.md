# Sửa ROLE_NOT_FOUND khi chọn S2 — 05/09/2026

## 1. Tóm tắt công việc

Đã tái hiện và sửa đúng luồng client: SDK2820 không truyền serverId nên xác thực mặc định S1; chọn S2 chỉ đổi địa chỉ kết nối, không đổi userToken/UserID. Backend S2 trước đây dùng userId S1 từ token để tìm trong DB S2, gây ROLE_NOT_FOUND cho tài khoản có hoặc chưa có nhân vật S2.

Bài test trước gọi SDK2820 kèm serverId1002 nên bỏ sót luồng chọn server thật. Đợt này tái hiện bằng SDK mặc định S1 rồi dùng nguyên token đó kết nối WS-S2: trước sửa result−1/ROLE_NOT_FOUND, sau sửa loginACK vàplayer500PASS.

## 2. File/thư mục đã thay đổi

- Source chính production/local: `src/services/AccountService.js`, `src/handlers/account.js`.
- Đồng bộ local bản sửa proxy trước đó trong `src/net/HTTPServer.js`; production file này đã sửa ở đợt111609, không sửa lại trong đợt mới.
- AccountService thêm resolveServerLoginSession: kiểm token, authVersion, ban, role nguồn thuộc account, gate server đích; chọn role của đúng server. Nếu account chưa có role server đích, tạo qua helper private đã xác thực, không cần/mượn mật khẩu người dùng.
- Helper tạo role private giữ nguyên API tạo role bằng password; không có request flag bypass authentication.
- account.js từ chối route/server mismatch và sử dụng resolved role của node hiện tại. Không rewrite token gốc hoặc đi vào nhánh resetPlayerForServerSwitch.
- Tools: `snapshot_cross_server_login.py`, `qa_native_s2_switch.js`, `run_native_s2_switch_probe.py`, `test_cross_server_session.js`, `deploy_cross_server_login.py`, `trace_s2_role_not_found.py`.
- Evidence: `_ai_workbench/temp/cross_server_login_20260905/native_before.log`, `deploy_20260905_113900.json`; trace chỉ đọc `_ai_workbench/temp/s2_login_20260905/role_trace.json`.
- Backup production: `/linhhoasu/_ai_workbench/backups/cross_server_login_20260905_113900/`; local `_ai_workbench/backups/cross_server_login_local_20260905/`.

## 3. Lỗi đã gặp & giải pháp

| Lỗi | Nguyên nhân | Sửa/kiểm tra | Tránh lặp |
|---|---|---|---|
| Tất cả tài khoản chọn S2 báo ROLE_NOT_FOUND | Token ban đầu gắn role S1; S2 tìm sai DB/userId | Resolve role theo server đích sau xác thực token | E2E bắt đầu SDK không truyềnserverId như client |
| Dễ tạo trùng/reset role khi chuyển | Luồng cũ có reset khi serverSwitched | Giữ role existing, serverSwitched=false trong session đích, queue theoaccount/server | Verify sentinel level/item/settings và sốrole sau retry |
| Test đăng nhập cũ xanh nhưng client vẫn lỗi | Test gửi thẳng token từ SDK S2 | Bổ sung S1 token→S2 mới/cũ/retry | Test cảstate transition, không chỉendpoint độc lập |
| Diagnostic đọc log quá lớn | File PM2 chứa lịch sử lớn | Đọc tail bằngbuffer giới hạn3MB, không tải nguyên log | Bounded log reads |
| In log trên Windows lỗiGBK | Print Unicode theoencoding mặc định | Evidence UTF-8 lưu thành công trước lỗi in; đọc lại quaPowerShell | stdoutUTF-8 trong tool sau |

## 4. Kỹ năng / kinh nghiệm mới

- Token xác thực account và role nguồn không đồng nghĩa role đó dùng được trên mọi server. Role đích phải thuộc cùng account, đúng node và còn tồn tại.
- Không dùng params.platformuid/roleId của client để tùy chọn account khác; phải dựa trên authsession và ownership DB.
- Nhân vật S1/S2 tách biệt. Không copy save S1 qua S2, không sửa/reset role thật để che lỗi đăng nhập.

## 5. Kiểm thử và trạng thái

- Contract10checksPASS: token sai, authVersion sai, role nguồn không thuộcaccount, accountban, serverclosed đều từ chối; existingrole đúngserver không reset, token gốc không đổi.
- Live QA trước sửa: SDK mặc định S1→WS-S2 tái hiện ROLE_NOT_FOUND.
- Live QA sau sửa: role S2 mới tạo đúng1lần; đăng nhập lại bằng cùngtokenS1 không tạo trùng; role S2 đã có giữlevel≥37,item55=1234,setting sentinel; document nhân vật S1 không thay đổi; SDK S2 trực tiếp→WS cũngPASS.
- Đã nhận loginACK vàplayer500 qua WS thật; không phải visualUI acceptance.
- QA account/players được tạo riêng, cleanup exact accountId, DB counts0. Auth token QA cóTTL tựhết; không lograwtoken/password.
- Hai file deployedhashkhớp, S1/S2ready200, processonline. ChỉrestartS1/S2 vì chungsource; khôngrestartdist/admin/DB/Nginx; không thayconfiglịch.
- **S2 giữ mở cho mọi tài khoản**, không whitelist, không tự đóng18:55/19:00. Chỉ đóng khi người dùng yêu cầu.

## 6. Người dùng kiểm nghiệm

1. Đóng thông báo lỗi, tải lại trang game rồi đăng nhập lại tài khoản và chọnS2.
2. Nếu chưa từng có nhân vậtS2, phải vào bước tạo/chọnnhânvật; nếu đã có, vào đúngnhânvậtS2 cũ.
3. Quay vềS1 để kiểm tiến trìnhS1 vẫn nguyên; không cần reset tài khoản hoặc tạo tài khoản khác.
4. Nếu còn lỗi, gửi mãlỗi và thờiđiểm; không gửi mật khẩu/token. Không tuyên bố mọiclientđãPASS trước phản hồi của người dùng.
