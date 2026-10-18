# Sửa mở rương bộ thời trang — 09/09/2026

**Trạng thái: đã phát hành S1/S2 ngày 09/09/2026; hậu kiểm và WebSocket QA hai server PASS.**

## Kết quả

- 56 rương đủ cấu hình có đường Túi → Mở rương → chọn số lượng → xác nhận. Xem trước vẫn chỉ xem; mở thành công mới cập nhật túi và quyền sở hữu từ server. Bộ thường giữ quyền phối lẻ theo bản v5.
- Rương `28370`, `28380`, `28410` thiếu dữ liệu bộ/mảnh bị chặn trước khi trừ đồ. Không tự dựng cấu hình, gửi lại quà hoặc sửa đồ đã nhận.
- Khóa thao tác khi đang chờ; khi chưa rõ kết quả, dùng lại requestId để kiểm tra, tránh tiêu/cấp hai lần. Hàng đợi và mã giao dịch gắn với nhân vật + server; phản hồi cũ không ghi vào phiên mới.
- Màn mở dùng danh sách phần thưởng cố định, không chọn riêng mảnh. Mảnh thiếu bản dịch hiển thị tên vị trí như Vũ khí/Mũ/Áo/Quần.

## Phạm vi 5 file phát hành

1. `linhhoasu/lhs/newServer/src/services/FashionBoxService.js`: nhận diện toàn bộ rương 100/105, kiểm mapping cha/con, loại mảnh, số lượng và điều kiện trước tiêu.
2. `linhhoasu/lhs/newServer/src/handlers/item.js`: chuyển các rương này qua service kiểm tra, tránh rơi vào nhánh generic.
3. `linhhoasu/webgame/game/js/lhs-fashion-gear-v1.js`: phiên bản `20260909_fashion_gear_v7`, callback mở rương và cách ly mã giao dịch giữa các phiên.
4. `linhhoasu/webgame/game/js/lhs-fashion-box-v1.js`: phiên bản `20260909_fashion_box_v3`, xử lý click, màn sử dụng loại 105 và nhãn phần thưởng.
5. `linhhoasu/webgame/game/index.html`: nạp hai phiên bản trên; giữ patch đánh xa hiện hành.

Không sửa main bundle, bảng cấu hình, luật màu/nâng sao hoặc phần thưởng trùng; không repair/cấp bù người chơi thật. Chỉ tạo hai hồ sơ QA riêng rồi dọn sạch. Chênh lệch `item.js` với bản live trước phát hành chỉ là thay nhánh nhận diện rương thành hai dòng; đã kiểm bằng phép thay thế chính xác. Diff đầy đủ: `../temp/fashion_box_open_20260909/review.diff`.

## Kiểm chứng

- `test-fashion-box-open.js`: **85 ca PASS**, đủ 56 rương, 3 rương lỗi giữ nguyên, preview, số lượng, mở trùng, save lỗi/kết quả chưa rõ, retry/replay, tái dùng view, đổi nhân vật/server và phản hồi trễ. Dùng hàm native client và handler thật với lưu RAM; network/productionWrites = 0.
- Local và Linux staging: nghiệp vụ 15 PASS; native 8 nhóm/216 tổ hợp PASS; tab 192 ca, 150 biến thể và 36 màu PASS. Staging nạp riêng 2 module candidate ở đúng đường dẫn module, giữ persistence giả lập; không chép đè source live.
- Browser Egret/WebGL thật, viewport **390×844**: bấm chuột mở Mục Trần; chuỗi 6 bộ `28350/28040/29010/28340/29800/28320` đều mở, active và mặc được; mỗi lần bấm lặp chỉ phát một lệnh. Tải lại snapshot RAM vẫn giữ sở hữu. Kiểm tên cả 23 mảnh hiển thị và nút xác nhận nằm trong màn hình.
- Hồi quy local: đánh xa 78 appearance/468 ca +27 nhóm lỗi PASS; show-info PASS; nguyên liệu 17 ca PASS; core 714 bảng PASS. Các kiểm tra này được tái sử dụng vì phần tương ứng không đổi sau đó.
- Đã cài 5 file; hash disk và HTTP nội bộ/công khai khớp candidate. S1/S2 ready 200, bốn process ngoài backend giữ nguyên. Main/patch đánh xa và 7 service nền không đổi.
- WebSocket production trên **cả S2 và S1**: hồ sơ QA nhận thư chứa rương; nhận thư lặp không cấp trùng; mở `28350/29010/28340/29800/28320`, mặc bộ và đăng nhập lại PASS. RequestId cũ trả replay, không trừ/cấp lại; rương Mục Trần thứ hai đổi đúng 1.500 kim cương theo swaps hiện hành. Ba rương thiếu cấu hình giữ nguyên số lượng.
- Cleanup được kiểm lại sau QA: mỗi server còn 0 profile/0 mail thuộc lượt QA. Hậu kiểm 03:45:49 UTC xác nhận hash, ready và process ổn định; không có marker lỗi runtime mới trong phần log phát sinh.

