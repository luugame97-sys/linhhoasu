# Session Report — câu hụt, đổi ngư trường và phiếu làm mới

Ngày 06/09/2026. Snapshot11:23:31 và hậu kiểm trạng thái11:26:57 UTC+7. **Phiên này chỉ kiểm tra, không sửa source/DB/client, không câu, bán cá, đổi map hay dùng phiếu trên tài khoản người chơi.**

## 1. Tóm tắt công việc

### 1.1 Câu không thấy cá: cần phân biệt câu hụt với tự bán

**Bản gốc có cơ chế/trạng thái câu hụt và cá thoát**, nhưng **server hiện tại chưa sinh kết quả hụt trong hai handler câu cá đang kiểm**:

- Client Trung tham chiếu có FishEscapeState: Scuess0, konggan1, Taotuo2 và nhánh hoạt ảnh tương ứng.
- Mô tả gốc của cần nói tập trung tăng độ chính xác, cường độ giúp cá cắn câu/không giãy thoát; help Hoang Cổ30033154 nêu rõ câu trống vẫn tiêu hao Đùi Gà. Không suy từ đó rằng mọi lần người dùng thấy trống hiện nay là tính năng hụt đã hoạt động đúng.
- Handler câu thường4000 hiện luôn đẩy một entity vào fishInfos cho mỗi lượt được chấp nhận; escapes luôn rỗng.60 batch thử với count1/3/10 tạo đủ280 cá, không batch thành công nào rỗng.
- Handler linh hồn4060 hiện cũng tạo đủ số entity và escapes rỗng. RNG/empty catch bản gốc chưa được triển khai đầy đủ; không tự đặt tỷ lệ hụt trong phiên audit.
- Trường hợp bị từ chối vì pending hoặc không đủ Đùi Gà không trừ thêm mồi trong probe.

**Dữ liệu thực tế gần đây của nicky phù hợp với tự bán, không phải mất cá sau câu:**

| Dữ liệu trong20 lần xử lý auto gần nhất | Kết quả |
|---|---:|
|Tổng entity đã bán|60|
|Lần không có cá nào được trang bị, toàn bộ bán đi|19|
|Lần có thay một cá mạnh hơn|1|
|Khoảng thời gian lịch sử|11:17:13–11:19:22 UTC+7|
|Cá đang chờ tại snapshot|3|

Các60 entity bán gồm cả cá cũ bị thay ra ở một lượt, không phải60 cá mới độc lập. Theo giá bán handler hiện hành, tổng giá trị những entity trong lịch sử là300 Ngư Tệ; không coi đây là số tăng đo trực tiếp trước/sau số dư vì người chơi có hoạt động khác.

Probe tương ứng: câu3 →nhận3 →auto xác định cả3 yếu hơn →bán3, không thêm vào giỏ; mồi và Đùi Gà vẫn được dùng đúng lượt, Ngư Tệ tăng theo giá bán. Vì vậy chỉ nhìn giỏ không thêm cá không đồng nghĩa câu trượt hoặc mất phần thưởng.

Chưa có timestamp/packet trước-sau cho chính lượt người dùng thấy hụt. Nếu tắt tự bán mà vẫn bị trừ mồi, không có cá chờ và không có quà/Ngư Tệ, cần mốc giờ cụ thể để truy tiếp; chưa loại trừ lỗi UI/lifecycle ở trường hợp đó.

### 1.2 Đổi map phải tải lại: lỗi đã xác nhận

Trong handleFishChangeScene/tag4002, server chỉ:

1. Kiểm điều kiện khu.
2. Gán fishInfo.scene mới và lưu.
3. Trả ACK4002.

Nhưng không chuyển session._fishRoomMapId và không gửi packet4050 chứa dữ liệu vào map. Native sendChangeScene chỉ cập nhật ID lựa chọn; màn cảnh thật chỉ được tạo lại trong sc_fish_map_enter khi nhận4050.

