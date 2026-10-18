# Báo cáo kiểm kê toàn bộ gói nạp/tệ production

- Thời điểm chụp ban đầu: 2026-09-01T09:43:41; hậu kiểm live: 2026-09-01T09:57–10:00 (GMT+7).
- Phạm vi: production `103.116.105.154`, chỉ đọc; không mua thử, không sửa DB/source/config và không restart.
- Server/client config: **714/714 bảng**, PayConfig **694** mã, ShopConfig **1519** dòng.
- Đối chiếu gói server/client: **0 mã lệch**. Có 7 bảng binary khác nhưng không thuộc PayConfig/ShopConfig/Activity9/Privilege.

## Kết luận điều hành

- **Catalog không lệch:** server/client đều 714 bảng; PayConfig 694 mã, ShopConfig 1.519 dòng, 614 dòng có `payId`; `packageDiff=0`. Bảy bảng binary khác nhau đều không thuộc nhóm nạp/quà.
- **Lỗi nằm ở handler/runtime:** các đường `1202/1210`, `1211`, `1230`, `1241` và callback tiền thật không dùng chung một contract quà/kích hoạt.
- **Có hai lỗ hổng P0 cần khóa trước:** mua miễn phí gói trả phí qua `1202/1210`, và claim lặp vô hạn qua `1211/1241`.
- **Không đủ ledger để tự động bù:** Mongo `transactions=0`, `rechargeproductconfigs=0`; WebGM `recharge_orders=0`; log `1230` không có payId/result/reward delta.
- **Tiên duyên 10501 đang đồng nhất:** 2/2 player có record mua và `recordList[10501]`; không nên rollback helper Activity9 hiện tại.

## Kết luận ưu tiên

1. **P0 – có thể nhận miễn phí quà của gói trả phí qua packet shop `1202/1210`.** `handleMultiBuyItem()` kiểm goods/limit/cost nhưng không chặn `goods.payId>0`; 614 gói trả phí có `cost=[]`, nên forged packet đi qua mà không trừ tệ. Handler vẫn cấp quà, tăng `buyRecords` và `rechargeInfo.records`. Trong đó **486 gói có base rewards** có thể bị khai thác trực tiếp. Đây cũng có thể tạo trạng thái “đã mua/kích hoạt” không có order ledger.
2. **P0 – claim thẻ tháng `1211` có thể gọi lặp vô hạn.** Server luôn cấp `ID 1 ×50`, không kiểm ID hợp lệ, thẻ đã mua, còn hạn hoặc đã nhận trong ngày; sau đó mới ghi timestamp. Client có chặn nút theo ngày nhưng server không được phép tin client.
3. **P0 – claim gói chuỗi `1241` có thể gọi lại tùy `id/index`.** Handler chỉ kiểm `id` thuộc cây 50001/50010, không kiểm index hiện tại/đã claim; cấp cứng `ID 1 ×(30 + index×10)`, xóa row khớp rồi vẫn trả thành công kể cả khi row không tồn tại. Quà thật trong 24 bước ShopGiftConfig bị bỏ.
4. **P1 – callback tiền thật đang không có catalog phát quà hoạt động.** Mongo `rechargeproductconfigs=0`; `PayConfig` không có trường `diamond/attachments`, nên `RechargeConfigService` dựng mọi gói built-in với `diamond=0`, `attachments=[]`. Callback nội bộ nếu được dùng sẽ ghi nạp/VIP/kích hoạt nhưng không cấp quà theo ShopConfig. Hiện `transactions=0`, WebGM `recharge_orders=0` và XTPay chưa cấu hình, nên chưa có order/player lịch sử nào xác nhận bị mất quà qua callback này.
5. **P1 – đường mua bằng tệ/token tag 1230 bỏ quà khai báo.** Handler chỉ dùng `ShopConfig.rewards`; bỏ `extraRewards`, `firstRewards`, `subsequentRewards`, `isDouble` và nhiều contract sự kiện. Có **20 mã** có ít nhất một trường quà trực tiếp bị bỏ.
6. **P1 – nhóm type 14 và gói không có base rewards chưa có resolver đúng.** Có 33 mã type 14; 13 mã có `firstRewards`, 6 trong số đó có `subsequentRewards`, nhưng client ép chúng sang cash path trong khi callback cash không đọc các field này. Ngoài ra 128 gói pay-linked không có base `rewards`; 115 không có bất kỳ field quà trực tiếp, phần lớn cần specialized activity/chain resolver chứ không được fallback `ID 1 ×60`.
7. **P1 – 105 gói trigger type 11 không được server tạo `shopInfo.pack` đúng contract.** `tag 1240` chỉ lưu trigger; chỉ tạo `chainPack` cho 50001/50010. Snapshot DB hậu kiểm có `shopPackIds=[]`, phù hợp phản ánh “gói không hiện/không kích hoạt”.
8. **P1 – 112 gói có giới hạn nhưng period không được thực thi server-side thống nhất.** `limitType=1`: 23; `2`: 6; `4`: 80; `6` có ba dòng limit dương. Token/cash chủ yếu chỉ tăng count lifetime, không có day/week period key; có đường mua vượt giới hạn và có đường khóa vĩnh viễn gói đáng lẽ reset.
9. **P1 – gói tân thủ 11000018 chưa có Activity999 server contract.** Client khai báo 3 ngày: ngày 1 `29001×1 + 1×60 + 1203×1`, ngày 2/3 `1×30 + 2×3000`; production không có handler Activity999, nên record mua có thể tăng nhưng lịch quà/kích hoạt không xuất hiện.
10. **P1 – reward native không được route thống nhất.** Token `1230` chỉ special-case equipment rồi đưa phần còn lại vào bag; catalog paid có fashion `29001` và các gem `25012/25022/25032`, có nguy cơ record mua tăng nhưng native ownership không kích hoạt.
11. **P2 – callback cash không nguyên tử.** Player và mail được save trước khi transaction success được ghi; crash giữa hai bước có thể làm player/ledger lệch và retry khó phân biệt đã cấp quà hay chưa.

