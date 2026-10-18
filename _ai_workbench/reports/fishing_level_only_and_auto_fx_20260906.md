# Ngư trường chỉ yêu cầu cấp và kiểm hiệu ứng auto — 06/09/2026

Đã triển khai bỏ điều kiện ngày mở server ở ngư trường thường trên **S2 rồi S1**, hoàn tất12:07 UTC+7. Giữ yêu cầu cấp câu cá; đã sửa phần khóa/nút vào/dòng mô tả và nhận biết mở khu khi lên cấp trong client. **Hiệu ứng auto chỉ kiểm tra, chưa sửa** theo phạm vi yêu cầu hiện tại.

## 1. Tóm tắt công việc

### 1.1 Điều kiện mở ngư trường mới

| Ngư trường | ID | Cấp câu cá cần đạt | Điều kiện ngày trước đây | Sau triển khai |
|---|---|---|---|---|
| Ngư trường1 |1|1|1 ngày|Chỉ cấp1|
| Ngư trường2 |2|2|1 ngày|Chỉ cấp2|
| Ngư trường3 |3|5|1 ngày|Chỉ cấp5|
| Ngư trường4 |4|10|1 ngày|Chỉ cấp10|
| Ngư trường5 |5|15|1 ngày|Chỉ cấp15|
| Liên Tâm Tiên Cảnh |6|25|43 ngày|Chỉ cấp25|
| Linh Hải Vô Biên |7|28|71 ngày|Chỉ cấp28|

Đây là **cấp câu cá**, không phải cấp nhân vật. Không tự nâng cấp hoặc đổi map của người chơi. Các khu sự kiện101/201/301/401/501 và tính năng linh hồn/Hoang Cổ không thuộc yêu cầu bỏ ngày lần này; giữ gate hiện hữu.

Server `FishingIntegrityService.canUseScene` không còn tra `GameServer.openTime` cho ngư trường thường. Các đường vào map, đổi map, câu cá và tập cá được mở dùng cùng điều kiện cấp. Giữ pool hiện hành là hợp các ngư trường đã mở; không đổi thành chỉ câu cá của riêng nền đang chọn, không sửa RNG.

Client chỉ thay3 hàm:

1. `H_e.isSceneUnlock`: ngư trường thường bỏ so ngày; giữ kiểm cấp. Khu sự kiện giữ logic cũ.
2. `FishLevelPnael.UpdateContent`: không nối dòng số ngày cho khu thường; nút vào/trạng thái khóa lấy điều kiện mới.
3. `FishingModel.unlockNewSceneId`: nhận khu mới khi vượt mốc cấp mà không đợi tuổi server.

`FishSceneConfig.openDay` vẫn giữ trong bin gốc; các trường đó không còn chặn ngư trường thường. Không sửa bin hoặc lịch mở server để tránh ảnh hưởng tính năng khác. `checkSceneIdRed` vẫn dùng trường ngày gốc để phân nhóm khu cần dấu chấm đỏ chưa ghé, không dùng để từ chối vào khu; đây không phải gate mở map.

### 1.2 Kiểm hiệu ứng tự bán/trang bị

**Đã xác nhận nhánh auto-power thiếu lời gọi hai hiệu ứng bay có sẵn.**

- `sendAutoPowerFish` gửi4008, nhận `state`, cập nhật slots/kết quả/atlas và phát sự kiện cập nhật. Không gọi `playSellIconFlyAnim` hoặc `playPutInIconFlyAnim`.
- Server auto-power vẫn xử lý trên clone, ghi save/receipt, trả item sync1202 và ACK4008. Lỗi thiếu hiệu ứng không đồng nghĩa chưa nhận tiền hoặc cá; chưa có bằng chứng mất vật phẩm ở giao dịch cụ thể của người dùng trong yêu cầu này.
- `FISH_DEAL_UPDATE` cập nhật ô cá qua `updateEquipPool` và cập nhật đơn/tip. Nó không thay cho hai lời gọi hiệu ứng bay. Không khẳng định mọi hoạt ảnh nội bộ của ô cá đều không tồn tại.
- Luồng cũ `sendDealFishMutl` có gọi hiệu ứng bán và trang bị khi có view/nguồn bay. Bán cá có thể dùng nhân vật làm nguồn; trang bị thủ công lấy nhãn cá trong popup làm nguồn.
- Helper native `playSellIconFlyAnim` bay icon Ngư Tệ đến `powerCurrency1.animGr` rồi gọi `coinFlyBtnAnim`; helper trang bị bay icon cá đến ô theo type. Không cần tạo asset mới nếu sau này nối hiệu ứng vào nhánh auto.

#### Bằng chứng fixture với handler và callback native thật

| Probe | Kết quả |
|---|---|
| Auto xử lý cá mạnh/yếu cùng batch |Trang bị1 cá mới, bán2 cá, +4 Ngư Tệ theo2 cá phẩm chất2|
| Lưu trạng thái |Durable slot mới đúng UID, pending rỗng|
| Đồng bộ tồn kho |Có1202 cho68 và ACK4008 thành công|
| Callback auto |Áp dụng slot mới, phát cập nhật dữ liệu,0 lần gọi bay Ngư Tệ và0 lần gọi bay cá|
| Cùng mục tiêu UI, callback luồng cũ |Gọi hiệu ứng bán1 lần hoặc trang bị1 lần tương ứng|
| Helper native riêng |Có icon flight tới Ngư Tệ/ô cá; có coin pulse|

