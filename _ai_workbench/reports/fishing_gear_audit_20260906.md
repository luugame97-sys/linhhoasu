# Session Report — kiểm tra cường hóa cần câu và bè

Ngày 06/09/2026. Snapshot production lúc **07:24:34 UTC+7**. **Có lỗi thật ở mốc chuyển bậc của cả cần và bè; chưa sửa trong phiên kiểm tra này. Không nâng đồ hoặc tiêu hao vật phẩm của người chơi.**

## 1. Tóm tắt công việc

- Đọc báo cáo phiên trước, lấy151 artifact production và trạng thái câu cá bằng truy vấn chỉ đọc.
- Đối chiếu handler4010/4015, hai bảng FishRodGradeConfig/FishRaftGradeConfig, công thức combat, payload đăng nhập và hàm native của hai cửa sổ cần/bè.
- Chạy27 probe trên source snapshot, chặn socket và giả save trong bộ nhớ. Dùng chính hàm updateViewUI/getLevelUpListData của native client trong VM để lấy nút đang hiện, chi phí và chỉ số xem trước.
- Xác nhận lỗi điều kiện chuyển bậc, loại tài nguyên bị trừ lệch giao diện, cấp sau lên bậc, trạng thái tối đa và hiệu ứng tiết kiệm mồi của bè.
- Kiểm tra thông thường dưới mốc chuyển bậc, thiếu Ngư Tệ, cường hóa nhanh và save lỗi: các ca này hoạt động đúng theo bằng chứng dưới đây.

## 2. File/thư mục đã thay đổi

### Chỉ artifact hỗ trợ

- Tool mới: `_ai_workbench/tools/audit_fishing_gear_20260906.js`.
- Dùng lại snapshot_fishing_audit_20260906.py và verify_fishing_audit_readonly_20260906.py; không sửa hai tool đó.
- Evidence: `_ai_workbench/temp/fishing_audit_20260906T002434Z/`, gồm manifest.json, runtime.json, gear-audit.json, postcheck.json và source/config/client snapshot.
- Báo cáo này có cả MD/HTML; đã cập nhật session_report.md/.html.
- Backup báo cáo trước cập nhật: `_ai_workbench/backups/fishing_gear_audit_reports_20260906/`.

**Không sửa source game/client/config, không deploy, không restart, không gọi gameplay RPC trên production, không trừ tài nguyên, phát bù hoặc sửa dữ liệu lịch sử.** Snapshot/runtime chỉ dành cho nội bộ quản trị.

## 3. Lỗi đã gặp & giải pháp đề xuất

### 3.1 Lỗi quan trọng: server và client khác điều kiện chuyển bậc

Native cả hai cửa sổ yêu cầu đồng thời:

`level >= config.level` và `exp >= config.exp`

Trong khi đó getFishRodUpgradeCost/getFishRaftUpgradeCost ở server chỉ xét `level >= config.level`. Khi cấp vừa chạm trần, server đã trừ exp về0 rồi không cho nạp thêm exp bằng Ngư Tệ nữa; bước kế tiếp lập tức dùng gradeUpCost bằng tinh thể69. Client vẫn hiện nâng thường/nhanh bằng Ngư Tệ68.

| Tình huống | Giao diện native | Server thực tế |
|---|---|---|
| Cần bậc1/cấp10/exp0, không có tinh thể | Nâng thường:68×1; nhanh:68×50 | Từ chối, vì yêu cầu69×10 |
| Cần cùng trạng thái nhưng có tinh thể | Vẫn hiển thị chi phí68 | Nâng bậc và trừ69×10, không trừ68 |
| Bè bậc1/cấp10/exp0, không có tinh thể | Nâng thường:68×1; nhanh:68×100 | Từ chối, vì yêu cầu69×15 |
| Bè cùng trạng thái nhưng có tinh thể | Vẫn hiển thị chi phí68 | Nâng bậc và trừ69×15, không trừ68 |

Probe kiểm cả9 mốc chuyển bậc trên từng loại: đều có sự lệch68/69 khi exp chưa đầy. Đây không chỉ là chữ thông báo sai; nếu đủ tinh thể có thể bị trừ một loại tài nguyên khác loại đang hiển thị.

### 3.2 Lên bậc giữ cấp cũ, chỉ số vượt phần xem trước

applyRodUpgradeProgress/applyRaftUpgradeProgress khi gradeUp chỉ tăng rank và đặt exp0, không đặt cấp của bậc mới. Native phần xem trước lại tính bậc mới ở cấp1. Bảng fullLevelAttrs đã chứa tích lũy của bậc trước, vì vậy giữ cấp10 làm cộng thừa cấp trong bậc mới.