## Thống kê catalog đầy đủ

| Shop type | Số gói | Có base rewards | Ghi chú contract |
|---:|---:|---:|---|
| 0 | 53 | 43 | Gói thường/đặc quyền; 1 dòng có bonus field |
| 1 | 11 | 11 | Gói trực tiếp |
| 7 | 4 | 4 | Card đặc quyền; 4/4 có bonus field |
| 8 | 1 | 1 | Thẻ vĩnh viễn; có bonus field |
| 9 | 15 | 14 | Một gói không có base reward |
| 10 | 312 | 235 | Nhiều gói sự kiện cần resolver theo Activity* |
| 11 | 105 | 105 | Trigger/limit package; thiếu seeding `shopInfo.pack` |
| 12 | 1 | 1 | Gói đặc quyền; có bonus field |
| 14 | 33 | 0 | Cash/web; 13 first, 6 subsequent |
| 16 | 7 | 0 | Các bước trả phí của hai cây chain 50001/50010 |
| 17 | 4 | 4 | Gói có limit |
| 18 | 8 | 8 | Gói có limit |
| 19 | 10 | 10 | Gói có limit |
| 20 | 6 | 6 | Horse-race package |
| 21 | 44 | 44 | Old Trek/pass packages |

- 614 gói pay-linked được client hiển thị/điều hướng; 80 PayConfig không có ShopConfig row được coi là dormant/legacy, không tự động mở hoặc tự điền quà.
- 486/614 có base `rewards`; 128/614 không có base; 20 mã có secondary fields `extra/first/subsequent`; 15 mã dùng `isDouble`.
- Toàn bộ reward ID/count/giá trong catalog đã qua scan cấu trúc; không tìm thấy ID quà không tồn tại trong AssetsConfig.

## Mã có trường quà đang bị server bỏ

- Có `extraRewards`: 7 mã — 11000001–11000002, 11000007–11000009, 11000012, 11026000.
- Có `firstRewards`: 14 mã — 2000101–2000107, 2000258–2000263, 11000007.
- Có `subsequentRewards`: 6 mã — 2000258–2000263.

