# Kế hoạch hoàn thiện Đặc quyền câu cá x10 — S1

Trạng thái: kế hoạch; chưa triển khai thay đổi trong lượt này.

## 1. Phạm vi và yêu cầu

- Tên: **Đặc quyền câu cá x10**; mã hiện dùng `11000022`.
- Giá: **2.400 Vé nạp (item 1001)** cho **24 giờ kể từ giao dịch được xác nhận**.
- Chỉ bán quyền thực hiện tối đa 10 lượt câu thường trong một lần. Không kèm quà, không cấp cần Huyền Vũ, không cộng thuộc tính hay thưởng ngày.
- Đề xuất giữ quy tắc gia hạn đã nêu: hạn mới = max(hạn hiện tại, giờ server) + 24 giờ. Thời gian vẫn chạy khi offline; mua thêm không thành x20/x30.
- S1 là phạm vi mở bán, sử dụng và restart. S2–S8 giữ hành vi hiện tại; mã dùng chung phải có guard theo server, kể cả sau lần restart khác trong tương lai.
- Tự câu vẫn theo điều kiện hiện có. Gói chỉ tăng số lượt, không mở quyền tự câu/auto bán trước cấp hoặc mở thêm ngư trường. Không mở rộng sang câu linh hồn/Hoang Cổ trong đợt này.
- X10 là 10 lượt mỗi lần; so với x3 là tăng khoảng 3,33 lần số lượt mỗi chu kỳ. Không quảng cáo nhanh gấp 10 so với x3.

## 2. Hiện trạng và lỗi có bằng chứng

1. Màn đen: index local cũ được đưa lên trong đợt x10 và rollback, tham chiếu `lhs-homeland-guard-v1.js` và `lhs-toparena-v3.js` chưa có trên VPS; loader tuần tự dừng ở 404. Không có bằng chứng đủ để kết luận hook `FishingCard` là nguyên nhân màn đen.
2. Đã phục hồi exact live index trước x10: hash `fd9611f0…`; kiểm 51 URL JS và màn đăng nhập thực tế PASS trong lượt phục hồi. Đây chưa phải kiểm chứng vào nhân vật.
3. Read-only VPS trong lượt lập kế hoạch: S1 `/ready=200`; index không tải addon x10, addon là no-op. `fish.js` vẫn cho count 1–10, không tham chiếu `FishingX10Service` để kiểm quyền. Quyền mua hiện chưa được bảo vệ tại nơi sử dụng.
4. `test_fishing_x10_s1_20261011.js` mock cả load/save. PASS 6 ca không chứng minh CAS Mongo, mất ACK, cập nhật client hay câu thực tế.
5. Chưa có nghiệm thu UI. Client cũ đoán global class, giới hạn thời gian đợi 20 giây, hook `ViewManager.open` chưa chứng minh bắt được panel con của Quà Siêu Hời. Có lỗi tiềm ẩn: `receivedAt` mất sau sync mua, bộ nhớ pending không phân owner khi localStorage lỗi, callback muộn/đổi server, popup chồng nội dung ở màn nhỏ.

## 3. Trình tự thực hiện và điều kiện qua bước

### A. Chốt baseline đang chạy

- Lấy hash + snapshot chọn lọc của index, bundle thực được index tham chiếu, addon, compat, fish, FishingX10Service, PlayerService, receipt service và cấu hình câu liên quan.
- Đọc cấu hình PM2 chỉ các trường cần thiết; xác định source dùng chung, SERVER_ID và cổng S1. Không dùng cây local làm baseline production.
- Kiểm tra read-only có lượt mua/receipt/hạn `11000022` đã tồn tại hay chưa; không sửa số dư hay đoán bồi thường.
- Đối chiếu index thực: thay đổi candidate chỉ thêm một file addon mới đã tồn tại, giữ mọi marker/fix hiện hành.
- Gate: tất cả nguồn và đường dẫn rõ ràng; hash drift thì dừng xuất bản để đối chiếu lại.

### B. Hoàn thiện server mua và sử dụng quyền

