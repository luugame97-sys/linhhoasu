# Kiểm người chơi cùng ngư trường và xếp chỗ câu — 06/09/2026

**Kết luận: có lỗi nhìn thấy nhau không đầy đủ và chồng vị trí. Có thể sửa bằng tự phân phòng/chỗ trên server, tái dùng4 vị trí có sẵn của client. Chưa triển khai bản sửa.**

Nguồn kết luận là source production đã xác minh hash và11 phép mô phỏng handler/receiver native. Phép kiểm live nhiều nhân vật **không đạt do lỗi harness**, không dùng làm bằng chứng thành công; QA còn sót đã được sao lưu/dọn, chi tiết bên dưới.

## 1. Tóm tắt công việc

### 1.1 Người chơi có nhìn thấy nhau không?

Client đã có mô hình nhiều người trong ngư trường, nhưng server chỉ làm một phần:

- `handleFishMapTransition` trả push4050 với `players: []` cho người mới vào, dù có người đang câu.
- Server gửi push4051 về người mới vào cho các kết nối khác; client cùng map xử lý bằng `sc_fish_map_other_enter` → `PlayerEnter`.
- Vì vậy, A vào trước rồi B vào: A có thể thấy B, còn B không nhận được A. Người vào sau không thấy đầy đủ người vào trước.
- Vào lại cùng khu có thể làm mất danh sách người khác đang hiển thị:4050 dựng lại cảnh với danh sách rỗng, còn server không rebroadcast same-room entry.
- Khác map: client lọc4051/4052 theo mapId. S1/S2 đang là các WSServer riêng, không có danh sách câu cá liên server được chia sẻ; không mặc định nhìn thấy nhau giữa hai server.

Mô phỏng2 người: A thấy[A,B], B thấy[B]. Mô phỏng8 người vào lần lượt: người đầu thấy8 entity, người cuối chỉ thấy mình. Đây là kết quả thực thi native trong VM với dữ liệu giả lập, không phải đếm người đang online production.

### 1.2 Chỗ câu hiện tại bị chồng

`handleFishMapTransition` gán `pos:1` cho chính người vào và gọi `buildFishMapOtherEnterPacket(...,1)` cho người khác. Không có bộ cấp chỗ trống, không giới hạn4 người/phòng và chưa có instance room tách khỏi mapId.

Native `FishEntityData.parse` và `FishMapRaid.CreateRole` lấy tọa độ trực tiếp từ `FishConst.PosConfig[pos]`. Không tự đẩy người đứng trùng sang chỗ khác. Với gói hiện tại, các entity cùng đứng tại `(228,-80)`, hướng sang trái.

| Chỗ native | X | Y | Hướng |
|---|---|---|---|
|0|-228|-80|Sang phải|
|1|228|-80|Sang trái|
|2|-228|121|Sang phải|
|3|228|121|Sang trái|

Đây là4 điểm neo hai bên/hai hàng của bố cục gốc. Khoảng cách neo ngang456 và dọc201 theo hệ tọa độ cảnh, không phải pixel vật lý của ảnh chụp.

**Lưu ý kỹ thuật:** số chỗ đúng là0–3, không phải1–4. `buildFishMapPlayer` hiện ép `Math.max(1,...)`, nên truyền0 sẽ biến thành1. Truyền4 vào native sẽ lỗi `Cannot read properties of undefined (reading 'x')`. Không được chỉ tăng bộ đếm pos mà bỏ qua contract này.

Mô phỏng8 người:8 entity của người quan sát đầu tiên có cùng một tọa độ. Mô phỏng cấp đủ4 chỗ0–3 trực tiếp cho native: tạo được4 tọa độ riêng, không cần đổi asset. Chưa chứng minh mọi bè/thời trang lớn đều không che lên nhau bằng nghiệm thu hình ảnh.

### 1.3 Các phần liên quan còn thiếu

