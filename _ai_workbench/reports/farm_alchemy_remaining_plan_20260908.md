# Kế hoạch hoàn thiện Linh điền và Luyện đan — 08/09/2026

## Phạm vi được yêu cầu

Người dùng yêu cầu xác định lỗi còn lại, lập kế hoạch sửa đúng và cho phép tự cân đối theo logic game khi thiếu dữ liệu gốc. Đây là quyền đề xuất thiết kế mới cho phần thiếu, không phải xác nhận rằng các tỷ lệ dưới đây là bản chính thức. Lượt này không sửa source/config game, không deploy, không sửa DB người chơi.

Code local15file mục tiêu vẫn khớp hash release local đã duyệt. Không tái xác minh runtime VPS ở lượt này: môi trường Python hiện không có paramiko và SSH CLI chưa có host key tin cậy. Không cài tool hoặc bỏ qua kiểm tra host key. Bản live gần nhất đã xác nhận trong release.json vẫn là release giới hạn, không được coi kiểm tra local hôm nay là tình trạng live.

## 1. Lỗi kỹ thuật cần sửa trước khi cân bằng

| Ưu tiên | Bằng chứng mới | Cách sửa / điều kiện đạt |
|---|---|---|
| P0 | ConfigService truyền toàn ArrayBuffer của Buffer giải nén vào ByteArray, bỏ byteOffset/byteLength. Node local v24.19.0 tái hiện694–697 bảng thay714, PlantConfig/PlantBuildConfig lẫn nội dung PlantBaseConfig, AlchemyBaseConfig mất; công thức đọc thành388 dòng thay148 | Truyền Buffer/view có giới hạn đúng. Codec.js có mẫu tương tự cần kiểm tra. Validate schema/ID quan trọng; giữ last-good cache, không cache bộ bảng lỗi; không sửa binary để chữa lỗi decoder. Test Buffer offset khác0, nhiều lần load, Node đang dùng trên VPS và bản local mới |
| P1 | Đồng bộ phục hồi phân27 phát ITEM_UPDATE khi client còn phần hồi ảo: UI nhận12 trong khi model cuối11; reset timer không phát refresh cuối | Cập nhật count+time atomically hoặc reset phần hồi ảo trước absolute count, rồi phát event một lần; kiểm cả login, mở túi, farm, dùng hết phân, reconnect |
| P1 | RequestId lấy giờ thiết bị; điện thoại nhanh120giây bị EXPIRED_FEATURE_REQUEST_ID. Request mới cùng timestamp với nhóm đã bị loại khỏi journal có thể bị từ chối | Dùng server-issued epoch/sequence và nonce, TTL dựa receivedAt của server. Giữ requestId khi retry cùng ý định; không chỉ nới thời gian để che lỗi; bounded journal theo byte/count, chặn trùng đúng khóa |
| P1 | Wrapper client nuốt callback lỗi thẻ2428/result2 nên nhánh tắt auto không chạy ngay. Timer khác có thể tắt sau, chưa chứng minh loop vô hạn | Phân loại lỗi từng protocol: xử lý trạng thái stop/cooldown/retry, rollback reservation; không gọi callback success của claim lỗi; hạn chế toast spam |
| P2 | UI chất lượng cho công thức120101/nghềlv1 ghi30% +20, nhưng server cộng trọng số rồi chuẩn hóa thành41,67% | Chọn một ngữ nghĩa nhất quán: khuyến nghị giữ weighted rule hiện tại, hiển thị xác suất cuối41,67% và giải thích bonus. Không tự đổi thành50% khi bảng chưa xác định percentage-point |
| P2 | Ngày/quota phụ thuộc timezone tiến trình; shop reset chỉ trong lượt mua thành công; chưa có barrier reset đầy đủ cho farm/alchemy client | Dùng GameDayService thống nhất GMT+7 cho hai tính năng; login/heartbeat/first action cùng dayKey, reset1lần, push đủ counters, không xóa đồ mua. Kiểm khônglogin suốt00:00, server restart, thẻ hết hạn |

Bộ test48ca hiện dừng ngay ở số công thức sai trên Node local mới, không phải48ca vẫn xanh hôm nay. Lỗi buffer mới phải xử lý trước mọi thử nghiệm kinh tế. Chưa quy lỗi buffer cho VPS hiện tại khi chưa kiểm được phiên bản và runtime đó.

Nguồn: src/services/ConfigService.js:97, src/protocol/Codec.js:64, FarmRecoveryService.js, FeatureReceiptService.js, FarmShopService.js, client lhs-farm-alchemy-v2.js. Chẩn đoán: tools/diagnose_farm_alchemy_remaining_20260908.js; temp/farm_alchemy_fix_20260908/remaining-diagnostic.json.

## 2. Mở những chức năng hiện bị khóa bằng thiết kế có kiểm soát

