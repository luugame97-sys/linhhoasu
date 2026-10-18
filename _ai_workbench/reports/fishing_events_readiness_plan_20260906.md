# Rà soát mở sự kiện câu cá và lịch luân phiên — 06/09/2026

**Có thể triển khai cách tổ chức user muốn, nhưng bản hiện tại chưa đủ để mở tất cả an toàn chỉ bằng bật lịch.** Nhiều sự kiện có asset/config và giao diện nhưng gameplay/nhận thưởng còn thiếu. Phiên này chỉ audit và lập phương án; không mở sự kiện, không sửa source/config/DB, không restart, không mua/claim hoặc tạo nhân vật QA trên production.

## 1. Tóm tắt công việc

### 1.1 Đã kiểm những gì

- Chụp source/config/client production với155 hash guard, đọc714 bảng server và LanguageConfig hiện phục vụ.
- Đối chiếu8 cần,10 bè,25 row Activity33Config, Activity6 Đại hội câu cá, liên kết gói/quà, gate native và backend.
-11 probe độc lập trên source snapshot và các hàm native thật trong VM; mọi save chỉ ở bộ nhớ, socket bị cấm.
- Đọc thống kê activityInfo của người thật trên S1/S2 bằng Mongo aggregate, không xuất tên/ID tài khoản.

### 1.2 Cần câu thần thú là gói, không phải4 sự kiện riêng

| Cần | Item | Shop/Pay | Phân loại và trạng thái |
|---|---|---|---|
| Huyền Vũ |5903|11000009|Gói thẻ đặc quyền; quà50 Đùi Gà+2 phiếu/ngày đã sửa ở release trước. Có thể duy trì cửa vào dài hạn, không tự gia hạn thẻ hoặc cấp miễn phí |
| Chu Tước |5905|11000101|Gói cần câu, được liệt kê ở Đại hội câu cá/type6 và ngư trường/type33. Hiệu ứng10% câu đôi chưa được thực thi đầy đủ trong catch handler |
| Bạch Hổ |5906|11000102|Gói cần câu; config cần có điều kiện ngày server43. Nhánh thưởng đơn hiện chưa áp dụng10% nhân đôi |
| Thanh Long |5907|11000106|Gói cần câu; config cần có điều kiện ngày server57. Chưa có xử lý bonus nhân đôi tỷ lệ biến dị được xác minh, cần kiểm/sửa trước mở bán rộng |
| Vượng Tài |5908|11000107|Gói cần câu; điều kiện ngày57. Cơ chế1% cá đặc biệt chưa hoàn thiện, không thể coi nhận item là đã có hiệu ứng |
| Cần vàng |5904|3000001|Gói độc lập. Probe bán10 cá cho20 Ngư Tệ cả khi có/không cần vàng, chưa áp dụng10% bonus trong đường bán hiện hành |
| Trúc Xanh |5902|5902|Mua bằng nguyên bảo; bonus cá theo đơn cần kiểm riêng, không thuộc sự kiện thần thú |
| Cần gỗ |5901|Không|Mặc định, không có bonus riêng |

Các con số43/57 là điều kiện gói/cần riêng; yêu cầu trước về bỏ ngày mở **ngư trường thường** không tự động bỏ điều kiện của những cần này. Đọc native condition switch xác nhận type5 là serverOpenDay. Phiên này không tự thay điều kiện đó.

Tên vật phẩm có thể xuất hiện trong trang cần/bè dù sự kiện cấp/mua liên quan chưa mở. Vì vậy việc user thấy các cần trong game không chứng minh lịch sự kiện đã chạy.

10 bè được ghi đủ tên/ID/mô tả trong `readiness-audit.json` và `catalog-initial.json`:6201–6210. Các gói6203–6210 gắn Shop11000201–11000208, xuất hiện trong giftIds type33. Chúng không phải10 sự kiện riêng. Một số tên bản dịch hiện có chưa tự nhiên, không chỉnh tên hay encoding trong audit này.

### 1.3 Danh mục sự kiện cần chạy nối tiếp

**Nhóm ngư trường — activityType33**: native `VortexFishActivityData.getActivityData()` lấy `getFirstAvailableActivityByType(33)`, nên các biến thể cùng tranh một đầu vào. Có thể có nhiều row active nhưng gameplay chính chỉ chọn row đầu tiên.

