# Session Report — bảng cân bằng câu cá riêng

Ngày 06/09/2026. **Đã thiết lập bảng cân bằng riêng theo yêu cầu của chủ server, mở lại tẩy thuộc tính cần và hộp kho báu trên S1/S2. Đây không phải tỷ lệ gốc bản Trung. Không phát bù hoặc sửa cá/thuộc tính lịch sử của người chơi.**

## 1. Tóm tắt công việc

- Tạo một bảng JSON có phiên bản để quản lý giá trị, trọng số, chi phí và giới hạn. Server chọn kết quả, không tin thuộc tính hoặc quà do client gửi.
- Mở tẩy thuộc tính: trừ đúng10 Thiên Thanh Thạch, sinh3–6 dòng theo cấp câu, lưu bản xem trước; chỉ khi người chơi chọn thay mới đổi thuộc tính đang dùng. Đăng nhập lại vẫn còn bản xem trước.
- Mở5 hộp94821–94825: mỗi hộp rút1 món theo bảng dưới, tối đa100 hộp/lệnh. Đường mở ở giao diện câu cá và trong túi dùng chung giao dịch.
- Thêm requestId và balanceRevision: replay trả kết quả cũ, không trừ/cấp thêm; yêu cầu sai phiên bản không tiêu hao. Lưu64 biên nhận gần nhất và20 lần lịch sử tẩy ở server, không gửi lịch sử đó trong gói đăng nhập.
- Bổ sung tác dụng thật cho các dòng tẩy được mở: Hải thần101 đã dùng trong combat; Sức sống9 tiết kiệm Đùi Gà; Tinh thông104 tiết kiệm mồi;201–210 tăng và301–310 giảm trọng số từng loài trong pool đã mở.
- Giữ nguyên luồng mồi FIFO, đơn có vé, linh hồn dự phòng và full-entity/relog đã sửa trước. Không đổi RNG linh hồn hoặc tự thêm quà di vật/sự kiện.

### Bảng tẩy thuộc tính

Chi phí: **135×10/lần**. Thay bản xem trước vào cần: **miễn phí**. Tẩy lại thay bản xem trước, không thay thuộc tính đang trang bị.

| Phẩm chất dòng — ID | Tỷ lệ mỗi dòng | Hải thần / tiết kiệm Đùi Gà / tiết kiệm mồi | Tăng–giảm trọng số loài |
|---|---:|---:|---:|
|2|45%|0,50–1,00%|2,50–5,00%|
|3|30%|1,01–1,80%|5,01–9,00%|
|4|16%|1,81–2,80%|9,01–14,00%|
|6|7%|2,81–4,00%|14,01–20,00%|
|7|2%|4,01–6,00%|20,01–30,00%|

Giá trị nguyên bps,100bps=1%; chọn đều trong khoảng min/max bao gồm hai đầu. “Trọng số loài” là thay đổi tương đối khi random, không phải cộng trực tiếp từng đó điểm phần trăm vào xác suất cuối.

| Cấp câu cá | Số dòng / xác suất |
|---|---|
|1–25|3 dòng,100%|
|26|3 hoặc4 dòng, mỗi loại50%|
|27|3/4/5 dòng, mỗi loại1/3|
|28|3/4/5/6 dòng, mỗi loại25%|
|29|4/5/6 dòng, mỗi loại1/3|
|30–40|5 hoặc6 dòng, mỗi loại50%|

Số dòng lấy từ FishLevelConfig.washCount hiện hành. Chọn loại thuộc tính có trọng số, không lặp loại và không đồng thời ra tăng/giảm cho cùng một loài:

| Nhóm | ID | Trọng số mỗi loại |
|---|---|---:|
|Hải thần: tăng thuộc tính cá|101|12|
|Sức sống: miễn tiêu hao Đùi Gà|9|9|
|Tinh thông: miễn tiêu hao mồi phụ|104|9|
|Thợ săn: tăng trọng số tôm, cá, cua, rùa, sao biển, sứa, bạch tuộc, trai, cá heo, cá mập|201–210|3 cho từng ID|
|Khắc tinh: giảm trọng số theo cùng thứ tự loài|301–310|3 cho từng ID|

