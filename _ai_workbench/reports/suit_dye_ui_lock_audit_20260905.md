# Audit khóa hiển thị sau nhuộm màu — 05/09/2026

## 1. Tóm tắt công việc

- Xác định đúng bộ trong ảnh: `29030 – Cửu Thiên Phong Lôi`.
- Màu đang chọn/mặc là màu `2 – Thương Minh Thám Nhược`.
- Bốn component của màu 2: `80229031`, `80229032`, `80229033`, `80229039`.
- Chi phí nhuộm: item `118 × 40`.
- Audit Mongo production chỉ đọc và đã ẩn danh người chơi.
- Kết luận: server đã lưu đúng quyền sở hữu và trạng thái mặc; dấu khóa còn lại do client chưa nhận packet cập nhật Fashion ngay sau tag `1803`.

## 2. File/thư mục đã thay đổi

- Source game production/local: **không thay đổi**.
- Tool audit: `_ai_workbench/tools/audit_suit_dye_state_remote_20260905.js`.
- Runner: `_ai_workbench/tools/run_suit_dye_audit_20260905.py`.
- Fixture tái hiện: `_ai_workbench/tools/test_suit_dye_ui_sync_gap_20260905.js`.
- Evidence: `_ai_workbench/temp/suit_dye_audit_20260905_004953.json`.
- Hậu kiểm production: `_ai_workbench/temp/appearance_fix_postdeploy_20260905_005202.json`.

## 3. Lỗi đã gặp & giải pháp

| Lỗi | Nguyên nhân | Cách kiểm tra | Cách tránh lặp lại |
|---|---|---|---|
| Nhuộm xong popup cho mặc nhưng ô màu vẫn có khóa | `handleSuitColorUnlock` mở component trên server nhưng phản hồi chỉ có tag `1202` và `1803`, thiếu tag `1800` cập nhật `activateFashion` | Fixture: server owned=true, client snapshot owned=false, responseTags=`[1202,1803]` | Sau unlock phải push `1800` chứa `fashionData` và `activateFashion` |
| Client xác định màu bị khóa | `IsSuitActive(suitId,color)` yêu cầu đủ toàn bộ component trong `activateFashion` | Đối chiếu công thức client với bốn ID màu | Không chỉ dispatch event giao diện khi state model chưa được cập nhật |
| Có thể hiểu nhầm là mất vật phẩm | Nhân vật preview/mặc được nhưng model ownership trong phiên vẫn cũ | Audit Mongo và relog payload | Phân biệt state server với cache client |

## 4. Kỹ năng / kinh nghiệm mới

- Một màu thời trang không phải một flag đơn: client coi màu mở khi đủ toàn bộ Fashion component của biến thể.
- Tag `1803` chỉ xác nhận thao tác nhuộm; muốn UI hết khóa ngay cần thêm tag `1800` hoặc cập nhật trực tiếp `FashionModel.activateFashion`.
- Tag `1802` có thể mặc component đã lưu trên server, nhưng không tự bổ sung ownership vào model client.

## 5. Trạng thái hiện tại

- Production có đúng một người thật cấp 93 sở hữu suit `29030`; trạng thái đã ẩn danh.
- Người này sở hữu đủ màu `0`, `1`, `2`; không thiếu component, không có partial.
- Màu đang mặc là `2`; `suitColors[29030]=[1,2]`.
- Toàn S1: 1.769 player/609 người thật; số người có màu đã mở nhưng màu gốc vẫn khóa: `0`; số người partial component: `0`.
- Toàn S2: 581 player/1 người thật; hai loại lệch trên đều `0`.
- Fixture tái hiện chính xác: server mở màu thành công và trừ nguyên liệu, nhưng client chưa đổi trạng thái khóa cho tới relog.
- Hậu kiểm: 12/12 hash production đúng, S1/S2 ready 200, bot 580/580, runtime issue 0, log lỗi rỗng.

## 6. Bước tiếp theo

1. Workaround hiện tại: đóng hẳn game/trang rồi đăng nhập lại; màu 2 sẽ đọc lại đúng là đã mở.
2. Nếu người dùng yêu cầu sửa, thêm packet `1800` sau `1803` và `1804`, giữ nguyên packet chi phí và response gốc.
3. Test native: nhuộm → khóa biến mất ngay → mặc → đóng/mở panel → relog; đồng thời kiểm tra không trừ nguyên liệu lần hai.