- Broadcast hiện qua `WSServer.broadcastExceptUser` đến mọi socket OPEN khác user, không lọc cùng ngư trường/phòng hoặc trạng thái đăng nhập ở server. Client lọc một phần nhưng traffic vẫn phát quá rộng; cần thu hẹp khi triển khai room.
- `handleFishCatch` hiện chưa gửi peer push4060 để người khác thấy động tác quăng/thu cần. Có nhân vật không đồng nghĩa đã đồng bộ hoạt ảnh câu cá đầy đủ.
- Đổi cần4011 và đổi mồi4007 chưa gửi peer4061/4062; đổi bè có4063. Client đã có các receiver này.
- Rời map/đổi map có thông báo4052 và client xóa người rời trong trường hợp cơ bản. Disconnect có hook trong WSServer, nhưng chưa có ghế/room allocation để thu hồi.

### 1.4 Phương án đề xuất, chưa thực hiện

Ưu tiên **mỗi phòng tối đa4 người**, dùng4 chỗ gốc:

1. Quản lý phòng theo `(serverId, mapId, roomId)`, tách roomId khỏi ID ngư trường. Người mới ưu tiên phòng còn chỗ; phòng đầy mở phòng tiếp theo.
2. Server cấp một chỗ trống0–3 theo thứ tự ổn định; không đổi chỗ người đang câu khi có người vào/ra. Không dùng random tọa độ cho từng lượt.
3. Khi vào, gửi đầy đủ danh sách người khác trong đúng phòng; đồng thời báo người mới cho các thành viên hiện có. Loại chính mình và UID trùng khỏi roster.
4. Gắn vị trí với session membership; reconnect/thay phiên phải kiểm đúng chủ sở hữu chỗ. Không để cleanup socket cũ giải phóng chỗ của session mới.
5. Thu hồi chỗ khi rời, đổi khu hoặc mất kết nối; xử lý đồng thời cần khóa/cấp chỗ nguyên tử ở mức phòng, không chỉ khóa theo người chơi. Nếu cần giữ chỗ ngắn cho reconnect phải có thời hạn rõ ràng.
6. Hoàn tất kiểm điều kiện/lưu scene trước khi công bố room mới; nếu save không xác nhận, trả lại reservation, không broadcast thành công hoặc xóa cá chờ.
7. Broadcast join/leave, động tác câu, đổi cần/mồi/bè và emoji chỉ tới người trong cùng phòng. Không mở liên server hoặc thay logic catch/auto/coin.
8. Kiểm hình ảnh4 người với bè/thời trang lớn, tên dài và hiệu ứng câu/bán; chỉ chỉnh khoảng cách/scale nếu ảnh thực chứng minh bố cục gốc chưa đủ.

**Đánh đổi cần rõ:** khi chia4 người/phòng, mọi người trong cùng phòng nhìn thấy nhau, nhưng toàn bộ người chọn cùng ngư trường không nhất thiết cùng một phòng. Nếu muốn10–20 người cùng xuất hiện trên một màn, cần thiết kế lại thêm tọa độ/scale/culling và nghiệm thu giao diện, không chỉ xóa giới hạn.

## 2. File/thư mục đã thay đổi

### Source game

Không sửa source game/client/config. Không deploy hoặc restart bất kỳ tiến trình game, bot, admin, dist, Nginx hay DB. Sửa map/chỉ cấp/auto FX của các phiên trước được giữ nguyên.

### Tool và evidence

- `_ai_workbench/tools/snapshot_fishing_room_readonly_20260906.py`: hash guard và snapshot source/client, không đọc người chơi trong bước snapshot.
- `_ai_workbench/tools/audit_fishing_room_20260906.js`:11 phép kiểm offline; save trong bộ nhớ, network bị cấm.
- `_ai_workbench/tools/qa_fishing_room_live_20260906.js`, `run_fishing_room_qa_20260906.py`: harness live lỗi, **đã chặn chạy bằng WITHDRAWN**. Không tái sử dụng.
- Tool kiểm/dọn hậu quả riêng: `inspect_room_qa_cleanup_20260906.py`, `cleanup_failed_room_qa_20260906.py`, `verify_room_qa_redis_20260906.py`.
- Evidence: `_ai_workbench/temp/fishing_room_audit_20260906T052229Z/`: `manifest.json`, `room-audit.json`, `qa-cleanup-inventory.json`, `qa-cleanup-final.json`, `qa-redis-check.json`, `postcheck.json`.
- Backup report: `_ai_workbench/backups/fishing_room_audit_reports_20260906/`.
- Báo cáo này và HTML tương ứng; cập nhật `session_report.md/.html`.

