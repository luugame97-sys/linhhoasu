# Audit rương/item mở trong túi — 14/10/2026

## Phạm vi và bằng chứng

- Đọc source/config hiện tại trên VPS `103.116.104.165`, sau đó chạy handler với player giả lập trong RAM.
- Catalog chính: 674 item có đường dùng/thưởng trung gian, 2.236 ca count/selection. Rà bổ sung tên Việt có 17 candidate ngoài nhóm chính (loại một mảnh thường bị regex bắt nhầm); 16 mã không có route mở, 100045 grant được nếu gọi trực tiếp nhưng bị ẩn. `productionWrites=0`, `networkAttempts=0`, `writeAttempts=0`; không dùng tài khoản người chơi và không gửi RPC thật.
- Đã kiểm tra process S1–S8: cùng source `/linhhoasu/lhs/newServer/src/app.js`, không override config binary, tất cả khởi động sau lần sửa `item.js`. Đây là bằng chứng phạm vi source đang dùng, không phải authenticated E2E.
- Source hash VPS lúc audit: `item.js` `931e22004b6d70d1e80f6f5c24a68bcbaaafc5d92d830a5b019e2d324b5838af`; `RandomUsableItemRewardService.js` `d59beb95a05936899f679b32cd3ed34825eea9788140e3423b7540d588b8cd0e`; `RewardGrantService.js` `2b86c938ee6fce6edbcec1e87ed9fd4d8290a9d6ae94116ad23b540bac889196`.

## Item trong ảnh

- ID `100802`, asset type `99`, icon `random_petsoul_02`, tên `Tinh linh nguyên tố Trân phẩm ngẫu nhiên`.
- Pool hợp lệ có trong resolver: item `268, 269, 270, 271, 272`, mỗi quả phẩm chất 6, `score=400`.
- Phần thưởng dự kiến: 1 rương → 1 quả Kim/Mộc/Thủy/Hỏa/Thổ ngẫu nhiên; mở 55 rương phải nhận tổng 55 quả (không phải 55 quả mỗi loại). Resolver hiện dùng chọn đều 5 loại, tương đương 20%/loại; đây là cách triển khai hiện tại, không khẳng định tỷ lệ gốc CN.
- `AssetsUseConfig[100802]` **không tồn tại trên server**. Addon client vẫn tự thêm type `102` ở `lhs-petsoul-fix-v1.js`, nên client hiển thị nút dùng.
- Fixture server count `1/3/55`: đều `result=0`, consume đúng `1/3/55`, trả `rewardInfo` rỗng, không có mã lỗi, không có item `268–272`. Đây là lỗi mất rương/mở ra không có gì.
- Resolver có thể tạo pool 268–272, nhưng handler hiện tại chỉ gọi resolver khi `useType===102`; item server thiếu `useCfg` nên rơi vào nhánh consume chung.

## Các rương type99 đang có nguy cơ bị trừ rỗng

Có **35 mã**, gồm 100802 và 34 mã sau, client có `useType=102` nhưng server không có `AssetsUseConfig`; fixture đều `result=0`, consume `1`, reward count `0`:

- `406, 408, 432, 434, 444, 446` (hộp nguyên liệu cố định);
- `100071–100073`, `100181–100184`, `100211–100213`, `100241–100243`, `100261–100263`;
- `100511–100513`;
- `100721–100729`.

Các item trên nằm trong addon/whitelist 95 mã của đợt 02/10, nhưng patch server tương ứng hiện không còn trong `item.js`; chỉ còn addon client. Đây là dấu hiệu rollback/drift cần xử lý trước khi cho người chơi mở.

Nhóm type99 visible nhưng không có cả server/client use config: `474–479`, `100050`, `100070`, `100130`, `100180`, `100210`, `100240`, `100260`, `100651–100653`. Chúng không có đường mở native bình thường; khi gọi trực tiếp generic `1300` trong fixture vẫn bị trừ rỗng. Một số vốn là thưởng auto-open, nên chưa gọi đây là lỗi người chơi bấm mở trong túi.