- Tái dùng handler mua riêng; xác nhận khóa role, draft không sửa session trước commit, trừ item1001 + lưu hạn + receipt trong cùng ghi nguyên tử có CAS.
- Kiểm replay cùng request, request ID sai/payload đổi, hai request đồng thời, CAS miss, lỗi trước ghi và timeout sau ghi. Trả thành công chỉ sau xác nhận hoặc read-back receipt; không tự rollback toàn bộ player.
- Rà scope CAS hiện dùng `activity52CAS`: chỉ guard/ghi field thực sự cần, không ghi đè thay đổi khác. Kiểm bằng persistence thật ở DB thử nghiệm cô lập.
- Tại catch S1: count >3 yêu cầu quyền x10 còn hạn, kiểm trước trừ mồi/năng lượng. Replay giao dịch đã chốt vẫn trả kết quả cũ dù vé vừa hết hạn; thao tác mới hết hạn bị từ chối hoặc client hạ về x1/x3.
- Xác minh dữ liệu quyền hydrate sau relog; giờ server quyết định hạn. Giữ x1/x3 hiện có của S1 và hành vi S2–S8.
- 10 lượt phải roll độc lập, trừ đủ theo từng lượt và hiệu ứng miễn tiêu hiện có; tiến độ task/event/EXP đúng count, UID không trùng. Thiếu tài nguyên xử lý thống nhất, không trừ một phần rồi báo thất bại.
- Kiểm 10 lượt có thể sinh trên 10 cá do hiệu ứng nhân đôi/cá sự kiện: pending, auto equip/sell, giới hạn payload và kết quả không bị cắt mất. Không đổi tỷ lệ rơi.
- Gate: mua đúng tiền không đủ; cần catch thực sự từ chối khi chưa mua/hết hạn và nhận đúng khi còn hạn.

### C. Giao diện trong game

- Dùng EUI/style sẵn có, tái sử dụng asset; vị trí đề xuất là mục riêng **Đặc quyền câu cá x10** trong Quà Siêu Hời, cạnh mục Huyền Vũ. Kiểm tra registry/tab native trước khi quyết định hook; không đoán class global.
- Tên, 2.400 Vé nạp, 24 giờ liên tục, quyền 10 lượt, tiêu hao theo số lượt, thời gian còn lại, nút Mua/Gia hạn và trạng thái chờ phải rõ ràng. Không dùng banner quảng cáo/quà của Huyền Vũ cho gói mới.
- Candidate chỉ gắn sau khi model/config/panel đã sẵn sàng. Hook đúng lifecycle panel con, mở lại/tab khác/đổi server không nhân nút hay timer. Không patch toàn bộ ViewManager chỉ để thêm một mục nếu có điểm mở rộng hẹp hơn.
- Định danh pending theo role + server; timeout giữ request cũ, không tự tạo lần mua mới. Callback sai owner bị bỏ; số vé và hạn lấy từ ACK/server, không tự cộng/trừ lạc quan.
- Đồng hồ dùng thời gian server và mốc nhận mỗi response; đồng bộ x10 sau mua và relog, tự về x1/x3 khi hết hạn. Khi đang còn cá pending thì xử lý xong kết quả đã chốt trước lượt mới.
- Addon v2 có URL/version riêng. File rollback v1 giữ no-op; không bật lại đoạn đã comment.
- Gate: lỗi addon không được chặn bootstrap game; test cố tình làm lớp/model vắng, khởi tạo chậm và đổi tab. Kiểm màn nhỏ và desktop bằng browser thực.

### D. Kiểm thử trước deploy

