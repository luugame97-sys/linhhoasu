# Đối chiếu bậc rơi Nội đan/Tinh huyết với bản Trung — 14/09/2026 (UTC+7)

> Đính chính: báo cáo này đã phân tích nhầm hệ thống so với câu hỏi “cấp bậc rơi45” của người dùng. Số liệu dưới đây chỉ nói về cảnh giới/Alchemy, không phải cấp rơi trang bị. Cấp rơi trang bị dùng `BoxConfig` / `boxInfo.level`; đối chiếu tĩnh VN local và snapshot CN đều45 row, cùng nội dung. Xem mục đính chính45→100 trong `session_report.md`; không cần mở Alchemy để tăng cấp rơi trang bị.

## Kết quả

- Binary Trung hiện tại `config_2f004ade.bin` trả HTTP 200, `Last-Modified: 04/09/2026 10:40:18 GMT`, SHA-256 `40c6e371fbe90f423e29f91e519459632789f038326ab8fa8550114494b9c276`; hash trùng snapshot đã lưu ngày 09/09.
- Bản Trung có 747 bảng; bản server hiện tại có 714. Riêng `RoleStageConfig` đều 45 mốc, `AlchemyFormulaConfig` đều 148 công thức và nội dung hai bảng này trùng nhau.
- Cả hai bản có 15 bậc vật phẩm rơi cho mỗi nhóm: Nội đan `2001–2015`, Tinh huyết `2201–2215`. Mốc mở bậc: `1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34, 37, 40, 43`.
- Vì vậy ở stage 45, bản Trung cũng chỉ rơi bậc 15 (ID `2015`/`2215`); không có bậc 16+ trong binary Trung đã xác minh. Stage 44–45 không mở thêm tier vật phẩm.

## Khả năng mở thêm

- Có thể mở về mặt kỹ thuật, nhưng không phải đổi riêng số `45`. Cần nguồn dữ liệu chính thức cho tier mới, thêm asset/item, công thức tiêu hao và mốc stage tương ứng ở cả server + client; sau đó cập nhật policy/kiểm thử và native gameplay QA.
- Không nên tự tạo ID hoặc đẩy tier giả: service hiện cố ý fail-closed khi thiếu `AssetsConfig`/recipe/`RoleStageConfig`, và policy hiện khóa 15 tier với 100% chọn đúng tier hiện tại.
- Đây là đánh giá khả thi read-only; chưa sửa config, dữ liệu người chơi hay production.
