# Sửa đổi ngư trường câu cá — 06/09/2026

Đã triển khai thành công S2 rồi S1 lúc **11:52 UTC+7**. Chỉ thay `src/handlers/fish.js`; client và cấu hình giữ nguyên. Bản sửa gửi đủ sự kiện vào cảnh để client gốc dựng lại ngư trường ngay, không phải tải lại game sau mỗi lần đổi map.

## 1. Tóm tắt công việc

### Nguyên nhân và cách sửa

Trước đây, tag4002 chỉ lưu `fishInfo.scene` và trả ID mới. Session vẫn ở room cũ, còn client không nhận push4050 để chạy `sc_fish_map_enter` → `EnterFishMapRaid`. Vì vậy nhãn ngư trường đổi nhưng cảnh vẫn cũ; reload mới vào đúng cảnh.

Hai đường đổi map4002 và vào map4050 hiện dùng chung `handleFishMapTransition`:

1. Chuẩn bị trên bản sao player, kiểm ID và điều kiện mở khu hiện hành. ID sai không tự rơi về map1.
2. Lưu scene và chờ xác nhận. Lỗi/null/timeout không phát sự kiện chuyển room; session bị vô hiệu hóa để nạp lại dữ liệu bền vững, không ghi rollback giả.
3. Sau khi lưu: cập nhật `_fishRoomMapId`, báo rời room cũ4052 và vào room mới4051 cho các client khác. Chọn lại cùng room không tạo thông báo ra/vào trùng cho người khác.
4. Với4002: ACK4002 trước, push4050 sau. Push chứa mapId/time/pos/food/raftId/rodId/players theo contract sẵn có. Với4050 giữ thứ tự entry rồi ACK như trước.

Luồng rời map4051 cũng chuyển sang chuẩn bị trên clone, chỉ xóa room sau khi lưu thành công. **Giữ hành vi cũ khi bấm thoát câu cá: scene trở về map1**; không đổi nó thành tính năng ghi nhớ khu sau khi thoát. Ngắt kết nối/relog khi còn ở map vẫn giữ scene đã lưu.

Không thêm tỷ lệ hụt, không thay tăng tốc, không reset đơn, không bù hoặc chỉnh cá/vật phẩm người thật. Không sửa sự cố input-freeze đang tạm dừng.

### Hành vi client gốc được giữ

- Push4050 đóng view cũ, dọn raid/entity/timer rồi tạo view mới; nền lấy từ `FishSceneConfig[scene].picture`.
- Nếu đang ủy thác, client gốc tự dừng khi vào cảnh mới. Muốn tiếp tục cần bật lại ủy thác.
- Cá đã câu nhưng chưa xử lý vẫn còn trong kết quả/giỏ chờ. Chuyển khu không tự bán, giữ, nộp hoặc xóa cá.
- Không sửa file main/index, không thêm background giả hoặc DOM fallback.

## 2. File/thư mục đã thay đổi

### Source chính

- Local: `I:/Linhhoasu/server/server/linhhoasu/lhs/newServer/src/handlers/fish.js`.
- Production: `/linhhoasu/lhs/newServer/src/handlers/fish.js`.
- Diff: thêm56 dòng, bỏ38 dòng; các hàm ngoài nhóm map không đổi theo so sánh AST.
- SHA-256 mới: `48e62e9b49aa80a29552a9561698159f83b2621030b50aa8f25dd27c1fd3e182`.
- SHA-256 trước sửa: `50886be8cd194a02fb7e542dca9934be356972206f6bade56fe16c80fa3984c9`.

### Tool hỗ trợ và evidence

- Mới: `_ai_workbench/tools/test_fishing_map_fix_20260906.js`, `qa_fishing_map_live_20260906.js`, `release_fishing_map_20260906.py`.
- Sửa test cũ: `_ai_workbench/tools/test_fishing_balance_20260906.js`; sau giao dịch clone phải thao tác trên `session.player`, không tiếp tục sửa alias player cũ. Giữ nguyên toàn bộ kỳ vọng gameplay của test.
- Baseline bất biến: `_ai_workbench/temp/fishing_audit_20260906T043042Z/`.
- Candidate/evidence: `_ai_workbench/temp/fishing_map_fix_20260906/`: `map-test.json`, `stage.json`, `canary-progress.json`, `deploy.json`, `verify.json`, `status.json`.
- `main.fixed.js` trong candidate chỉ là bản sao **byte-identical** của main.js để chạy các test cũ; không phải client được sửa hoặc deploy.
- `release-error.json` là lỗi staging ban đầu do test dùng alias cũ; kết quả cuối cùng nằm trong `deploy.json` và `verify.json`.
- Report: file này, bản HTML cùng tên, và `session_report.md/.html`.