| Chuyển bậc1 →2 | Sinh lực xem trước native | Sinh lực sau handler/server combat | State lưu sau lên bậc |
|---|---:|---:|---|
| Cần |4.800|7.500|Bậc2/cấp10 thay vì cấp1 theo preview|
| Bè |9.600|15.000|Bậc2/cấp10 thay vì cấp1 theo preview|

Các con số trên là phần sinh lực của riêng cần/bè trong fixture, không phải tổng sinh lực nhân vật. Đã chạy hàm BattleService.addFishingAttrs thật và payload login: lệch được lưu, không phải chỉ do UI chưa refresh.

Chưa tự đổi cấp của người chơi: việc sửa dữ liệu đã nâng trước đây cần chính sách riêng, không thể âm thầm hạ chỉ số hoặc suy lại chi phí lịch sử.

### 3.3 Đạt tối đa nhưng giao diện vẫn hiện nút nâng

Khi lên bậc10/cấp1400, server đưa exp về0 rồi chặn mọi lần nâng tiếp. Native chỉ hiện “tối đa” nếu exp cũng đầy4000 đối với cần hoặc8000 đối với bè. Vì thế vẫn hiện nút nâng thường/nhanh nhưng lần bấm sau bị từ chối.

Chốt không vượt bậc10 đang hoạt động; phần lỗi là trạng thái cuối không thống nhất. Không thấy trường hợp rank vượt cấu hình trong snapshot người thật hiện tại.

### 3.4 Hiệu ứng “Tinh thông” của bè chưa được áp dụng

FishRaftGradeConfig.attrs104 tăng theo bậc, từ150bps ở bậc1 đến1500bps ở bậc10 (15%). Mô tả native xác định đây là tỷ lệ không tiêu hao mồi câu.

FishingBalanceService.skipCost hiện chỉ cộng rodAttrs104, không cộng attrs104 của bậc bè. Probe bè bậc10, không có dòng tẩy104, ép RNG về0: vẫn không được miễn mồi và bị trừ1 mồi. Đây là phần thiếu tác dụng thật của chỉ số sau cường hóa bè, không phải lỗi hiển thị số lượng.

Các hiệu ứng nâng bậc khác như tập trung/sức mạnh/cá lớn/hiệu suất mồi chưa được chứng minh đầy đủ trong phiên này; không kết luận tất cả đều đạt. Không mở rộng sửa RNG hoặc thiết kế bảng cân bằng khi chỉ được yêu cầu kiểm tra.

### 3.5 Các phần không tái hiện lỗi

- Dưới trần cấp, nâng thường trừ68×1 và tăng1 exp, save và login payload khớp.
- Nâng nhanh đủ tiền đi tới cấp kế tiếp, đúng chi phí native hiển thị: ví dụ cần bậc1/exp7 dùng43 Ngư Tệ, bè dùng93 Ngư Tệ. Nút “nhanh” không có nghĩa nâng hết mọi bậc.
- Nếu không đủ Ngư Tệ để đầy thanh, nâng nhanh dùng phần hiện có và lưu tiến độ tương ứng; không tự nâng khống. Ví dụ7 Ngư Tệ thành7 exp.
- Nâng thường không đủ tiền không trừ vật phẩm.
- Save trảnull hoặc throw không trả thành công; session bị vô hiệu, snapshot durable không đổi trong fixture.
- Max-rank guard chặn lên bậc11 và không trừ thêm tại trần.

### Bảng tổng hợp và lỗi harness

| Vấn đề | Nguyên nhân | Hướng xử lý | Cách tránh lặp lại |
|---|---|---|---|
|Kẹt chuyển bậc / trừ tinh thể khi nút báo Ngư Tệ|Server thiếu điều kiện exp trong chọn thao tác và cost|Thống nhất state machine theo contract native; chặn cost/type khác thao tác người dùng|Test trước/trong/sau mốc cấp và exp, với69=0/đủ|
|Cấp/chỉ số sau lên bậc sai preview|Không chuyển level về cấp bắt đầu của bậc mới|Thống nhất cấp nội bậc, base attrs và preview|So native preview → handler → combat → DB/login|
|Max không hiện đúng|Exp0 sau lần nâng cuối, native đợi thanh đầy|Đồng bộ điều kiện terminal và UI|Test rank10/level1400 và lần bấm sau|
|Bè không được miễn mồi theo chỉ số104|skipCost chỉ đọc dòng tẩy cần|Cộng hiệu ứng bậc bè theo điều kiện mở thực tế và cap đã thống nhất|Test fixed-RNG thấp/cao, tránh random test không xác định|
|Tham số upgradeAll lỏng|Ép truthy, chuỗi “false” bị coi làtrue|Validate boolean/0/1; không dùng truthiness cho cờ tiêu hao|Negative RPC fixture; native hiện gửi boolean đúng|
|Hai probe đầu chọn nhầm packet|4010 push đi trước ACK cùng tag, push không córesult|Harness chọn packet córesult, chạy lại27/27 không lỗi|Không lấy packet đầu cùngtag làmACK|