Tất cả tỷ lệ/quota sau là **đề xuất cân bằng mới**, chưa áp dụng. Đặt vào một config có phiên bản; server và phần preview client cùng đọc dữ liệu này. Giữ phần thưởng/thời gian sẵn có thay vì tự thêm vật phẩm mới.

### A. Hạt100 trong ô thường

- Gieo vào ô thường, trừ1hạt đúng1lần, RNG ở server và lưu kết quả ngay lúc gieo; reconnect không roll lại.
- Dùng PlantConfig, KHÔNG dùng PlantMagicConfig vì ID1/2/4 trùng nhưng nghĩa khác.
- Tỷ lệ khởi điểm: Bạc(id2)45%, bánh(id4)30%, ngô(id101)20%, Nguyên bảo(id1)5%. Tổng10000 trọng số.
- Giữ sản lượng cơ bản lần lượt2000/30/3/20 và growTime9000giây (2h30), buff nhà như cây thường.
- Kỳ vọng cơ bản1hạt:900Bạc +9bánh +0,6ngô +1Nguyên bảo; đây là kỳ vọng trên nhiều lần, không phải mỗi lần nhận tất cả. Test thêm buff nhà tối đa, phân bón,6ô và cost ladder để tránh vòng lặp mua-rút lợi.

### B. Ô kỳ dị tự mọc

- Dùng riêng PlantMagicConfig1–12; mở ô theo cấp1/10/20, giữ300giây hồi ô và thời gian1h/1h30/2h theo cấu hình.
- Chọn nhóm Bạc50%, bánh30%, ngô15%, Nguyên bảo5%; trong mỗi nhóm: hạng thấp70%, giữa25%, cao5%.
- Mapping trọng số cụ thể theo ID:1=3500,2=1250,3=250;4=350,5=125,6=25;7=2100,8=750,9=150;10=1050,11=375,12=75. Tổng10000.
- Kiểm thu nhập theo thời gian và không áp buff cây thường vào ô kỳ dị ngoài cấu hình. Giả định3ô thu liên tục, không trộm/không tăng tốc: bình quân khoảng33.616Bạc,116bánh,11,6ngô,19,3Nguyên bảo/ngày; cần mô phỏng đủ kịch bản trước khi gọi cân bằng tốt.
- Cây cũ không có seedId/version: không đoán đã gieo hạt nào. Giữ kết quả hiện tại đến cuối chu kỳ; chỉ chu kỳ mới dùng policy mới, ghi version/seedId/rollId để hỗ trợ repair sau.

### C. Quảng cáo / hỗ trợ ngày

- Nếu có provider: xác minh signed server callback, ad nonce, loại quà, expiry và replay trước cấp.
- Nếu chưa có provider: thay UI bằng “Hỗ trợ hằng ngày”, không gọi là “đã xem quảng cáo”; loại bỏ yêu cầu video giả. Server phát theo quota và receipt, không tin tag200.
- Giữ quota hiện có làm baseline: hạt2lượt/ngày ×3; phân2lượt/ngày, lượng theo PlantLevelConfig; giảm build4lượt/ngày ×1800giây. Đặt cooldown tối thiểu30giây giữa lượt cùng loại, yêu cầu feature đã mở.
- Quyền skip-ad dùng cùng quota hỗ trợ, không tạo thêm một nguồn thưởng song song. Kiểm tác động tới giá trị thẻ và mô tả đã bán.

### D. Hạt thường hằng ngày

- Đề xuất làm đầy tồn hạt29 tới mức cấu hình nhà3 (5–15), không cộng dồn vô hạn, không giảm tồn đang vượt cap.
- Hạch toán riêng lượt cấp ngày và quà hỗ trợ ở trên; tổng nguồn có thể5+6=11hạt ở nhàcấp1,15+6=21 ở nhàmax trước nguồn nhiệm vụ/gói. Mô phỏng mức cung Linh thực tương ứng.
- Ngày mới GMT+7, settle lười tại login/first action; chỉ cấp cho ngày hiện tại, không nhân số ngày nghỉ. Không backfill “quà thiếu” lịch sử nếu không có receipt.

### E. Bón ruộng người khác

- Dùng đúng vật phẩm32, giảm300giây/đơn vị theo config; người gửi trả chi phí, chủ ruộng nhận giảm thời gian, không nhận vàng/đồ mới.
- Khóa sender+owner; validateô/cây/chủ khác mình/không bị trộm hoặc CD. Không đổi finishTime dùng cho lease trộm.
- Quota khởi điểm5đơn vị/người gửi/ngày và5đơn vị/ô/mỗi chu kỳ; clamp mức cần dùng, không tiêu đơn vị không còn tác dụng.
- Dùng reservation/outbox hai phía: trừ tiền được khôi phục/settle nếu owner write lỗi, owner không nhận hiệu ứng lần2 khi sender mất ACK. Push slot/túi cho cảhai.