| Probe đổi khu1→2 | Sau ACK4002 |
|---|---|
|ID ngư trường đã lưu|2|
|ID room của session|Vẫn1|
|Client fishInfo.scene|2|
|Packet vào map4050|Không có|
|EnterFishMapRaid được gọi|Không|
|changeSceneCallBack được gọi|Không|

Khi cấp packet4050 đúng qua handler vào map trên fixture, hàm native tạo map2 và callback chạy. Đây là nguyên nhân ảnh có thể ghi “Vị trí hiện tại” ở **Kim Sa Lệ Thủy — map2**, trong khi cảnh phía sau chưa đổi. Reload làm luồng vào map chạy lại nên người dùng mới thấy map đã chọn.

**Chưa sửa trong phiên này.** Hướng sửa cần đồng bộ server room, gói vào map và lifecycle native, không chỉ ép thay ảnh nền.

### 1.3 Có6 phiếu nhưng chưa thấy dùng: đúng điều kiện ẩn nút

- Item70 là **Phiếu làm mới đơn**.
- Từ màn câu cá, mở **Giỏ cá của tôi →bấm một biểu tượng đơn trong hàng “Đơn hàng hôm nay” hoặc nút chi tiết đơn**. Cả hai mở FishOrderPanel có tiêu đề **“Đơn hàng mỗi ngày”**.
- Trên đơn **chưa nhận thưởng**, bấm **Làm mới đơn hàng** và xác nhận: mỗi lần tốn1 phiếu. Màn chọn ngư trường trong ảnh không phải nơi dùng phiếu.
- Đơn đã nhận thưởng không được làm mới để nhận quà thêm; native ẩn refreshButton và server cũng từ chối.
- Snapshot hiện tại: vé70=6, cả3 đơn đều received=true. Vì vậy nút làm mới ẩn ở cả3 đơn; chờ lượt đơn ngày mới/chưa nhận thưởng mới dùng được. Không khuyên reset nhận thưởng hoặc mở lại đơn đã nhận.
- Probe đơn chưa nhận với6 phiếu: refresh hiện nút, trừ6→5, đổi ID đơn và tiến độ về0. Probe3 đơn đã nhận: tất cả nút ẩn, server từ chối, phiếu vẫn6.
- Tùy chọn tự trang bị/bán cá mới ưu tiên hơn tự nộp đơn. Nếu muốn nộp cá làm nhiệm vụ ngày, cần tắt tùy chọn đó và dùng luồng nộp đơn/ủy thác đơn hiện có.

## 2. File/thư mục đã thay đổi

Chỉ artifact phân tích:

- _ai_workbench/tools/audit_fishing_miss_map_orders_20260906.js:9 probe trên source snapshot/nativefunctions, save giả và socket bị chặn.
- _ai_workbench/tools/read_fishing_map_order_state_20260906.py:đọc item70, đơn, lịch sử auto và log giới hạn; kiểm hash.
- Dùng lại snapshot_fishing_audit_20260906.py.
- Evidence: _ai_workbench/temp/fishing_audit_20260906T042330Z/:manifest.json,runtime.json,miss-map-orders-audit.json,map-order-state.json.
- Báo cáo này và session_report.md, cả hai có HTML đầy đủ.
- Backup report: _ai_workbench/backups/fishing_miss_map_order_reports_20260906/.

Không đổi source, config, tốc độ, DB, vật phẩm, ngày nhận, auto settings hoặc cá. Không deploy/restart/gameplayRPC/compensation. File runtime/log chỉ dành cho quản trị nội bộ.

## 3. Lỗi đã gặp & giải pháp

