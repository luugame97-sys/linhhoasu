# Sửa hiệu ứng tự bán và trang bị cá — 06/09/2026

Đã triển khai client mới lúc **12:17 UTC+7**, dùng cho S1/S2 tại cổng81. Nhánh “Tự trang bị cá mạnh, bán cá yếu” đã nối vào hiệu ứng native: cá mới bay về đúng ô, Ngư Tệ bay về ô tiền và phát coin pulse. Không sửa server hoặc restart tiến trình.

## 1. Tóm tắt công việc

User yêu cầu sửa tiếp ngay sau khi audit xác nhận auto-power chỉ cập nhật dữ liệu mà chưa gọi hiệu ứng. Phần bỏ ngày mở map đã hoàn tất trước đó; bản client này giữ nguyên yêu cầu chỉ cấp25/28 và sửa đổi map đang hoạt động.

### Luồng hiệu ứng mới

1. `sendAutoPowerFish` ghi nhận raid/view hiện tại khi gửi yêu cầu xử lý cá4008; chỉ cho một yêu cầu đang chờ như cũ.
2. Khi có ACK, kiểm generation reconnect và cờ callback đã xử lý. Áp dụng state authoritative/receipt revision, phát sự kiện cập nhật ô cá như trước.
3. Chỉ ACK thành công mới gọi `playAutoPowerFishEffects`.
4. Với mỗi cá trong `r.equipped`, đối chiếu UID/ID/type với slot server trả về; dùng `playPutInIconFlyAnim` bay icon từ nhân vật đang câu đến đúng ô. Tối đa một hiệu ứng cho mỗi type trong response.
5. Với kết quả có `soldUids` và Ngư Tệ68 trong `r.rewards`, gọi `playSellIconFlyAnim` một lần cho batch; native helper bay icon về ô68 rồi gọi `coinFlyBtnAnim`. Không nhân hiệu ứng bán theo từng cá với tổng reward lặp lại.

Hiệu ứng dùng asset/helper gốc, không tạo ảnh hoặc DOM overlay mới. Coin pulse/đường bay chỉ là hình ảnh; không cộng tiền, grant item, gửi RPC hoặc ghi DB từ hiệu ứng.

### Bảo vệ lifecycle

- Phản hồi trùng của cùng request chỉ được xử lý một lần, tránh lặp cả hiệu ứng lẫn khởi động lượt câu kế tiếp.
- Response replay từ receipt server cập nhật state nhưng không phát lại hiệu ứng thưởng cũ.
- Sau reconnect, generation cũ bị bỏ qua hoàn toàn.
- Nếu raid/view đã đổi, scene không khớp, view không còn stage/parent hoặc không có nhân vật, bỏ hiệu ứng; vẫn nhận state đã lưu.
- Nếu đang câu nền và không có view lúc gửi request, không phát hiệu ứng vào view vừa mở sau đó.
- Ô cá chưa tồn tại/bị tháo khỏi stage thì bỏ riêng hiệu ứng trang bị đó; ô tiền không có thì bỏ riêng hiệu ứng tiền.
- Lỗi native renderer khi gọi flight không ngăn áp dụng state hoặc làm kẹt auto.
- Bấm dừng auto khi đang chờ ACK: kết quả đã xác nhận vẫn có thể hiện hiệu ứng trên cảnh còn mở, nhưng không phát lượt câu mới.
- Cá khóa/có kỹ năng/ngang lực chiến được giữ theo server; không vẽ trang bị/bán cho cá không có trong kết quả thành công.

Không đổi tốc độ1,11×, thời gian bắt cá, lịch `doNext` của lượt tiếp theo, quyền Huyền Vũ, quy tắc bán hoặc lựa chọn cá mạnh. Không thêm độ trễ chờ hiệu ứng.

## 2. File/thư mục đã thay đổi

### Source chính

- Local `linhhoasu/webgame/game/js/main.min_a6195824.js`: sửa `u.sendAutoPowerFish`, thêm `u.playAutoPowerFishEffects`.
- Local `linhhoasu/webgame/game/index.html`: token `20260906_fishing_auto_fx_v1`.
- Production tương ứng `/linhhoasu/webgame/game/js/main.min_a6195824.js` và `/linhhoasu/webgame/game/index.html`.
- Tất cả server source, config bin, map/level gates, auto-power service, balance/gear/commerce, API và DB schema giữ nguyên.
- Kiểm phép biến đổi ngược: xóa helper mới và phục hồi callback trả lại đúng toàn bộ bundle baseline; mọi hàm ngoài hai thay đổi này giữ byte-identical.

