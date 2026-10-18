# Fix 63 rương chưa có loot contract — 14/10/2026

## Kết quả

- Đã triển khai resolver cho đúng 63 mã type 102 trước đây mở bị trừ nhưng không có phần thưởng.
- Luồng cũ vẫn được giữ: kiểm tra metadata `AssetsConfig`/`AssetsUseConfig`, dựng reward plan trước khi consume, sau đó dùng `RewardGrantService` và native handler hiện có.
- Phân phối trong các pool tự chế là đồng xác suất giữa các lựa chọn. Đây là logic tương thích được dựng từ icon, mô tả CN và catalog runtime hiện tại; không tuyên bố là trọng số backend Trung chính thức.

## Nhóm logic

- Rương tiền/vật phẩm/title: chọn một mức hoặc một phần thưởng từ các ID hiện có.
- Linh/Elf, Artifact, Orb, Curios: lấy pool động từ `ElfConfig`, `ArtifactConfig`, `OrbConfig`, `CuriosConfig`; phần thưởng native đi qua handler ownership hiện tại.
- Mảnh Curios `94902, 94904, 94908, 94911, 94923, 94926, 94929, 94932, 94935, 94938, 94941`: dùng đúng nhóm 4 piece liên tiếp theo suffix/icon.
- Homeland `100641/100642/100643`: chọn một trong bốn building resource, tính theo config 5 phút và nhân lần lượt 30 phút/2 giờ/8 giờ; không khởi tạo hay ghi `homelandInfo` trong lúc lập plan.
- Boss `101000`: Long Lân `92x20`, Spirit aura `94x200`, thêm mảnh huyết mạch và 10% cơ hội mảnh phẩm chất cao. Tỷ lệ 10% là compatibility choice do không có bảng tỷ lệ gốc.

## Fallback đã ghi nhận

- Catalog hiện không có Elf quality 2/3/5 và Artifact quality 5. Các rương tương ứng dùng pool quality 4 gần nhất; quality 6 dùng pool quality 6.
- Rương Curios shop dùng Curios quality 4 gần nhất; các rương mảnh Curios có nhóm piece quality 7 theo icon.
- Hộp `100139` và phần huyết mạch boss dùng wrapper `random_bloodlinePiece_03/05` để tiếp tục native bloodline grant, không để lại wrapper rỗng.

## Kiểm chứng và triển khai

- Fixture cô lập chạy pre-swap và post-live: **193/193 PASS** = 63 mã × count `1/3/55` + 4 count sai (`0/-1/1.5/10001`).
- Fixture chặn socket/file write: `networkAttempts=0`, `writeAttempts=0`; không dùng player thật và không ghi DB.
- `node --check` PASS cho `item.js` và `RandomUsableItemRewardService.js`.
- Backup: `/linhhoasu/_ai_workbench/backups/custom_boxes_20261014_182950`.
- Receipt: `_ai_workbench/temp/custom_boxes_20261014/deployment.json`.
- Restart tuần tự `lhs-s1001` đến `lhs-s1008`; cả 8 `/ready` đạt Mongo/Redis `true`; process ngoài phạm vi không đổi.

## Còn thiếu

- Chưa mở native E2E bằng tài khoản người chơi thật; cần người dùng thử từng nhóm rương trong client để xác nhận popup hiển thị đúng.
- Các rương câu cá `94821–94825` không nằm trong 63 mã này vì dùng contract receipt/revision riêng.