| Pay ID | Giá R | rewards hiện được đọc | extra bị bỏ | first bị bỏ | subsequent bị bỏ |
|---:|---:|---|---|---|---|
| 2000101 | 6 | — | — | 1×60 | — |
| 2000102 | 30 | — | — | 1×300 | — |
| 2000103 | 68 | — | — | 1×680 | — |
| 2000104 | 128 | — | — | 1×1280 | — |
| 2000105 | 328 | — | — | 1×3280 | — |
| 2000106 | 648 | — | — | 1×6480 | — |
| 2000107 | 1998 | — | — | 1×19980 | — |
| 2000258 | 1000 | — | — | 1×2000, 23022×1, 62×10 | 1×1500, 62×5, 81×1, 53×1 |
| 2000259 | 2000 | — | — | 1×5000, 24126×1, 11430×1, 62×20 | 1×3000, 62×10, 82×1, 53×2 |
| 2000260 | 4000 | — | — | 1×10000, 22023×1, 11530×1, 62×40 | 1×6000, 62×20, 82×2, 53×4 |
| 2000261 | 10000 | — | — | 1×30000, 21126×1, 12034×1, 62×100 | 1×15000, 62×40, 82×4, 53×8, 101308×1 |
| 2000262 | 16000 | — | — | 1×48000, 21×1000, 92×800, 62×160 | 1×24000, 62×60, 82×6, 53×12, 101308×1 |
| 2000263 | 20000 | — | — | 1×60000, 29160×1, 92×1000, 62×200 | 1×30000, 62×80, 82×8, 53×16, 101308×2 |
| 11000001 | 198 | 1×1980 | 1×100, 4×100 | — | — |
| 11000002 | 30 | 1×300 | 4×100 | — | — |
| 11000007 | 68 | 1×680 | 55×40, 56×2 | 100043×1 | — |
| 11000008 | 18 | 1×100 | 4×150 | — | — |
| 11000009 | 68 | 1×680 | 65×50, 70×2 | — | — |
| 11000012 | 68 | 1×680 | 100×5 | — | — |
| 11026000 | 68 | 1×680 | 415×1000 | — | — |

## Thẻ tháng/đặc quyền

| ID | Player có record mua | Player đã kích hoạt thời hạn | Có record nhận ngày | Lệch |
|---:|---:|---:|---:|---|
| 11000001 | 16 | 16 | 16 | Không lệch kích hoạt |
| 11000002 | 37 | 37 | 36 | 1 chưa từng nhận ngày |
| 11000007 | 5 | 5 | 5 | Không lệch kích hoạt |
| 11000008 | 0 | 0 | 0 | Không lệch kích hoạt |
| 11000009 | 10 | 10 | 10 | Không lệch kích hoạt |
| 11000012 | 12 | 12 | 12 | Không lệch kích hoạt |

- Hậu kiểm live có 80 ID-player rows của năm loại thẻ đang có người mua; 0 record mua mà thiếu thời hạn kích hoạt. Số người duy nhất tối thiểu 39, nhưng một người có thể sở hữu nhiều loại.
- Riêng `11000002`: 37 player active, 36 player có `monthCardRecords`; 1 player chưa từng nhận quà ngày. Đây có thể là trạng thái hợp lệ chưa claim, không phải lỗi kích hoạt.
- `11000008` có trong `PrivilegeConfig`/ShopConfig nhưng client `MonthIdList` và server `KNOWN_MONTH_CARD_IDS` không bao gồm; DB cũng chưa có người mua. Cần xác định đây là gói legacy hay gói phải hỗ trợ trước khi mở bán.

### Lỗi bảo mật/claim của thẻ tháng

- Client chỉ hiện nút claim khi card active và chưa claim trong ngày, nhưng packet `1211 {id}` có thể được gửi trực tiếp.
- Server không kiểm `monthCards[id]`, không kiểm expiry, không kiểm same-day và không whitelist card ID; bất kỳ player đã đăng nhập nào cũng có thể gọi lặp cùng ID hoặc ID tùy ý để nhận `50 Nguyên bảo/lần`.
- Do log hiện không ghi tag 1211 theo user/id/result nên chưa thể định lượng lịch sử khai thác; đây là lỗ hổng code chắc chắn, không phải bằng chứng một player cụ thể đã gian lận.

## Hai cây gói chuỗi sai quà

| Cây | Số bước | Bước trả phí | Quà client/config | Quà server hiện tại |
|---:|---:|---|---|---|
| 50001 | 10 | shop 50001, 50002, 50003 | Nguyên bảo + mảnh tinh linh; các bước miễn phí có mảnh/Baozi/Linh tủy | `ID 1 ×(30 + index×10)` |
| 50010 | 14 | shop 50011–50014 | Nguyên bảo + mảnh yêu linh; các bước miễn phí có Baozi/phù tốc/Linh tủy | `ID 1 ×(30 + index×10)` |

