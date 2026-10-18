# Rương bộ chỉ xem, không mở — chẩn đoán và phương án sửa

## Kết luận đã kiểm chứng

Ảnh người dùng là `FashionInfoView` (Chi tiết thời trang/Thử chiến), không có thao tác sử dụng rương. Không phải người dùng thao tác sai. Lượt này chỉ kiểm tra và lập phương án; không sửa/deploy game hoặc dữ liệu người chơi.

Đã chạy hàm native thật trong VM cùng overlay livev5 và cấu hình hiện hành:

1. `ItemModel.getBagItems()` đưa rương vào túi với `isOwner=true, canUse=1`. Tuy nhiên `ItemIcon.onClickItem()` kiểm `type=100 && useType=105` trước nhánh ownership và chuyển thẳng `FashionInfoView`. Cờ canUse/chấm đỏ không tạo đường sử dụng.
2. Nếu ép qua `ItemTipsView`, nút Dùng hiện đúng và mở `ItemUseView`, nhưng **cả `ItemUseView.OnOpen()` lẫn `onClickUseBtn()` đều thiếu case105**. Màn không khởi tạo số lượng/rewards đúng và nút không gửi1300. Vì vậy sửa click riêng là chưa đủ.
3. Có59 item catalog type100/use105. **56 item đủ cấu hình** đều tái hiện hai lỗi trên:19bộ thường,32bộ liên động,2đổi màu,1áo tắm,2kết liễu. Gồm Mục Trần28350, Phượng28040, Mặc Nhiễm28340,29010/29040.
4. **3 item thiếu cấu hình:**28370 Viêm Đế Tiêu Viêm,28380 Võ Tổ Lâm Động,28410(tên chưa có bản dịch). Có AssetsUse rewards nhưng thiếu FashionDressConfig và toàn bộ FashionConfig của4mảnh. `FashionBoxService.isBox()` không nhận, generic handler1300 vẫn tiêu rương/ACK0/cộng4item ẩn, không grant fashion. Đã tái hiện bằng RAM/network-block; không thực hiện trên người thật.

Source main/overlay/index:3hash khớp live;9table hash trước khi overlay sửa view config đều khớp live. Test cũ PASS canUse và gọi backend trực tiếp **không chứng minh click mở được**. Lượt trước hướng dẫn người dùng vào Túi bấm Dùng chưa đầy đủ; không tiếp tục coi reload là cách chữa lỗi này.

Tool/evidence: `tools/audit_fashion_box_click_20260909.js`, `temp/muchen_activation_20260909/click-audit.json`. Đây là native VM + handler RAM, chưa phải nghiệm thu click/render browser thật. ProductionWrites/networkAttempts=0 trong fixture.

## Phương án sửa đầy đủ, giữ logic đã thống nhất

### 1. Phân loại và giữ nguyên quyền sử dụng

- Phân biệt rương đủ cấu hình, rương thiếu cấu hình, component mặc, và item lựa chọn/ngẫu nhiên.
- Chỉ mở rương có mapping fixed rewards khớp biến thể gốc và các FashionConfig hợp lệ. Không đổi type105 thành102/101 để lách UI.
- Không auto-open khi nhận thư, login, bấm icon hay xem preview; mở phải là hành động xác nhận riêng. Không ép mặc sau mở.

### 2. Sửa đường bấm và màn mở cùng nhau

- Rương trong Túi (`isOwner=true`, còn số lượng) → `ItemTipsView` có **Mở rương** và **Xem trước**. Preview ở shop/phần thưởng/thư chưa nhận tiếp tục chỉ xem, kể cả tài khoản đang có cùng ID.
- Thêm nhánh105 riêng trong `ItemUseView.OnOpen`: bố cục rương fixed, liệt kê đúng3/4phần theo config, số lượng hiện có, mặc định mở1. Reset đầy đủ state khi tái dùng view; không cho chọn từng phần như rương tự chọn.
- Nhánh105 của `onClickUseBtn` kiểm số lượng mới nhất/conditions/config; chỉ khi người dùng xác nhận mới gọi1300 với itemID và số lượng hợp lệ. Khóa nút khi chờ phản hồi.
- Giữ nút Thử chiến của preview; không biến nó thành nút mở hoặc cấp đồ. Sau mở thành công cho đường dẫn tới Ngoại quan/Bộ; việc Mặc vẫn đi1802 khi đủ quyền.

### 3. Hoàn tất ACK/error/replay và đồng bộ