Đây là kiểm source và thực thi các hàm native trong VM, **không phải đã quan sát hoạt ảnh trong trình duyệt/APK**. Các con số trên thuộc nhân vật fixture trong bộ nhớ, không phải giao dịch của nicky. Chưa sửa hiệu ứng vì user yêu cầu kiểm tra phần này, không tự mở rộng phạm vi thay đổi client auto.

## 2. File/thư mục đã thay đổi

### Source chính

- `linhhoasu/lhs/newServer/src/services/FishingIntegrityService.js`: chỉ sửa `canUseScene`.
- `linhhoasu/webgame/game/js/main.min_a6195824.js`:3 hàm client nêu trên, kiểm khôi phục ngược trả đúng baseline byte-for-byte.
- `linhhoasu/webgame/game/index.html`: đổi cache token thành `20260906_fishing_level_only_v1`.
- Production tương ứng ở `/linhhoasu/lhs/newServer/` và `/linhhoasu/webgame/game/`.
- Không thay fish.js/map transition vừa sửa, commerce/Huyền Vũ, auto-power, gear/balance, WSServer/PlayerService, cấu hình bin, DB schema hoặc WebGM.

### Công cụ hỗ trợ

- Mới dưới `_ai_workbench/tools/`: `build_fishing_level_only_client_20260906.js`, `test_fishing_level_only_20260906.js`, `qa_fishing_level_only_live_20260906.js`, `release_fishing_level_only_20260906.py`.
- Sửa `test_fishing_map_fix_20260906.js`: khai báo policy `server-age` (mặc định cũ) hoặc `level-only`; vẫn kiểm negative/positive cụ thể, không bỏ gate assertion. Cho phép đúng3 hàm client thay qua manifest và inverse check.
- Dùng lại snapshot, auto/gear/balance/daily/core tests và renderer report.

### Evidence và backup

- Baseline: `_ai_workbench/temp/fishing_audit_20260906T045902Z/`, snapshot11:59:03 UTC+7,153 artifact.
- Candidate: `_ai_workbench/temp/fishing_level_only_20260906/`.
- Evidence: `client-build.json`, `level-only-tests.json`, `map-test.json`, `stage.json`, `canary-progress.json`, `deploy.json`, `verify.json`.
- Backup local trước sửa: `_ai_workbench/backups/fishing_level_only_local_20260906/`.
- Backup báo cáo: `_ai_workbench/backups/fishing_level_only_reports_20260906/`.
- Staging: `/linhhoasu/_ai_workbench/temp/fishing_level_only_20260906_050505/`.
- Backup production: `/linhhoasu/_ai_workbench/backups/fishing_level_only_20260906_050505/`:0.before=service,1.before=main,2.before=index.
- Báo cáo: file này và HTML tương ứng, cùng cập nhật `session_report.md/.html`.

Không tạo file rác ở root. Không sửa các snapshot/client tham chiếu bất biến. File local index giữ line ending hiện có, nội dung chuẩn hóa newline khớp index production; không ghi đè cả file local chỉ để đổi CRLF/LF.

## 3. Lỗi đã gặp & giải pháp

| Vấn đề | Nguyên nhân | Cách xử lý | Cách tránh lặp lại |
|---|---|---|---|
| Hai khu khóa theo ngày |Server kiểm openTime; client kiểm serverOpenDay và nối mô tả ngày|Đổi policy khu thường thành chỉ cấp ở server và3 hàm client|Test cấp dưới/đúng/trên, ngày0/1/42/43/70/71/999|
| Auto cộng âm thầm |Nhánh mới không gọi helper bay Ngư Tệ/trang bị có sẵn|Audit xác nhận bằng handler/native callback; chưa sửa hiệu ứng|Nếu nối sau này phải lấy kết quả ACK thật, guard view và replay|
| Test đầu giả định cá chỉ thuộc khu đang chọn |Runtime dùng pool hợp tất cả khu đã mở|Đối chiếu source, kiểm chính xác tập pool truyền vào RNG; không đổi gameplay để làm test xanh|Đọc contract pool trước đặt oracle|
| Tên tool phỏng đoán không có |Không có patch_fishing_auto_20260906.js|Liệt kê đúng build_fishing_auto_client_20260906.js rồi đọc|Khám phá tên file trước truy cập|
| rg glob trong path không khớp trên Windows |fish*.js đưa ở vị trí path|Dùng thư mục thật với `-g`|Không dựa vào shell tự mở wildcard|
| Trích mọi UpdateContent ra quá nhiều kết quả |Method trùng tên trong bundle minify|Neo theo class pmt/Ggt, trích AST đúng FunctionExpression|Không dump toàn minified line hay mọi lớp|
| Index local/production khác hash nhưng nội dung giống |CRLF/LF khác nhau|Kiểm normalized content khớp, chỉ sửa token local|Tách khác newline khỏi source drift thực|