### Sai sót trong kiểm live và dọn QA

Yêu cầu này là kiểm tra/đánh giá khả năng. Bước live tạo nhân vật, vào map và phát presence vượt mức cần thiết cho một audit; không được mô tả cả phiên là chỉ đọc. Các phép thử đã dừng, không sửa gameplay để đáp ứng harness.

- Harness insert `userId=qa_room_..._uN` nhưng login không token tự thêm `_s1002`, dẫn đến tải/tạo nhân vật khác cấp1 thay vì clone cấp116/câu28. Vì vậy xác nhận chéo UID và vào map2 thất bại là lỗi phép thử, không phải bằng chứng map2 hỏng.
- Waiter ban đầu bị loại khi gặp packet không khớp, gây timeout; promise không được bắt làm một số lần chạy bỏ qua finally. Một tiến trình thử còn tồn tại sau timeout SSH.
- Một lỗi name unique xảy ra vì tên QA cố định còn tồn; các lần đổi fixture tiếp theo không tạo được một ca live hoàn chỉnh. Không có kết quả S1/S2 live PASS đáng tin ở phiên này.
- Chặn chạy hai script lỗi. Inventory xác định đúng18 document QA còn sót ở S2:15 clone+3 nhân vật mới do suffix login; S1 không có document thuộc prefix này. Dừng đúng PID21016 sau khi kiểm argv chính xác là `node /tmp/qa_fishing_room_20260906.js 1002`, không đụng tiến trình game.
- Sao lưu đủ18 document vào `/linhhoasu/_ai_workbench/backups/failed_room_qa_20260906_1788673854848/lhs_s1002.ejson` (thư mục700, file600), rồi xóa từng record bằng `_id+userId+playerId+name` đã xác minh. Có thể khôi phục dữ liệu test từ backup; không phải xóa dữ liệu người chơi.
- Hậu kiểm: không còn QA process, file `/tmp` của harness đã hết; Mongo player/mail/session/account/transaction thuộc mẫu ID QA đều0. Kiểm Redis theo prefix của đúng S1/S2: session QA và member rank arena/tower QA đều rỗng. Không sửa online count hoặc rank người thật.
- Hậu kiểm source154 hash nguyên,6 tiến trình nguyên PID/restart và ready200. Việc từng mở QA có thể đã gửi presence cho người đang cùng map do broadcast hiện hành; không khẳng định không có bất kỳ tác động hiển thị tạm thời nào.

## 3. Lỗi đã gặp & giải pháp

| Lỗi/phát hiện | Nguyên nhân | Xử lý phiên này | Chống lặp |
|---|---|---|---|
| Nhìn thấy nhau một chiều |Entry roster rỗng|Tái hiện2/8 client offline|Room roster đầy đủ+join fanout đúng scope|
| Nhân vật chồng nhau |Mọi self/peer pos1|Chứng minh tọa độ giống nhau|Server cấp chỗ trống0–3, có capacity|
| Vào lại khu mất người khác |Rebuild4050 rỗng, same-room không rebroadcast|Mô phỏng reentry|Idempotent room/resync roster|
| Nguy cơ off-by-one ghế |Server clamp>=1, native chỉ0–3|Probe pos0/4|Dùng validation cùng contract native|
| Thiếu động tác câu/đổi cần/mồi của người khác |Chưa phát4060/4061/4062|Probe handler và receiver|Test packet+native cho peer, không suy từ self|
| Broadcast quá rộng |Không lọc room hoặc login|Ghi nhận, chưa sửa|Room-scoped authenticated recipients|
| Live QA không đúng identity |Thiếu suffix `_s1002` khi insert|Rút phép thử, không dùng kết quả|Đọc login contract, assert identity trước RPC|
| Waiter timeout/hung process |Xóa waiter không khớp, promise không bắt|Chặn harness, dừng exact PID|Một tầng RPC chuẩn, finally đã kiểm; không lặp thử mù|
| Tồn dư QA |Abort trước cleanup, clone name trùng|Backup và xóa18 record exact identity|Inventory trước/sau, marker từng run, không cleanup theo tên chung|
| Shell lỗi quoting/heredoc |Cú pháp Bash/nháy lồng dùng trong PowerShell|Dùng script dưới tools hoặc lệnh đơn giản|Không ghép nhiều tầng shell|
| Config/helper path phỏng đoán |File không tồn tại tại path đoán|Dùng rg --files tìm đúng net/Session.js, db/redis.js|Discovery trước đọc|
| Mongoose warning isNew |Schema existing reserved field|Ghi nhận, không sửa model ngoài phạm vi|Phân biệt warning với assertion|