Nhóm type1 bổ sung cũng thiếu route mở: `90081–90085`, `100100`, `100161–100164`, `100186–100188`, `100191–100193`. Fixture gọi trực tiếp bị trừ rỗng. Không tính nhóm này vào 35 mã có đường mở client.

## Các rương không mở được nhưng đang fail-closed

Các type `102` sau trả `ITEM_REWARD_POOL_UNVERIFIED`, không consume item: `412, 413, 94301, 94401, 94416, 94418–94422, 94515, 94701, 94703, 94705, 94706, 94708, 94709, 94711, 94713, 94715, 94718, 94719, 94721, 94724–94726, 94729, 94801, 94802, 94902, 94904, 94908, 94911, 94923, 94926, 94929, 94932, 94935, 94938, 94941, 100020–100022, 100026, 100030–100032, 100036, 100040, 100060, 100139, 100160, 100170, 100185, 100190, 100200, 100230, 100250, 100641–100643, 101000, 101310`.

Tổng **63 mã ngẫu nhiên**. Guard hiện giữ lại item nên không thấy mất quà trong fixture.

Có thêm **3 rương tự chọn**: `90021/90022` không có lựa chọn hợp lệ nên trả `selection required`; `90151` chọn hàng 0 nhận `62×5`, nhưng chọn hàng 1 (Linh Trục `100721×2`) bị `ITEM_REWARD_POOL_UNVERIFIED`. Cả ba giữ rương khi lựa chọn thất bại. Như vậy có 65 mã không mở được và 1 mã lỗi một lựa chọn trong nhóm có route đã thử.

## Những nhóm đã mở được trong fixture

Các type `102` có pool/handler hiện hành trả thành công và có reward gồm: `94411–94415, 94417, 100010–100017, 100019, 100023–100025, 100033–100035, 100041–100044, 100061–100063, 100080–100086, 100110–100115, 100140–100146, 100171–100174, 100201–100203, 100231–100233, 100251–100253, 100501–100503, 100701–100709, 100810–100813`.

Các emoji `94702, 94704, 94707, 94712, 94716, 94720, 94722, 94727` cũng consume và phát packet emoji riêng; không dùng `rewardInfo.items` để đánh dấu rỗng.

Rương câu cá `94821–94825`: request thiếu `requestId/expectedRevision` bị `FISH_CLIENT_UPDATE_REQUIRED`; chạy lại đúng contract cho cả 5 mã đều nhận thưởng và trừ đúng 1. Không xếp chúng vào nhóm thiếu pool. Các hộp thời trang chạy transaction trong RAM thành công sau khi mock đủ `drainPendingSaves`; lỗi mock ở lượt đầu đã loại khỏi kết luận.

## Tồn kho thật (read-only, S1–S8)

Projection chỉ lấy những ID liên quan, không xuất danh tính và không ghi player:

- `100802`: S6 có 1 hồ sơ non-bot giữ 398 item; không khẳng định đây là tài khoản trong ảnh (ảnh có 55).
- `100073`: S1 có 2 item/2 hồ sơ; `100721`: S1/S3/S8 tổng 10 item/5 hồ sơ. Đây là nhóm có nguy cơ mất nếu mở.
- `100139` đang bị chặn: tổng 5.414 item trên 68 hồ sơ non-bot; `94802` tổng 6 item; `90151` S2 có 7 item.
- Số tồn chỉ chứng minh có item bị ảnh hưởng trong game, không chứng minh đã mất bao nhiêu trong quá khứ.

Evidence: `_ai_workbench/temp/chest_audit_20261014.json` (prefix `CHEST_AUDIT_RESULT=`), `_ai_workbench/temp/chest_runtime_20261014.json`; công cụ tái kiểm tra: `_ai_workbench/tools/audit_chests_20261014.js`, `_ai_workbench/tools/chest_runtime_readonly_20261014.js`.

## Giới hạn

Đây là source/config live + isolated handler fixture và aggregate kho hiện tại. Chưa mở bằng tài khoản QA thật, chưa đối soát lịch sử mất/phát bù và chưa sửa/deploy. Phạm vi là rương/túi quà trong kho cùng các wrapper phần thưởng; chưa nghiệm thu tất cả minigame mở ô/hộp event riêng bằng UI.