- `tag 1241` không đọc `ShopGiftConfig`, không xác minh index hiện hành, không advance state và có thể được gọi lại cùng `id/index`.
- DB hậu kiểm không có `shopInfo.pack`; chain state chỉ được tạo khi client gửi đúng trigger/param, vì vậy còn có lỗi “gói không hiện/kích hoạt”.

## Gói tân thủ 11000018

- Giá catalog: `priceR=6`, `priceD=99`, `priceNT=33`.
- Client `Activity999TypeConfig` ánh xạ tới 999001/999051.
- Ngày 1: Đồ Long Đao `29001×1`, Nguyên bảo `1×60`, thẻ bỏ quảng cáo `1203×1`.
- Ngày 2 và 3: Nguyên bảo `1×30`, bạc `2×3000` mỗi ngày.
- Production không có `Activity999`/`999001`/`11000018` handler; generic token path vì base rewards rỗng chỉ fallback `ID 1×60`, còn record mua vẫn tăng. Đây là ứng viên rất mạnh cho phản ánh “mua nhưng không kích hoạt/không nhận đủ quà”.

## Giới hạn mua và trạng thái kích hoạt

| limitType | Số gói có limit dương | Rủi ro hiện tại |
|---:|---:|---|
| 1 | 23 | Count lifetime, không có reset ngày |
| 2 | 6 | Count lifetime, không có reset tuần |
| 4 | 80 | Gói kích hoạt/one-shot; cần state owner chuyên biệt |
| 6 | 3 | Giới hạn đặc thù; handler dùng chung chưa có period contract |

- `tag 1230` và cash callback không kiểm `ShopConfig.limit/limitType`; `handleMultiBuyItem` kiểm một lifetime `buyRecords` nhưng cũng là đường bypass payment.
- Hệ quả là cùng một catalog nhưng các đường mua có semantics khác nhau: đường token/cash có thể mua vượt hạn, còn đường shop có thể khóa vĩnh viễn gói lẽ ra reset.

### Dấu vết mua trong 20 mã lỗi contract

| Pay ID | Player có record | Tổng lượt mua ghi nhận | Mua tối đa/player |
|---:|---:|---:|---:|
| 11000001 | 16 | 16 | 1 |
| 11000002 | 37 | 41 | 3 |
| 11000007 | 5 | 5 | 1 |
| 11000009 | 10 | 12 | 3 |
| 11000012 | 12 | 17 | 6 |

- Chỉ 5/20 mã lỗi contract đang có dấu vết mua trong DB; đó là 5 thẻ đặc quyền ở bảng trên. Tổng cộng 91 lượt; không thể cộng các cột “player có record” để suy ra chính xác số người duy nhất vì một người có thể mua nhiều loại.
- 15 mã còn lại, gồm toàn bộ nhóm type 14 và `11000008`, `11026000`, có 0 record mua trong snapshot hiện tại.
- Các player sở hữu năm loại card là **phạm vi cần kiểm tra/bù tiềm năng**, chưa thể khẳng định mỗi người thiếu chính xác món nào vì server không lưu reward snapshot và không có order ledger; lịch sử có thể đã chạy phiên bản handler khác.

## Tiên duyên

| Pay ID | Player có record | Player active | Mua nhưng chưa active | Active không có mua |
|---:|---:|---:|---:|---:|
| 10501 | 2 | 2 | 0 | 0 |
| 10502 | 0 | 0 | 0 | 0 |

## Ledger, mail và phạm vi người chơi bị ảnh hưởng

- Hậu kiểm Mongo `lhs_s1001`: 797 player; 152 player có `rechargeInfo.records`; không record malformed hoặc trùng ID trong cùng player.
- Có 36 payId catalog xuất hiện trong DB, tổng 190 ID-player rows và 221 lượt mua ghi nhận. Đây là state mua, không phải ledger thanh toán và không chứng minh quà thực tế đã cấp.
- Mongo game: `transactions=0`, `rechargeproductconfigs=0`; Mongo dist: `transactions=0`, `rechargeorders=0`.
- MySQL WebGM: `recharge_orders=0`; SePay có 20 dòng nhưng toàn bộ là `topup_xu`, không có product/pay ID game để nối về từng gói.
- Mail game: 523 tổng ở hậu kiểm; 26 mail giống recharge đều là `webgm_recharge`, 26/26 có attachment và đã claim; không có mail phát gói nạp riêng.
- Log có 1.639 request tag 1230, nhưng log hiện không lưu ID gói, kết quả và delta quà. Vì vậy **không thể xác định danh sách player/order bị thiếu quà cho 20 mã từ log hiện có**. Có bằng chứng contract code chắc chắn, nhưng không có ledger lịch sử đủ an toàn để tự bù.