Tổng trọng số lượt chọn đầu90; sau mỗi dòng loại bỏ ứng viên đã chọn và loại đối nghịch. Tỷ lệ loại ở các dòng sau là xác suất có điều kiện, không cố định như dòng đầu. Phẩm chất từng dòng được chọn độc lập theo45/30/16/7/2.

- Chỉ23 loại trên được đưa vào danh sách tẩy/auto-filter. Các dòng105–109,211–213 chưa hoàn thiện hiệu ứng nên không sinh dòng vô tác dụng.
- Giới hạn hiệu lực tiết kiệm Đùi Gà20%, tiết kiệm mồi25%. Phải đủ năng lượng cho cả lượt trước khi thử miễn phí, không câu với0 Đùi Gà rồi trông chờ xác suất.
- Trọng số loài được chặn trong khoảng1000–20000, nền10000; cá thuộc khu chưa mở vẫn không được đưa vào pool.
- Không tự áp lại bảng lên thuộc tính người chơi đang có; chỉ các lần tẩy mới dùng bảng này.

### Bảng mở hộp

| Phần thưởng mỗi lần rút | Số lượng | Xác suất |
|---|---:|---:|
|Mảnh Thiên Công tương ứng hộp|1|2%|
|Nguyên bảo — ID1|50|23%|
|Bánh bao — ID4|30|25%|
|Tăng tốc — ID6|5|20%|
|Bạc — ID2|10.000|30%|

Tổng100%. Mỗi hộp1 lần rút độc lập; **không có pity/bảo hiểm**, không cấp toàn bộ5 món.100 hộp không bảo đảm có mảnh.

| Hộp | Mảnh tương ứng |
|---|---|
|94821|190001|
|94822|190002|
|94823|190003|
|94824|190004|
|94825|190005|

Quà và số lượng bám danh sách hiển thị FishSoulPrivilegeConfig.privRewardShow; trọng số là bảng tự thiết lập theo ủy quyền, không suy ra từ danh sách đó. Hộp3–5 có thể chọn khi thực sự sở hữu, không tự cấp hộp. Giao diện hộp hiện tỷ lệ thành3 dòng giới hạn kích thước.

Mảnh190001–190005 là **vật liệu trong túi**, không phải bộ thời trang để tự kích hoạt. Đã kiểm cấp/lưu/sync đúng và chặn đường dùng item chung nuốt mất mảnh. Chưa nghiệm thu chức năng kích hoạt Thiên Công Huyễn Cảnh/bonus10% của Tranh Trung Các; việc mở hộp không tự mở chức năng đó.

## 2. File/thư mục đã thay đổi

### Source chính đã đồng bộ local/production

| File | Nội dung |
|---|---|
|`linhhoasu/lhs/newServer/src/config/fishingBalance.json`|Bảng cân bằng mới, phiên bản lhs-fishing-custom-20260906-v1|
|`linhhoasu/lhs/newServer/src/services/FishingBalanceService.js`|Validate bảng, random trọng số, hiệu ứng tẩy, giao dịch/biên nhận và lịch sử|
|`linhhoasu/lhs/newServer/src/handlers/fish.js`|Tẩy/thay, tiêu hao có tiết kiệm và trọng số loài|
|`linhhoasu/lhs/newServer/src/handlers/fish-soul.js`|Mở hộp có trừ vật phẩm, cấp quà và chống replay|
|`linhhoasu/lhs/newServer/src/handlers/item.js`|Mở hộp trong túi dùng cùng ledger; không tiêu hủy mảnh vật liệu qua generic use|
|`linhhoasu/lhs/newServer/src/handlers/playerPayload.js`|Ẩn lịch sử/biên nhận nội bộ khỏi login|
|`linhhoasu/webgame/game/js/main.min_a6195824.js`|requestId/revision, kết quả tẩy authoritative, danh sách auto, hộp có tỷ lệ và lỗi đúng|
|`linhhoasu/webgame/game/index.html`|Cache key20260906_fishing_custom_balance_v1_layout|

Không sửa bin config gốc, dữ liệu nhân vật thật, DB schema, WebGM, WSServer, PlayerService hoặc bot worker. Source dùng snapshot production149 artifact mới tại `temp/fishing_audit_20260906T000508Z/`.