| Vấn đề | Nguyên nhân/bằng chứng | Xử lý trong phiên | Chống lặp |
|---|---|---|---|
|Không thấy cá mới nhưng trừ mồi|19/20 lượt auto gần nhất bán hết, server có sinh cá|Giải thích và kiểm lịch sử, không gán mọi lần trống là hụt|So fishInfos,auto sale history,Ngư Tệ thay vì chỉ giỏ|
|Luật hụt gốc chưa đầy đủ ở server|Client có0/1/2; handler hiện escapes=[]|Ghi rõ khác biệt, không chế tỷ lệ hụt|Phân biệt “gốc có” với “runtime đã làm”|
|Đổi map chỉ đổi ID, không dựng cảnh|4002 thiếu4050 và roomID không đổi|Tái hiện bằng handler + nativecallback|Fix đồng bộ room/entry/lifecycle, không chỉ nền|
|Không thấy nút dùng phiếu|Cả3 đơn đã nhận, native cố ý ẩn|Chỉ vị trí dùng và điều kiện, test6→5 trênclone|Không mở lại reward đã nhận|
|Thiếu log chính lượt hụt|Tail giới hạn không còn request của tài khoản|Không suy đoán giao dịch cụ thể|Cần giờ xảy ra + số dư/pending trước-sau|

## 4. Kỹ năng / kinh nghiệm mới

- Giá trị lựa chọn fishInfo.scene và map đang render là hai trạng thái khác nhau. ACK đổi ID chưa phải sự kiện vào map.
- Callback đổi cảnh chỉ chạy khi native nhận entry4050; kiểm riêng nó thay vì nhìn nhãn “Vị trí hiện tại”.
- Cùng một batch có thể nhận cá rồi bán ngay trong auto: không giữ cá mới là hành vi hợp lệ nếu cá yếu hơn.
- Phiếu tồn không bảo đảm có thao tác hợp lệ: quyền làm mới phụ thuộc đơn chưa nhận thưởng.
- Nguồn native tham chiếu là bằng chứng có thiết kế hụt/cá thoát, không đủ suy ra tỷ lệ RNG server gốc.

## 5. Trạng thái hiện tại

-9 probe hoàn thành,0 lỗi harness; gồm60 batch/280 cá thường,3 linh hồn, no-consume rejection, auto sale, map4002/4050 vàrefresh conditions.
- “PASS” trong probe nghĩa là tái hiện đúng điều kiện cần kiểm; không gọi đổi map hoặc toàn bộ câu cá đã PASS.
- Snapshot11:26:57: nicky cấp117/câu8,scene2,phiếu6,3 pending,3 đơn received=true. Dữ liệu có thể tiếp tục đổi theo thao tác người chơi sau snapshot.
-153artifact trong snapshot được hậu kiểm không đổi. HTTPready8080/8083=200. Không ghi player, không restart, không fix source trong phiên.
-Không nativevisual/tài khoản thật/WSgameplaytest. Đã chạy hàm native thật trongVM và snapshot server; chưa đủ kết luận từng lần hụt cụ thể.
-Mô tả Hoang Cổ nói hụt vẫn tiêu Đùi Gà, không dùng nó để tự thêm tỷ lệ hụt hoặc thay đổi mồi hiện hành.

**Kết luận:** đổi ngư trường cần reload là lỗi; phiếu làm mới đang bị ẩn đúng do các đơn đã nhận; nhiều lượt không thấy cá trong dữ liệu gần đây là tự bán cá yếu, không phải server sinh câu hụt.

## 6. Bước tiếp theo

1. Khi user yêu cầu sửa map: backup/refresh baseline, sửa4002 để luồng room-entry đồng nhất4050, test map1↔2↔3, đang có pending, đang auto, callback, relog và không đổi số cá/tài nguyên.
2. Muốn thấy cá nhận trước khi quyết định thì tắt “Tự trang bị cá mạnh, bán cá yếu”. Nếu tắt mà vẫn mất mồi và không có bất kỳ cá/quà/coin, ghi giờ cụ thể để truy.
3. Dùng phiếu ở Đơn hàng mỗi ngày, trước khi nhận thưởng đơn; ngày hiện tại đã nhận cả3 thì không có nút làm mới.
4. Không reset đơn, không phát bù, không tự thêm RNG hụt. Muốn phục hồi đầy đủ luật gốc cần nguồn xác suất/contract riêng.