### Backup và triển khai

- Backup local: `_ai_workbench/backups/fishing_map_local_20260906/`.
- Backup báo cáo cũ: `_ai_workbench/backups/fishing_map_reports_20260906/`.
- Backup production cuối: `/linhhoasu/_ai_workbench/backups/fishing_map_20260906_045045/fish.js.before`.
- Staging cuối: `/linhhoasu/_ai_workbench/temp/fishing_map_20260906_045045/`.
- Không chép toàn cây source local lên VPS. Hash guard toàn153 artifact trước/sau; kiểm ownership/cwd/script của hai tiến trình game trước restart.
- Rollback chỉ khôi phục file nguồn đã backup và restart đúng game đã đổi; không rollback player DB.

## 3. Lỗi đã gặp & giải pháp

| Lỗi/phát hiện | Nguyên nhân | Cách xử lý | Cách tránh lặp lại |
|---|---|---|---|
| Đổi nhãn nhưng cảnh không đổi |4002 thiếu push4050, session còn room cũ|Dùng chung transition có save, room và native entry|Test ID lưu, session room, packet và hàm dựng cảnh riêng|
| Room được công bố trước xác nhận lưu |4050/4051 cũ sửa session room trước save|Clone, save confirmed rồi mới publish|Inject null, throw và commit-then-throw|
| ID vào map sai tự đổi thành map1 |Normalize ID trước validate|Validate ID yêu cầu trước chuyển cảnh|Negative test ID âm,0,lẻ,chuỗi rác,ID thiếu và map sự kiện bị khóa|
| Native fixture trích nhầm Init |Method đầu lớp minify là `(r=Abt.prototype).Init`, không phải `r.Init`|Neo theo lớp Abt và chọn đúng method đầu|Không lấy method cùng tên của lớp kế tiếp|
| Một regression báo thiếu mồi dù vừa cấp trong fixture |Test sửa alias `p` cũ sau khi session thay bằng clone|Sửa test dùng `s.player`; giữ assertion thiếu/có mồi|Sau transaction luôn đọc player hiện hành|
| Canary S2 đầu kỳ vọng mất3 mồi nhưng chỉ mất2 |Nhân vật QA mở bè223, hiệu ứng miễn mồi104 có thể kích hoạt hợp lệ|Gate dừng và hoàn nguyên trước S1; QA mới không mở223 để cô lập phép kiểm map/cost|Không đặt kỳ vọng RNG cố định khi fixture còn bonus ngẫu nhiên|
| Kiểm ready ngay sau rollback trả000 |Game vừa restart chưa kịp listen|Hậu kiểm xác nhận S2 đã ready; sửa release tool chờ ready sau rollback và ghi lỗi trước rollback|Lưu lỗi gốc trước, chờ tiến trình phục hồi rồi kiểm hash/health|
| Lệnh kiểm encoding report bị PowerShell parser chặn |Dấu nháy cong trong regex one-liner bị shell coi là dấu đóng chuỗi|Đổi mẫu regex sang Unicode escape, chạy lại PASS|Không nhúng smart quote trực tiếp trong shell one-liner|

Canary đầu tại staging044716 dừng trước S1. Source đã về đúng SHA cũ, S1 PID23011 không đổi; S2 PID13124/restart40 và cả hai ready200 được xác nhận lúc11:50:13. QA còn0. Không sửa kinh tế game để làm test xanh. Sau khi chỉnh fixture và chạy lại toàn bộ staging, bản cuối triển khai11:51:40–11:52:14.

Không có lỗi encoding mới trong file sửa/report; giữ UTF-8. Không chỉnh các đoạn báo cáo lịch sử ngoài phần bổ sung của phiên này.

## 4. Kỹ năng / kinh nghiệm mới

