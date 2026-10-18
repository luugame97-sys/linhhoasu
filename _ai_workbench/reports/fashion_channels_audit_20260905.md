# Session Report — kiểm toàn bộ ngoại quan theo kênh nhận

**Kết luận: phản ánh có cơ sở; có lỗi phía server game và tồn kho nhận sai từ trước. Chưa có bằng chứng Webshop hiện tại tự đổi sai ID thời trang.** Đây là phiên kiểm tra, không sửa game hoặc dữ liệu.

Snapshot source/config/WebGM: 05/09/2026, khoảng20:51 UTC+7. Mongo kiểm cuối20:59:17 UTC+7. Các lần đọc không phải một transaction xuyên SQL/Mongo, người chơi vẫn hoạt động bình thường.

## 1. Tóm tắt công việc

- Đọc session report và báo cáo ngoại quan đã sửa; không lấy kết luận cũ “PASS2.192” làm bằng chứng rằng hiện tại mọi kênh đều hoàn chỉnh.
- Lấy lại152 artifact source/config/client/WebGM qua SSH chỉ đọc, chạy fixture trên chính source snapshot. Không dùng candidate cash đang HOLD của phiên trước.
- Kiểm catalog gồm1.976 dòng FashionConfig,59 bộ đồ và các collection native liên quan: tổng2.192 ID, trong đó3 ID nội bộ không gửi trực tiếp.
- Kiểm8.756 ca cấp qua mail/giftcode trong game:2.189 ID gửi được ×2 kênh ×nhận lần đầu/lặp. Kiểm56 bộ đồ qua nhận thư→dùng hộp→sở hữu component.
- Đối chiếu694 PayConfig qua resolver cash/token, tổng1.388 phép resolve. Có10 payId liên kết ngoại quan trực tiếp hoặc rương con trong ShopConfig; chạy15 giao dịch fixture hợp lệ:10 cash và5 token. Không gọi cổng thanh toán thật.
- SQL đọc143 mặt hàng,9 giftcode và59 mốc tích nạp. Trong Webshop có20 mặt hàng ngoại quan trực tiếp,12 đang bật; thêm5 hộp có đầu ra thuộc catalog ngoại quan, cả5 đang bật. Có3 giftcode chứa ngoại quan hoặc hộp liên quan; không đọc/xuất mã code dùng được.
- Mongo đọc người thật S1/S2, tồn kho, ownership, record mua gói và các thư ngoại quan còn lưu; định danh đưa vào evidence đã băm.

### Phân biệt kênh nhận

| Kênh | Đường đi đã đọc | Kết luận trong phạm vi đã kiểm |
|---|---|---|
| Webshop | SQL item_id/amount→bridge mail→handler mail claim | Không thấy đổi ID tại bridge.67 dòng thư-ngoại quan đã nhận đối chiếu ởS1/S2 đều có ownership |
| Giftcode trên web | SQL reward_items→bridge mail→handler mail claim | Danh hiệu11274 trong109 thư đã nhận có ownership; hộp29040 đi vào túi theo thiết kế |
| Giftcode trực tiếp trong game | RedemptionCode→activity.grantRewardRows | Ownership lần đầu đúng;631 ID có chênh lệch quà quy đổi khi nhận trùng so với swaps/config và đường mail |
| Gói nạp cash/internal callback | recharge→grant/benefit→player.save→syncSessionPlayer | Tái hiện5 payId: DB có ngoại quan nhưng live session thiếu; lỗi game, không phải web đổi item |
| Gói dùng vé/token1230 | compat→resolver→grant trên session→save |5 ca ngoại quan liên quan qua fixture; không suy toàn bộ694 gói đều đã đạt E2E |

Tên một số PayConfig là “Thanh toán web”; chúng thuộc catalog thanh toán game, **không đồng nghĩa mặt hàng Webshop SQL**.

## 2. File/thư mục đã thay đổi

### Không thay đổi

- Không sửa source chính hoặc source production, config game/client, WebGM, SQL/Mongo/Redis.
- Không mua hàng, redeem code, gửi/nhận thư thật, tiêu item, chuyển quyền sở hữu, bù quà, hoàn Xu hoặc restart.
- Không thao tác native UI hoặc đăng nhập thay người chơi. Candidate cash của phiên trước tiếp tục HOLD, chưa triển khai.

### Artifact hỗ trợ mới