### Hỗ trợ và backup

- Tools mới trong `_ai_workbench/tools/`: build_fishing_balance_client_20260906.js, extend_fishing_balance_tests_20260906.js, test_fishing_balance_20260906.js, release_fishing_balance_20260906.py, qa_fishing_balance_live_20260906.js, run_fishing_balance_live_20260906.py, sync_fishing_balance_local_20260906.py, publish_fishing_balance_layout_20260906.py, final_fishing_balance_20260906.py.
- Candidate/evidence: `_ai_workbench/temp/fishing_balance_20260906/`: tests.json, stage.json, deploy.json, live-qa.json, final-staging-tests.json, final-check.json, client-build.json, local-sync.json.
- Backup source production: `/linhhoasu/_ai_workbench/backups/fishing_balance_20260906_001504/`.
- Backup client layout: `/linhhoasu/_ai_workbench/backups/fishing_balance_layout_20260906_001925/`; không restart cho lượt layout.
- Backup local: `backups/fishing_balance_local_20260906/`, `backups/fishing_balance_layout_local_20260906/`; backup report: `backups/fishing_balance_reports_20260906/`.
- Gói source-only `temp/fishing_balance_20260906/fishing_custom_balance_v1_20260906.zip`,9 entry, yêu cầu bản fishing_bait_order_soul_v2. Hash chính xác trong final-check.json. Không chứa credential, runtime người chơi hoặc DB snapshot.
- Báo cáo này và session_report.md đều có bản HTML đầy đủ. Không tạo tool/file tạm ở root.

## 3. Lỗi đã gặp & giải pháp

| Lỗi | Nguyên nhân | Xử lý | Tránh lặp |
|---|---|---|---|
|Tẩy/hộp bị khóa|Thiếu bảng server-only|Tạo bảng riêng có phiên bản và tỷ lệ công khai theo yêu cầu|Không gắn nhãn tỷ lệ chính thức|
|Thuộc tính sinh ra nhưng không tác dụng|Handler chưa dùng các hiệu ứng|Chỉ mở23 loại có code thực thi; giới hạn loại auto-filter|Test tác dụng tiêu hao/trọng số/combat|
|Retry trừ/cấp lặp|Thiếu định danh giao dịch bền vững|requestId + revision +64 receipt, lookup trước consume|Test replay cùng key, stale, xung đột key và sau relog|
|Mutate dở rồi save lỗi|Trừ/cấp trực tiếp trên player|Lập kế hoạch/grant trên clone, await save; null/throw vô hiệu session|Test durable unchanged và không save rollback giả|
|Mảnh bị nuốt qua dùng item chung|Vật liệu không có AssetsUseConfig|Chặn generic use190001–190005, giữ trong túi|Test vật liệu sau cấp và use reject|
|Thông báo cụ thể vẫn thành câu chung/tạm khóa|Sai ưu tiên toán tử OR và điều kiện ba ngôi ở patchv2|Thay lookup lỗi có fallback rõ ràng|VM native kiểm đúng chuỗi hiển thị|
|Mô tả tỷ lệ có nguy cơ tràn màn|Skin label không có width|Chia3 dòng, width540/height66/font18, căn giữa|VM updateUI + kiểm skin và owned box gating|
|Final WS ready có lần timeout|Trạng thái tải/kết nối dao động đã thấy ở phiên trước|Không restart thêm; đọc lại và đạt HTTP/WSready, giữ log giới hạn|Không coi HTTP readiness là bằng chứng gameplay|
|Patch item nhầm anchor ban đầu|`const count = parsedCount.count` xuất hiện nhiều chỗ|Phát hiện bằng diff, chuyển vào đúng handleUseItem trước deploy|Anchor theo tên hàm + unit đường genericuse|

## 4. Kỹ năng / kinh nghiệm mới

