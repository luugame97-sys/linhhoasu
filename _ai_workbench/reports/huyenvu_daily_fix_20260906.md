# Session Report — sửa quà Huyền Vũ và xác minh tăng tốc gốc

Ngày 06/09/2026, hậu kiểm **11:20:39 UTC+7**. **Đã triển khai sửa nhận quà ngày trên S2 rồi S1; kiểm qua WebSocket/DB/relog đều đạt. Tăng tốc câu cá được xác nhận có trong client gốc/tham chiếu và giữ nguyên1,11×, không tự chế tốc độ mới. Không bù hoặc nhận lại quà lịch sử của người chơi.**

## 1. Tóm tắt công việc

### Quà Huyền Vũ đã sửa

- Thẻ11000009 tiếp tục cấp đúng ShopConfig.extraRewards: **50 Đùi Gà — ID65 và2 phiếu làm mới đơn — ID70**. Không đổi giá thẻ, thời hạn hoặc số lượng quà.
- Gửi packet1202 gồm số tăng và số dư tuyệt đối **trước** phản hồi thành công1211. Số lượng client có thể cập nhật ngay, không chỉ mở cửa sổ quà.
- Tính quà và thời điểm nhận trên bản sao player; lưu cùng một snapshot. Chỉ trả success sau save có kết quả xác nhận.
- Nếu save trảnull hoặc throw: không báo nhận thành công, không ghi rollback giả; session bị vô hiệu để đăng nhập lại đọc trạng thái durable. Trường hợp write đã commit nhưng phản hồi lỗi vẫn không phát lại khi retry.
- Giữ kiểm quyền sở hữu/thời hạn, ID thẻ và ngày nhận. Giữ lịch nhận **GMT+8** như luồng đang có, không tự đổi sang timezone máyVPS+7.
- Bấm lại trong cùng ngày: **không cấp thêm**, chỉ gửi số dư hiện tại và thời điểm nhận đã lưu. Điều này phục hồi số hiển thị sau mất ACK/packet, không phải compensation.
- Client chỉ đánh dấu nhận khi success hoặc server xác nhận đã nhận trong ngày. Các lỗi hết hạn/ID/config/save không còn tự đánh dấu đã nhận theo đồng hồ client.
- Xóa cache item list khi nhận/resync để lần mở túi không lấy số cũ.
- Handler1211 dùng chung5 thẻ tháng/đặc quyền; đã kiểm quà của11000001/11000002/11000007/11000012 không bị đổi. Các hàm quảng cáo và gói chuỗi không bị sửa trên production.

### Tăng tốc có thật trong gốc — không sửa cơ chế

Đã đọc cả file trong gói ban đầu và client Trung tham chiếu lưu sẵn:

| Nguồn | Bằng chứng |
|---|---|
|server.zip → linhhoasu/webgame/game/js/main.min_a6195824.js|Có fishing_isFastMode, isFishSpeedAdd, chia timer cho1.11 và phát hoạt ảnh1.11×|
|_ai_workbench/temp/cn_origin_70000001_20260831/js/main.min_97d2b812.js|Có cùng cờ và hệ số1.11; tên biến minify khác|
|Production baseline hiện tại|Cơ chế tăng tốc cùng hệ số vẫn còn|

- Main trong archive SHA256: d0463feecb7a55070a38772950a048d026d560be5c3fe918f61ff78d1d73e021.
- Main Trung tham chiếu SHA256: c127a9cc99e6f012a03c745bc1a495b8c45ef1f08067f434873dbcf8c580ca47.
- Evidence offset/đoạn code/hash ở speed-origin-proof.json.
- **Đây là cơ chế có sẵn, không phải tính năng tốc độ do phiên này thêm.**1,11× giảm khoảng9,9% thời gian hoạt ảnh, không phải2×.
- Chỉ đổi hàm C.sendGetMonthcardsReward ở client. Hàm tăng tốc, timer, auto trang bị, danh sách cá, skin/config đều giữ nguyên từng byte ngoài hàm nhận quà.
- Không thay hệ số, không thêm2×, không giả lập animation/timer mới. Guard metadata của auto mới đã làm ở phiên trước cũng không đổi.
- Chứng minh bằng source không đồng nghĩa đã đo FPS/tốc độ tổng qua UI trên mọi thiết bị; không tuyên bố mọi lỗi lifecycle câu cá đã được giải quyết.