| ID area1 | Nhóm nội dung | Map | Xử lý lịch đề xuất |
|---|---|---|---|
|33001|Ngư trường xoáy — biến thể1|101|Một đợt riêng |
|33002|Ngư trường xoáy — biến thể2|101|Đợt sau; khác gói/quà hiển thị, không coi giống hoàn toàn33001 |
|33201|Ngư Vương — Bờ tuyết băng giá|201|Luân phiên |
|33202|Ngư Vương — Anh Mộc Hoa Đảo|301|Luân phiên |
|33203|Ngư Vương — Bích Hải Tinh Than|401|Luân phiên |
|33204|Ngư Vương — Bên dòng sông Lưu Xuyên|501|Luân phiên |
|33301|Chai trôi — Bích Hải Tinh Than|401|Luân phiên chung type33, không bật chồng Ngư Vương |
|33302|Chai trôi — Bên dòng sông Lưu Xuyên|501|Luân phiên |
|33303|Chai trôi — Bờ tuyết băng giá|201|Luân phiên |
|33304|Chai trôi — Anh Mộc Hoa Đảo|301|Luân phiên |

Ngư trường xoáy có3 mini-game trong client: mở rương, tìm vật dưới vỏ sò và đánh cá lớn. Đây là các module của sự kiện, không phải3 row lịch độc lập.

**Nhóm Đại hội câu cá — activityType6, subtype6**: ID6006 (area1),6056 (area2). Config có8 nhiệm vụ60601–60608 và4 vòng. Điều kiện hiện tại là cấp nhân vật55. Native cũng chọn sự kiện type6 đầu tiên; không được mở dài hạn6006 chồng các Đại hội Luyện Thể/Ngự Thú/Tọa Kỵ/Thần Binh khác cùng type6. Nếu lịch type6 đã có chuỗi của các hệ khác, cần chèn Đại hội câu cá vào đúng chuỗi; không chiếm cố định đầu vào này.

### 1.4 Không mở bản sao thành sự kiện mới

Activity33Config có25 row nhưng chỉ11 row có ActivityConfig tương ứng:10 area1 ở bảng trên và33051 area2.14 row không có metadata đăng ký:33052,33101,33151,33251–33254,33351–33354,33951,33952,33999.

So sánh config sau khi bỏ activityId xác nhận11 cặp trùng nội dung:33001/33051,33002/33052,33101/33151,33201/33251,33202/33252,33203/33253,33204/33254,33301/33351,33302/33352,33303/33353,33304/33354. Không mở các bản sao khu vực thành thêm lượt thưởng chỉ vì ID khác. Các row thiếu metadata cần xác minh nguồn/provenance, không tự đăng ký toàn bộ bằng phỏng đoán.

6006/6056 cũng là hai bản khu vực của Đại hội câu cá, không phải hai nội dung riêng. Phương án area1 là điểm xuất phát thiết kế, cần chốt mapping theo `rechargeArea`/cohort thực tế khi triển khai; không ép đổi khu vực tài khoản.

## 2. File/thư mục đã thay đổi

### Chỉ artifact audit

- `_ai_workbench/tools/snapshot_fishing_events_20260906.py`: snapshot hash-guard, không player reads/writes trong bước chụp source.
- `_ai_workbench/tools/catalog_fishing_events_20260906.js`: giải bảng/tên tiếng Việt và liên kết item→shop→event.
- `_ai_workbench/tools/audit_fishing_event_readiness_20260906.js`:11 probe trong bộ nhớ, không network.
- `_ai_workbench/tools/read_fishing_event_runtime_20260906.py`: thống kê Mongo read-only theo activity ID và hậu kiểm source/process/ready.
- Evidence dưới `_ai_workbench/temp/fishing_events_audit_20260906T091339Z/`: `manifest.json`, `catalog-initial.json`, `readiness-audit.json`, `runtime-events.json`.
- Báo cáo chuyên đề này, HTML cùng tên và cập nhật `session_report.md/.html`.
- Backup báo cáo cũ: `_ai_workbench/backups/fishing_events_reports_20260906/`.

Không sửa file trong `linhhoasu/`, config bin, timer, player/DB, shop hoặc lịch production. Không upload script lên VPS; chỉ chạy truy vấn/hash read-only qua SSH stdin. Không thêm automation/scheduled task trong app.

## 3. Lỗi đã gặp & giải pháp

### Các blocker mở sự kiện được xác minh

