# Hoàn thiện rương đang hiển thị — 14/10/2026

## Kết quả triển khai

Đã triển khai server và client cho **28 mã**: 26 rương random thiếu contract và 2 rương chọn mảnh tinh linh rỗng. Server S1–S8 đã restart tuần tự, readiness Mongo/Redis 8/8 đạt. Không gửi RPC dùng vật phẩm trên tài khoản thật, không ghi player trong fixture.

| Mã | Phần thưởng / cách mở |
|---|---|
| 474–479 | Một phù Giám bảo từ `BidKingItemConfig`, theo phẩm chất 7/6/4/3/2/1 tương ứng; vật phẩm type51 vào kho item để hệ thống Giám bảo sử dụng. |
| 100050, 100070 | Thần binh / Hồn Thần binh từ `ArtifactConfig` type1/type2, quality4, cùng phương án tương thích 100040/100060. |
| 100100 | Một mảnh Võ hồn `100101–100105`; giữ luồng ghép mảnh sẵn có. |
| 100161–100164 | Một mảnh Bí bảo theo phẩm chất 3/4/6/7 từ `CuriosConfig.pieceID`. |
| 100180, 100210 | Bí bảo quality4 thuộc materialType1/2. |
| 100186–100188, 100191–100193 | Mảnh Bí bảo materialType1/2, đúng phẩm chất 3/4/6. |
| 100240, 100260 | Bí bảo quality4 từ catalog hiện hành. |
| 100651–100653 | Vật liệu Gia viên theo `HomelandBuildngResourceConfig`, thời lượng 30 phút / 2 giờ / 8 giờ và cấp công trình; cùng resolver 100641–100643. |
| 90021, 90022 | Giữ cơ chế tự chọn, mỗi rương chọn một trong 10 mảnh tinh linh quality4 đang có; không chuyển thành random. |

Đối chiếu các bảng config của bộ client Trung đang lưu trong dự án và runtime hiện hành. Không có catalog tinh linh quality2/3 hoặc các pool quality5 tương ứng để port nguyên trạng; dùng quality4 theo phương án tương thích đã áp dụng ở lượt trước. Random đồng xác suất trong pool; **không tuyên bố là loot weight backend Trung chính thức**.

## Thay đổi chính

- `linhhoasu/lhs/newServer/src/services/RandomUsableItemRewardService.js`: thêm 26 định nghĩa, pool Giám bảo/Võ hồn, xác thực metadata cho wrapper thiếu use config; tổng 89 định nghĩa custom. Thêm resolver lựa chọn cho 90021/90022.
- `linhhoasu/lhs/newServer/src/handlers/item.js`: kiểm tra lựa chọn trên resolver tương ứng trước khi trừ rương; lựa chọn thiếu/sai vẫn giữ nguyên item.
- `linhhoasu/webgame/game/js/lhs-select-legacy-boxes-v1.js`: bổ sung useType102 cho đúng 26 mã và danh sách type101 cho hai mã chọn; giữ các điều kiện hiện có, không mở nút dùng cho nguyên liệu.
- Index production sửa trực tiếp trên preimage đã kiểm hash; không ghi đè bằng index local đang khác production. Marker cuối: `20261014_legacy_boxes_v2`.

## Kiểm chứng

- Syntax server/client PASS.
- Pre-swap và post-live server fixture: **271 ca random/count + 4 ca lựa chọn PASS**. 89 mã × count1/3/55, bốn count sai; networkAttempts/writeAttempts=0, save được stub trong RAM.
- Fixture client dùng config client thật: đủ **26 route random**, **10 lựa chọn/mã**; thứ tự lựa chọn client/server khớp. **30 ca lựa chọn PASS**: từng lựa chọn count3 và thiếu/sai index/sai tổng/âm/lẻ không trừ item, không save. Kiểm tra cài addon lặp không tạo trùng.
- Audit server hiện hành: **692 candidate, 2.254 ca, emptyItems=0, failedItems=113**. Cả 28 mã vừa sửa đều thành công. Bài audit này không phải gameplay WebSocket/native E2E và phần client của nó chưa nạp addon mới; contract client được kiểm riêng ở fixture trên.
- Sáu candidate đang visible bị từ chối khi dùng trực tiếp là **90081–90085 và 164502**. Đây là mảnh/nguyên liệu dùng ghép/đổi, không phải rương cần random hóa. Tên chứa “tự chọn” khiến bộ lọc audit gom nhầm.
- 107 candidate hidden còn lại gồm 102 mã internal/event/auto-open chưa có generic use contract và năm rương câu cá 94821–94825 cần requestId/expectedRevision. Không tự mở các mã nội bộ hoặc bỏ contract câu cá; chưa thể tuyên bố mọi mã ẩn đều hoàn chỉnh.
- SHA256 trên filesystem và HTTPS khớp cho addon/index; không đổi hoặc restart process ngoài game S1–S8.

## Backup, hash và bằng chứng

- Server + index trước lần đầu: `/linhhoasu/_ai_workbench/backups/remaining_boxes_20261014_213404`.
- Client trước bản cuối: `/linhhoasu/_ai_workbench/backups/remaining_boxes_client_20261014_144426`.
- Index preimage bị thiếu ở helper lần đầu đã được tái dựng bằng cách gỡ đúng một dòng thêm mới và xác nhận SHA256 chính xác `58c0b214…`; đã lưu vào backup lần đầu. Helper đã bổ sung kiểm backup index trước swap.
- Hash cuối: item.js `83c15ec7faeaaf5c644ef5aa9c4eb5d311641ee6acc7afba931d83a977523c71`; resolver `43ebf0d84fe658a6727d60a674aafd03390561f1e1bdef5cfb2bbe37f3e501a2`; addon `0f075b423953f2815b25e19fda8c7463b0f70376976b1bd205eb9a97dd87e148`; index `14221c82f6285e42c789c8e5059ca734a49b303f065a5301d6e3278aed65d961`.
- Receipt: `_ai_workbench/temp/remaining_boxes_20261014/deployment.json` và `client_deployment.json`; audit `_ai_workbench/temp/chest_audit_20261014_postdeploy2.txt`.
- `productionWrites:0` trong receipt server cũ chỉ mô tả fixture/player writes; lượt triển khai thực tế đã thay file và restart 8 node. Helper đã đổi tên trường thành `playerWrites` để tránh hiểu nhầm.

## Còn thiếu

Chưa kiểm native E2E trên tài khoản thật: popup, icon render, mở rương và relog để đọc tồn kho lưu DB. Người chơi cần tải lại toàn bộ game để nhận addon mới. Không bù vật phẩm lịch sử hoặc đổi logic event ẩn. Giữ backup và evidence của đợt sửa để rollback; không xóa file cũ của dự án.
