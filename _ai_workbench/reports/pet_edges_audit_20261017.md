# Rà soát pet 17/10/2026

Phạm vi read-only production. Hash live pet.js trùng candidate `866372cbdcc82d7261d9c2e95a83cdd758b4506a12eb25044c7c01d665becc48`. Đọc native main, PlayerService, WSServer và route; không deploy/restart/player writes.

## Kết quả

1. Ưu tiên cao: RPC3311 sửa trực tiếp session.player trước lưu, bỏ qua kết quả savePlayer. PlayerService có nhánh trả null khi không match. Fixture null save vẫn trả result0 và mất material trong RAM; save throw vẫn để RAM đã tiêu material. Chưa chứng minh mất dữ liệu production. Các handler3302/3304/3306/3307/3312/3315 cũng có mẫu await-save không kiểm tra kết quả; cần draft + xác nhận lưu + xử lý phiên khi commit không rõ. WSServer có role lock chung, không kết luận thiếu khóa hoặc race chỉ vì handler không tự khóa.
2. Native3304 chỉ kiểm tra phản hồi truthy, không result0: mô phỏng result-1 vẫn phát âm thanh lên cấp và tăng nowUpgradeTimes. Native3305/3306 còn truy cập t.data.uid mà không guard data; native3312 chạy update/unbind sau result-1 nếu object tồn tại. Cần kiểm tra toàn đường addon trước chốt mức ảnh hưởng UI từng route; fixture xác nhận native3304, chưa browser E2E.
3. Manual3311 đã cho dư EXP, auto3314 vẫn chỉ chọn cặp EXP khi tổng <=cap và trả EXP_LEVEL_CAP. Đây là khác biệt hành vi, không mặc định lỗi: tự động bỏ EXP có thể tiêu nhiều pet vô ích. Nên giữ auto không hao khi target đầy và thông báo lý do dừng rõ; không tự đổi chính sách.
4. Manual3311 vẫn chặn recipient đang ở slot chủ chiến/hỗ trợ; nâng bằng3304 không có điều kiện này. Có thể tinh chỉnh chỉ bảo vệ nguyên liệu tiêu hao, cho recipient đang dùng nhận EXP, nhưng cần kiểm tra cập nhật thuộc tính/đội hình trước sửa.

## Bằng chứng

- `_ai_workbench/tools/audit_pet_edges_20261017.js`
- `_ai_workbench/temp/pet_eat_overflow_20261017/audit-edges.json`: 3 tình huống tái hiện bằng mock, không DB hoặc gameplay mutation.
- Chưa đủ căn cứ coi reset hoàn Quả Linh theo cấp là lỗi kinh tế: cần xác minh quy tắc chuyển đổi EXP/reset gốc trước kết luận.