| Vấn đề | Bằng chứng | Việc cần sửa trước khi mở |
|---|---|---|
| Cả5 map sự kiện bị chặn |canUseScene từ chối isActivity; thử map101/201/301/401/501 dù event row active vẫn FISH_SCENE_LOCKED |Router/gate và pool riêng cho sự kiện; không đơn thuần bỏ if rồi dùng pool rỗng |
| Mini-game báo thành công không quà |1700 module1 index1/2/3 trảresult0, rewards=[], vé records vẫn1 |Xử lý vé/lượt, kết quả authoritative, phần thưởng, sync và chống replay |
| Bảng xếp hạng không thật |Hai fixture khác nhau đều nhận rank1, danh sách chỉ mình |Tích điểm server, BXH theo đợt/server, chốt và phát thưởng idempotent |
| Chai trôi chỉ trong state cá nhân |A thả chai, B vớt ra rỗng/trừ1 lưới; A vớt lại chai của A |Kho chai dùng chung, ownership, lượt tương tác, giới hạn và nội dung |
| Khen chai không cấp quà/giới hạn đúng |4 lần hit tăng score4, daily record0, +0 item216 dù config thưởng3 và max3/ngày |Ledger ngày, không tự khen/replay, quà/sync đúng, xử lý mất ACK |
| Đại hội không trả quà vòng |module0 result0 nhưng score0, record tăng1, rewards=[]; config vòng là100 Đùi Gà+15 tinh thể+10 phiếu |Counter theo kỳ, nhiệm vụ/claim vòng, vòng tối đa và reset đúng |
| Event chưa bật vẫn tự có row khi gửi operate |Thiếu row33002 nhưng request tạo active window14 ngày mặc định |Reject khi ngoài lịch; không tự seed lịch từ request người chơi |
| Tắt hiển thị chưa chặn thao tác |disabledEntryIds vẫn có thể operate result0 dù row ẩn; row hết hạn rõ ràng được từ chối |Gate server thống nhất enabled/window/cohort, không dùng UI làm bảo vệ |
| Mở chồng cùng family che sự kiện |Native chỉ chọn first available type33/type6 |Scheduler không chồng các nhóm tranh UI; nếu muốn song song cần sửa selector contract |
| Bonus cần chưa đầy đủ |Chu Tước low-draw vẫn10 cá/10 lượt; Bạch Hổ quà như cần thường; cần vàng bán10 cá vẫn20 coin |Hoàn thiện hiệu ứng passive và định nghĩa ownership/equip đúng nguồn trước mở gói rộng |

Probe trên clone có đầy đủ item cần và đã chọn rod tương ứng, dùng RNG thấp có kiểm soát; không câu/mua/nhận thưởng người thật. Các probe này xác nhận đường code hiện tại, không tự suy số người bị thiệt hại hoặc mức bù.

Tỷ lệ/pool biến dị Thanh Long, Vượng Tài, các bè nâng cao và settlement cuối kỳ chưa được nghiệm thu toàn bộ. Không tự gán chúng PASS chỉ vì có tên/asset/gói.

### Lỗi công cụ trong audit

| Lỗi công cụ | Nguyên nhân | Xử lý/chống lặp |
|---|---|---|
| Tên chưa dịch ở lần dump đầu |LanguageConfig dùng field cn, gear name nằm AssetsConfig |Đọc schema thật, resolve qua AssetsConfig vàcn; chạy lại |
| Output dài/truncated |Dump toàn table và hàm cùng tên của minify |Lưu full JSON dưới temp, chỉ in summary và extract exact marker |
| Path shop.js không có |Handler tên khác kiến trúc giả định |Không kết luận từ file thiếu, tìm caller thực tế bằng rg |
| Mongoose cảnh báo isNew |Schema hiện hữu có reserved field |Ghi nhận, không thay model trong audit |

Không có encoding corruption mới; tên bè dịch chưa tự nhiên là nội dung nguồn, không tự sửa tay toàn bộ. Tool/report UTF-8.

## 4. Kỹ năng / kinh nghiệm mới

- Tách4 lớp: tên asset/gói, lịch event, gameplay/reward, hiệu lực đặc quyền. “Thấy cần” hoặc “nhận item” không chứng minh passive đã hoạt động.
- Event có nội dung khác vẫn có thể xung đột kỹ thuật vì native chọn cùng first available family. Nhóm type33 cần một lane lịch chung nếu giữ client hiện tại.
- Trùng khu vực phải gộp về cùng nội dung logic, không tạo đợt thưởng nhân đôi chỉ vì suffix ID khác.
- Mở dài hạn là mở quyền tham gia theo lịch; không tự kéo dài thẻ đã mua, xóa purchase limit, reset receipt hoặc phát quà lịch sử.
- Scheduler phải dùng mốc start/end cố định theo đợt, không now+N ngày trên mỗi lần ensure/login. Phải chốt thưởng đợt cũ trước khi chuyển state đợt mới và xử lý reconnect.

## 5. Trạng thái hiện tại

### Runtime hiện tại

