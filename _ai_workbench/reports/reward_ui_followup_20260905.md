# Tiếp tục kiểm tra lỗi item trên phiên game đang chạy — 05/09/2026

## Kết quả

- Dùng đúng tab game người dùng đã mở sẵn tại `http://103.116.105.154:81/`; không tạo phiên đăng nhập mới, không reload, không đăng xuất.
- Nhìn thấy nhân vật `nicky`, cấp 108, đang ở trong game. Lớp loot hiển thị item `108` và nút **Bán toàn bộ**.
- Không bấm bán, không mở item, không mua gói, không dùng code; tránh làm thay đổi inventory người dùng.
- Console tại thời điểm đọc: các cảnh báo Spine “tài nguyên chưa tải xong”, cảnh báo khoảng cách ký tự và duplicate handle; **không thấy Illegal invocation, TypeError, Unhandled hoặc fatal error** trong lần đọc hiện tại.
- Các listener WebSocket probe localhost và proxy QA đã được dừng; không để lại cổng kiểm thử 18791–18793.

## Trạng thái fix

- Không có bằng chứng lỗi đăng nhập trên phiên người dùng đang chạy. Nhánh sửa wrapper WebSocket bị dừng, không patch client production.
- Không thể nghiệm thu item UI từ lớp loot đang mở vì hành động đóng/mở hoặc click sai có thể làm bán/tiêu item. Server WS contract, DB/relog và native ownership đã PASS ở phiên triển khai trước.
- Các cảnh báo Spine/duplicate handle được ghi nhận riêng; chưa đủ bằng chứng là nguyên nhân item lỗi hoặc mất tương tác.

## Bước kế tiếp an toàn

1. Khi người dùng đóng lớp loot hoặc chủ động chỉ rõ item cần kiểm, mới thao tác một item cụ thể và chụp state trước/sau.
2. Đối chiếu item delta, native state và console theo đúng `itemId/msgUid`; không bấm nút bán toàn bộ.
3. Giữ 114 ID fail-closed và P4 repair preview chưa commit.