- Vật phẩm52 là mảnh kiến trúc, không phải ngoại quan. Phát vào túi đúng không đồng nghĩa bonus kiến trúc đã được kích hoạt.
- Trạng thái bản tẩy chờ thay cần lưu; không dùng client copy làm nguồn sự thật khi nhận replay sau khi đã thay.
- Khi lịch sử receipt quá64, expectedRevision cũ vẫn phải ngăn giao dịch lịch sử chạy lại. Không dựa duy nhất vào bộ nhớ response cache của WebSocket.
- JSON mới là cấu hình gameplay thực sự, phải validate trọng số, giới hạn, item và khớp chi phí client trước tiêu hao. Sửa JSON đòi hỏi test/restart có phạm vi, không hot-edit tùy ý trên production.
- `ID6` được hệ thống hiện tại lưu ở currencies.gold, không phải items6. Sync/replay phải lấy đúng nguồn số dư này.

## 5. Trạng thái hiện tại

-70 tests PASS trên Windows và staging Node20. Bao gồm duyệt đủ50.000 điểm trọng số hộp (5×10.000),10.000 điểm trọng số phẩm chất,2.000 lượt tẩy seeded qua40 cấp,25 nhánh quà, trường hợp thiếu/vượt số lượng, replay, lỗi save và native callback/layout.
- Core gameplay contract PASS local/staging với714 bảng; syntax các source/JS và JSON parse PASS. Staging độc lập, không mở socket từ bộ test in-memory.
- Live WS QA PASS S1/S2: hồi quy mồi/đơn/linh hồn/full entity, tẩy tốn10 đá, giữ preview qua relog, thay/relog, mở100 hộp mỗi loại (500/server), replay sau relog, generic1300 dùng chung4063.
- Các nhân vật QA đã xóa đúng UID/playerId, còn0. Không dùng vật phẩm hoặc tiền người chơi, không gửi bù. Không sửa cá đang có hoặc tẩy sẵn của người chơi.
-152 artifact tracked hash đúng:8 file release và144 artifact ngoài release không đổi. Source local khớp candidate; served main/index đúng hash. Ready8080/8083 và WS9200/9201 đạt200/ok ở hậu kiểm cuối.
- Chỉ restart S1/S2 một lần cho backend. PID S1=15246/restart1371, S2=15191/restart35. Dist/admin/2 bot worker giữ PID/restart count. Lượt chỉnh layout client không restart.
- Error tail không TypeError/ReferenceError/Unhandled/FATAL/SyntaxError. Một lần final WSready timeout rồi kiểm lại đạt; không tuyên bố đã giải quyết tải/reconnect ngoài phạm vi.
- Chưa nghiệm thu hình ảnh UI bằng phiên người chơi thật hoặc thêm một lần restart sau khi tạo dữ liệu QA. Đã chạy actual native functions trong VM và WS/DB/relog thật.

**Hai chức năng tẩy và mở hộp đã mở lại với bảng riêng. Không có tuyên bố toàn bộ hiệu ứng câu cá, RNG linh hồn, di vật/sự kiện hoặc Thiên Công Huyễn Cảnh đã hoàn thiện.**

## 6. Bước tiếp theo

1. Người dùng tải lại trang game/đăng nhập lại để nhận client có requestId/revision và bảng tỷ lệ. Client cũ bị từ chối hai thao tác mới, không trừ vật phẩm.
2. File chỉnh cân bằng chính là `src/config/fishingBalance.json`: qualityRolls, attributes, boxes.pools. Khi đổi tỷ lệ hộp phải chạy lại builderclient để văn bản tỷ lệ được cập nhật theo JSON rồi test và deploy cùng lượt.
3. Chi phí135×10 đang kiểm khớp FishBaseConfig. Muốn đổi giá phải cập nhật contract chi phí client/server có chủ đích, không chỉ sửa một phía. Số dòng theo bảng FishLevelConfig hiện hành.
4. Thay đổi tiếp theo nên dựa trên số liệu nhận thưởng/tẩy thực tế. Không tự đặt lịch giám sát hoặc đổi tỷ lệ đang chạy nếu user chưa yêu cầu.
5. Nếu tiếp tục Thiên Công Huyễn Cảnh: kiểm/hoàn thiện activation của mảnh190001–190005 riêng, không tiêu hủy mảnh thử trên tài khoản người chơi.
6. Rollback source phải bảo toàn balanceRevision, receipts, lịch sử tẩy và reserve trong DB; không restore player snapshot cũ. Không chạy compensation/reroll lịch sử.
