# Session Report — tự trang bị cá, tăng tốc và Huyền Vũ

Ngày 06/09/2026, hậu kiểm lúc **11:05 UTC+7**. **Đã thêm tùy chọn tự trang bị cá mạnh, bán cá yếu trên S2/S1. Tăng tốc và quà Huyền Vũ được kiểm tra; handler quà ngày chưa sửa, không phát bù.**

## 1. Tóm tắt công việc

### Tự trang bị/bán cá — đã triển khai

- Thêm ô **“Tự trang bị cá mạnh, bán cá yếu”** ở cửa sổ ủy thác câu cá thường, mặc định **tắt**.
- Server so lực chiến của nhân vật nếu trang bị từng ứng viên vào đúng loại cá, dùng BattleService và dữ liệu đã lưu, không tin điểm client gửi.
- Chọn cá mạnh nhất trong lô hiện tại, thay toàn bộ entity; bán cá yếu hơn, kể cả cá cũ vừa thay ra. Giữ giá bán server hiện hành (Ngư Tệ theo quality), không thiết lập lại giá.
- Giữ cá khóa, chết, có kỹ năng hoặc tempSkills. Nếu cá đang trang bị được bảo vệ thì giữ cả ô và cá mới cùng loại. Cá ngang lực chiến không tự bán.
- So theo **thuộc tính có hiệu lực ở cấp câu hiện tại**. Cá có tiềm năng cao ở cấp sau nhưng lực chiến hiện tại thấp vẫn có thể được bán; muốn giữ tiềm năng/sưu tầm phải tắt chế độ này hoặc giữ cá thủ công.
- Chế độ mới ưu tiên hơn bộ lọc dừng phẩm chất/loài và tự nộp đơn. Ghi chú này hiện dưới ô tùy chọn. Tắt chế độ mới thì luồng cũ giữ nguyên.
- Còn cá cần giữ thì tự dừng và mở phần nhận cá; chỉ bắt đầu lượt câu tiếp sau khi nhận ACK/state mới.
- Cấu hình thêm ở cuối định dạng nhị phân cũ, có kiểm độ dài khi đọc; bản cũ mặc định false, không thay vị trí trường trước.
- Lưu20 lịch sử giao dịch tự động gần nhất tại autoPowerHistory, có entity cá đã bán. Chỉ dùng phục hồi nội bộ, không phải túi để nhận lại miễn phí; không gửi lịch sử này trong login.
- requestId/balanceRevision/receipt ngăn xử lý lặp. Chặn UID trùng, state pending cũ, batch quá10 và thiếu quyền ủy thác. Yêu cầu cấp câu10 hoặc thẻ11000009 còn hiệu lực.
- Reconnect reset cờ chờ, tăng generation; callback cũ không ghi đè state hoặc tự câu tiếp. Dừng thủ công trong lúc chờ ACK không bị tự khởi động lại.

### Tăng tốc ủy thác — kết quả kiểm tra

- Native hiện là **1,11×**, không phải2×. Không tự thay đổi hệ số.
- Probe hàm startFishing thật:3200ms →2883ms khi bật nhanh, giảm khoảng9,9% thời gian. Tổng thời gian thực tế còn phụ thuộc metadata, vòng chờ và mạng.
- Metadata chưa tải (Anim_Config toàn0) có thể tạo waitAllTime=NaN. Luồng tự động mới chặn gọi câu khi raid/metadata chưa sẵn sàng, không tiêu hao để rồi kẹt.
- Nhãn mới ghi “Tăng tốc câu cá (1,11×)”. Không sửa vòng hoạt ảnh toàn game hoặc lỗi input-freeze đã tạm dừng.
- Chưa đo native UI/FPS, background hoặc Hoang Cổ trực tiếp; không tuyên bố toàn bộ tăng tốc đã hết lỗi. Đây là ủy thác client trong phiên online, không phải tiến trình offline server.

### Huyền Vũ — đính chính và kết luận

**Đính chính thông báo sơ bộ:** đoạn cấp50 Nguyên bảo thuộc cây local cũ. Source production thật đã có kiểm thời hạn/ngày nhận và cấp ShopConfig.extraRewards đúng. Không dùng local khác hash để kết luận quà live là50 Nguyên bảo.

| Hạng mục | Bằng chứng snapshot/probe |
|---|---|
|Quà ngày cấu hình11000009|65×50 Đùi Gà +70×2 phiếu làm mới|
|Quà thực cấp vào player|Đúng50 Đùi Gà và2 phiếu|
|Thời hạn thẻ|Có kiểm activeUntil; không thẻ/hết hạn bị từ chối|
|Nhận lặp cùng ngày|Có kiểm ngày GMT+8; lần hai bị từ chối|
|Cập nhật số lượng1202|**Thiếu**: chỉ trả1211.rewardInfo, không cập nhật số đếm item|
|Save trảnull|**Lỗi**: vẫn có thể trảresult0 dù chưa xác nhận durable write|
|Client nhận phản hồi lỗi|Không check result trước changeMonthCardRewardTime, có thể đánh dấu đã nhận dù thất bại|