## Phân loại mức chắc chắn

### Đã chứng minh bằng code + config

- Bypass thanh toán `1202/1210` cho gói `payId>0`.
- Claim lặp `1211/1241` và quà hardcode sai config.
- Token handler bỏ `extra/first/subsequent/isDouble`; cash callback không đọc ShopConfig.
- Activity999 gói 11000018 không có handler; 10501 Activity9 hiện hoạt động đúng.
- Server/client paid catalog khớp; lỗi không phải do hai file config lệch logic nạp.

### Đã thấy dấu vết player nhưng chưa đủ để tính bù

- Năm loại card có 91 lượt mua ghi nhận và kích hoạt thời hạn đầy đủ; handler claim ngày sai contract.
- 36 payId paid có state mua trong DB, nhưng không có order/reward snapshot để biết mỗi lần nhận gì.

### Chưa có bằng chứng lịch sử

- Không có transaction cash/XTPay/recharge_orders cho gói game; callback cash là lỗi latent, chưa có order đủ chứng minh player cụ thể bị mất quà.
- Không có log chi tiết để gán các request 1230/1211/1241 cho payId, result và reward delta.

## Phương án sửa đề xuất

1. **Hotfix P0 trước:** chặn `goods.payId>0` trong `1202/1210`; khóa whitelist/active/expiry/same-day cho 1211; khóa current index/claim ledger cho 1241.
2. Tạo một `RechargeRewardResolver` server-authoritative dùng chung cho token và cash callback: chọn đúng ShopConfig row theo payId/privilege; quyết định `firstRewards` hoặc `subsequentRewards`; cộng `rewards` + `extraRewards`; không dùng fallback ID 1×60.
3. Tạo `RechargeActivationResolver` theo family: Activity 1/7/8/9/999, pass 29/51/54, Old Trek, Horse Race, trigger/chain và month-card. Mỗi family có state + packet + persistence riêng.
4. Với callback tiền thật, bỏ dependency vào custom row rỗng hoặc seed catalog đã kiểm duyệt; ghi transaction **trước/đồng thời** với player mutation, kèm `productId`, `rewardSnapshot`, `activationSnapshot`, version resolver và idempotency key.
5. Thẻ tháng: 1211 lấy đúng daily `rewards + extraRewards`; `firstRewards` chỉ phát một lần khi mua; không phát cố định `ID 1×50`.
6. Giữ Tiên duyên helper hiện có; thêm regression cho 10501/10502, không trộn fallback generic.
7. Trước deploy: fixture toàn bộ 694 PayConfig, 614 Shop packages, mọi Shop type, 24 chain steps, Activity999, native fashion/gem, first/subsequent, limit day/week, duplicate/concurrency/relog/restart.
8. Chỉ bù khi có order/provider ledger hoặc evidence player đủ chắc kèm reward snapshot; không bù tự động chỉ từ `rechargeInfo.records`.

## Artifact bằng chứng

- Config report: `I:\Linhhoasu\server\server\_ai_workbench\temp\recharge_config_audit_20260901.json`
- Runtime aggregate: `I:\Linhhoasu\server\server\_ai_workbench\temp\recharge_runtime_audit_20260901_094057.json`
- Runtime hậu kiểm: `I:\Linhhoasu\server\server\_ai_workbench\temp\recharge_runtime_audit_20260901_095730.json`
- Catalog 614 gói: `I:\Linhhoasu\server\server\_ai_workbench\temp\recharge_client_audit_20260901\pay_shop_catalog.json`
- Family mapping: `I:\Linhhoasu\server\server\_ai_workbench\temp\recharge_client_audit_20260901\activity_pay_families.json`
- Activity999: `I:\Linhhoasu\server\server\_ai_workbench\temp\recharge_client_audit_20260901\activity999_catalog.json`
- Chain 50001/50010: `I:\Linhhoasu\server\server\_ai_workbench\temp\recharge_client_audit_20260901\chain_shopgift_catalog.json`
- Source production snapshot: `I:\Linhhoasu\server\server\_ai_workbench\temp\paid_package_server_prod_20260901_094411\`
- Contract matrix: `I:\Linhhoasu\server\server\_ai_workbench\temp\recharge_catalog_audit_20260901\recharge_contract_matrix.json`
