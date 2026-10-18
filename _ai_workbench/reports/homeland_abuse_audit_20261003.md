# Truy vết KNB từ Cúng tượng / Họa Trung Các

## Kết luận — 03/10/2026, 13:50–13:52 GMT+7

**Chưa đủ bằng chứng xác định nhân vật đã lợi dụng Cúng tượng nhận KNB vượt lượt, hoặc tính tổng KNB đã nhận từ lỗi cũ.** Không đồng nghĩa không có ai từng lợi dụng lỗi.

- Đọc trực tiếp 6.683 bản ghi nhân vật trên sáu DB đang chạy S1–S6; 1.932 có `homelandInfo`.
- 10 bản ghi có bộ đếm Cúng tượng mới; 2 có số lượt >0, không bản ghi nào >5. Không có `homelandInfo.actionLedger` chứa biên nhận.
- Log ứng dụng và PM2 còn từ 30/09 đến 03/10/2026: kiểm tra 20 file, khoảng 375,65 MB; không tìm thấy dòng RPC `6707` hoặc `6709`. Log ứng dụng và PM2 có nội dung trùng, không cộng thành số thao tác độc lập.
- Cả sáu runtime đang `LOG_LEVEL=warn`, `WS_TRACE_TAGS` rỗng. Thao tác bình thường được ghi ở mức debug nên không có nhật ký thành công để quy nguồn KNB.
- Không có collection nhật ký biến động tiền/Homeland trong inventory DB. Mongo `local` chỉ có `startup_log`, không có oplog để khôi phục chuỗi thay đổi.

## Các lượt đang được lưu

| Server | Tên nhân vật trong DB | Ngày bộ đếm | Lượt Cúng tượng |
|---|---|---|---:|
| S1 | Talo | 03/10/2026 | 5 |
| S3 | HanhGia_1003_17823d06b0_ | 03/10/2026 | 3 |

Hai dòng này chỉ chứng minh có lượt được lưu sau khi bổ sung bộ đếm, **không phải danh sách dùng bug**. Chưa kiểm chứng hai bản ghi là tài khoản QA/admin hay người chơi. Không lấy số dư KNB cao, tên nhân vật, cấp hoặc thời điểm cập nhật chung làm bằng chứng vi phạm.

## Vì sao không truy đầy đủ được lịch sử cũ

- Source trước bản vá: `handleHomelandPayTribute` cộng 10 KNB khi `free` truthy, 30 KNB khi trả phí nhưng không trừ phí/giới hạn; không ghi bộ đếm hay ledger. Evidence: `_ai_workbench/temp/homeland_audit_20261003/homeland.js`, hàm từ dòng607.
- Source live hiện tại hash `4f6f4937043fdb1162cd34e0e152b5e547785418319fdf1a3245cbc6b94f682d` khớp bản đã triển khai lúc08:38, chưa phải candidate local. Có giới hạn3+2 nhưng vẫn trả10 KNB mỗi lượt; không có biên nhận từng lượt, nên bộ đếm không đủ thay thế lịch sử kinh tế.
- KNB trong túi là số dư nhiều nguồn sau chi tiêu; so sánh với tổng nạp hoặc số dư cao không xác định được phần đến từ Cúng tượng.
- Chưa đọc backup DB lịch sử hoặc log trên VPS cũ. Hai nguồn này chỉ giúp quy trách nhiệm nếu giữ được dấu vết thao tác/biến động riêng đủ chi tiết; bản chụp số dư đơn thuần vẫn không quy nguồn được.

## Bằng chứng và phạm vi

- `_ai_workbench/temp/homeland_abuse_20261003/inventory.json`: runtime, collections, file log, source hashes.
- `_ai_workbench/temp/homeland_abuse_20261003/players.json`: thống kê/projection, hai bộ đếm có sử dụng; số dư trong file chỉ là dữ kiện nội bộ, không phân loại ai dùng bug.
- `_ai_workbench/temp/homeland_abuse_20261003/logs.json`: phạm vi quét, đếm theo tag; không chứa packet payload hay bí mật.
- Tool có thể chạy lại: `_ai_workbench/tools/audit_homeland_abuse_20261003.{py,js}`. Chỉ dùng driver Mongo đọc và SSH stdin; không khởi tạo models/handlers/logger, không ghi production.
- Không restart, không khóa người chơi, không thu hồi KNB, không gửi gameplay RPC. Một lần gọi mode details dừng ở kiểm tra thiếu tham số trước khi query DB; mode chưa sử dụng đã được gỡ.

## Bước tiếp theo có thể chứng minh được

Khi triển khai bản sửa đã nghiệm thu, cần lưu biên nhận riêng cho từng lần phát thưởng: server/nhân vật, mã yêu cầu, thời điểm, lượt trước/sau, KNB trước/sau, chi phí, phần thưởng và kết quả lưu. Chỉ log RPC thành công/chậm không đủ chứng minh tiền đã ghi. Hiện chưa triển khai thêm logging hoặc thay đổi runtime trong lượt audit này.