### Tool hỗ trợ và báo cáo

- Mới trong `_ai_workbench/tools/`: `build_fishing_auto_fx_client_20260906.js`, `test_fishing_auto_fx_20260906.js`, `qa_fishing_auto_fx_live_20260906.js`, `release_fishing_auto_fx_20260906.py`.
- Sửa `test_fishing_auto_20260906.js`:3 fixture callback bổ sung dependency Y.RaidMgr/helper FX stub để giữ các bài test state/generation; hiệu ứng thật được kiểm ở suite riêng26 case.
- Baseline snapshot: `_ai_workbench/temp/fishing_audit_20260906T051014Z/`, lấy12:10:15 UTC+7,153 artifact.
- Candidate/evidence: `_ai_workbench/temp/fishing_auto_fx_20260906/`: `client-build.json`, `auto-fx-tests.json`, `stage.json`, `deploy.json`, `verify.json` và kết quả regression.
- Backup local: `_ai_workbench/backups/fishing_auto_fx_local_20260906/`.
- Backup báo cáo: `_ai_workbench/backups/fishing_auto_fx_reports_20260906/`.
- Staging `/linhhoasu/_ai_workbench/temp/fishing_auto_fx_20260906_051546/`.
- Backup production `/linhhoasu/_ai_workbench/backups/fishing_auto_fx_20260906_051546/`:0.before là main,1.before là index.
- Cập nhật báo cáo này MD/HTML và session_report.md/.html đầy đủ6 mục.

Triển khai bằng thay thế file nguyên tử cùng filesystem, main trước index; không phục vụ bundle đang ghi dở. Có hash guard trước install và rollback chỉ hai file client, không rollback DB. Không restart Nginx/game/DB hoặc bù thưởng.

## 3. Lỗi đã gặp & giải pháp

| Lỗi/rủi ro | Nguyên nhân | Xử lý | Chống lặp |
|---|---|---|---|
| Auto bán/trang bị âm thầm |Callback mới thiếu lời gọi helper native|Nối helper từ ACK đã lưu, đúng reward/equipped|Test cả state và hiệu ứng đích|
| Auto không có popup để lấy vị trí icon |Luồng trang bị thủ công dùng nhãn cá popup|Dùng nhân vật câu đang hiển thị làm nguồn bay|Kiểm stage/parent/slot trước gọi helper|
| Callback trùng có thể lặp hiệu ứng/lượt kế |Chỉ có generation reconnect, chưa có guard từng callback|Cờ answered trong closure request|Gọi lại cùng callback trong fixture|
| ACK cũ phát hiệu ứng lên map mới |Không kiểm identity raid/view lúc gửi/nhận|Capture raid/view và so sánh trước vẽ|Đổi raid, view, scene, close/reopen tests|
| Background/slot chưa tạo có thể gây lỗi renderer |Không có display node hợp lệ|Bỏ hiệu ứng tương ứng, giữ state và auto|No-view/no-target tests|
| Lỗi hoạt ảnh làm dừng auto |Ngoại lệ từ helper graphic|Cô lập lời gọi flight, không ảnh hưởng logic|Inject render error và xác nhận lượt tiếp|
| Tìm helper theo alias không thấy |Bundle dùng FPt.onePosToOtherPos rồi alias sc|Đọc definition và getNodePos/CreateRole|Không suy getMyEntity là Point: thực tế được addChild lên display|
| Mongoose cảnh báo field isNew |Schema hiện hành dùng tên reserved|Ghi nhận, không sửa model ngoài scope|Tách warning khỏi kết quả test|

Không có lỗi production ở lần staging/deploy này, không rollback. UTF-8 được giữ; không phát sinh mojibake trong helper tiếng Việt hoặc báo cáo.

## 4. Kỹ năng / kinh nghiệm mới

- Hiệu ứng phải bám kết quả giao dịch đã xác nhận, không dự đoán chiến lực hoặc tự bán lần nữa trên client.
- Replay ledger và callback bị gọi lại là hai trường hợp khác nhau; cần chặn cả hai.
- Kiểm view tại thời điểm nhận ACK chưa đủ; cần biết request xuất phát từ view nào để không vẽ lên một phiên cảnh mới.
- Native getMyEntity trả display object có trong lootNode. Helper getNodePos hỗ trợ DisplayObject; không cần tạo điểm màn hình hoặc overlay mới.
- FX không nên trì hoãn lượt câu tiếp theo hoặc hỏng đường auto khi renderer chưa sẵn sàng. Việc bỏ FX ở chế độ nền không làm mất phần thưởng.

