# Kiểm thử lại pet — 18/10/2026, khoảng 06:50–06:54 GMT+7

## Kết luận

Bản sửa cải thiện bảo vệ dữ liệu, nhưng chưa thể nghiệm thu mọi luồng pet. Tái hiện được 5 thiếu sót bằng mã đang triển khai trong môi trường cô lập; không thay đổi production hoặc tiêu hao pet thật.

## Đã kiểm chứng

- Git vẫn chỉ có các thư mục/file untracked đã tồn tại. Đọc session report và báo cáo fix trước khi audit.
- SHA256 5 file live pet.js/main/grid/safety/index khớp candidate/receipt17-10. Pet.js: `3930fac8e92fb0d6a8c70dfe9a827bbb452b2f5c9bf75d1bcf78df1c9dd230d7`.
- S1–S9 online, `/ready` Mongo+Redis9/9. Đây là kiểm tra readiness, không gameplay E2E.
- Chạy lại11 nhóm test cũ PASS; bổ sung test sử dụng nguyên hàm native từ main và addon hiện hành. Trường hợp lỗi không phát âm thanh/counter thành công ở callback; việc chạy animation riêng ở view vẫn còn lỗi bên dưới.
- Ăn EXP trên cả chủ chiến/hỗ trợ1/hỗ trợ2/ô thường lên đúng cap260, giữ slot/UID/Hồn thú, tiêu đúng1material. Fixture dùng cấu hình giới hạn đã kiểm chứng trước; không thử bằng pet thật.
- Mô phỏng DB đã commit rồi báo timeout: original RAM không đổi, session bị invalidation, báo chưa xác nhận thay vì thành công; cần login read-back để hòa giải. Không chứng minh Mongo real commit-unknown hoặc reconnect E2E.
- Codec live pack/unpack3311 bảo toàn result-1/code/msg/data:null/retryable:false.
- Đối chiếu WSServer: có role lock và cache phản hồi theo request trong phiên. Không kết luận thiếu chống lặp hoàn toàn; durable receipt cho thao tác tay vẫn chưa có.

## Thiếu sót đã tái hiện

### 1. [P1] Auto có thể lặp vô hạn sau lỗi lưu làm mất hiệu lực phiên

`handlePetAutoCompose` null/throw save invalidate session rồi throw. Router từ chối request tiếp theo với `{result:-1,msg:'not logged in'}`; không có retryable:false. `grid.js/startRun` coi mọi lỗi không có retryable:false là tạm thời, tiếp tục theo lịch tới5giây/lần và chỉ báo chờ kết nối. Tái hiện3lần từ chối liên tiếp, timer vẫn còn, trạng thái auto chưa dừng. Không chủ động gây lỗi DB production.

Hướng sửa: phân biệt session-invalid/commit-unknown với lỗi mạng tạm thời, dừng auto, hướng dẫn/điều phối đăng nhập lại và hòa giải receipt trước khi tiếp tục.

### 2. [P2] Client tính thiếu chi phí nâng nhiều cấp

Native panel `sendUpgrade` kiểm tra `chi phí cấp hiện tại * số cấp`, trong khi server cộng chi phí tăng dần từng cấp. Live quality10 base250/add180, speedUpScale[0,20,40], speedUpLevel[1,5,10]. Ví dụ level21, nâng5cấp: client kiểm19.250 Quả Linh, server cần21.050. Fixture có20.000: UI gửi request nhưng server trả result-1, dữ liệu giữ nguyên.

Hướng sửa: dùng cùng phép cộng cấp liên tiếp, chọn số cấp thực sự đủ tiền, hiển thị tổng phí đúng.

### 3. [P2] View vẫn chạy animation nâng cấp trước ACK

Guard mới ngăn callback thành công/âm thanh/counter khi result-1, nhưng native panel `sendUpgrade` gọi `compSpine.setAnimation` ngay sau gửi request. Test nguyên hàm native + addon: animation đã chạy1lần trước phản hồi thất bại; âm thanh và counter không tăng. Đây là thiếu sót trong bản sửa và kết luận trước, không phải guard callback bị vô hiệu.

Hướng sửa: chỉ chạy animation view từ ACK thành công hoặc sự kiện nâng cấp đã xác nhận.

### 4. [P2] Giữ nút nâng cấp chưa giới hạn request đang chờ

Native long-touch gọi mỗi150ms; addon chỉ bọc kết quả, không chặn request mới khi request trước chưa trả. Test trì hoãn callback: 10lần gọi phát10request còn chờ. Log S1 sau rollout tại01:08:04 ngày18/10 có backlog depth8/tag3304. Không quy toàn bộ độ trễ server cho patch vì log không đủ chứng minh quan hệ nhân quả.

Hướng sửa: một request nâng cấp đang chờ cho mỗi pet; gom số cấp hoặc chỉ gửi tiếp khi ACK trước hoàn tất, dừng khi lỗi/thả nút/đóng view.

### 5. [P3] Bàn đầy che mất lý do dừng auto

`startRun` gặp BOARD_FULL luôn dùng câu chung, bỏ qua `blockedExpCap` và `blockedCostQualities`. Test summary BOARD_FULL+blockedExpCap:true chỉ hiện “Đã dừng: bàn đầy, không còn cặp phù hợp.”; câu giải thích giữ EXP mới thêm không được dùng.

Hướng sửa: ghép lý do bàn đầy với thiếu phí/vượtcap, giữ nguyên chính sách không tiêu EXP dư tự động.

## Bằng chứng và giới hạn

- `_ai_workbench/tools/audit_pet_retest_20261018.js`
- `_ai_workbench/temp/pet_retest_20261018/tests.json`
- Test cũ: `_ai_workbench/tools/test_pet_safety_20261017.js` (11nhóm PASS).
- Chưa thao tác browser gameplay, chưa Mongo giao dịch thật, chưa đăng nhập lại để so sánh DB/UI, chưa phủ toàn bộ success/failure của tẩy/đổi/reset/phóng sinh/đồ giám. Không tuyên bố không còn lỗi hoặc đã mất tài nguyên người chơi.
- Ưu tiên sửa: auto phiên lỗi → tính phí nhiều cấp → animation/giới hạn request → thông báo dừng. Lượt này chỉ audit, không deploy/restart/migrate.