Không sửa tiếng Việt trong bundle; report mới UTF-8. Các log/report lịch sử giữ nguyên.

## 4. Kỹ năng / kinh nghiệm mới

- Presence hai chiều, danh sách hiện tại và sự kiện gia nhập là ba phần riêng. Broadcast người mới không thay thế roster cho người vào sau.
- Client đa người đã có4 vị trí; cấu hình mẫu/tempData không phải contract. Phải đọc `PosConfig`, parse và CreateRole thực tế để biết0–3.
- Map ID không phải room/line ID. Chia phòng cần lọc người nhận ở server vì nhiều peer receiver chỉ có actor ID, không có roomId để tự lọc.
- Không thể suy “không chồng hình” chỉ từ điểm neo tách nhau: còn kích thước bè, thời trang, tên và hoạt ảnh.
- Audit nên dùng snapshot+fixture đọc-only; live gameplay QA cần phạm vi được chấp thuận và harness có ownership/cleanup đáng tin. Không chuyển lỗi harness thành lỗi game hoặc giảm assertion để lấy PASS.

## 5. Trạng thái hiện tại

-11/11 probe offline hoàn tất,0 harness error trong suite offline,31 save chỉ trong bộ nhớ. Các probe xác nhận lỗi hiện tại, **không có nghĩa chức năng đã sửa**.
- Tái hiện asymmetry,8 người cùng điểm, mất peer khi reentry,4 điểm native hợp lệ và lỗi index4, peer catch/rod/bait sync thiếu, raft sync có.
- Chưa live QA nhiều người đạt; không native visual, không chỉnh layout hay room allocation.
- Cleanup dữ liệu riêng đã hoàn tất, có backup khôi phục18 record QA; không còn process/script live QA hoạt động hoặc DB/Redis residue trong scope kiểm.
- Hậu kiểm12:53:11 UTC+7:154/154 artifact khớp bản auto FX đã deploy, ready8080/8083=200. S1 PID29724/restart1376, S2 PID27996/restart42; dist30824,admin30856,bot1600/1576 giữ PID/restart.
- Phương án4 chỗ/phòng là đề xuất triển khai, chưa tồn tại trong production. Không bù/reset hoặc sửa cá/vật phẩm người thật.

## 6. Bước tiếp theo

1. Nếu user yêu cầu triển khai, ưu tiên room membership/roster hai chiều và phân4 chỗ0–3; giữ chính sách cấp/map/auto/rewards.
2. Test đồng thời4/5/8/20 người, join/leave/reconnect/đổi map, same-map retry, save fail, socket cũ đóng và new session thay thế; phòng đầy không trùng chỗ.
3. Bổ sung peer animations/gear/bait đúng room; kiểm người ngoài phòng không nhận packet.
4. Nghiệm thu hình ảnh4 người với asset lớn; nếu muốn nhiều hơn4 người cùng màn cần chọn riêng thiết kế đông người hoặc chia phòng có chọn phòng.
5. Chỉ dùng live fixture sau khi workflow được review/cho phép; identity phải khớp500 trước vào map và cleanup kể cả login tạo ngoài dự kiến. Hai harness WITHDRAWN không được chạy lại.
