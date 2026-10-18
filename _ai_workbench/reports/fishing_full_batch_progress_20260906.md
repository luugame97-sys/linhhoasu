# Hoàn thiện câu cá và mở sự kiện chung — checkpoint 06/09/2026

**Đang làm, chưa phát hành.** Đã tạo bản sửa thật trong candidate cho các phần có đủ dữ liệu và chạy188 nhóm test local đạt. Chưa mở sự kiện trên S1/S2. Phần còn thiếu cần quyết định dùng bảng cân bằng riêng vì không tìm thấy tỷ lệ gốc trong các nguồn hiện có đã kiểm; không tự đoán tỷ lệ rồi mở bán.

## 1. Tóm tắt công việc

Yêu cầu được gộp thành một đợt: xác suất hụt/linh hồn/di vật/sự kiện, mồi nâng cao và cần/bè, Thiên Công, kiểm4 người với bè/thời trang lớn trên nhiều thiết bị. Giữ ý tưởng lịch7 ngày cho các nhóm tranh đầu vào và cửa sự kiện độc lập90 ngày, nhưng chưa cài lịch hoặc bật production.

### 1.1 Đã triển khai code trong candidate

| Hạng mục | Nội dung đã viết | Phạm vi xác minh |
|---|---|---|
| Gate sự kiện câu cá |Không cho request tự tạo active row; từ chối disabled, thiếu metadata, chưa tới/hết hạn, thiếu cấp/hệ thống |Thiếu row, inactive, metadata thiếu, khóa và no-mutation test |
| Cần vàng5904 |Bonus bán10% theo ownership, cả bán tay và auto; tích phần lẻ tránh mất tiền khi bán lẻ |10 cá×2coin→20coin bán+2coin bonus, batch/split/relog/replay |
| Bonus cần vàng đúng native |Ghi vào fishInfo.extraPrice, nhận tại FishPriceGetPanel/tag4022; không cộng trực tiếp rồi bỏ nút nhận |Claim một lần,1202 sync, auto callback cập nhật extraPrice |
| Cần Bạch Hổ5906 |Sở hữu có10% nhân đôi quà đơn; không cần mặc đúng cây mới có hiệu lực |Ranh giới0/999/1000/9999, repeat không cấp thêm |
| Thiên Công190051/190052 |Ghép đúng100 mảnh190001/190002 theo ShopConfig13190051/52, lưu item kích hoạt; retry không tiêu tiếp |Thiếu/mixed/số lẻ/unavailable/save null/throw/commit bất định |
| Đổi cảnh Thiên Công |Chỉ chọn0 hoặc skin có cấu hình và đã sở hữu; clone+saveconfirmed |Chặn ID giả, chưa sở hữu và invalid; relog giữ skin |
| Buff Thiên Công |Mỗi skin đã sở hữu cộng10% thuộc tính kiến trúc;2 skin cộng20%, nhiều bản sao cùng skin không cộng dồn |So công thức native trước các multiplier combat khác |
| Persistence các thao tác liên quan |Bán/nhận đơn/nhận bonus thực hiện trên clone; save không xác nhận thì invalidate, không ACK thành công |Test null, throw và commit-then-throw |

**Đây là code candidate, không phải các sửa đã chạy trên server.** Không tạo quyền lợi miễn phí, không gia hạn thẻ, không bù lịch sử và không đổi cá/thuộc tính cũ.

### 1.2 Chưa làm xong trong đợt này

- Chu Tước: tỷ lệ10% có mô tả, nhưng cần hoàn thiện paired payload/double animation và các nhánh mồi/catch tổng thể trước ghép vào generator mới.
- Thanh Long, biến dị/linh hồn: thiếu phân phối cơ sở; x2 chưa có ý nghĩa đúng nếu chưa biết tỷ lệ nền.
- Hụt/cá thoát: client có trạng thái nhưng không có bảng tỷ lệ server gốc trong các nguồn đã kiểm.
- Di vật: có danh sách theo map nhưng chưa có tần suất/weight rơi chuẩn.
- Mồi nâng cao: có attr/type và mô tả; một số loại tăng khả năng nhưng không có định nghĩa xác suất nền hoặc độ tăng đủ rõ. Loại5542/5543 có mô tả guarantee/50% biến dị, vẫn cần tích hợp đúng tất cả điều kiện giỏ/kỷ lục và pool.
- Sự kiện: chưa sửa mini-game, shared chai trôi, BXH, vòng nhiệm vụ, settlement hoặc scheduler; chưa bật các row lịch.
-3 Thiên Công190053–190055: có item/exchange100 mảnh nhưng **không có row HomelandSkinConfig tương ứng**. Native hiện chỉ có0,190051,190052; không mở ID thiếu bằng map giả.
- Hiển thị4 người nhiều bè/thời trang lớn và đa thiết bị: chưa chạy nghiệm thu hình ảnh mới. Kết quả tọa độ/phòng và fixture EUI trước đây không được thay cho yêu cầu này.