- Nhánh105 phải có callback kết thúc rõ: chỉ đóng/báo thành công khi server xác nhận; lỗi giữ đồ và trả lại trạng thái UI. Bọc hiện tại `Rpc.received` return khi lỗi/replay cần được xét cùng pending state để không khóa nút vĩnh viễn.
- Một ý định mở dùng một requestId epoch; retry của cùng ý định không tạo ID mới và không trừ/cấp trùng. Timeout/đứt kết nối mơ hồ thì đối chiếu lại túi/ownership trước mở tiếp, không tự lặp lệnh.
- Dùng số lượng tuyệt đối từ1202.changed và ownership1800;1300 xác nhận kết quả. Refresh túi, chấm đỏ và danh sách bộ; không tự set activateFashion hoặc dress.star0 khi chưa có dữ liệu server. Mục Trần base0 được client suy từ đủ4parts.
- Giữ luật mặcv5: bộ thường được phối lẻ; bộ1/2/4 mặc qua bộ; suối nóng giữ luồng riêng. Rương trùng đổi theo swaps hiện hành, không tự đặt bù/giá.

### 4. Chặn rương thiếu cấu hình phía server trước trừ đồ

- Nhận diện mọi item có dấu hiệu rương bộ100/105 trước khi rơi vào generic handler. Validate mapping cha/con, type và số lượng; sai/thiếu thì trả mã lỗi rõ và **giữ nguyên rương**.
- Với28370/28380/28410, client báo chưa hỗ trợ, không dẫn vào preview lỗi hoặc mở. Kiểm tra catalog gửi/GM và đánh dấu chưa hỗ trợ để tránh phát sinh thêm; không tự xóa mail/vật phẩm đã cấp.
- Chỉ bổ sung các bộ này khi có dữ liệu bộ/component/appearance/skill/asset tương ứng đã đối chiếu; không suy cấu hình từ tên hay ID liền kề.

### 5. Xử lý đồ đã nhận

- 56loại rương hợp lệ còn trong túi: sau sửa người chơi tự mở chính rương hiện có, không cần gửi lại/migration.
- Nếu có hồ sơ từng dùng3rương thiếu dữ liệu: lập preview theo receipt/mail/inventory, tránh nhầm quà trùng hoặc đồ đã nhận qua nguồn khác. Mọi khôi phục/cấp bù phải được duyệt riêng, có preimage và receipt chống lặp; không repair hàng loạt trong bản UI.

## Tiêu chí nghiệm thu trước phát hành

- **59item:**56rương mở được từ click thật,3rương thiếu dữ liệu bị chặn và count không đổi. Không chỉ gọi handler hoặc kiểm canUse.
- Kiểm chuỗi nhận→túi→click→preview/mở→chọn số lượng→xác nhận→1300→1202/1800→bộ active→mặc→relog. Thư/GM/giftcode/shop dùng QA riêng; không tiêu tài nguyên người chơi.
- Chưa có/có một phần/đủ bộ; số lượng1/nhiều/0/âm/vượt tồn; lặp click; save lỗi/timeout/retry/replay; packet chậm; mở xong hết rương; view tái dùng với item khác; preview không phát mutation.
- Hồi quy rương tự chọn/ngẫu nhiên/đan/danh hiệu, mảnh lẻ, màu/nâng sao, preset/suối nóng và patch đánh xa. Không phát sinh sở hữu giả, trừ/cấp hai lần, nút kẹt hoặc đổi luật phối đồ.
- Browser Egret thật bắt buộc: Mục Trần và đại diện đủ5loại bộ; mobile portrait có nút mở nhìn thấy/bấm được, đóng/mở lại không giữ state cũ. Backend/VM phủ56ID và trường hợp lỗi.

## Phạm vi phát hành khi được duyệt

Ưu tiên mở rộng overlay ngoại quan hiện có, không refactor bundle/engine. Server chỉ thêm validation/fail-closed rương bộ và dùng transaction/save/receipt sẵn. Snapshot/backup/CAS trước sửa; test local +Linux staging +browserQA; backend guard lênS2 rồiS1 trước, chỉ restart process backend cần thiết. Client dùng chungS1/S2 nên thử candidate riêng trước khi thay manifest chung. Tăng token cache, hậu kiểm hash/health/log và có rollback source; không rollback DB. Patch đánh xa và các thay đổi khác giữ nguyên.

**Cập nhật 09/09/2026:** đã phát hành S1/S2; local/Linux staging, browser QA và WebSocket/relog QA hai server PASS. Xem [báo cáo bản sửa](fashion_box_open_fix_20260909.md) để biết kết quả, giới hạn và phần còn lại.
