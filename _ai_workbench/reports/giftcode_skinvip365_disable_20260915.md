# Vô hiệu hóa SKINVIP365 — 15/09/2026

- Đã vô hiệu hóa theo CAS hẹp trong MongoDB game: `lhs_s1001`, `lhs_s1002`, `lhs_s1003`.
- Không xóa vật lý, không sửa reward, giới hạn hoặc lịch sử sử dụng.
- Trạng thái sau cập nhật ở cả 3 DB: `status=disabled`.
- `usedCount` được giữ nguyên: S1 = 1, S2 = 0, S3 = 0.
- WebGM MySQL không có bản ghi `SKINVIP365`, nên không có dòng nào cần cập nhật ở bảng `giftcodes`.
- Không restart server và không sửa dữ liệu người chơi; lượt đã nhận trước đó không bị thu hồi.

## Kiểm chứng

- Read-back cả 3 Mongo DB: code tồn tại nhưng `status=disabled`, `updatedBy=admin`.
- Read-back MySQL WebGM: truy vấn `code/giftcode=SKINVIP365` trả 0 dòng.
- Code bị chặn ở nhánh game giftcode disabled; lịch sử sử dụng được bảo toàn.
