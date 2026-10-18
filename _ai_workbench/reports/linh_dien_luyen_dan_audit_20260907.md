# Kiểm tra linh điền và luyện đan — 07/09/2026

## Cập nhật sau triển khai

Nhóm luyện đan đã sửa và phát hành S1/S2; xem session_report.md và alchemy_release_20260907.json.
Đính chính phần chẩn đoán tĩnh dưới: AssetsConfig type9 là đan phương, type8 là đan dược.
Do đó handler cũ còn cấp nhầm công thức thay vì sản phẩm. Cờ exchange là tự đổi thảo dược thiếu bằng Linh thực.
WebSocket đã có role lock và response replay cache, nên mục race phía dưới chỉ là giả thuyết cũ, không phải lỗi đã xác minh.
Phần ô huyền bí chưa sửa vì chưa đủ căn cứ chọn phân phối cây; farm1.js chỉ là file không active, bản thân tồn tại hai file không chứng minh lỗi runtime.

## Phạm vi

- Đọc `linhhoasu/lhs/newServer/src/handlers/farm.js`, `alchemy.js` và đăng ký route trong `handlers/index.js`.
- `farm.js` là implementation đang được route dùng; `farm1.js` không được import bởi `index.js`.
- Không sửa source, không ghi DB, không deploy/restart.

## Phát hiện

### P1 — Luyện đan chấp nhận công thức/item không hợp lệ và vẫn tăng lượt/EXP

`handleGenerate` và `handleAutoGenerate` chỉ lấy `params.id`, gọi `grantGenerateRewards`, rồi luôn tăng `dayCount`, EXP và tiến độ nhiệm vụ khi `realCount > 0`. `grantGenerateRewards` không trả lỗi nếu `AssetsConfig[id]` không tồn tại hoặc item không có `type === 9`; khi đó phần thưởng có thể rỗng nhưng server vẫn báo `result: 0` và tiêu quota/ngày.

Hệ quả: client có thể gửi ID bất kỳ để đốt quota và tăng EXP/nhiệm vụ mà không tạo đan dược; cần validate recipe trước khi mutate.

### P1 — Auto luyện đan có thể cấp bạc miễn phí qua cờ `exchange`

Trong `grantGenerateRewards`, mọi `exchangeFlag > 0` đều cộng `{id: 2, count: safeCount * 20}` mà không kiểm tra recipe, quyền đổi, giá nguyên liệu hay số vật phẩm đã trừ. Vì `handleAutoGenerate` nhận trực tiếp `params.exchange`, client có thể bật cờ này cho mọi ID hợp lệ/không hợp lệ để nhận bạc.

### P1 — Luyện đan không kiểm tra/trừ nguyên liệu đầu vào

Cả hai handler không đọc cấu hình cost/ingredient và không gọi kiểm tra tồn kho trước khi tăng số lượng. Nếu thiết kế yêu cầu nguyên liệu, đây là đường cấp đan dược/EXP chỉ bằng packet 2500/2501.

### P2 — Race khi gửi song song packet luyện đan

Hai request có thể cùng đọc `dayCount` trước khi `persistPlayer`; không có khóa/idempotency/counter compare-and-set ở handler. Cần test tải song song để xác nhận mức vượt quota và duplicate reward.

### P2 — Linh điền có đường reset ô huyền bí đáng ngờ

`resetBlockAfterHarvest` gọi `applyPlantOnBlock(farm, block.index, 100, now)` cho mọi ô `index >= 100`. Đây là seed ID cố định, trong khi `applyPlantOnBlock` resolve seed qua `PlantConfig/PlantMagicConfig`. Nếu ID 100 không phải seed huyền bí hợp lệ, ô sẽ không tự trồng lại hoặc có thể rơi vào fallback reward đầu tiên. Cần đối chiếu `PlantMagicConfig` thực tế và test harvest ô 100+.

### P2 — Dữ liệu/logic farm có hai implementation

`farm.js` và `farm1.js` đều chứa toàn bộ handler farm nhưng route hiện tại dùng `farm.js`. Hai file dễ lệch bản sửa; mọi kiểm thử hoặc fix nhầm `farm1.js` sẽ không tác động runtime.

## Kiểm chứng

- `node --check` đạt cho `farm.js`, `alchemy.js`, `index.js`.
- Đã xác nhận route: 2400–2425 trỏ `farm`, 2500–2501 trỏ `alchemy`.
- Chưa chạy DB/live account; các lỗi trên là kết luận tĩnh từ code và cần fixture/integration test trước khi sửa production.

## Đề xuất tiếp theo

1. Thêm resolver recipe duy nhất: ID phải tồn tại, đúng type, có cost; trả lỗi trước mọi mutate.
2. Tách quyền `exchange` thành rule server-side, kiểm tra và trừ cost thực tế; không tin cờ client.
3. Bọc mutate + quota bằng lock/atomic update hoặc transaction/idempotency key.
4. Đọc cấu hình magic field và test các ca trồng, thu hoạch, tăng tốc, trộm, ô 100+.
