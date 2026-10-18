# Chẩn đoán kẹt bán trang bị sau Ủy thác — 15/09/2026

## Kết luận

- Lỗi chính là **hàng đợi RPC theo socket bị flood**, không phải riêng thuật toán chọn đồ bán.
- Các phiên gây lỗi gửi hàng loạt request nâng Pháp tướng `tag=3001` (và có lúc nâng thú cưỡi `3204`) nhanh hơn server xử lý. Mọi RPC mutation cùng socket bị xếp tuần tự, nên `2201` bán trang bị phải đứng sau hàng trăm request.
- Client auto-sale đặt deadline riêng **12.000 ms**. Log live ghi `2201` chờ queue S1 `17.620 ms`, S2 `14.231 ms`, S3 `18.411 ms`; vì vậy client chạy nhánh báo “Chưa xác nhận bán…” trước khi server đến lượt xử lý.
- Sau deadline, callback `2201` đến muộn bị bỏ qua (`guard.finished`), nên danh sách client vẫn giữ UID cũ. Nếu server đã bán/lưu xong, bấm **Bán toàn bộ** thủ công gửi lại UID không còn trên server; server trả `uids=[]`, client coi là partial/invalid và báo cùng lỗi. Đây là lý do auto-sale lỗi kéo theo bán thủ công cũng không được trong cùng phiên UI.

## Bằng chứng live

- S2 `ws#1165`: flood `tag=3001`, queue depth lên ít nhất `180`; `2201 msgUid=988` backlog depth 92, bắt đầu sau `14.231 ms`. Sau đó nhiều `3001` chờ gần 30 giây và socket đóng còn depth164.
- S3 `ws#2501`: `3001` chiếm 2.464 sự kiện queue trong cửa sổ 00–01h, depth140; `2201 msgUid=3194` backlog depth88 rồi chờ `18.411 ms`. Socket đóng còn depth65.
- S1 `ws#1553`: flood chủ yếu `3204`, depth85; `2201 msgUid=4098` chờ `17.620 ms`.
- Có thêm lỗi thứ cấp hiếm: S2 một lần `AUTO_EQUIP_SALE_SAVE_NOT_CONFIRMED`; S1/S3 có `send failed ... EPIPE` khi socket đóng. Đây không giải thích phần lớn ca kẹt nhưng cùng kích hoạt thông báo fail-safe.
- Khi không bị backlog, handler `2201` thường hoàn tất khoảng 0,5–3,4 giây; post-send chỉ 0–2 ms. Test hiện tại 18 case/200 batch vẫn PASS vì harness gửi tuần tự và không mô phỏng flood `3001/3204` hoặc ACK đến sau 12 giây.

## Trạng thái

- Lượt này chỉ đọc source/log và chạy regression local: `productionWrites=0`, `networkAttempts=0` đối với test; không sửa/deploy/restart/DB.
- Cần sửa theo hai lớp: chặn/coalesce spam `3001/3204` ở client hoặc server, và làm auto-sale reconcile được ACK muộn/UID đã bán thay vì giữ trạng thái client cũ. Chỉ tăng timeout 12 giây không xử lý gốc và vẫn có thể kẹt khi queue 20–30 giây.