| Nhóm | Kết quả bắt buộc |
|---|---|
| Số dư | 2.399 bị từ chối; 2.400 trừ về 0; đúng item1001; không quà/phần thưởng khác |
| Hạn | Chính xác +86.400.000ms; gia hạn; mua sau hết hạn; tại ranh giới hết hạn |
| Giao dịch | Retry/reconnect cùng ID trừ một lần; xung đột/lỗi DB không báo thành công giả |
| Quyền sử dụng | Chưa mua và hết hạn không câu >3 trên S1; có quyền câu10; count sai/âm/quá10 bị chặn |
| Kinh tế câu | Mồi thường/nâng cao, hụt/thoát/cá đôi, task/event/EXP, UID, giữ/bán, không mất pending |
| Client | Tải sạch, cache cũ, khởi tạo chậm, mở/đóng/tab, đồng hồ sau mua, thiếu vé, timeout, relog |
| Cách ly | S2–S8 không hiện/mua/nhận quyền mới, Huyền Vũ giữ thời hạn/quà/đặc quyền cũ |
| Hiệu năng | Đo latency/payload và pending với x10, đánh giá tải thêm lên CPU/DB chung trước mở rộng |

- Chạy fixture RAM trước; dùng DB test cô lập để kiểm CAS/receipt thật; cuối cùng test browser với server staging và snapshot config đúng baseline.
- Gate: có lỗi gameplay, dependency/404, exception hoặc chưa kiểm login → không deploy.

### E. Deploy S1 có thứ tự

1. Backup chọn lọc + hash trước đổi; kiểm readiness S1 và snapshot PID/restart S2–S8.
2. Upload addon version mới và kiểm nội dung/syntax/hash trước khi thêm manifest. Candidate index được patch từ index live vừa đọc, không từ index local.
3. Cài server candidate dưới cờ phát hành dành S1; restart riêng S1 nếu cần. Kiểm installed source + contract và readiness. Trong thời gian chưa sẵn sàng, không nhận giao dịch mua mới.
4. Chỉ sau server PASS mới bật UI S1. File client dùng chung phải kiểm server sau login và sau mỗi lần chuyển server.
5. Kiểm toàn bộ script URL của candidate qua origin/public (status, MIME, nội dung/hash), manifest giữ fix hiện có; `/ready` và S2–S8 không có restart ngoài scope.
6. Browser thật: tải lạnh → đăng nhập → chọn S1 → vào nhân vật → mở gói → mua/câu/relog bằng danh tính QA được phép. Không lấy account khiếu nại rương cũ để tiêu vé thử.

## 4. Nghiệm thu cuối

- Phải nhìn thấy gói trong game, mua trừ đúng 2.400, server lưu hạn 24 giờ, câu10 đúng chi phí/kết quả, đăng nhập lại còn quyền và số dư đúng.
- Không có 404/exception làm dừng tải, UI thao tác được, S2–S8 không thay đổi quyền. Chụp ảnh gói/kết quả và lưu evidence đã lọc dữ liệu nhạy cảm.
- Chỉ có HTTP200/syntax/fixture PASS chưa được gọi là hoàn thành. Nếu chưa có QA được phép, báo rõ đang chờ nghiệm thu giao dịch và chưa mở bán rộng; không tự tạo account/người chơi production.

## 5. Dừng và rollback

- Dừng ngay khi login/loading hỏng, gói sai server, sai giá, bị trừ lặp, mất cá hoặc CAS không bảo vệ được state.
- Với lỗi UI: tắt cờ UI x10, trả manifest về preimage live đã xác minh; không upload code local cũ. Giữ addon URL mới loadable nhưng vô hiệu hóa an toàn nếu cần cho cache cũ.
- Nếu lỗi tiền/quyền: khóa riêng mua mới ở S1; giữ dữ liệu hạn/receipt đã mua. Với vé hợp lệ đã bán, bảo toàn quyền đang có hoặc đối soát từng giao dịch trước bồi hoàn.
- Không restore DB player từ snapshot cũ. Mọi bù/repair cần preimage, marker idempotent và read-back riêng; không tự cấp bù trong rollout.

## 6. Bàn giao triển khai

Kế hoạch đã chốt tên/giá/hạn/quyền và S1. Việc cần có trước E2E production là danh tính QA được phép mua bằng 2.400 vé, hoặc người vận hành tự mua để đối soát. Không yêu cầu chọn lại các thông số đã chốt.
