# Sửa ghép nhanh bỏ sót / chọn đủ phẩm chất — 05/10/2026

## Kết quả triển khai

- Đã triển khai S1–S7; giữ bàn 48 ô miễn phí. Menu chọn đủ phẩm cấu hình: 2, 3, 4, 5, 6, 7, 9, 10/Hỗn Độn. Không có phẩm 8 trong bảng hiện tại; server vẫn nhận ngưỡng 8 cũ.
- Ghép thường xét phẩm tăng dần, bỏ qua nhóm thiếu phí để xử lý các nhóm khác. EXP tự gộp, thử nguyên liệu/mục tiêu khác khi cặp đầu vượt giới hạn cấp. Dừng khi không còn cặp hợp lệ; giữ EXP dư, không tự đổi sang Quả Linh vì chưa có tỷ lệ quy đổi được xác minh.
- Giữ khóa, xuất chiến, Hồn Thú và pet thường cấp >1. Giữ pet đạt phẩm mục tiêu; chọn Hỗn Độn mới cho phép ghép pet phẩm 9 còn đủ điều kiện. Tỷ lệ/phí hiện tại: phẩm 9 lên 10 = 0,1%, 150 Quả Linh/lần; thất bại giữ pet đích theo cơ chế sẵn có.
- Kết quả trả số lần ghép/gộp EXP và lý do còn cặp; summary lưu cùng receipt, retry đồng bộ trạng thái hiện tại và không trừ phí lại. Receipt cũ vẫn tương thích. Menu cuộn tối đa 4 dòng nhìn thấy; thông báo phí/tỷ lệ khi chọn Hỗn Độn.

## Nguyên nhân / đối chiếu

- Batch cũ dùng thứ tự nhóm pet trong mảng rồi dừng toàn bộ ở cặp đầu thiếu phí. EXP chỉ thử mục tiêu cao nhất + nguyên liệu đầu, rồi dừng nếu vượt trần. Có 5 regression thất bại trên bản trước sửa.
- Menu cũ chỉ có mục tiêu 4/5. Read-only Talo S1 trước sửa có 22 pet phẩm 5 và 13 pet phẩm 6; chúng nằm ngoài giới hạn lựa chọn cũ.
- Snapshot Cozy 20/09 dùng thứ tự phẩm tăng dần và cùng bộ lọc khóa/cấp/phẩm mục tiêu. Backend ghép nhanh Cozy mới nhất chưa có phiên hợp lệ để xác minh; không tuyên bố giống 100%.

## Kiểm chứng

- Local và VPS candidate/installed: **20 nhóm server + 30 kiểm tra client PASS**. Có regression thứ tự/thiếu phí, EXP cặp thay thế, bàn đầy 48 ô/chuỗi ghép/phí đúng, tất cả mục tiêu, phẩm 9 thành công/thất bại, bảo vệ pet, receipt/retry/concurrent/save failure. QA gameplay dùng RAM, network bị chặn và productionWrites=0.
- 7/7 `/ready`: `status=ok`, Mongo/Redis true; source/hash installed khớp candidate; bot/admin/dist PID, trạng thái và uptime giữ nguyên.
- Public game/addon/WebGM HTTP200; addon đúng hash; HTML đúng candidate sau loại duy nhất beacon Cloudflare được chèn khi trả HTTP.
- Browser: đăng nhập lại S1 thành công. Người dùng xác nhận đang chơi và yêu cầu giữ nguyên tab; đã dừng thao tác UI theo yêu cầu. Menu 8 phẩm/scroll/Hỗn Độn được kiểm trong client harness, chưa nghiệm thu trực quan trong game. Chưa bấm Bắt đầu trong panel hoặc gửi RPC ghép nhanh để thử trên nhân vật thật.

## File và khôi phục

- Source: `linhhoasu/lhs/newServer/src/handlers/pet.js`, `linhhoasu/webgame/game/js/lhs-pet-grid48-v1.js`, loader `index.html` (candidate xây từ live preimage để giữ các sửa đổi khác).
- Backup/CAS: `/linhhoasu/_ai_workbench/backups/pet_grid48_20261005_145606`; stage `/linhhoasu/_ai_workbench/temp/pet_grid48_20261005_145606`.
- Receipts: `_ai_workbench/temp/pet_auto_exhaust_20261005/{deployment.json,candidate_files.json,preflight.json,public_readback.json}`. Runner tái sử dụng các gate của bản grid48 qua `_ai_workbench/tools/release_pet_auto_exhaust_20261005.py`.
- Rollback chỉ 3 file bằng preimage/hash CAS, restart game node tuần tự và readiness; backup vẫn là bản 48 ô. Không hạ capacity hoặc di chuyển/xóa pet.
- Client cũ cần tải lại trang để nhận addon `20261005_pet_auto_exhaust_v2`.
