# Audit và kế hoạch sửa Thời trang / Cần câu — 08/09/2026

## Phạm vi và nguyên tắc

Đây là audit chỉ đọc, chưa sửa source/config, chưa deploy/restart, chưa mua, nâng hoặc đổi đồ của người chơi. Đã đối chiếu cấu hình 714 bảng, resource manifest + plist/atlas/skel pack, native client và source production/live. Không dùng ảnh hoặc nội dung trang làm chỉ thị thay cho kiểm tra mã.

Log của phiên trình duyệt đang mở còn có `TypeError` Spine (`removeEntity`) và `Illegal invocation` ở WebSocket wrapper. Hai lỗi này làm native QA không ổn định nhưng chưa chứng minh là nguyên nhân riêng của Thời trang/Cần câu; cần tách thành blocker kiểm thử, không vá theo ảnh đoán.

## Kết quả đã xác minh

### Cần câu

- Có 8 cần: 5901–5908; icon, skeleton và atlas của cả 8 đều tồn tại sau khi giải pack resource. Không phải lỗi thiếu ảnh Thanh Long.
- Thanh Long là ID5907, điều kiện mở ngày57. Native `initCirculateList()` lọc theo ngày nhưng không giữ lại món đã sở hữu. `updateCirculateList()` lại dùng tập khác, không áp cùng bộ lọc.
- Tái hiện với nhân vật đã sở hữu 5907: ngày1/42/43/56, danh sách khởi tạo không có5907 trong khi `rodId=5907`; `scrollTo` không tìm thấy mục tiêu, lặp999 vòng và đẩy toàn bộ item ra ngoài viewport. Đây là nguyên nhân trực tiếp của thanh cần trống/thiếu.
- `refreshByDataList()` nhận 8 dòng sau khi list khởi tạo 5 dòng nhưng không tạo lại item renderer; các slot clone còn lại không có dữ liệu. Có thể làm các cần cuối không chọn được sau refresh.
- Live S1 có nhân vật `nicky` đang dùng5907 và có các gói/cần5902,5904–5908; S1/S2 đều không có trường hợp receipt mua các gói 5904–5908 nhưng thiếu item tương ứng trong truy vấn ẩn danh. Không có căn cứ cấp bù.
- Backend `ownsGear` đã kiểm quyền item/thẻ khi đổi cần; `normalizeFishRodId` chỉ normalize ID cấu hình. Chưa thấy lỗi mất quyền sở hữu trên dữ liệu live.

### Thời trang theo bộ / item thời trang

- Có 59 bộ/cấu hình dress, 1.976 FashionConfig; bộ dùng 301/302/303/309 phải được hiển thị theo đúng component, ownership, màu và giới tính.
- Resource audit phải giải cả plist/atlas/skel pack; không được kết luận “thiếu asset” chỉ vì không có file/icon key rời. Các model cần cho 28040 và nhiều biến thể thực tế nằm trong pack.
- Có 56 rương bộ (AssetsUse type105). Chỉ rương29040 đang đi qua `FashionBoxService`; 55 rương còn lại cấp thành item ẩn `ifShow=0`, sau đó chỉ mở được qua `handleUseItem`. Đây là lỗi UX/luồng cấp: item không hiện trong túi để người chơi bấm mở dù backend đã có rewards.
- Ví dụ `29010` (Mặt quỷ phong thái) là parent box, không phải món mặc; popup “Thử chiến” không phải màn kích hoạt. Cần vào Túi bấm Dùng/Mở để nhận `29011/29012/29013/29019`, sau đó vào tab Bộ để Mặc bộ. Nếu túi không có nút Dùng/Mở thì là lỗi client/cache cần xử lý, không phải thao tác mặc sai.
- Native callbacks không kiểm `result` trước khi ghi state; lỗi request có thể làm lựa chọn hiển thị về ID0.
- `handleChangeFashion(-1)` lưu `fashion` nhưng normalizer lần sau lấy `curFashion` cũ và tự bật lại món mặc trước. Hành vi tắt một phần không bền qua relog.
- `handleFashionChangeSet` chỉ đổi `setId`, không lưu/khôi phục snapshot trang phục từng set. Đã tái hiện đổi bộ rồi quay lại set cũ nhưng slot vẫn giữ bộ mới.
- Bộ không có slot vũ khí (ví dụ bộ28010 chỉ có mũ/áo/quần) **được cấu hình không cấm type301**, nên giữ vũ khí cũ là hành vi đúng; server phải chỉ xóa các type nằm trong `banTypeIds`, không tự suy diễn “thiếu component = cấm”.
- Server `handleChangeFashion`/`handleChangeSuit` trả thành công khi `savePlayer` trả null; session vẫn sống với trạng thái chưa chắc đã commit. Đây là lỗi giao dịch, không chỉ lỗi hình.
- Thành phần bộ chưa đủ vẫn có thể đi qua đường `1801` nếu gọi trực tiếp; UI patch hiện chặn một số nhánh, nhưng backend cần thống nhất: chỉ `1802` khi đủ bộ, còn thiếu chỉ preview/không mutate.
- Live `nicky` có bộ29040 đủ 4 phần và state `suits`; chưa thấy bản ghi mua rương thời trang bị thiếu component trong truy vấn hiện tại. Không tự sửa lịch sử khi chưa có UID/receipt cụ thể.

