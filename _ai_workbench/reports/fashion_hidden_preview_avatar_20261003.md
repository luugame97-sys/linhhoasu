# Sửa preview thời trang ẩn và avatar cá nhân — 03/10/2026

## Kết quả

- Đối chiếu bundle Cozy đã lưu: hành vi phù hợp là hiển thị catalog/khóa và preview client-only; không tự cấp ownership.
- Thêm `lhs-fashion-hidden-preview-v1.js`: bổ sung suit, màu và các món thời trang standalone bị native gate ẩn vào panel; chọn món chưa sở hữu chỉ cập nhật preview, không gửi RPC equip. Mua, nâng cấp, nhuộm và quyền sở hữu vẫn đi qua native/server cũ.
- Thêm avatar cá nhân qua `tag=1807`: chọn ảnh hoặc camera bằng `input capture=user`, client resize JPEG 256px; server chỉ nhận PNG/JPEG/WebP, kiểm tra magic bytes, giới hạn 512KB, lưu file theo SHA-256 và giới hạn đổi lại 7 ngày.
- Thêm `avatarUrl`/`avatarUploadAt` vào Player và payload hiển thị/map; không thay avatar thời trang native, không xóa avatar cũ trong DB.

## File chính

- `linhhoasu/webgame/game/js/lhs-fashion-hidden-preview-v1.js`
- `linhhoasu/webgame/game/js/lhs-avatar-upload-v1.js`
- `linhhoasu/lhs/newServer/src/services/AvatarUploadService.js`
- `linhhoasu/lhs/newServer/src/handlers/avatar.js`
- `linhhoasu/lhs/newServer/src/handlers/index.js`
- `linhhoasu/lhs/newServer/src/db/models/Player.js`
- `linhhoasu/webgame/game/index.html`

## Kiểm chứng

- Syntax Node cho toàn bộ file mới/sửa: PASS.
- `test_fashion_hidden_preview_20261003.js`: PASS; 40 suit rows ẩn, 5 màu preview, 249 row fashion; unowned equip RPC = 0.
- `test_avatar_upload_20261003.js`: PASS; signature/size/cooldown/store hash.
- Fashion regression hiện hành: suit tabs 192, box 89, gear matrix 216: PASS; productionWrites/networkAttempts = 0.

## Giới hạn còn lại

- Chưa deploy VPS, chưa restart PM2, chưa chạy browser E2E sau đăng nhập và chưa upload ảnh thật; đây là source/candidate + fixture RAM-only.
- Trước rollout cần backup/CAS static + server, tạo thư mục public avatar với quyền hẹp, kiểm tra Nginx URL `/game/uploads/avatars/*`, readiness, rồi QA bằng tài khoản test được ủy quyền. Không dùng tài khoản/người chơi thật để thử mua/nâng cấp.

## Production rollout — đã hoàn tất

- VPS `103.116.104.165`, backup/CAS thành công: `/linhhoasu/_ai_workbench/backups/fashion_hidden_avatar_20261003_072601`.
- Đã swap 9 file (4 file mới + 5 file hiện hữu được patch từ live bytes), không ghi player/DB trực tiếp; tạo thư mục avatar `root:www`, mode `750`, file upload dự kiến `640`.
- Restart rolling `lhs-s1006` → `lhs-s1001`; readiness Mongo/Redis **6/6 PASS**.
- Index và hai addon public/loopback đều có marker mới; SHA-256 served khớp candidate.
- Receipt: `_ai_workbench/temp/fashion_hidden_avatar_20261003/deployment.json`, trạng thái `DEPLOYED_VERIFIED`.
- Hai lần chạy trước dừng/rollback tự động (S6 readiness chậm và lỗi kiểu dữ liệu trong deployer); preimage/live hash sau rollback được xác nhận nguyên vẹn.

Chưa chạy authenticated browser E2E, chưa upload ảnh thật và chưa xác nhận render native trên tài khoản QA.