-16:24:28 UTC+7: S1 có701 player không phải bot, S2 có92. Chỉ đọc số tổng/ID sự kiện, không xuất thông tin định danh.
- Không có row6006/6056 hoặc type33 trong activityInfo của các player không phải bot ở hai DB. Rows nhìn thấy trong aggregate hiện thuộc7001,9001,43001,44001. Đây là bằng chứng chưa có lịch được cấp vào các profile tại thời điểm chụp, không phủ định user nhìn thấy màn cần/bè.
-155 artifact còn khớp expected bản phòng câu; PID/restart6 tiến trình nguyên. Ready8080/8083=200. Không có production mutation trong phiên này.

### Coverage

-714 bảng/config,8 cần,10 bè,25 row type33 và11 probe readiness hoàn tất,0 harness error.
-11 probe là kết quả **audit**, không phải11 test fix đã PASS. Chưa patch/bật event, chưa live gameplay/visual/paid flow, chưa test scheduler mới vì chưa xây scheduler.
- Huyền Vũ vẫn là phần đã có bản sửa quà ngày/relog trước đó. Phiên này không claim lại và không gia hạn thẻ. Các kết quả cũ được nêu là lịch sử release, không giả là test mới.

## 6. Bước tiếp theo và lịch đề xuất

### Cách tổ chức sau khi hoàn thiện blocker

| Luồng | Đề xuất | Ràng buộc |
|---|---|---|
| Ngư trường/type33 |Một biến thể7 ngày, hết đợt chuyển biến thể kế;10 biến thể area1 tạo vòng70 ngày |Chỉ1 row type33 hoạt động theo cohort; các bản khu vực tương đương dùng cùng đợt logic |
| Đại hội câu cá/type6 |Đợt7 ngày trong lịch Đại hội chung |Không chồng với Đại hội khác cùng type6; sửa task/4 vòng/BXH trước |
| Gói cần/bè độc lập và đặc quyền |Cửa tham gia/giới thiệu90 ngày hoặc lịch dài hạn được cấu hình |Giữ giá, điều kiện mua, purchase limit, thời hạn entitlement đã mua; chỉ mở khi hiệu ứng thật đạt |
| Huyền Vũ ngày |Duy trì tính năng hiện có, nhận quà khi thẻ còn hiệu lực |Không reset marker hoặc phát thêm để “mở sự kiện” |

**7 ngày/90 ngày là đề xuất thiết kế, không phải thời lượng gốc đã xác minh, chưa áp dụng.** Khi user chốt triển khai có thể dùng cấu hình riêng để dễ đổi số ngày. Không đặt ngày bắt đầu thực tế cho tới khi build/test đủ an toàn.

Ví dụ thứ tự lane type33:33001 →33002 →33201 →33202 →33203 →33204 →33301 →33302 →33303 →33304 →lặp vòng. Nếu muốn rút bớt biến thể cùng nội dung, giữ một đại diện Vortex và vẫn luân phiên4 mùa Ngư Vương/4 mùa chai trôi. Không tự mở14 row thiếu metadata.

### Thứ tự triển khai đề nghị

1. **P0 — Gate/lịch:** registry family/cohort/instanceId, lịch cố định, reject event disabled/ngoài đợt; bảo vệ claim/purchase và không tự tạo active row từ request.
2. **P1 — Cần/bè:** Chu Tước/Bạch Hổ/Thanh Long/cần vàng và bonus bè có mô tả; test tỷ lệ ranh giới, ownership/equip, đơn/bán/catch, save/retry/relog. Không quảng bá gói chỉ có hình nhưng thiếu hiệu ứng.
3. **P2 — Đại hội:** counter theo đợt,8 nhiệm vụ/4 vòng, đúng reward và kết thúc kỳ; giữ nhiệm vụ các Đại hội khác.
4. **P3 — Ngư trường sự kiện:** event scene/room routing, fishKing/mutation/drop pools chuẩn, mini-game ticket/outcome, chai trôi chia sẻ và BXH thật. Thiếu bảng tỷ lệ/kết quả chuẩn thì giữ khóa hoặc xin phê duyệt bảng riêng, không tự chế rồi gọi là gốc.
5. **P4 — Luân phiên/dài hạn:** đảm bảo không overlap, cận start/end/restart/relog, settlement một lần, data đợt cũ còn đọc/nhận hợp lệ. UI thông báo đợt kế tiếp, gói không duplicate theo ID vùng.
6. **P5 — Release:** fixture negative vànative contract, QA riêng staging rồi S2/S1, ảnh client thật và hậu kiểm tiền/vật phẩm/receipt. Không dùng tài khoản người chơi để mua/claim hoặc phát bù khi chưa có yêu cầu.

Kết luận bàn giao: có thể tổ chức theo ý tưởng nối tiếp/dài hạn, nhưng cần sửa phần thiếu trước. Chưa mở hoặc thay lịch trên server trong phiên kiểm tra này.