“Bấm nhận mà không thấy tăng” phù hợp lỗi **đồng bộ UI**, không chứng minh DB chưa cấp. Probe trên clone:65 tăng100→150,70 tăng0→2, nhưng không có1202. Chưa có log đủ để xác định riêng lượt người dùng đã bấm có commit không.

Snapshot nicky cho thấy thẻ còn hiệu lực và có monthCardRecords. Không suy ngược quà thiếu từ số vật phẩm hiện tại. Không gọi1211 trên tài khoản đó, không reset ngày, không nhận lại hoặc phát bù.

**Commerce-compat.js production giữ nguyên trong release này**: phạm vi Huyền Vũ là kiểm tra. Khi được yêu cầu sửa cần bổ sung1202, save xác nhận và callback chỉ đánh dấu nhận khi thành công.

## 2. File/thư mục đã thay đổi

### Source chính local/production

| File | Nội dung |
|---|---|
|linhhoasu/lhs/newServer/src/services/FishingAutoService.js|Mới: chọn theo lực chiến server, guard và lập kế hoạch|
|linhhoasu/lhs/newServer/src/handlers/fish.js|Nhánh autoPower4008, quyền, ledger, clone+save, history và ACK|
|linhhoasu/lhs/newServer/src/handlers/playerPayload.js|Ẩn autoPowerHistory khỏi login|
|linhhoasu/webgame/game/js/main.min_a6195824.js|Checkbox EUI native, setting, callback, reconnect, metadata guard|
|linhhoasu/webgame/game/index.html|Cache key20260906_fishing_auto_power_v1|

Không đổi binary config/skin, commerce-compat, giá bán, bảng cân bằng, WebGM, DB schema, WSServer hoặc bot worker. Không dùng HTML overlay để thay UI native.

### Công cụ và evidence

- Tools mới: audit_fishing_auto_privilege_20260906.py, build_fishing_auto_client_20260906.js, test_fishing_auto_20260906.js, qa_fishing_auto_live_20260906.js, release_fishing_auto_20260906.py, sync_fishing_auto_local_20260906.py, final_fishing_auto_20260906.py; tất cả trong _ai_workbench/tools/.
- Baseline: _ai_workbench/temp/fishing_audit_20260906T005207Z/.
- Candidate: _ai_workbench/temp/fishing_auto_20260906/; gồm privilege-audit.json, auto-tests.json, qa-auto-settings.json, client-build.json, stage.json, canary-progress.json, deploy.json, final-check.json, local-sync.json.
- Backup remote: /linhhoasu/_ai_workbench/backups/fishing_auto_20260906_040301/.
- Backup local: _ai_workbench/backups/fishing_auto_local_20260906/; report backup: _ai_workbench/backups/fishing_auto_reports_20260906/.
- Gói source-only: temp/fishing_auto_20260906/fishing_auto_power_v1_20260906.zip,6 entry,2.189.356 bytes; SHA25604078615d52314d78f4cdf9777443ca2b116821ce91063081417bc53747555a3.
- Gói yêu cầu fishing_gear_v1; không chứa credential/runtime/DB hoặc fix quà ngày. Snapshot/log chỉ dùng nội bộ.
- Báo cáo này và session_report.md có HTML đầy đủ, không tạo file tạm ở root.

## 3. Lỗi đã gặp & giải pháp

| Vấn đề | Nguyên nhân | Xử lý | Chống lặp |
|---|---|---|---|
|Nhầm quà live với local|Local commerce cũ khác production|Đính chính bằng snapshot/hash và handler thật|Không suy từ local khác hash|
|Quà ngày không hiện số tăng|Thiếu1202|Chẩn đoán, chưa sửa|Test DB+ACK+sync, không chỉ popup|
|Quà save-null vẫn success|persistPlayer bỏ qua null|Chẩn đoán, chưa sửa|Không đánh dấu nhận trước xác nhận save|
|Auto cũ chỉ dừng khi cá mạnh|Không có equip tự động|Tùy chọn riêng server-authoritative|Không đổi ý nghĩa tùy chọn cũ|
|Bán nhầm cá có giá trị khác|Không bảo vệ khóa/kỹ năng|Giữ/cảnh báo/dừng, ngang điểm không bán|Test protected/type/UID/skill|
|Callback cũ sau reconnect|Cờ pending còn lại|Generation và reset pending|Late callback test|
|Metadata0 tạoNaN|Duration chưa tải|New auto kiểm readiness|Không tiêu hao rồi kẹt|
|Chèn UI nhầm class minified|childrenCreated là tên dùng chung|Exact marker V6e.prototype và VM test|Không dùng anchor mơ hồ|
|ByteArray không constructor|Module export trực tiếp|Sửa import harness|Binary roundtrip actual functions|