### F. Trợ giúp

- Nâng cấp nhà: chỉ bạn bè/cùng bang;1người giúp1lần mỗi lượt nâng cấp; tối đa3người giúp; mỗi lần giảm5% thời gian gốc, trần300giây, tổng không vượt15% thời gian gốc. Người giúp tối đa10lần/ngày, không cấp thưởng tiền để tránh farm tài khoản phụ.
- Xua đuổi trộm: helper đánh bằng thuộc tính thật với buff đúng vai trò. Thắng mới hủy lease; không nhận cây/thưởng của chủ. Một trợ giúp đang xử lý/lease, giới hạn chống spam; khóa helper+owner+thief.
- Dùng request/record trợ giúp hiện có của bang nếu tương thích; không tạo một mô hình quyền sở hữu khác và không trả thành công giả.

### G. Auto offline

- Chỉ tài khoản có quản gia/thẻ đang hiệu lực và đã bật; quy tắc mặc định tối đa8giờ mỗi khoảng offline.
- Chỉ thu hoạch, gieo lại hạt thường đã chọn và nấu bánh ruộng mình. Không auto trộm, không chiến đấu, không xem quảng cáo, không auto mua nguyên liệu hoặc tiêu Nguyên bảo/vé tăng tốc khi chưa được bật rõ.
- Dùng cùng dịch vụ mutation/reward như online; xử lý từng mốc hoàn thành, dùng seed thực, giới hạn quota/cooking đúng ngày. Hếtseed/thẻ/cap thì dừng. Online takeover và settle offline dùng cùng khóa và checkpoint, không tính hai lần.
- Thẻ hết hạn giữa khoảng offline chỉ tính đến thời điểm hết hạn. Reward đang có của chu kỳ dở vẫn giữ cho người chơi claim; không nhân nguyên liệu theo thời gian ảo.

## 3. Phần dữ liệu và UX cần hoàn thiện

- Giữ nguyên cost/công thức148row, phân biệt đan phương120xxx/đan dược110xxx/thảo dược210x. Không tăng succeed để che lỗi popup.
- Hiển thị riêng số lượt xử lý, thành công, thất bại, nguyên liệu đã tiêu, đan đã nhận và lý do auto dừng. Thảo dược ở túi chung; túi đan lọc type8 có lời dẫn tới nguyên liệu.
- Kiểm loss fight cũng có event actor/target đúng, hủy lease có push block và cập nhật thief; không chỉ test field win.
- Giữ kiểm soát khi tiến trình chết sau DBcommit trước ACK; receipt không dựa giờthiếtbị, không truyền object state cũ vào kết quả replay. Nếu thêm multi-process phải có khóa/CAS phân tán; khóa trong1process không được coi là transaction toànserver.
- Repair cây cũ/đồ thiếu: audit chọn lọc và preimage backup, chỉ bù khi có chứng cứ. Quyền tự cân bằng gameplay không đồng nghĩa tự phát quà hoặc xóa tồn kho của người chơi.

## 4. Trình tự triển khai và gate

1. **Release nền tảng:** sửa decode buffer, schema validation, callback/clock/time-sync. Chạy lại toàn bộ48+19test,714bảng,148côngthức trên Node local và đúng Node VPS. Không đưa config lỗi vào cache chạy.
2. **Release khép kín kinh tế:** thêm policy có version, mở hạt100/ômagic, hạtngày và hỗtrợngày. Thử RNG biên + mẫu100.000/nhóm; mô phỏng7–30ngày ở cấp1/10/20/max, có/khôngbuff/thẻ/phânbón, người chơi mới/cũ. Không coi xác suất đều là mặc định chính thức.
3. **Release tương tác:** bón/giúp, kiểm20người tranh1ô, resend, mất ACK, DBtimeout, owneroffline; không nhận hiệu ứng hoặc thưởng lặp.
4. **Release offline:** checkpoint timeline, midnight/thẻhếthạn/restart, chuyển offline↔online, dừng đủ điều kiện; không backfill quà lịch sử.
5. **QA nghiệm thu:** tài khoản thử được phép, giao diện thật: mua→gieo→thu→đổi herb→luyện→dùngđan→relog. Kiểm trừ/nhận exact count và counters, không chỉ HTTPhealth hoặc mock save. Phát S2 rồiS1, hash/CAS/backup; mở feature flags từng nhóm.

Mỗi release có rollback source và config đi cùng version. Policy version được gắn với chu kỳ đã khởi tạo, không đổi kết quả cây đang lớn khi rollback/cân bằng lại. Không cài công cụ toàn máy hoặc nới kiểm tra SSH để bỏ qua vấn đề môi trường hiện tại.