- `_ai_workbench/tools/snapshot_fashion_channels_20260905.py`: lấy source/config và gọi SQL chỉ đọc qua stdin; không upload file lên VPS.
- `_ai_workbench/tools/audit_fashion_channels_web_20260905.php`: chỉ SELECT trong read-only transaction; không bootstrap session/user_api hoặc gọi action ghi.
- `_ai_workbench/tools/audit_fashion_channels_fixture_20260905.js`: dùng handler/resolver thực từ snapshot, lưu giả lập, chặn socket network. Không load app bootstrap.
- `_ai_workbench/tools/audit_fashion_channels_runtime_20260905.js` và `run_fashion_channels_runtime_20260905.py`: Mongo find/projection có timeout, output ẩn danh; kiểm hash source/config sau audit.
- Evidence: `_ai_workbench/temp/fashion_channels_20260905T135129Z/` gồm `manifest.json`, `web_inventory.json`, `fixture.json`, `runtime.json`, source/config snapshot. Source snapshot không phải package để deploy/chia sẻ vì có thể chứa cấu hình nội bộ.
- Báo cáo MD/HTML này và cập nhật session_report.md/.html. Backup report trước sửa: `_ai_workbench/backups/fashion_channels_reports_20260905_210032/`.

Các artifact hỗ trợ nằm trong workbench. Snapshot/config thực được pin theo path và hash trong manifest; không ghi đè các cây source khác nhau.

## 3. Lỗi đã gặp & giải pháp

### 3.1 Dữ liệu lỗi có thật ở production

| Server / ID | Dữ liệu tại thời điểm kiểm | Nhận định |
|---|---|---|
| S1 /29001 — Đồ Long Đao |31 nhân vật có tổng31 item trong túi; cả31 thiếu Fashion ownership | Sai trạng thái: đây là ngoại quan cần ownership, không phải hộp cần dùng |
| S1 /11274 — Linh Họa Sư1 năm kỷ niệm |32 nhân vật giữ34 item;25 người thiếu ownership,7 người đã sở hữu nhưng còn bản sao trong túi | Có tồn kho sai/di sản; không được bù toàn bộ34 bản vì có người đã sở hữu |
| S1 tổng hai nhóm |52 người có body-ID trong túi;48 người thiếu ownership ở ít nhất một ID | Không cộng31+25 thành56 người vì8 người trùng nhau |
| S2 |41 người thật tại snapshot cuối;0 body-ID thời trang trong túi theo phép kiểm này | Chưa thấy lỗi tồn kho tương tự trong snapshot, không chứng minh mọi UI/S2 đều hoàn chỉnh |

S1 có81 record mua gói11000003;31 người trong số đó thiếu29001,50 người đã sở hữu. S2 có6 record,6/6 đã sở hữu. Record mua gói không lưu đầy đủ kênh/giờ của mọi giao dịch: **không gán chắc31 trường hợp cho cash callback hiện tại**. Body-ID nằm trong túi còn là dấu hiệu của đường cấp cũ; cần truy receipt/backup trước sửa lịch sử.

Ngoài ra có3 dòng S1 đã mở hình thú cưỡi22503/22504/22505 nhưng collection native hiện không có bản tương ứng. Chưa coi đây là3 trường hợp mất quà chắc chắn vì cần phân biệt đã dung luyện/tiêu native với lỗi cấp. Không tự tái cấp.

### 3.2 Lỗi đồng bộ gói nạp phía game hiện vẫn tái hiện

| PayId | Tên catalog | Ngoại quan thiếu ở phiên online sau cash callback |
|---|---|---|
|11000003|Vũ khí gói tân thủ|29001|
|2000258|Thanh toán web16000|23022|
|2000259|Thanh toán web32000|11430,24126|
|2000260|Thanh toán web64000|11530,22023|
|2000261|Thanh toán web160000|12034,21126|

Từng fixture đều nhận success và DB giả lập có ownership đúng, nhưng session online không có. Nguyên nhân nằm trong `src/handlers/recharge.js`: sync không truyền danh sách field; `SessionPlayerSyncService.js` mặc định chỉ sync items/currencies/rechargeInfo/shopInfo, bỏ fashionInfo và nhiều hệ native. Gameplay/close save toàn session có thể ghi đè state mới. Đây là lỗi server đã có reproducer, không chỉ suy từ ảnh người dùng.