## 4. Kỹ năng / kinh nghiệm mới

- Score cá phải tính khi đặt vào đúng slot; không chỉ so quality/multi/tổngvalue khác loại. Bản này dùng chuẩn BattleService; công thức/scale hiển thị client cũ chưa phải oracle tuyệt đối.
- Kiểm cấp câu hoặc thẻ còn hiệu lực trước ủy thác; không tin trạng thái bật do client gửi.
- Danh sách UID phải khớp toàn bộ pending; không nhận danh sách cắt xén rồi xóa phần còn lại.
- Ảnh07:21/07:23 chụp trước gear release07:45, không dùng ảnh cũ để phủ nhận bản cường hóa mới.
- 1,11× tương đương giảm khoảng9,9% thời gian. Zero/NaN khi chưa có metadata khác với hệ số tăng tốc sai.

## 5. Trạng thái hiện tại

-21 tests auto/persistence/guard PASS local/staging; gồm binarytrue/false/legacy roundtrip và nativecheckbox layout trong VM.
-70 hồi quy balance PASS; staging gear38 nhóm/1.800 matrix PASS. Một test thống kê profile lịch sử không chạy tại staging này vì không upload runtime, không gắn nhãn39. Core714 bảng PASS local/staging.
-3 probe chẩn đoán xác nhận thiếu1202, nullsave và speed1,11×/metadata0. Probe tái hiện bug không đồng nghĩa featurePASS.
-Live S2 QA đạt trước S1: chọn tốt nhất, bán3 cá yếu, giữ ô khóa, sale history, setting10002/relog, retry, câu thật rồi auto, tẩy/hộp dùng chung ledger. Dailyclaim1211 live actions=0.
-QA cleanup0. Chỉ2 UID QA riêng bị thao tác; không vật phẩm/cá người chơi thật, không compensation. Auto mặc định tắt.
-154 hash tracked PASS;5 file release/149 artifact khác nguyên. Commerce hash không đổi;3 source local và main/index served khớp.
-PID cuốiS1=2605/restart1373,S2=32330/restart37. Restart1 lần/server; dist30824/admin30856/bot1600/1576 giữ PID/restart. HTTPready8080/8083=200, WSready9200/9201=ok.
-Chưa nghiệm thu visual UI trên phiên người thật; chưa offline automation hoặc QA state xuyên thêm restart.

### Còn lỗi / giới hạn

1. **Huyền Vũ:** thiếu1202, save-null vẫnsuccess, callback đánh dấu nhận khi lỗi. Đã chẩn đoán, chưa sửa; không bù lịch sử.
2. **Cold animation metadata:** luồng auto mới có guard; luồng cũ/Hoang Cổ chưa được nghiệm thu đầy đủ.
3. **Lực chiến:** dùng cấp hiện tại, không đánh giá tiềm năng ở cấp sau. Muốn giữ cá sưu tầm cần tắt auto hoặc giữ thủ công.
4. **Giá/bonus bán cá:** giữ quy tắc server hiện hành, chưa xác minh đủ bonus cần vàng/đặc quyền so bản gốc.
5. RNG linh hồn, di vật/event, hiệu ứng mồi nâng cao, activation mảnh Thiên Công vẫn là phần chưa nghiệm thu trước đây. Không tuyên bố câu cá hoàn thiện100%.

## 6. Bước tiếp theo

1. Ctrl+F5/đăng nhập lại, mở ủy thác câu cá thường, bật “Tự trang bị cá mạnh, bán cá yếu” rồi Bắt đầu. Đọc lưu ý về cá được giữ và bộ lọc.
2. Khi được yêu cầu sửa Huyền Vũ: dùng production baseline, sửa save-confirmed+1202+clientresultguard; test hết hạn/đã nhận/ngày mới/retry/save bất định. Không reset ngày nhận/phát bù tự động.
3. Nếu muốn sửa toàn bộ cold-start/tăng tốc: kiểm metadata thật, lifecycle/timer và UI native; không thay1,11 thành2 để gọi là fix.
4. Rollback source phải giữ balanceReceipts/autoPowerHistory/state DB, không restore player snapshot cũ; chỉ restart game trong phạm vi.