## 4. Kỹ năng / kinh nghiệm mới

- Không suy “cấp là tích lũy” chỉ từ level trong bảng. Native label “Bậc{0} cấp{1}”, preview bậc mới cấp1 và fullLevelAttrs tích lũy cung cấp bằng chứng đối chiếu.
- Việc đã test chặn rank11 ở phiên trước chưa bao phủ tính nhất quán của exp, nút chuyển bậc hoặc cấp sau chuyển. Kết luận trước không đủ để gọi cả cường hóa đã ổn.
- Phiên này không tìm thấy lỗi “save bị mất” khi nâng thường; lỗi chính nằm ở state được quyết định sai trước khi save. Không nên sửa bằng lưu thêm hoặc tăng số lượng vật phẩm.
- Bằng chứng native ở đây là chạy hàm thật trong VM có UI controls giả, không phải đã mở giao diện thật hay đo packet người chơi đang bấm.

## 5. Trạng thái hiện tại

### Dữ liệu người chơi chỉ đọc

| Server | Profile đã bắt đầu nâng cần | Cần đang tại trần cấp nhưng exp chưa đủ native | Profile đã bắt đầu nâng bè | Bè ở cùng trạng thái lệch |
|---|---:|---:|---:|---:|
|S1|42|27|1|1|
|S2|8|3|0|0|

Đây là số profile có trạng thái trùng điều kiện lỗi, không chứng minh tất cả đã bấm nút thất bại hoặc đã mất tài nguyên. Một người có thể nằm ở cả hai cột cần/bè; không cộng thành31 người duy nhất.

Nhân vật nicky ở snapshot:

- Cấp nhân vật116, cấp câu5.
- Cần bậc2/cấp20/exp0; bè bậc1/cấp10/exp0.
- Ngư Tệ68=99.195, tinh thể69=0. Với state này, UI hiện nâng bằng68 nhưng server sẽ đòi lần lượt69×30 cho cần hoặc69×15 cho bè; do69=0 nên bị từ chối. Không khuyên nạp/thêm tinh thể để vượt lỗi.

### Kiểm chứng

-27 probe chạy xong, probeErrors0. “PASS” trong gear-audit.json nghĩa là probe tái hiện đúng hành vi được assert, **không phải cường hóa đã PASS chức năng**.
-9 mốc chuyển bậc ×2 loại có lệch tài nguyên. Max terminal, preview/combat, partial fast, thiếu tiền và save failure đều có evidence riêng.
-7 hash hậu kiểm source/config/main không đổi so snapshot.4 file local liên quan khớp snapshot production. Không restart, gameplay người thật hoặc DBwrite trong phiên.
- Không nghiệm thu UI visual, DB persistence live/restart bằng nhân vật QA. Kiểm save/login dùng fixture trong bộ nhớ để không tiêu hao tài khoản người chơi.
- Warning Mongoose isNew xuất hiện lúc import harness; không có probe error do warning này. Không sửa schema ngoài phạm vi.

**Kết luận: cả cần và bè đều có lỗi thật ở chuyển bậc; phần cường hóa thông thường không phải toàn bộ bị hỏng. Chưa fix trong lượt kiểm tra này.**

## 6. Bước tiếp theo

1. Khi được yêu cầu sửa: ưu tiên thống nhất loại thao tác/cost và điều kiện exp ở mốc chuyển bậc. Không vá bằng cấp thêm tinh thể hoặc bỏ kiểm tồn kho.
2. Chốt và sửa cấp bắt đầu bậc mới theo native, đồng thời preview/combat/max terminal. Giữ dữ liệu lịch sử, không tự hạ cấp/thu hồi stat hoặc phát bù.
3. Bổ sung hiệu ứng bậc bè104, kiểm điều kiện mở bè và cap với dòng tẩy. Các chỉ số nâng bậc khác cần audit tác dụng riêng.
4. Test matrix mọi rank, bước thường/nhanh/nâng bậc, chi phí vừa đủ/thiếu, độ trễ/retry, save lỗi, relog và UI native trước deploy S1/S2.
5. Tạm tránh bấm nâng tại mốc trần cấp khi UI báo loại tài nguyên không khớp; không thử trên tài khoản thật để chứng minh lỗi.