Số5 là5 gói có reward ngoại quan trực tiếp trong tập liên kết ShopConfig được kiểm; **không tuyên bố chỉ5 gói trong toàn game có thể bị ảnh hưởng**, cũng không khẳng định4 gói200025x đang được mở bán hoặc đã phát sinh giao dịch thật. Các family đặc thù không đi ShopConfig/resolver chung còn cần acceptance riêng.

Pay2000263 cấp29160 là hộp bộ đồ, nên phải nhận hộp rồi dùng. Việc chưa sở hữu component ngay lúc nhận hộp không tự động là lỗi.

### 3.3 Item tồn kho sai không thể chữa bằng “Sử dụng”

29001 và11274 không có AssetsUseConfig/useType. Probe server tag1300 trên bản sao trong bộ nhớ trả success, trừ item từ1→0 nhưng không tạo ownership. Lỗi guard nằm ở `item.js`: vẫn consume khi useCfg=null, sau đó không có reward branch.

Đã kiểm cả1.914 ID loại Fashion thuần trong tình huống **giả định đã bị bỏ nhầm vào túi**: đều có thể bị đường RPC dùng item tiêu mất mà không kích hoạt. Đây không phải kết luận1.914 thời trang đều cấp lỗi: luồng nhận mới qua mail đang cấp thẳng ownership đúng, và1.914 ID này không có useType để client hiện nút dùng thông thường. Tuy vậy backend vẫn thiếu guard cho request đó. Không khuyên người chơi bấm dùng/bán item29001/11274; phải sửa dữ liệu có đối soát.

### 3.4 Không phải mọi item “thời trang” trong túi đều lỗi

-29040 — Thời đại hàng hải có AssetsUseConfig105 và bốn phần29041/29042/29043/29049. Nhận item29040 vào túi là đúng; dùng một hộp mở ownership các phần.
- Fixture56 bộ có use config qua nhận thư→dùng→ownership đều PASS. Ba bộ nội bộ không có use config được tách khỏi tập item gửi được.
- Snapshot có276 hộp29040 ởS1 và24 ởS2. Đây là tổng tồn kho, không phải số người và không được đưa vào số item lỗi.

### 3.5 Giftcode nhận trùng khác đường mail

Với631 ID Fashion vĩnh viễn có cấu hình `swaps`, lần đầu nhận sở hữu đúng trên cả hai đường. Lần hai:

- Mail chuyển thưởng đúng theo swaps trong fixture.
- Giftcode trực tiếp trong game không cộng thưởng quy đổi; shared grant chỉ giữ ownership đã có.

Ví dụ11274: cấu hình quy đổi400 Nguyên bảo. Mail lần2 cộng400, giftcode trong game lần2 cộng0. Đây là lỗi nhất quán phần thưởng/trùng có thể khiến người chơi thấy “nhận nhưng không có gì mới”; **không phải lỗi giftcode trên web**, vì giftcode web đi mail. Không suy số631 thành631 người đã mất thưởng.

### 3.6 Lỗi công cụ đã xử lý trong phiên

| Dấu hiệu | Nguyên nhân | Xử lý | Chống lặp |
|---|---|---|---|
| Probe đầu báo220 ca thiếu native | Oracle so thẳng sourceID của49 SpecialArtifact và6 SpecialSword với ID native | Đọc showId trong config và hàm grant; sửa riêng test, chạy lại | Không dùng ID vật phẩm nguồn thay cho target native; không sửa game để làm test xanh |
| Warning Mongoose isNew | Field schema cũ dùng tên reserved | Ghi warning; không biến thành lỗi grant khi không có failure | Tách warning import khỏi kết quả contract |
| rg báo lỗi flag encoding | Nhầm truyền tham số PowerShell ErrorAction vào rg | Bỏ tham số sai, đọc đúng file/path | Chỉ dùng option của executable |

Không sửa source gameplay trong quá trình hiệu chỉnh oracle. Không có dấu hiệu mojibake mới trong báo cáo; các tên tiếng Việt chưa tự trau chuốt lại khi đó là tên catalog.

## 4. Kỹ năng / kinh nghiệm mới

