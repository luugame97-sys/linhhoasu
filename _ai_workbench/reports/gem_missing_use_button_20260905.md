# Item Hồn ngọc cấp 5 không có nút sử dụng

## 1. Tóm tắt công việc

- Chẩn đoán ảnh người dùng, đối chiếu config/client và đọc tồn kho MongoDB; không sửa source hoặc dữ liệu game.
- Xác nhận lúc 08:11:33 UTC: nhân vật nicky ở S1 đang có **100095 ×30**, không có 100085 trong projection tồn kho. Nhân vật đã lên cấp110 tại thời điểm đọc; ảnh là thời điểm trước đó.

## 2. File/thư mục đã thay đổi

- Tool read-only: `_ai_workbench/tools/check_nicky_gem_item_20260905.py`.
- Evidence: `_ai_workbench/temp/nicky_gem_item_diagnosis_20260905.json`.
- Báo cáo MD/HTML này và cập nhật session_report.md/.html. Không sửa game/DB, không consume hoặc restart.

## 3. Lỗi đã gặp & giải pháp

| Item | Cấu hình | Kết quả |
|---|---|---|
|100085|type1,useType102,có AssetsUseConfig|Rương usable, có nút sử dụng|
|100095|type99,param1075,không useType,không AssetsUseConfig|Placeholder thưởng cấp5, không có nút sử dụng|

Hai ID trùng tên/icon. Ảnh có mô tả ngắn “Nhận ngẫu nhiên 1 hồn ngọc cấp 5” đúng100095;100085 có thêm câu dùng trong túi. Client chỉ cho sử dụng khi có cấu hình useType/AssetsUseConfig.

100095 phải được chuyển thành Hồn ngọc native khi cấp thưởng. Bản router mới xử lý các lần cấp qua router đã sửa, không tự chuyển placeholder đã tồn tại trong bag. Chưa xác định30 cái này được nhận trước deploy hay từ một luồng hiện vẫn bỏ qua router; không quy nguyên nhân lịch sử khi chưa có receipt.

## 4. Kỹ năng / kinh nghiệm mới

- Không nhận diện item chỉ bằng tên/icon. Phải đối chiếu ID và mô tả/loại/config sử dụng.
- Fix cấp mới không tự repair inventory cũ; kiểm test phải phân biệt hai đối tượng.

## 5. Trạng thái hiện tại

- Đã chứng minh nguyên nhân không có nút:100095 không phải rươngusable100085. Đây không phải do thiếu cấp/VIP hay lỗi nút.
-30 item giữ nguyên. Không thêm nút bằng client hoặc bù tự động.

## 6. Bước tiếp theo

- Đối chiếu nguồn phát100095 và quyền sở hữu native; sửa luồng còn bypass router nếu có.
- Chuyển/resolve đúng30placeholder theo preview được duyệt, hoặc thống nhất đổi1:1 sang100085; bảo đảm không phát hai lần. Chưa áp dụng trong phiên chẩn đoán này.
