# Web/game lệch nhân vật khi nhận giftcode — 04/10/2026

## Kết luận

Audit read-only production 11:14–11:18 ICT trên VPS `103.116.104.165` xác nhận một đường gây lệch server: web đăng nhập mặc định S1 hoặc lựa chọn cũ của trình duyệt; xác thực thông qua `/api/user/login` của game. API này tự tạo role trên server được yêu cầu nếu chưa có role. Vì vậy chỉ đăng nhập web ở S1 có thể tạo nhân vật S1 cấp1 dù người dùng chơi server khác.

Giftcode lấy `hk_default_session_role()` theo phiên web, không lấy nhân vật game đang chơi. Popup game mở `/web-panel/?is_popup=1&tab=tab-giftcode` mà không có context nhân vật đã xác minh. Các kiểm tra ownership hiện tại bảo vệ tài khoản/server của phiên web, nhưng chưa xác nhận người dùng thực sự muốn nhận vào nhân vật đó.

## Bằng chứng live

- Hai ngày gần nhất có678 lượt giftcode: S1=271, S2=3, S3=2, S4=3, S5=4, S6=28, S7=367; tất cả status `sent`, không có `pending_delivery` trong khoảng đã truy vấn.
- Đối soát500 lượt mới nhất:500 recipient tồn tại và thuộc đúng tài khoản/server ghi trong phiên web;0 ownership mismatch.
- 146/500 lượt trỏ đến role khác với role có `lastLoginTime` game gần nhất. Trong đó137 thư của18 tài khoản còn nguyên/chưa nhận tại các nhân vật S1 cấp1. Đây là bằng chứng lệch điểm nhận, không tự suy tất cả các lượt đổi server đều nhầm.
- 320 thư còn tồn tại:146 đã nhận theo mail/ledger,174 chưa nhận.180 thư không còn tìm thấy bằng eventKey; chưa chứng minh mất thưởng (thư đã nhận có thể đã xóa). Không phát lại hoặc chuyển đồ dựa trên thiếu mail đơn thuần.
- Ví dụ đối soát: delivery6638 của `xuantoi05` gửi S1 cấp1; cùng account có nhân vật `Hoa Hoa` S7 cấp9 và role login gần nhất ởS7. Thư S1 vẫn chưa claimed.
- Tuyến WebGM S1–S7 đúng gameId/cổng8080,8083–8088. Vấn đề quan sát được là lựa chọn người nhận, chưa thấy API gửi nhầm sang account khác trong mẫu.

## Phương án sửa

1. Web dùng xác thực tài khoản không tạo role và không đổi server game. Giữ nguyên hành vi login game bên ngoài phạm vi WebGM.
2. Sau xác thực chỉ liệt kê nhân vật thật đã có; hiển thị server, tên, cấp, UID. Gợi ý role game gần nhất nhưng không tự chuyển khi nhiều lựa chọn.
3. Trước claim phải xác nhận account + server + UID; server kiểm lại quyền sở hữu và gắn xác nhận với CSRF/context phiên. Chặn form cũ khi đổi tài khoản/server; không tin UID/query string từ browser.
4. Popup trong game dùng context game được backend xác minh; chặn khi phiên web khác nhân vật. Không đặt token trong URL/localStorage hoặc tắt kiểm tra quyền để đồng bộ.
5. Thông báo kết quả và lịch sử ghi rõ nhân vật/server nhận. Retry giữ nguyên recipient/eventKey của delivery cũ.
6. Xử lý lịch sử riêng: đối soát mail/claim ledger, cùng account, recipient đích do chủ account xác nhận, claim tại server đích, lượt/hạn code. Chỉ chuyển/cấp bổ sung khi có chứng cứ chống nhận hai lần; không tự chọn server gần nhất làm đích chuyển đồ hàng loạt.

## Giới hạn và trạng thái

Chỉ chẩn đoán theo câu hỏi “có cách nào fix không”: không đổi source/runtime/DB production, không đăng nhập bằng mật khẩu người chơi, không gửi lại quà, không restart. Chưa có E2E sau sửa vì chưa triển khai bản sửa.

Local `HTTPServer.js` có endpoint `giftcode-context` và `GiftcodeContextService` nhưng bản live vừa tải không có endpoint đó; không coi candidate local là chức năng đã deploy. Các file local khác cũng có thay đổi TopArena chưa đồng bộ sau rollback; không deploy nguyên bản local.

Bằng chứng: `_ai_workbench/temp/web_game_identity_20261004/web.json`, `mail_audit.json`, `hashes.json`, `config_selected.json`, `HTTPServer.js`, `game_index.html`, `source/`.