## 5. Trạng thái hiện tại

### Test tự động

| Suite | Kết quả |
|---|---|
| Auto FX |26/26 PASS local/staging|
| Auto gameplay |21/21 PASS local/staging|
| Gear |38/38 PASS staging,1.800 matrix|
| Balance/integrity |70/70 PASS staging|
| Huyền Vũ |24/24 PASS staging|
| Core |714 bảng PASS|

Tổng **179 nhóm test staging PASS**. FX suite bao gồm bán-only, equip-only, mixed,10 type, locked/partial held, callback trùng, receipt replay, reconnect, mất raid/view/actor/slot/coin target, scene đổi, renderer exception và dừng khi chờ ACK. Thực thi callback và helper flight/coin native, kiểm đích và số lần gọi; chưa nghiệm thu renderer bằng hình ảnh.

### Live QA S2 và S1 trước khi publish client

- Dùng nhân vật QA riêng. Server chọn cá mạnh đúng, bán cá yếu, giữ ô khóa, nhận109 Ngư Tệ từ100 sau batch fixture, save history/receipt đúng.
- Phản hồi thật4008 được đưa vào callback native mới; flight tới `slot1`, `coin68`, coin pulse1 lần. Callback lặp và response replay không thêm flight hoặc thưởng.
- Setting binary/relog, retry sau relog, câu thật→auto, tương tác tẩy/hộp vẫn PASS; không claim Huyền Vũ hoặc thao tác người thật.
- Asset icon ở live-ACK harness là stub; membership/target icon thật được kiểm ở fixture dùng config thật. Không coi harness này là hình ảnh game đã render.
- QA player và mail được xóa đúng scope, hậu kiểm còn0 ở cả hai DB.

### Hậu kiểm12:17:23 UTC+7

-154 artifact khớp expected:2 client file thay,152 artifact khác giữ nguyên; toàn bộ server source nguyên.
- Main SHA-256 `698ee96c1072607a2d527fa5157e96ce3cd534d5d4321bb2f1e7762608a519a7`.
- Index production SHA-256 `7de1ef55e759deb5dc3b843e6f415c3d46baa7728544bdb1525cefda542e8f83`.
- Main/index phục vụ cổng81 đúng hash mới. Main local/candidate khớp; index normalized nội dung khớp, giữ newline local.
- Cả6 tiến trình giữ PID/restart: S1 PID29724/restart1376, S2 PID27996/restart42, dist30824, admin30856, bot1600 và1576. Ready8080/8083 đều200.
- Không restart, compensation, migration hoặc sửa item/player lịch sử.
- Các sửa trước về đổi map và bỏ ngày giữ byte-identical trong source/client. Chưa chạy lại toàn suite level-only ở phiên FX vì không đổi chúng; inverse check chứng minh phạm vi client và full server hash chứng minh phần server giữ nguyên.
- **Chưa nghiệm thu hình ảnh trực tiếp trên trình duyệt/APK**, chưa cold-start. Không tuyên bố các phần đó PASS từ kết quả VM/WS.

## 6. Bước tiếp theo

1. Người dùng tải lại game một lần để nạp token `20260906_fishing_auto_fx_v1`.
2. Bật “Tự trang bị cá mạnh, bán cá yếu”, giữ màn câu cá mở: lượt có bán sẽ bay Ngư Tệ về ô tiền; lượt thực sự thay/trang bị cá sẽ bay icon về đúng ô.
3. Nếu toàn cá yếu thì chỉ có hiệu ứng bán. Nếu toàn cá được giữ/khóa/ngang điểm thì không giả hiệu ứng bán hoặc trang bị.
4. Đóng màn câu cá/chuyển khu thì không phát FX lên cảnh khác; tiền/cá vẫn theo state server. Dừng auto khi chờ ACK không làm mất kết quả đã lưu.
5. Nếu không thấy flight trên client cụ thể, lấy thời điểm/khu và video ngắn để kiểm stage/lifecycle thực; không chạy lại giao dịch hoặc bù chỉ vì thiếu animation.