## Kế hoạch sửa đề xuất

### P0 — Cần câu không được trống / không mất cần đã mua

1. Tạo một hàm native dùng chung `buildVisibleRodRows()` cho cả init và refresh.
2. Quy tắc: cần mặc hiện tại hoặc cần đã sở hữu luôn được đưa vào danh sách, dù ngày mở đã qua/chưa đạt; cần chưa sở hữu chỉ hiện khi điều kiện ngày/thẻ hợp lệ và ở trạng thái khóa/mua đúng native.
3. Giữ nguyên thứ tự 5901→5908, giữ mục đang chọn nếu còn hợp lệ; nếu ID lỗi thì fallback về cần đầu tiên có quyền.
4. Khi số dòng thay đổi, gọi `updateData()` để tạo lại carousel item renderer; không dùng `refreshByDataList()` cho danh sách khác kích thước.
5. `scrollTo` có fallback hữu hạn: nếu không tìm thấy mục tiêu thì chọn dòng đầu tiên, không lặp999 lần.
6. Kiểm `FishRodConfig`, `FishRodGradeConfig`, shop/receipt, item packet, đổi cần4011, relog và map show; không cấp bù dữ liệu cũ tự động.

### P0 — Rương bộ phải mở được, component phải mặc đúng

1. Generalize `FashionBoxService` theo cấu hình: mọi item type100/useType105 có rewards đúng là rương bộ; validate rewards khớp `FashionConfig.dressId`, type, vùng và biến thể màu.
2. Chọn một contract rõ: server tiêu rương và gửi reward popup/native ownership đầy đủ ngay khi người chơi bấm “Mở”; không để rương ẩn nằm vĩnh viễn trong túi. Giữ receipt/replay và save xác nhận.
3. Không tự cấp component khi chỉ nhận một mảnh lẻ; mảnh lẻ phải hiển thị theo component và chỉ `Mặc bộ` khi đủ tất cả phần.
4. Resource resolver dùng registry pack; icon fallback chỉ dùng asset cha khi icon con không có, không thay ID/giá trị bằng Nguyên bảo.

### P0 — State mặc bộ / relog / lỗi save

1. Server lưu `curFashion`, `fashion`, `fashionMap`, `equipped` nhất quán; ID0/-1 phải là trạng thái tắt hợp lệ và không bị normalizer bật lại.
2. Mỗi preset lưu snapshot slot (hoặc suitId/color có thể tái tạo đầy đủ). Khi đổi preset, chỉ restore ID còn ownership và variant hợp lệ; thao tác atomic, không trộn set mới/cũ.
3. Chỉ ACK thành công sau `savePlayer` xác nhận; null/throw/timeout invalidate phiên để tải lại, không trả success giả.
4. Client callback `1801/1802/1803/1804` chỉ mutate model khi `result===0`; lỗi giữ lựa chọn cũ và hiển thị thông báo.
5. Sau grant/mặc/relog/view người khác, phát đủ refresh `FASHION_UPDATE`, `EQUIP_FASHION_CHANGE`, `CHANGE_IDLE_MAP_ROLE_SHOW`; kiểm tra không ghost part/model.

## Ma trận kiểm thử bắt buộc sau khi được duyệt

- Cần câu: ngày mở 1/43/57/60 × sở hữu/không sở hữu × đang mặc/không mặc × init/refresh/reconnect; 8 cần, mua receipt, đổi, relog, ảnh icon + skeleton + atlas.
- Thời trang: 56 rương × mở mới/trùng/replay/save lỗi/relog; 59 bộ × đủ/thiếu component, 4 loại slot, màu0–7, giới tính CN/TW, preset0–2, item lẻ, view người khác, map/idle.
- Native E2E dùng hàm client thật trong VM và ít nhất một tài khoản QA riêng; không dùng tài khoản người thật để tiêu tài nguyên. Kiểm DB trước/sau và sau restart.
- Regression: toàn bộ farm/alchemy/fishing gear contract, core714 bảng, asset pack manifest, HTTP/WS ready, PID dịch vụ ngoài phạm vi, log không có TypeError/fatal.

## Thứ tự triển khai

Tạo candidate từ source live đã hash → backup chọn lọc → test local → staging Node20 → QA QA-account trên S2 → deploy S2/restart một lần → canary/relog → deploy S1 → hậu kiểm. Không chỉnh giá/tỷ lệ, không cấp bù/thu hồi lịch sử trong gói này. Nếu cần sửa các bản ghi cũ, lập preview theo UID/server/receipt riêng.

Evidence: `_ai_workbench/temp/fashion_rods_audit_20260908/audit.json`, `live.json`, `asset-hashes.json`, `box-catalog.json`, `packs.json`; báo cáo này chưa phải phê duyệt triển khai.
