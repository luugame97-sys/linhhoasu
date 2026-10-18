# Đối chiếu thiết kế auto câu nền — 07/09/2026

## 1. Tóm tắt công việc

Người dùng hỏi hành vi vừa train quái vừa auto câu có đúng logic game không. Tiếp tục chẩn đoán, không thay đổi source hoặc hành vi.

Kết luận có giới hạn: **theo bản client trong gói server.zip được bàn giao và bản client Trung tham chiếu đã lưu, auto vẫn chạy sau khi đóng màn câu là cơ chế có chủ ý**. Đây không phải hành vi được thêm bởi bản sửa auto theo lực chiến hoặc sửa hiển thị số lượng gần đây. Không có căn cứ từ kiểm tra này để kết luận toàn bộ gameplay/server chính thức giống hoàn toàn.

Về giao diện, nút quay lại dễ làm người chơi hiểu thành dừng câu trong khi Đùi Gà vẫn bị dùng. Đây là điểm cần làm rõ trải nghiệm. Đề xuất giữ cơ chế gốc và thêm trạng thái “Đang auto câu” cùng nút dừng ở map ngoài nếu được yêu cầu triển khai. Tự động tắt khi đóng màn câu là thay đổi luật vận hành, không nên tự coi là fix bắt buộc.

## 2. File/thư mục đã thay đổi

- Tool hỗ trợ mới: `_ai_workbench/tools/compare_fishing_background_design_20260907.js`.
- Bằng chứng: `_ai_workbench/temp/fishing_background_design_20260907/comparison.json`.
- Báo cáo này và bản HTML; cập nhật `_ai_workbench/reports/session_report.md/.html`.
- Backup báo cáo: `_ai_workbench/backups/fishing_background_design_reports_20260907/`.
- Không sửa gói server.zip, client Trung, source game, config, DB hoặc tiến trình đang chạy.

## 3. Lỗi đã gặp & giải pháp

| Vấn đề | Nguyên nhân | Cách xử lý | Cách tránh lặp lại |
|---|---|---|---|
| Kiểm tra “đang chạy” chưa chứng minh “đúng thiết kế” | Phiên trước chỉ kiểm current source và fixture | Đối chiếu gói bàn giao, client Trung tham chiếu, snapshot trước sửa và current | Tách kiểm hoạt động khỏi kiểm nguồn gốc thiết kế |
| Nút quay lại dễ hiểu là tắt auto | Code dùng backExit khi auto đang bật, chỉ bỏ panel/entity | Ghi rõ ý nghĩa hiện tại; đề xuất báo trạng thái/nút dừng, chưa thực hiện | Không thay luật chơi chỉ vì UI diễn đạt thiếu |
| Không thể chứng nhận official server parity | Có client tham chiếu nhưng không có source server chính thức trong phép kiểm | Chỉ kết luận chủ ý phía client của bản game này | Không gọi mọi trường hợp là chuẩn game gốc100% |

Không có lỗi mã hóa cần sửa. Không chuyển mã hoặc chỉnh text gameplay trong phiên này.

## 4. Kỹ năng / kinh nghiệm mới

- Bằng chứng thiết kế mạnh hơn tên hàm đơn lẻ: cùng có nhánh quay lại riêng khi auto bật, giữ controller và chế độ silent ngoài phòng câu trên nhiều bản độc lập.
- Nút tắt auto, nút đóng màn và mất kết nối là ba thao tác khác nhau.
- Tối ưu UX có thể giữ nguyên luật auto nền; việc bắt buộc đứng ở ngư trường mới được câu là lựa chọn thiết kế khác.

## 5. Trạng thái hiện tại

### Đối chiếu bốn nguồn

| Nguồn | Quay lại giữ auto | backExit giữ controller | Silent ngoài màn câu |
|---|---|---|---|
| Client trong server.zip bàn giao | Có | Có | Có |
| Client Trung tham chiếu lưu31/08 | Có | Có | Có |
| Snapshot trước sửa auto06/09 | Có | Có | Có |
| Client hiện tại | Có | Có | Có |

Chi tiết code trong tất cả nguồn:

- Nút quay lại: isAutoFish=true → mFishRaid.backExit(); false → cs_fish_map_leave().
- backExit chỉ RemoveAllEntity và đặt fishMainView=null, khác Clear có xóa timer/dữ liệu vòng câu.
- isNeedSlientMode có điều kiện isAutoFish và không ở giao diện phòng câu: đây là dấu hiệu rõ ràng hỗ trợ auto nền.
- Có updateFishMapRaidTime riêng, không gộp vòng cập nhật map train/battle với vòng câu cá.

### Hash nguồn

- server.zip member `linhhoasu/webgame/game/js/main.min_a6195824.js`: `d0463feecb7a55070a38772950a048d026d560be5c3fe918f61ff78d1d73e021`.
- `_ai_workbench/temp/cn_origin_70000001_20260831/js/main.min_97d2b812.js`: `c127a9cc99e6f012a03c745bc1a495b8c45ef1f08067f434873dbcf8c580ca47`.
- `_ai_workbench/temp/fishing_auto_20260906/main.js`: `2b6526ec04a05fb5a210b0545b30cfa0bea492bf8c0accb041858438a4db0395`.
- Current local và VPS đọc lại trong phiên: `2cc9a3811fd61cc421c3ce240982aae84582593e38d5d8c679a7a2af8c9d6c42`.

Script so sánh chạy thành công: cả4nguồn có đủ3dấu hiệu. Không chạy native gameplay/tài khoản thật trong phiên này. Kết quả12ca client/4ca server là bằng chứng hoạt động của phiên trước, không được chạy lại hoặc coi thành kiểm full official parity.

## 6. Bước tiếp theo

1. Nếu giữ ý đồ bản game hiện tại: bổ sung thông báo khi thu màn, trạng thái auto ngoài map và nút dừng dễ thấy. Chưa thực hiện vì người dùng đang hỏi đánh giá.
2. Nếu chủ game muốn luật khác: xác nhận “rời màn câu thì dừng auto” trước sửa; cần xử lý lượt đang bay/ACK để không mất hoặc cấp trùng cá.
3. Nếu nghi một tài khoản gặp lỗi: theo dõi lượt/Đùi Gà/cá chờ và reconnect, không suy từ trạng thái nút.
