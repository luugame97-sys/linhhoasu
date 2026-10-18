# Rà soát sâu luyện đan và linh điền — 07/09/2026

## Phạm vi và bằng chứng

- Chỉ đọc source hiện hành, client bundle, 714 bảng cấu hình và MongoDB aggregate ẩn danh S1/S2; không đọc UID/tên, không sửa DB, không deploy.
- Fixture chạy 67 ca, outbound network bị chặn (0 lần), productionWrites=0; ma trận 148/148 công thức đã kiểm tra cost/reward/cảnh giới và các nhánh auto. Đây không phải phép thử thống kê toàn bộ xác suất.
- Farm live có hash 0c810190 (local hiện là e3181f do các thay đổi không liên quan); alchemy live khớp bản vừa triển khai. Evidence: temp/farm_alchemy_audit_20260907/audit-live-source.json và live.json.

## Lỗi đã xác minh

### Luồng hạt, cây, thu hoạch và nhận thảo dược

1. Hạt 29/30/31 và mọi ID item hợp lệ không có mapping seed→plant đều rơi về cây rewardId=1. Hạt bị trừ nhưng cây, thời gian và phần thưởng sai; hạt 100 cũng rơi nhầm thay vì PlantMagicConfig.
2. Endpoint danh sách túi có thể trả dữ liệu cũ tối đa 3 giây vì item-list cache không bị xóa sau shop purchase. Packet delta 1202 vẫn được gửi đúng trong fixture; chưa kết luận đây luôn là lý do túi người chơi thật không đổi.
3. Giá UI và server lệch: shop 6000001 client hiển thị 10 Nguyên bảo, server dùng costAgain[0] và trừ 25.
4. Nhánh shop vẫn ACK thành công nếu savePlayer trả null; client ghi nhận mua dù trạng thái ghi chưa xác nhận.
5. Thu hoạch từng ô thường có thể nhận lặp. Sau ensureFarmInfo thay mảng block, reset xóa object cũ; fixture thu hoạch liên tiếp ô 0 cho 40 rồi 80 điểm linh thực.
6. Đường trộm trả rewardId của cây (ví dụ 38) thay vì rewards của PlantConfig (điểm linh thực 34); magic harvest chịu ảnh hưởng lỗi mapping ở mục 1.
7. Ô đã chín bị gieo đè vì server chỉ chặn khi finishTime còn ở tương lai; phần thưởng cũ mất.
8. Tăng tốc chấp nhận itemId không có trong plantFoodId và dùng fallback 300 giây; itemId=0 vẫn giảm thời gian không tốn vật phẩm.
9. Tăng tốc ruộng người khác luôn bị từ chối do server bắt targetDbid là chính mình, trong khi client có luồng dùng item 32 cho land khác.
10. Tag 2420 (đường gieo tháng, không phải nút gieo thường 2400) không kiểm hạt, không kiểm ô trống/chín và không trừ seed; fixture gieo không hạt/ghi đè cây đang chạy đều ACK 0. Cần xác nhận đây có còn được client hiện tại gọi hay chỉ là legacy RPC.
11. Lên cấp farm phát thêm item 33 nhưng không gửi delta item 33; client chỉ thấy sau login/refresh.
12. Quảng cáo id 1 cấu hình thưởng hạt 29 x3 nhưng handler luôn cấp EXP item 3; handler cũng không enforce số lượt hoặc cooldown.
13. Client giữ reservation hạt nếu RPC gieo bị từ chối: tăng cache trước request, chỉ hoàn lại khi success.

### Luồng luyện đan và đồng bộ client

14. ACK normal dùng result=failedCount; client bundle hiện diễn giải theo công thức success=requested-result, failed=result. Fixture native callback đạt, nên đây là giao thức khó đọc chứ chưa phải lỗi độc lập.
15. Endpoint normal 2500 vẫn nhận công thức auto-only subtype 3; packet ngoài client bypass ý định phân luồng.
16. Auto dừng ở 20 đan dù quyền lợi cho phép 22 vì craft không tính privilege vào output cap; đây là lỗi QoL.
17. Save kiểu commit rồi throw khiến DB có thể đã có đan nhưng session chưa cập nhật; timeout rồi gửi lại có nguy cơ lặp.
18. Alchemy level hỏng/out-of-range vẫn được giữ; bảng chỉ có level 1–60 nhưng client panel truy cập RoleConfig[level].name và có thể crash. Live có 1 nhân vật S1 level >60.
19. Giới hạn pill khi dùng trực tiếp (record âm -802/-804 và record item) không dùng cùng nguồn với craft auto, nên giới hạn/privilege có thể khác UI.

### Trộm, build, cache và đồng bộ liên người chơi