## 2. File/thư mục đã thay đổi

### Source chính

| File | Nội dung |
|---|---|
|linhhoasu/lhs/newServer/src/handlers/commerce-compat.js|Sửa1211: grant và marker trênclone, saveconfirmed,1202, same-day resync và lý do lỗi|
|linhhoasu/webgame/game/js/main.min_a6195824.js|Chỉ sửa native callback nhận quà tháng; thời điểm server và result guard|
|linhhoasu/webgame/game/index.html|Cache key20260906_huyenvu_daily_v1|

Production bắt đầu từ snapshot mới, không upload file local cũ. Local commerce trước đó thiếu các kiểm tra đã có ở production; đã đưa logic nhận quà về cùng bản mới, nhưng **giữ riêng lời gọi persistPlayer cũ của local** vì nó phục vụ quảng cáo/gói chuỗi ngoài scope. Hậu kiểm so normalized source có đúng một khác biệt đã ghi nhận này.

Không đổi FishConfig/ShopConfig, bảng cân bằng, tốc độ, WebGM, DB schema, WSServer, PlayerService hoặc bot worker.

### Công cụ, evidence và backup

- Tools mới: build_huyenvu_daily_client_20260906.js, verify_fishing_speed_origin_20260906.py, test_huyenvu_daily_20260906.js, qa_huyenvu_daily_live_20260906.js, release_huyenvu_daily_20260906.py, sync_huyenvu_daily_local_20260906.py, final_huyenvu_daily_20260906.py; đều dưới _ai_workbench/tools/.
- Điều chỉnh tool test_fishing_auto_20260906.js để nhận đường baseline gốc qua AUTO_ORIGINAL_MAIN và bỏ riêng2 probe chẩn đoán lỗi commerce cũ khi chạy hồi quy.21 test tính năng auto vẫn chạy đầy đủ.
- Baseline: _ai_workbench/temp/fishing_audit_20260906T041024Z/.
- Candidate/evidence: _ai_workbench/temp/huyenvu_daily_fix_20260906/: daily-tests.json, speed-origin-proof.json, client-build.json, stage.json, canary-progress.json, deploy.json, final-check.json, local-sync.json.
- Remote backup: /linhhoasu/_ai_workbench/backups/huyenvu_daily_20260906_041648/.
- Local backup: _ai_workbench/backups/huyenvu_daily_local_20260906/; report backup: _ai_workbench/backups/huyenvu_daily_reports_20260906/.
- Gói source-only: temp/huyenvu_daily_fix_20260906/huyenvu_daily_fix_v1_20260906.zip,4 entry,2.166.029 bytes; SHA256ccf6f84aff0a75e8773f425a70ea55f5cae5ed0e1680ff71f914943d2e4b467c.
- Gói dựa trên fishing_auto_power_v1, không có credential, dữ liệu người chơi hoặc binary config. Không triển khai đè mù lên bản mới hơn.
- Báo cáo này và session_report.md có đầy đủ bản HTML; không tạo tool/file tạm ở root.

## 3. Lỗi đã gặp & giải pháp

| Lỗi | Nguyên nhân | Đã xử lý | Tránh lặp lại |
|---|---|---|---|
|Bấm nhận nhưng số lượng không tăng trên UI|Thiếu packet1202|Gửi delta và số dư tuyệt đối trướcACK|Kiểm DB+1202+1211, không chỉ popup|
|Save-null vẫn success|Không kiểm kết quả save|Reject/invalidate khi không xác nhận|Null/throw tests|
|Rollback sau timeout có thể làm mất write đã commit|Ghi lại preimage trong memory khi chưa rõ durable|Không giả rollback; relog và guard ngày|Commit-then-throw/retry test|
|Lỗi server mà client đánh dấu nhận|Callback không checkresult|Chỉ cập nhật khi success/confirmedalreadyclaimed, dùng claimTime server|Native callback tests|
|Retry mấtACK có nguy cơ hiểu nhầm là thiếu quà|Chỉ trả lỗi chung, không resync|Resync số dư khi đã nhận; rewardInfo rỗng|Retry trước/sau relog không cấp thêm|
|Regex bằng chứng speed không nhận biến $7|Regex chỉ dùng ký tự word|Cho phép dấu$ trong tên biếnminify|Đối chiếu cả3 nguồn trước kết luận|
|Hồi quy auto so nhầm baseline|Baseline mới đã có byte settingauto|Truyền bản trước auto cho testappend-only|Không sửa source để chiều test|
|Local commerce khácproduction|Cây local cũ|Lấy snapshotproduction, sync hẹp và backup|Hashguard, không chép toàn cây local|

