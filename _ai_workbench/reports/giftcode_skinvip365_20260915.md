# Giftcode SKINVIP365 — 15/09/2026

- Đã tạo code `SKINVIP365` trong MongoDB production của S1/S2/S3 (`lhs_s1001`, `lhs_s1002`, `lhs_s1003`). Không ghi đè code có sẵn; dùng kiểm tra tồn tại + `$setOnInsert`.
- Trạng thái `active`, `maxUses=0` (không giới hạn tổng), `perUserLimit=1`, `usedCount=0` tại thời điểm tạo.
- Quà được chuyển từ 19 ID bộ sang **204 ID mảnh `FashionConfig`** để khi nhập giftcode server grant quyền sở hữu skin trực tiếp; không phát ID rương.
- Bao gồm toàn bộ biến thể `showType=3` của danh sách đã chốt. Nhánh `spFashionIds` của bộ `28340` và màu 1–7 của `29040` đã được đưa vào. Không thêm `28410` vì ID này không thuộc danh sách “thời trang đặc biệt” trước đó.

## Kiểm chứng

- Read-back cả 3 database: code tồn tại, `active`, chính sách đúng, đủ 204 item ID, `usedCount=0`.
- Contract grant trên runtime server: 204/204 mảnh tồn tại trong `FashionConfig`, grant không lỗi, 204 quyền sở hữu được tạo trong fixture RAM.
- `/ready`: HTTP 200 trên 8080 (S1), 8083 (S2), 8084 (S3).
- Không restart process, không sửa dữ liệu người chơi, chưa redeem bằng tài khoản thật nên chưa tuyên bố native UI E2E.