20. Tự trộm ruộng mình được ACK 0.
21. Thiếu chuột thì server tự tạo item 104 thay vì từ chối/thu phí.
22. count=0 có thể hủy trộm của người khác, không kiểm tra robber.
23. Ngưỡng bảo vệ 30% không áp dụng đúng; cây 12/40 vẫn cho trộm.
24. Hai session có thể cùng bắt một ô vì khóa chỉ theo người gọi, không theo target; save sau ghi đè save trước.
25. Handler cập nhật enemy/detail ruộng người khác có thể save full snapshot sau normalize, ghi đè item mua/luyện đồng thời. Handler 2408 hiện là read-only trong bản live; ca đã chứng minh là đường cập nhật enemy 2404, không phải mọi poll đều ghi.
26. Fight robber luôn trả win=1, không phụ thuộc lực chiến/đối thủ; đây là placeholder.
27. Build upgrade: UI cấp 1 hiển thị 30 giây, server đặt 300 giây (dùng thời gian cấp kế tiếp).
28. Build speedup: client tính 300 giây/vé, server chỉ giảm 60 giây/vé.
29. Build ad=1 không có receipt xác thực, packet giả có thể hoàn tất nâng cấp.
30. Build đã hết thời gian không settle trước khi mở lượt mới, nên cấp/chi phí có thể sai.
31. Trợ giúp build/fight ACK 0 nhưng không có hiệu ứng thực.
32. Log thu hoạch lưu được nhưng không push 2403, client giữ log cũ tới lần mở lại.
33. 2420 không push block 2401, client có thể giữ block cũ.
34. Mở ô magic sau level-up không có push block riêng, client chỉ biết ở poll/check sau.

## Quan sát live ẩn danh

- S1: 762 player thật, 12 lượt mua shop 6000003, tổng hạt 2101 còn 11, pill 110131 còn 1; block magic rewardId=1 là 687 và thường rewardId=1 là 231.
- S2: 136 player thật, không có lượt mua shop 6000003, hạt 2101=0, pill 110131=0; block magic rewardId=1 là 128 và thường rewardId=1 là 46.
- Đây là aggregate không định danh, chưa chứng minh tài khoản cụ thể mất đồ; cần UID/server/thời điểm để đối chiếu trước–sau.

## Ca đạt hoặc không phải lỗi

- Shop 6000003 trong fixture cấp đúng item 2101 và packet 1202 delta; lỗi cache/save-null là nhánh riêng.
- 148/148 công thức qua validation cost/reward; auto exchange dùng AssetsExchangeConfig và không tự cộng bạc. 9 ca PASS khác bao gồm nấu hai slot, harvest-all, magic regrow sau chờ, pill daily shared-record, permanent record/relog và callback build.
- Harvest-all, magic reset sau chờ, nấu hai slot và callback build cơ bản đạt.
- farm1.js không được import bởi route; drift là rủi ro bảo trì, chưa phải implementation runtime thứ hai.

## Chưa kết luận

- Mapping chính thức hạt 29/30/31 sang cây nào cần bảng/asset gốc, không đoán để sửa.
- Auto offline/land-card và packet 2426–2428 chưa có route concrete trong server.
- Chưa bù/thu hồi; cần UID và receipt giao dịch.

## Vị trí code chính để sửa sau khi duyệt

- `linhhoasu/lhs/newServer/src/handlers/farm.js`: seed resolver 130–174, farm normalize 806–893, harvest 1502–1573, trộm 1575–1702, tăng tốc 1839–1893, harvest-all 1895–1970, build 1998–2180, cook 2202–2294, cache/offline 2371–2490.
- `linhhoasu/lhs/newServer/src/handlers/alchemy.js`: `ensureAlchemyInfo` 13–27, mutation/persist 30–63.
- `linhhoasu/lhs/newServer/src/services/AlchemyCraftService.js`: toàn bộ resolver/cost/limit/output ở 22–75.
- `linhhoasu/lhs/newServer/src/handlers/item.js`: shop cache/list 788–820, shop purchase 875–1230, use item 1246–1550.
- Client đối chiếu: `linhhoasu/webgame/game/js/main.min_a6195824.js` (LandModel/AlchemyModel/ItemModel), `lhs-alchemy-v1.js` chỉ là guard callback, không sở hữu logic phần thưởng.

## Diễn giải đúng triệu chứng người chơi báo

- Chuỗi đúng phải là: gieo hạt 29/30/31 → nhận điểm linh thực 34 → mua thảo dược 2101/2102/... → sở hữu đan phương 120xxx → luyện ra đan dược 110xxx. Cấu hình hiện có `PlantConfig` 38/39/40 trả item 34, trong khi client gửi seed 29/30/31; server thiếu mapping nên chuỗi này đang đứt ở bước đầu.
- Thảo dược 2101 là item type 1, không nằm trong bộ lọc túi đan dược type 8. Nó phải xem ở túi chung/ô nguyên liệu của màn luyện đan, không phải danh sách “đan dược đã dùng”. Đây là khác biệt hiển thị cần kiểm lại trên tài khoản thật.
- Công thức 120101 có `succeed=10000`, nên một lượt hợp lệ phải cho một đan dược 110102/110103/...; công thức subtype 3 như 120131 có `succeed=4500`, nên thất bại 55% là theo cấu hình hiện tại. Khi thất bại, nguyên liệu và EXP vẫn tiêu nhưng không có đan dược; đây có thể là phần “luyện xong không ra đan” nếu người chơi đang dùng công thức auto subtype 3, không phải mất thưởng chắc chắn.
