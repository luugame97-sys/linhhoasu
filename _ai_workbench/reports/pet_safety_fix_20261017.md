# Sửa an toàn thao tác pet — 17/10/2026

## Đã triển khai

- Shared pet.js: 14 handler thủ công3300/3301/3302/3304–3313/3315 chạy trên draft trong role lock có sẵn. Chỉ publish sau save truthy; null/throw trả lỗi chưa xác nhận, invalidate session để không dùng RAM cũ khi commit không rõ. Slot3301 đổi từ deferred sang confirmed save. Auto3314 giữ wrapper draft/receipt riêng.
- Recipient đang chủ chiến/hỗ trợ hoặc gắn Hồn thú nhận EXP được; nguyên liệu khóa/đang sử dụng/gắn Hồn thú vẫn được bảo vệ. Recipient khóa vẫn bị chặn. Quy tắc bỏ EXP dư giữ đúng lựa chọn người dùng.
- Client addon `lhs-pet-safety-v1.js`: guard success/shape9 route, lỗi không chạy callback thành công; kéo EXP lên ô trang bị và kéo thú trang bị xuống EXP đều gửi3311; cập nhật board/attrs/appearance sau thành công. Không gọi animation ô thường với slot âm.
- Auto giữ nguyên chính sách không tiêu EXP dư; thông báo giải thích có thể kéo tay nếu chấp nhận bỏ dư. Hai cảnh báo native30032333 thay bằng câu xác nhận bỏ EXP thật, không hứa hoàn vật phẩm. Main còn lại giữ nguyên byte.

## Kiểm chứng và giới hạn

- 11 nhóm test PASS: null/throw không đổi original và invalidate, success bảo toàn binding/UID/slot, duplicate bị chặn, nguyên liệu khóa, draft3301/3310, chín route client reject không gọi success, success hợp lệ, equipped refresh, drag EXP gửi ăn thay vì swap. Source syntax PASS.
- Đây là test cô lập với persistence/client mock, không Mongo giao dịch thật hoặc native authenticated gameplay E2E. Không dùng pet/tài nguyên tài khoản thật để thử; không migration/player write trực tiếp.
- Rollout `DEPLOYED_VERIFIED`: S1–S9 online/readiness Mongo+Redis9/9, PID/restart invariant, shared source hash, PM2save, HTTPS4/4, process ngoài phạm vi0. Server mới dùng cùng source/entry và client nhận cùng bản sửa.
- Backup chọn lọc `/linhhoasu/_ai_workbench/backups/pet_safety_20261017_124104`. Receipt `_ai_workbench/temp/pet_safety_20261017/deployment.json`, tests cùng thư mục. Restore đúng5preimages (addon mới thì gỡ khỏi loader/đưa về backup), CAS kiểm hash hiện tại rồi restart tuần tự để rollback.
- Giới hạn: chưa bổ sung receipt/idempotency cho tất cả thao tác thủ công; không tự retry khi kết quả lưu không rõ. Confirmed slot save có thêm độ trễ DB so với deferred cũ; đổi này bảo đảm thông báo thành công sau lưu.

## File triển khai

- `/linhhoasu/lhs/newServer/src/handlers/pet.js`
- `/linhhoasu/webgame/game/js/lhs-pet-safety-v1.js`
- `/linhhoasu/webgame/game/js/lhs-pet-grid48-v1.js`
- `/linhhoasu/webgame/game/js/main.min_drop200.js`
- `/linhhoasu/webgame/game/index.html`

Người chơi cần tải lại client để nhận addon. Cần nghiệm thu native ghép/ăn/nâng/đổi với tài khoản được cho phép và readback sau đăng nhập lại; không coi readiness là hoàn tất gameplay E2E.