- “Nhận item”, “có quyền sở hữu”, “mở component”, “đã mặc” và “render model” là các mốc riêng. Hộp bộ đồ và body-ID thời trang phải tách loại.
- Web chỉ truyền ID/count qua mail; lỗi conversion/ownership sau nhận thuộc handler game. Cần chứng cứ sai mapping mới kết luận web phát nhầm.
- Tồn kho sai có thể tồn tại sau khi source cấp mới đã sửa; test code hiện tại xanh không có nghĩa dữ liệu cũ đã chuyển hết.
- Repair cần tách người chưa sở hữu với người đã sở hữu nhưng còn item, thời hạn, swaps và receipt. Không phát bù theo số bag tổng.
- Một bộ test chỉ assert ownership có thể bỏ sót duplicate conversion hoặc live-session sync. Báo cáo này giữ các chỉ số riêng.

## 5. Trạng thái hiện tại

### Kết quả đã xác minh

-8.756 ca mail/game-giftcode:0 lỗi cấp ownership/lưu vào bộ nhớ giả lập, sau khi oracle SpecialArtifact/Sword dùng showId đúng. **Chỉ số0 này không bao gồm631 chênh lệch duplicate được báo riêng.**
-56/56 hộp bộ đồ có use config mở component đúng.
-1.388 resolver probes trên694 PayConfig;15 fixture mua liên kết ngoại quan không có lỗi grant vào DB giả lập;5 cash có live-state mismatch như bảng trên.
- Các row liên quan trong sáu bảng FashionConfig/FashionDressConfig/AssetsConfig/AssetsUseConfig/SpecialArtifactConfig/SpecialSwordConfig giữa server.bin và client.bin khớp,0 row difference. Không suy toàn bộ hai file bin giống nhau.
- Source/config/WebGM ở10 path trọng yếu vẫn khớp hash snapshot khi đọc lại sau audit. File recharge.js local và production đều SHA-256 `43c3fc0eb114d688aea1f64edaa159a0c047c1fb70c1a86be565602864e51ae5`.
- S1 có656 người thật, S2 có41 tại snapshot cuối. Số người tăng so snapshot trước do game tiếp tục hoạt động, không phải do tool tạo account.

### Bằng chứng đường web

-67 dòng attachment ngoại quan trong thư Webshop đã nhận còn lưu:57 S1,10 S2; không có dòng claimed mà Fashion ownership bị thiếu trong tập này.
-109 thư danh hiệu11274 được phân loại giftcode web và đã nhận:98 S1,11 S2, đều có ownership; ledger khớp trong nhóm đã kiểm. Phân loại kênh dựa nội dung/title thư đã biết; không phải đối soát tuyệt đối mọi SQL order, đặc biệt Webshop không có deterministic eventKey cho tất cả đơn cũ.
- Có6 thư cũ ởS1 chứa11274, đã claimed nhưng người nhận thiếu ownership và còn item trong túi; các thư từ29/08, không có player claim ledger hiện tại và không đủ dấu gắn kênh. Không tự gọi đây là lỗi giftcode/web hiện hành.

**Giới hạn:** chưa thực hiện thanh toán thật, chưa kiểm UI/model/animation từng ID, chưa chạy relog/restart hay callback thực. Không xác nhận631 trường hợp duplicate từng xảy ra cho người thật. Cũng không chứng minh mọi lần “không thấy đồ” đều có cùng nguyên nhân. Phần native visual từ báo cáo trước vẫn chưa được thay bằng nghiệm thu mới.

## 6. Bước tiếp theo

1. Nếu được yêu cầu sửa: ưu tiên lỗi ownership/session của cash nhưng phải qua gate writer/recovery đang HOLD; không chỉ copy rộng state DB vào RAM.
2. Chặn consume khi item không có flow sử dụng hợp lệ; thêm regression cho toàn bộ Fashion body bị bỏ nhầm vào túi.
3. Chuẩn hóa duplicate conversion giữa các kênh theo swaps hiện có; không nhân quà hoặc tự đoán tỷ lệ.
4. Lập preview sửa lịch sử cho29001/11274:31/25 người thiếu ownership và7 người đã có cần policy riêng; đối chiếu nguồn/receipt và preimage, duyệt trước commit. Không tự bù cả34 danh hiệu hay cộng trùng nhóm.
5. Chỉ sau backend/data đúng mới nghiệm thu UI bằng vài ID đại diện người dùng báo, rồi mở rộng model/asset. Không kết luận lỗi web nếu chưa có đơn cụ thể sai ID/count.

**Phiên này dừng ở kiểm tra và kết luận, chưa sửa/bù gì.**
