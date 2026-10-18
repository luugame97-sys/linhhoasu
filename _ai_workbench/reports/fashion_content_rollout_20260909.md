# Kế hoạch và triển khai cập nhật toàn bộ thời trang — 09/09/2026

**Trạng thái: DEPLOYED trên S2 rồi S1; hậu kiểm QA hai server PASS.**

## Phạm vi đã thực hiện

- Sửa BattleService: chỉ cộng thuộc tính của bộ khi người chơi thật sự sở hữu ít nhất một phần tương ứng; bộ mới không còn làm tăng chỉ số trước khi cấp.
- Sửa tag 1812: chỉ cho đổi chủ đề giao diện type107 khi đã sở hữu; ID lạ bị từ chối trước khi save; đồng bộ `fashionInfo.mainPanel`.
- Sửa rương bộ: validator nhận 28410 với 4 phần thời trang + slot306 `28416` là hiệu ứng vào trận. Không suy thêm phần thưởng ngoài cấu hình.
- Sửa nhánh màu đặc biệt 28340: `color=100..104` dùng `spFashionIds` CN và kiểm ownership riêng.
- Sửa áo tắm: cấp biến thể gốc color0 theo cost cấu hình, gồm 29820 `456×30`; vẫn mặc qua preset 999.
- Thêm cấu hình overlay có phạm vi: 6 bộ mới, 102 dòng FashionConfig mới, các bảng Fashion liên quan, appearance/skill/effect cần cho nội dung và `planPart` slot306. Baseline các hệ thống khác vẫn giữ nguyên.
- Thêm 78 tên Việt vào client content patch; tên bộ/mảnh/hiệu ứng dùng cách gọi nhất quán với UI hiện hành. Các tên dịch làm việc nằm trong `gm-fashion-catalog.json`; cần biên tập viên duyệt câu chữ marketing nếu muốn đổi phong cách.
- Thêm item ID mới vào WebGM `configMap,json`, gồm rương, mảnh, 25 ngoại quan lẻ, hiệu ứng28416 và bộ29820. Admin autocomplete `/api/admin/item-configs` đọc map này sau restart.
- Sau khi kiểm tra ảnh WebGM, phát hiện autocomplete thực tế gọi `/api/admin/item-dictionaries` (Mongo) chứ không gọi `/api/admin/item-configs`. Đã bổ sung fallback endpoint từ `configMap` cho truy vấn keyword, backup `HTTPServer.before`, restart lại S2/S1. Map live hiện có 29.751 entries và đủ toàn bộ ID mới; endpoint sẽ trả tên khi tìm bằng ID dù chưa có Mongo dictionary row.
- Trang GM PHP cũ dùng catalog riêng `webgame/gm/assets/item/gmitem.txt`; đã bổ sung 31 ID còn thiếu vào file này, backup `gmitem.before`, và kiểm tra trực tiếp bằng PHP: catalog live **7.412 item**, `28310/28370/29820` trả đúng tên. Nếu trình duyệt vẫn thấy danh sách 7.383 item thì đó là HTML/iframe cũ; đóng cổng WebGM, mở lại hoặc Ctrl+F5.

## Nội dung Trung đã cập nhật

- 28310 Trần Diệu Thương Khung
- 28370 Viêm Đế Tiêu Viêm
- 28380 Võ Tổ Lâm Động
- 28410 Tinh La Trùng Ảnh
- 29280 Phi Tuyết Yên Mặc
- 29820 Thương Lan Vân Mộng
- 25 ngoại quan lẻ mới và nhánh special màu 28340 đã có trong catalog/inventory.

## Kế hoạch triển khai đã thực hiện

1. Chốt source CN hiện hành, so sánh 13 bảng Fashion và tạo overlay candidate.
2. Sửa contract server trước khi nhập content; test RAM với network/productionWrites bằng 0.
3. Kiểm resource manifest/pack, SHA/CRC và dựng candidate 413 file.
4. Stage VPS, backup/CAS, cập nhật backend/config/catalog, restart S2 rồi S1.
5. Cài resource/manifest/client patch, restart lại backend để nạp overlay.
6. QA WebSocket trên S2 và S1, kiểm hash/health/process và dọn hồ sơ test.

## Kiểm chứng

- Candidate fixture: 6 bộ mới mở/mặc được; 28410 có `28416`; 28340 special color100–104; 29810/29820 áo tắm color0; 25 item lẻ; invalid main panel bị từ chối; ownership attrs không rò. Network/productionWrites = 0.
- Local regression: core 714 bảng PASS; nghiệp vụ fashion 15 PASS; native gear 8 nhóm/216 ca PASS; tab 192 ca PASS.
- Production WebSocket S2 và S1: mở `[28350, 28370, 28380, 28410, 28340, 29800, 28320]`, mặc bộ, special color, opening effect, bathrobe, main panel, replay và relog đều PASS.
- Hai profile/mail QA đã xóa; `playerDataWrites=0`. S1/S2 ready `8080/8083=200`; process online; hash cả 413 target khớp candidate sau rollout.
- WebGM catalog đã thêm 29820 sau bước kiểm cuối; hash catalog cuối `1f2fcb823455b12a024540f75b40561ca31d85fac38f12d0a187011f3324062f`.

## Rollback và giới hạn

- Manifest: `_ai_workbench/temp/fashion_cn_recovery_20260909/content-release.json`, trạng thái `DEPLOYED`, 413 target.
- Backup VPS: `/linhhoasu/_ai_workbench/backups/fashion_content_20260909_052356`; backup catalog bổ sung nằm trong cùng thư mục.
- Tool: `tools/release_fashion_content_20260909.py` có `verify`, `resume`, `rollback`; rollback theo CAS/hash, không đụng DB/player.
- Lượt đầu bị dừng ở resource do thiếu parent directory; đã hoàn tác 145 mục, xác nhận baseline sạch rồi rollout lại bằng batch CAS. Đây là lý do có nhiều lượt restart hơn kế hoạch ban đầu; không có dữ liệu người chơi bị sửa.
- Đã nhập các SkillEffect khác CN cần cho nội dung; chưa tuyên bố cân bằng combat Trung–Việt tương đương. Các thay đổi effect/số liệu cần một đợt balance QA riêng nếu muốn parity tuyệt đối.
- Client resource render toàn bộ GPU/thiết bị chưa được nghiệm thu; người chơi cần tải lại game để nhận manifest/resource mới.
- WebGM đang mở tab cũ có thể giữ state/cache cũ. Hãy reload cổng WebGM, mở lại **Trạm GM bơm đồ**, rồi gõ ID; fallback mới chỉ chạy từ phiên HTTPServer sau lần restart vừa rồi.

## Artifact chính

- [Báo cáo kiểm kê nguồn Trung](fashion_system_update_audit_20260909.md)
- [Manifest rollout](../temp/fashion_cn_recovery_20260909/content-release.json)
- [Overlay config](../temp/fashion_cn_recovery_20260909/fashion-overlay.json)
- [Inventory thời trang](../temp/fashion_cn_recovery_20260909/fashion-inventory.json)
- [Resource audit](../temp/fashion_cn_recovery_20260909/resource-audit.json)
- [QA fixture production](../temp/fashion_cn_recovery_20260909/compat-fixture.json)