## 2. File/thư mục đã thay đổi

### Candidate, không phải cây đang chạy

Root: `_ai_workbench/temp/fishing_full_candidate_20260906/`.

- Sửa `app/src/handlers/activity.js`, `fish.js`, `homeland.js`, `item.js`, `playerPayload.js`.
- Sửa `app/src/services/BattleService.js`.
- Mới `app/src/services/FishingKnownEffectsService.js`, `FishingEventGateService.js`, `HomelandSkinUnlockService.js`.
- Client `main.fixed.js`: chỉ cập nhật extraPrice từ ACK auto; inverse check bảo đảm các hàm khác nguyên baseline. Chưa đổi index/cache production.
- `changed-files.json`:9 server file có hash;3 file mới,6 file chỉnh.
- Baseline bất biến: `_ai_workbench/temp/fishing_events_audit_20260906T093353Z/`.

### Tools/evidence

- `_ai_workbench/tools/test_fishing_full_known_20260906.js`:34 nhóm mới.
- `_ai_workbench/tools/build_fishing_full_known_client_20260906.js`: build1 callback hiển thị bonus.
- `_ai_workbench/tools/run_fishing_full_candidate_checks_20260906.js`: orchestration các suite local.
- `_ai_workbench/tools/fishing_full_source_matrix_20260906.py`: kiểm source trong server.zip và keys cấu hình, không giải nén/ghi cây tham chiếu.
- Sửa test hỗ trợ `test_fishing_balance_20260906.js`: kiểm s.player hiện hành thay alias cũ sau clone-save; thêm assertion success/repeat fail, không hạ kỳ vọng gameplay.
- Candidate evidence: `known-fixes-tests.json`, `regression-summary.json`, `source-matrix.json`, `client-known-build.json`, `changed-files.json`.
- Backup báo cáo/test cũ: `_ai_workbench/backups/fishing_full_reports_20260906/`.
- Cập nhật báo cáo này MD/HTML và `session_report.md/.html`.

Không sửa source `linhhoasu/lhs/newServer` hoặc client live; không restart/deploy/ghi DB hay dùng tài khoản người chơi. Không chạy script QA live. Việc copy core test vào candidate chỉ phục vụ test, không thay source production.

## 3. Lỗi đã gặp & giải pháp

| Vấn đề | Nguyên nhân | Xử lý/định hướng | Chống lặp |
|---|---|---|---|
| Bật event bằng request tùy ý |upsert tạo window mặc định |Candidate gate trước ensure/upsert |Không dùng ẩn UI làm gate |
| Cần vàng không cộng bonus |Chỉ cộng qualitycoin, không đọc ownership/rate |Candidate bonus10% vào extraPrice |Kiểm cả manual/auto, claim, split và replay |
| Cộng bonus vào túi làm lệch contract native |Bản nháp đầu chưa theo FishPriceGetPanel |Đã sửa nháp về extraPrice/tag4022 trước bàn giao; test cập nhật |Đọc cả receiver/nút nhận, không chỉ mô tả tỷ lệ |
| Bạch Hổ không nhân đôi quà |Nhánh nhận đơn không có passive |10% theo sở hữu; RNG10000 điểm |Không yêu cầu đang mặc nếu mô tả là vĩnh viễn khi sở hữu |
| Ghép/đổi Thiên Công thiếu ownership/saveguard |Đường mua chung cho phép cấp item nhưng đổi skin tin ID |Specialized transaction chỉ2 skin hỗ trợ, kiểm item trước đổi |Unknown/mixed/repeat/uncertain-save tests |
| Buff Thiên Công chưa vào combat |BattleService bỏ skin703 |Cộng vào riêng attrs kiến trúc như native |Không áp10% lên toàn bộ sức mạnh nhân vật |
| Test combat kỳ vọng133 bằng130 |Có modifier liên kết sau phần kiến trúc |So contribution trước modifier, thêm so formula native |Không bỏ modifier game để test xanh |
| Test extraPrice đọc alias cũ |Session.player được thay bằng clone |Test dùng session hiện hành và kiểm nhận lặp fail |Không giữ p qua transaction |
| Thiếu dữ liệu gốc cho generator |Bundle chỉ có UI/catalog; archived server cũng simplified |Không tự thêm tỷ lệ, yêu cầu duyệt bảng riêng hoặc nguồn chuẩn |Phân biệt config cap/hiển thị với odds |
| Output quá lớn/marker patch không khớp |Dump quá nhiều trường và context suy đoán |Thu gọn output, đọc exact line rồi patch |Lưu evidence JSON, không dựa output bị cắt |
| Mongoose warning isNew |Field reserved hiện hữu |Ghi nhận, không sửa schema ngoài phạm vi |Không coi warning là testcase fail |