Browser QA dùng HTTP local và handler lưu RAM; bước tải lại snapshot của bài này được phân biệt với bài WebSocket/relog production bên trên. Browser có 5 cảnh báo khóa ngôn ngữ thiếu (`28351/28352/28353/28359/10028340`); nhãn phần thưởng đã có fallback, không phát sinh exception. Chưa nghiệm thu mọi icon/model hoặc luồng gửi qua shop/giftcode bằng tài khoản thật.

## Phát hành và hoàn tác

- Tool: `../tools/release_fashion_box_open_20260909.py`, các lệnh `stage`, `preflight`, `deploy`, `retry`, `verify`, `rollback`. Retry chỉ chạy sau rollback đã xác nhận.
- Manifest: `../temp/fashion_box_open_20260909/release.json`, trạng thái `DEPLOYED`; lưu cả lần hoàn tác đầu và kết quả cuối.
- Staging: `/linhhoasu/_ai_workbench/temp/fashion_box_open_20260909_032522`; backup VPS: `/linhhoasu/_ai_workbench/backups/fashion_box_open_20260909_032522`.
- Backup gốc live đã tải chọn lọc về `_ai_workbench/backups/fashion_box_release_20260909`; backup source đang dở trước lượt sửa nằm trong `fashion_box_resume_20260909`.
- Người dùng đã ủy quyền triển khai. Đã backup chọn lọc, cài 2 file backend, restart S2 rồi S1 và cài client/manifest sau; 4 bộ fixture chạy trên code đã cài đều PASS. Hoàn tác kiểm đúng hash và giữ file mới trong backup, không rollback DB.
- Lần đầu đã rollback ở S2 vì log có `Connection is closed`. Log xác nhận tiến trình cũ nhận SIGINT lúc 11:31:54, Redis EPIPE/unhandled lúc 11:31:55; tiến trình mới mới bắt đầu 11:31:57. Không sửa hạ tầng shutdown trong bản này. Bộ kiểm log được bổ sung phân loại đúng hai lỗi đóng Redis khi nằm giữa SIGINT/SIGTERM và lần start kế tiếp; mọi lỗi khi chạy mới vẫn chặn phát hành. 8 ca kiểm bộ phân loại PASS. Lần phát hành lại không có các lỗi này. Tổng lượt restart trong công việc: S2 ba lần (triển khai đầu, hoàn tác, triển khai lại), S1 một lần.
- Bằng chứng: `tests.json`, `visual.json`, `release.json`, `live-qa.json`, `post-qa.json`, `restart-log-review.json` trong `../temp/fashion_box_open_20260909/`. Hai hồ sơ QA đã xóa, không giữ dump người chơi thật.

## Việc còn lại

- Người chơi tải lại game để nhận client mới, vào Túi → rương → Mở rương. Rương hợp lệ còn trong túi dùng trực tiếp, không cần cấp lại.
- Ba bộ thiếu cấu hình cần dữ liệu chuẩn để bổ sung. Chưa sửa catalog GM/webshop hoặc khôi phục lịch sử đã dùng rương lỗi; các phần đó cần phạm vi/dữ liệu riêng.
- Cảnh báo Redis lúc tắt tiến trình cũ cần xử lý riêng nếu tiếp tục xuất hiện; không được coi mọi lỗi `Connection is closed` là vô hại. Log S2 hiện khoảng 5,09 GB; chưa xóa/rotate log, nên xem xét chính sách xoay log trong công việc riêng.

## Bài học

Kiểm canUse hoặc gọi handler thành công chưa chứng minh nút mở hoạt động. Kiểm UI phải gắn với hash mã cuối cùng. Cache requestId/epoch phải có phạm vi nhân vật + server, kể cả khi callback của phiên cũ về trễ.