Không có lỗi mojibake mới; source/client/report UTF-8. Giữ các bản sửa/tài sản lịch sử, không tự reroll/bù.

## 4. Kỹ năng / kinh nghiệm mới

- Bỏ điều kiện ngày cần sửa cả quyền server, trạng thái khóa của client và tự mở khu khi tăng cấp; chỉ giấu dòng mô tả sẽ không đủ.
- Trường ngày vẫn có thể phục vụ phân nhóm chấm đỏ; không xóa hàng loạt mọi `openDay` trong bundle vì còn nhiều hệ thống khác.
- Phân biệt handler ghi tiền/cá, callback cập nhật state và gọi hoạt ảnh. Số dư tăng mà thiếu flight là lỗi phản hồi hình ảnh, không mặc định là mất thưởng.
- Khi auto chạy không popup, nối hiệu ứng trang bị cần nguồn bay hợp lệ, không lấy nhãn popup null. Nên dùng dữ liệu `equipped/rewards` trong ACK, không tính lại kết quả bán/trang bị từ client.
- Test map/catch phải phản ánh pool hợp ngư trường đã mở; map nền không định nghĩa toàn bộ pool hiện hành.

## 5. Trạng thái hiện tại

### Kết quả kiểm thử

| Nhóm | Kết quả |
|---|---|
| Policy cấp mới |19/19 PASS local và Linux staging|
| Audit hiệu ứng |4/4 probe hoàn tất; xác nhận thiếu hiệu ứng, không phải hiệu ứng đã sửa|
| Đổi map |26/26 PASS, có save fail/room/native lifecycle/pending|
| Auto hiện hành |21/21 PASS|
| Gear |38/38 PASS,1.800 matrix cases|
| Balance/integrity |70/70 PASS|
| Huyền Vũ |24/24 PASS|
| Core |714 bảng PASS|
| Live S2 và S1 |Cả hai PASS: cấp28 vào6/7; cấp24 từ chối cả hai; cấp25/27 vào6 nhưng từ chối7|

Tổng198 nhóm test thay đổi/hồi quy và4 probe hiệu ứng. Live QA:11 lần đổi map ban đầu cùng kết nối, bắt cá→đổi khu gửi liền, giữ3 cá pending qua chuyển khu/relog, không trừ thêm vật phẩm. Sau đó chỉ chỉnh cấp của đúng QA offline để kiểm boundaries. Không thay tuổi server, không dùng tài khoản người thật.

Bằng chứng bỏ ngày trên “server ngày1” nằm trong native VM và fixture với `GameServer.findOne` bị chặn để bắt mọi truy vấn tuổi server (0 lần đọc). Live test kiểm điều kiện cấp thật của S1/S2, **không đổi ngày mở của production**.

### Hậu kiểm12:07:43 UTC+7

-154 artifact đúng expected:3 file thay,151 giữ nguyên; bin/client config nguyên.
- Service SHA-256: `6bb46542b0100fb671572028e17b748c886f009df2ca999660d141fb34f122e1`.
- Main SHA-256: `2a91835de7b10da73a8299859e116c462861541b57d8f47aa1d5691b513a5091`.
- Index production SHA-256: `cb92a86175ab3a9ffb7ac836bcc20909c710f5ed0acc639ee533edf9990e92fc`.
- Main/index được phục vụ cổng81 đúng hash mới; local main/service khớp candidate, index normalized khớp.
- S1 PID29724/restart1376, S2 PID27996/restart42. HTTP ready8080/8083 đều200.
- Dist PID30824, admin30856, bot S1 PID1600 và bot S2 PID1576 giữ nguyên PID/restart. Không restart DB/Nginx.
- QA player và mail còn0 ở cả hai DB; đã xóa đúng dữ liệu test, không xóa dữ liệu người chơi.
- Không bù, không migration, không sửa hiệu ứng, không thay số lượt/tốc độ/kinh tế câu cá.
- Chưa nghiệm thu hình ảnh trực tiếp trình duyệt/APK, cold-start hay giữ fixture xuyên thêm một lần restart; không gọi các phần đó PASS.

## 6. Bước tiếp theo

1. Người dùng tải lại game **một lần** để nạp main có cache token mới; từ đó hai khu chỉ hiện yêu cầu cấp25/28, không còn43/71 ngày. Không cần reload mỗi lần đổi khu.
2. Với nhân vật chưa đủ cấp câu cá, khu vẫn khóa là đúng; không nâng cấp hoặc bypass cấp.
3. Nếu user yêu cầu sửa hiệu ứng: nối helper native vào ACK auto-power thành công, Ngư Tệ bay về ô68 và cá mới bay về đúng slot; không regrant/cộng tiền từ hiệu ứng.
4. Phần hiệu ứng cần test bán-only, equip-only, mix, held/locked/tie, không view/popup, đổi map/đóng cảnh/reconnect và replay; không phát lại hiệu ứng từ ACK cũ hoặc giữ tham chiếu view đã đóng. Nghiệm thu hình ảnh trực tiếp riêng sau triển khai.