Giữ UTF-8, không sửa tay các tên/mô tả nguồn hơi lủng củng thành nghĩa gameplay mới. Không sửa source tham chiếu hoặc global memories.

## 4. Kỹ năng / kinh nghiệm mới

- Mô tả ownership của cần5904/5906 là “sau khi nhận vĩnh viễn có hiệu ứng”; kiểm item sở hữu khác kiểm rod đang mặc.
- Cần vàng có luồng bonus riêng: extraPrice→FishPriceGetPanel→4022. Cần đồng bộ nó ở auto thay vì chỉ cộng vào túi.
- `FishSoulBaseConfig.divides=[3000,6500,10000]` dùng chia mốc kỷ lục/thanh trọng lượng, **không phải** xác suất phẩm chất. `FishLevelConfig.washCount.weight` là số dòng tẩy, không phải weight cá.
- Item mảnh/ID skin tồn tại không bảo đảm có HomelandSkinConfig/map/native renderer;190053–55 không được mở bừa vì có ShopConfig.
- Rate mô tả rõ10%,50% có thể lấy làm oracle; các odds cơ sở không có thì việc tự chọn là thiết kế kinh tế mới, cần quyền quyết định riêng.

## 5. Trạng thái hiện tại

### Test local

| Nhóm | Kết quả |
|---|---|
| Candidate known fixes |34/34 PASS|
| Auto regression |21/21 PASS|
| Cần/bè regression |39/39 PASS, có1.800 matrix cases và kiểm profile lịch sử từ snapshot cũ|
| Balance/integrity |70/70 PASS sau sửa fixture alias|
| Huyền Vũ |24/24 PASS|
| Core |PASS,714 bảng|

Tổng188 nhóm local PASS, không phải Linux staging/live QA. Không gọi toàn bộ gói “đã xong” từ kết quả các nhóm đã viết. Chưa test toàn bộ concurrent buy/recharge/skin/event lifecycle, chưa native UI end-to-end hoặc thiết bị vật lý.

### Nguồn thiếu đã đối chiếu

Trong `server.zip`,2 cây `newServer` và `lhs-local-run2` có cùng hash handler fish/fish-soul. Handler thường chọn uniform; linh hồn chọn tuần tự `soulIds[index % ...]`; đều có escapes rỗng. Chúng không cung cấp RNG gốc để phục hồi. Client/config live có minKg/maxKgValue/minAddRate/mốc UI; không tìm được bảng odds nền của hụt, cá thường, linh hồn, di vật hoặc tần suất event trong các nguồn đã kiểm. Đây không phải khẳng định không tồn tại ở bất kỳ nguồn bên ngoài nào.

### Production giữ nguyên

Hậu kiểm16:49:06 UTC+7:155 artifact khớp release phòng câu; S1/S2 ready200;6 process PID/restart nguyên (S1PID16313, S2PID15390). Chỉ query aggregate theo event ID; không ghi player, không mở mới6006/6056/type33. Toàn bộ candidate ở `_ai_workbench/temp/`, chưa sync vào source chính.

## 6. Bước tiếp theo / quyết định cần có

**Cần user cho phép dùng bảng cân bằng riêng cho phần odds còn thiếu** (hoặc cung cấp source/bảng tỷ lệ server gốc). Yêu cầu “bảng cân bằng riêng” trước đây đã áp cho tẩy/hộp; không tự mở rộng thành tỷ lệ tiêu mồi, cá hiếm, linh hồn và kinh tế sự kiện khi chưa xác nhận.

Nếu được phép: tạo một bảng JSON versioned, công khai tỷ lệ/nguồn; giữ các tỷ lệ đã có trong mô tả/config, chỉ đặt phần nền còn thiếu. Sau đó ghép generator/bonus mồi/cần/bè, di vật, event tickets/rewards/BXH/settlement; chạy simulation và negative test rồi mới kích hoạt luân phiên7ngày/dài hạn90ngày.

Với Thiên Công190053–55: cần thêm map/skin config/asset hợp lệ hoặc quyết định thiết kế mới; trong lúc đó giữ mảnh, không tiêu để cấp skin không render được. Hai skin190051/52 đã có candidate, chưa bật live.

Với4 người/đa thiết bị: chuẩn bị bộ render/native thật với các bè/phụ kiện lớn, viewport Android/iPhone/tablet; phân biệt viewport mô phỏng và thiết bị vật lý. Không chỉnh scale/bbox dựa vào fixture chữ hoặc thay game bằng DOM.

Giữ một đợt phát hành chung như user yêu cầu; chưa chạy deployment riêng lẻ. Sau khi quyết định phần thiếu, tiếp tục từ candidate này, không làm lại các phần đã test.