- `fishInfo.scene`, session room và raid đang hiển thị là ba trạng thái khác nhau; ACK lựa chọn không đủ chứng minh cảnh đã đổi.
- Sự kiện native có sẵn cần đúng thứ tự; sửa một file server đủ cho lỗi này, không cần thay asset/client.
- Chuẩn bị trên clone bảo vệ state đang dùng khỏi mutation khi validation thất bại; không được giả định object player cũ vẫn là object hiện hành.
- Hậu kiểm tiêu hao phải tách chi phí lượt câu khỏi thao tác đổi map và hiệu ứng miễn tiêu hao hợp lệ.
- Nếu canary thất bại thì dừng promotion; source rollback không đồng nghĩa dịch vụ đã ready ngay lập tức.

## 5. Trạng thái hiện tại

### Kiểm thử

| Nhóm | Kết quả | Phạm vi |
|---|---|---|
| Map mới |26/26 PASS local và Linux staging|7 khu, validate/khóa/ngày mở, room, pending/skills/lock/soul/preview/receipt, save fail, native lifecycle, đổi nhanh|
| Auto |21/21 PASS staging|Tự trang bị/bán và các bảo vệ hiện có|
| Cần/bè |38/38 PASS staging|Kèm1.800 case ma trận|
| Balance/integrity |70/70 PASS staging|Giữ cá, mồi, đơn, linh hồn, tẩy/hộp và save guards|
| Huyền Vũ |24/24 PASS staging|Quà ngày và đồng bộ tồn kho không hồi quy|
| Core |PASS,714 bảng|Contract gameplay chung|
| Live WS S2 |PASS|11 đổi map trên1 kết nối, ACK→4050, invalid reject, catch→map gửi liền, giữ3 cá, không trừ thêm, relog|
| Live WS S1 |PASS|Cùng bộ kiểm S2; chỉ promotion sau S2 đạt|

Tổng **179 nhóm test staging PASS**, ngoài core714 bảng. Live QA dùng nhân vật riêng, không thao tác nicky hoặc người thật; đã xóa đúng player/mail QA, hậu kiểm cả hai DB còn0 nhân vật QA của task.

Native test chạy hàm thật trích từ client: đóng view, dọn timer/entity, đổi sceneBg, dừng auto, gọi callback đúng một lần và giữ pending. **Đây không phải nghiệm thu hình ảnh trực tiếp trong trình duyệt/APK**. Chưa chạy native visual, cold-start hoặc giữ QA xuyên thêm một lần restart; không dùng WS/VM để tuyên bố các phần đó PASS.

### Hậu kiểm11:52:46 UTC+7

-153/153 artifact trong scope đúng expected:1 source thay,152 giữ nguyên. Local fish.js khớp candidate/production.
- Main được phục vụ tại cổng81 có SHA `ae1a85310aa20ccfcd8166526ef6686049e0cdede7eef791728d4621d3048870`, không đổi.
- S1 PID8786/restart1375; S2 PID8678/restart41; ready8080/8083 đều200. S2 có thêm hai restart ở lần canary đầu và hoàn nguyên, đã ghi rõ bên trên.
- Dist PID30824, admin30856, bot S1 PID1600, bot S2 PID1576 giữ nguyên cả PID/restart so với trước triển khai. Không restart Nginx/DB hoặc thay WebGM.
- Không phát bù, migration hay sửa dữ liệu lịch sử. Không kết luận toàn bộ tính năng câu cá đã hết lỗi; phiên này chỉ đóng lỗi đổi map và tính nhất quán save/room liên quan.

Hậu kiểm bổ sung11:56:59: PID/restart và ready không đổi; player QA **và mail QA** đều0 trên hai DB. Cặp report/session MD–HTML đủ6 mục, UTF-8 và cấu trúc HTML hoàn chỉnh đã kiểm PASS.

## 6. Bước tiếp theo

1. Người dùng mở câu cá, chọn hai ngư trường đã mở và đổi qua lại; cảnh/nền phải cập nhật ngay, không cần reload sau mỗi lần chọn.
2. Thử với cá đang chờ xử lý: cá phải còn, vật phẩm không đổi do riêng thao tác chuyển khu.
3. Nếu đang ủy thác, việc đổi map sẽ dừng ủy thác theo client gốc; bật lại để tiếp tục câu.
4. Nếu client cụ thể vẫn giữ cảnh cũ, ghi thời điểm và ngư trường đi/đến, ảnh/video; kiểm native lifecycle của đúng client đó, không tự đổi tốc độ/RNG hoặc reset dữ liệu.