## 4. Kỹ năng / kinh nghiệm mới

- Quà ngày là một giao dịch gồm inventory và marker; cùng save mới đủ, popup không chứng minh số lượng client đã đồng bộ.
- Không reset monthCardRecords của người thật để thử. Khi đã nhận, resync số dư hiện tại là an toàn; cấp lại cả gói là một hành động khác cần bằng chứng và quyền riêng.
- GMT+8 của reset ngày khác UTC+7 của máy/VPS; giữ contract hiện hành tránh nhận hai lần quanh nửa đêm.
- Tìm source gốc bằng archive/tham chiếu và so chính đoạn xử lý tốc độ, không chỉ tìm chữ “tăng tốc” trong giao diện.
- Lỗi native callback được kiểm bằng hàm thật tríchAST, không chỉ mô tả/mô phỏng lại ý tưởng.

## 5. Trạng thái hiện tại

- **24 kiểm thử quà ngày PASS** local/staging:50+2,1202,clone/save, thời hạn/ID/config, nhận lặp, resync, relog, ngày GMT8, không bù ngày cũ, marker tương lai, lỗi lưu trước/sau commit,2 request trong hàng đợi và callback native.
- Hồi quy **21 auto PASS,38 gear/1.800 tổ hợp PASS,70 balance PASS**, core gameplay714 bảng PASS. Test thống kê profile lịch sử không chạy trong staging này, không tính thành39.
- Triển khai thử: **S2 PASS trước S1**. Mỗi QA nhận một lần50 Đùi Gà+2 phiếu; kiểm packet1202, DB, claimTime, nhận lặp/hết hạn/ID sai và relog. Không nhận quà trên người thật.
- QA cleanup0. Không cấp bù, không reset ngày, không tăng thời hạn thẻ hoặc chỉnh vật phẩm/ngày nhận lịch sử của người chơi.
- **154 artifact kiểm hash đúng:3 file release và151 file ngoài scope giữ nguyên**. Main/index phục vụ ở cổng81 khớp; logic nhận quà local đồng nhất, khác biệt save helper đã ghi rõ.
- S1 PID23011/restart1374; S2 PID21270/restart38. Chỉ restart game1 lần/server. Dist30824,admin30856,bot1600/1576 giữ PID/restart count.
- HTTP ready8080/8083=200 và WS ready9200/9201=ok. Error tail không có TypeError/ReferenceError/Unhandled/FATAL/SyntaxError.
- Tăng tốc native có trong3 nguồn, tất cả hàm tốc độ được kiểm byte-identical trước/sau bản sửa này.
- Chưa nghiệm thu hình ảnh UI trên phiên người thật hoặc giữ dữ liệu QA qua thêm một lần restart. Đã kiểm callback thật và WS/DB/relog thật.

**Huyền Vũ đã sửa luồng nhận từ nay về sau. Lượt nhận trong quá khứ không được tự bù hay suy ngược từ số dư hiện tại.**

## 6. Bước tiếp theo

1. Ctrl+F5 và đăng nhập lại để nhận client mới. Khi đủ điều kiện nhận ngày, số Đùi Gà/phiếu phải cập nhật ngay.
2. Nếu đã nhận hôm nay, bấm lại chỉ đồng bộ số đang có và báo đã nhận; không cấp thêm50+2. Không xóa marker để vượt chốt.
3. Giữ nguyên tăng tốc1,11× của gốc. Không thêm2× hoặc sửa RNG/lifecycle khi không có yêu cầu và bằng chứng riêng.
4. Nếu vẫn có lượt nhận không khớp, cần mốc giờ và số dư trước/sau để đối chiếu log/DB; không thử bằng nhận hộ tài khoản thật.
5. Rollback chỉsource bằng preimage/hash; bảo toàn dữ liệu nhận quà/marker mới, không restore player từ snapshot cũ.
