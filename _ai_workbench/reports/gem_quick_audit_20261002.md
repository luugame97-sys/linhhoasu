# Kiểm tra hợp thành nhanh Hồn ngọc — 02/10/2026

## Kết luận hiện tại

- Menu native `FateGemAutoComposePanel.OnOpen` viết cố định danh sách6→2 bằng `for(var i=6;2<=i;i--)`. `GemModel.sendAutoCompose` gửi3903 `{level:i}`.
- `6/8` trong ảnh là trang túi6/8:12 ô/trang, cấu hình96 ô hiển thị ban đầu. Không phải trần cấp.
- Config live `GemBaseConfig.maxQuickLevel=100`,588 GemLevel rows, cao nhất100. Menu chưa theo cấu hình này.
- Cấp1–5 có `synthesisLevel` lên cấp kế tiếp, nên ghép thường/nhanh nhóm thấp dừng ở6. Cấp6–10 `synthesisLevel=0`, đi qua3906/GemComposeConfig ở tab Hợp thành đặc biệt (System217).
- Ví dụ6→7:2viên25051 +2viên25052→25061;7→8:3viên25061→25071;10→11:3viên25091→25101. Nhóm11–99 có đường thường lên kế tiếp;100 không có đường lên101.

## Khả năng mở rộng

Có thể mở menu chọn cấp đích tới100 theo config, đồng bộ ngữ nghĩa server:3903 hiện giới hạn **cấp nguyên liệu**, không phải cấp kết quả. Để đi xuyên6–11 phải xử lý recipe đặc biệt, cho người chơi chọn loại/ngọc kép ở6→7; không tự chọn nhánh và tiêu đồ khác ý muốn. Giữ ngọc đang khảm khỏi nguyên liệu, hiển thị tiêu hao trước xác nhận, trả duy nhất kết quả cuối còn tồn tại sau batch.

## Lỗi phụ đã tái hiện

3903 lưu mọi ngọc tạo ra vào `gems` trả về, bao gồm ngọc trung gian bị tiêu hao ở vòng sau. Native callback xoá `costs` rồi thêm tất cả `gems` nên có thể hiện ngọc ảo cho tới đồng bộ lại.

Fixture243viên cấp1: server kết thúc với1viên cấp6; response vẫn có81viên cấp2 +27viên cấp3 +9viên cấp4 +3viên cấp5 +1viên cấp6.120ngọc trung gian trong response đã không còn ở server. Cần sửa trước/cùng lúc mở nhanh nhiều bậc; đây không phải bằng chứng nhân đôi ngọc bền vững trong DB.

## Kiểm chứng và phạm vi

- Fresh live hash khớp snapshot: gem.js`8af822c924bbc6ee5e4f1b244bb3a37951caa66018ef9aa096b141f4657a3709`, config`eaa97e8fc3e38a75f75e9ba12dbbc8221e2083c8d8463e8d81219166cfb23a54`, client`1ae070b19d593ca120eeaf86856d0bc85b0b9ed71d5847e65be7139c966e0e9a`.
-10 fixture read-only source chạy local/save mock:1→6,6/7/10 bị bỏ qua ởnormal,11→12,99→100,100dừng, các recipe6→7/7→8/10→11. Kết quả `_ai_workbench/temp/gem_quick_audit_20261002/audit.json`; tool `_ai_workbench/tools/audit_gem_quick_20261002.js`.
- Chỉ audit và đề xuất. Chưa sửa gameplay/client/config production, chưa restart hoặc ghi playerDB; không chạy E2E hợp thành bằng tài khoản thật.

## Bổ sung audit ảnh “Hợp thành định hướng”

- Ảnh là `FateGemSpecialComposePanel`, không phải `FateGemAutoComposePanel`: native nút Hợp thành gọi `GemModel.sendSpecialCompose(_selectId, 1, true)` và luôn gửi `3906 {id, count: 1, compose: true}`. Vì vậy mỗi lần chỉ tạo 1 kết quả dù server handler 3906 đã nhân `consume.count * count` và tạo `count` kết quả.
- Candidate client v3 chỉ thêm nút `Hợp thành hết (N)` tại panel đặc biệt; N là min theo mọi nguyên liệu của `GemComposeConfig`, dùng `getGemCount(id, false)` để loại ngọc đã khảm; gửi một RPC 3906 batch và chạy callback xóa `uids`/thêm `gems`/dispatch UI như native. Không thay đổi hành vi nút gốc.
- Candidate `client/lhs-gem-quick100-v1.js` v3 SHA-256 `8919BBF09270B64D0D4FC929214C4CEC3ED96AC188479758BD622424CDE9A92B`; dùng native `sendSpecialCompose(id, N, true)` để giữ nguyên validation/mutation/reward/dispatch. Fixture VM xác nhận recipe `2x material11 + 1x material12` với tồn6/4 tạo `N=3`, payload đúng; `node --check` PASS; chưa deploy/E2E tài khoản thật.

## Bổ sung cân đối UI — 02/10/2026 22:05 ICT

- Client v4 kế thừa `scaleX/scaleY` của nút native, đặt hai nút cùng kích thước `190`, tâm `-103/+103`, gap `16`; fixture layout PASS.
- Deploy client-only đã xác minh: index `0388d7dad6206d939849dc9b5b97f7880c12044c5eaf7750b402f03ec8a9098d`, addon `36d042eeb133e411ed1a20f6b08019a76a4ecb01e16eb368fe5d30a1cb2aaa56`; readback public/loopback và readiness 6/6 PASS.

## Ngừng bán túi cấp10 — 02/10/2026 23:15 ICT

- Shop `10000007` đã bị tắt; túi `100097` và route mở túi vẫn giữ nguyên.
- Live postcheck PASS: shop `1520→1519`, target null, existing gem shops hash không đổi, public/loopback hash khớp, S1–S6 readiness PASS.
- Receipt: `_ai_workbench/temp/gem10_stop_shop_release_20261002/deployment.json`; postcheck: `_ai_workbench/temp/gem10_stop_shop_release_20261002/postcheck.json`.
