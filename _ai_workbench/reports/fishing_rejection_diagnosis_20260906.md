# Session Report — thông báo từ chối câu cá

Ngày 06/09/2026, snapshot 06:41:41 UTC+7. **Đã xác nhận thiếu sót trong luồng mồi/câu nhiều con sau bản sửa vừa triển khai. Phiên này chỉ kiểm tra, không sửa source hoặc dữ liệu production.**

## 1. Tóm tắt công việc

- Đọc ảnh người dùng: chế độ câu3, biểu tượng mồi đang lắp còn2, tài nguyên ở nút câu là1485, tiền câu cá98448; thông báo chung “Thao tác chưa hoàn tất…”.
- Đọc báo cáo release trước, kiểm source hiện hành và truy vấn trạng thái nhân vật trong ảnh chỉ đọc. Cả5 file source server khớp local; main hiện hành đúng bản fishing_integrity_v1.
- Source `consumeFishBait` yêu cầu đủ toàn bộ count ở mồi đang chọn, không chuyển sang mồi kế tiếp khi thiếu. Client `getAutoMutlFishCount` gửi3 khi bật fishing_mutl; client kiểm resource65, còn server lúc này kiểm5512. Client chỉ tự loại mồi khỏi foodBag khi số lượng bằng0, không xử lý trường hợp còn2 nhưng cần3.
- Vì vậy đây là lỗi luồng chọn mồi/hiển thị điều kiện, không phải cá pending hay khu bị khóa và không có bằng chứng lỗi mất stat mới trong ảnh này. Việc từ chối trừ quá số mồi đang có là đúng; phần thiếu là xử lý batch/fallback nhất quán và thông báo rõ.

## 2. File/thư mục đã thay đổi

- Tool hỗ trợ mới: `_ai_workbench/tools/audit_fishing_rejection_20260906.py`, `_ai_workbench/tools/probe_fishing_rejection_20260906.js`.
- Evidence: `_ai_workbench/temp/fishing_rejection_20260905T234141Z/snapshot.json`, `probes.json`. Snapshot/log chỉ dùng nội bộ, không public.
- Báo cáo MD/HTML này và session_report.md/.html. Backup report trước cập nhật ở `_ai_workbench/backups/fishing_rejection_reports_20260906/`.
- Không sửa source, client, config, inventory, cá hoặc trạng thái game. Không gọi gameplay RPC production, không restart và không phát bù.

## 3. Lỗi đã gặp & giải pháp

| Lỗi | Nguyên nhân | Kiểm tra / hướng xử lý | Tránh lặp lại |
|---|---|---|---|
| Bấm câu3 bị từ chối dù hiện1485 | food5512 chỉ còn2;1485 là item65 khác; server không chuyển qua5514 | Clone cùng state: count3 thất bại, count1 thành công; chuyển5514 rồi count3 thành công | Test batch tại ranh giới0/1/2/3 và nhiều loại mồi |
| Thông báo nói chung về pending/vật phẩm/khu | Nhánh thiếu mồi trảresult=-1, không có reason cụ thể;24 callback dùng chungtext | Thêm reason/đủ-cần theo loại mồi khi được yêu cầu sửa | Test nội dung lỗi khớp nguyên nhân server |
| Bỏ hết mồi báo success nhưng server vẫn giữ mồi cũ | handleFishBaitBagUpdate chỉ gánfoodBag khi length>0, fallback vẫn chọnfood cũ | Probe foodBag=[] trả0 nhưng còn[5512,5514] | Phải test mảng rỗng và sync client/server sau unequip |
| Test trước bỏ sót ranh giới2/3 | Test thiếu mồi trước đó dùng tồn kho0, QA thật dùng mồi mặc định65 | Bổ sung fixture đúng ảnh và so no-consume/no-save | QA cần mồi phụ, chuyển mồi và batch, không chỉ defaultbait |

## 4. Kỹ năng / kinh nghiệm mới

- Badge số mồi đang lắp khác số tài nguyên trên nút câu; không kết luận “còn1485 mà lỗi pending” chỉ từ một con số.
- Chặn tiêu hao vượt tồn là cần thiết, nhưng không được loại đường fallback cũ rồi coi toàn bộ flow đã hoàn chỉnh. Thay mồi phải đồng thời đổi loại được server xác nhận, không giả vờ hưởng thuộc tính mồi cũ.
- Khi đang chơi live, replay phải trên bản sao, stub save và cấm network. Không thử câu thật trên tài khoản người dùng để chẩn đoán.
- Log hiện tại cótag/msgUid nhưng không lưu params/result của mỗi lượt. count3 tại thời điểm ảnh được đối chiếu bằng ảnh + native getAutoMutlFishCount + exact-state replay, không gọi đó là packet capture đầy đủ.

## 5. Trạng thái hiện tại

### Snapshot khớp ảnh

| Trường | Giá trị |
|---|---|
| Cấp nhân vật / câu cá |116 /3|
| Khu câu |1, yêu cầu cấp1/ngày1; nhân vật đủ điều kiện|
| Pending cá thường / linh hồn |0 /0|
| Mồi đang chọn |5512×2|
| FoodBag |[5512,5514]|
| Mồi kế tiếp |5514×90|
| Tài nguyên65 |1485|
| Coin68 / crystal69 |98448 /0|

### Kết quả probe không ghi production

| Probe | Kết quả |
|---|---|
| Cùngstate, count3 |result=-1, không reason, save0, item không đổi|
| Cùngstate, count2 |result0, mồi5512 còn0 trên clone; native nút chỉ dùng1 hoặc3|
| Cùngstate, count1 |result0, mồi5512 còn1 trên clone|
| ChọnfoodBag[5514], count3 |result0, mồi5514 còn87 trên clone|
| Unequip toàn bộfoodBag[] |result0 nhưngfood/foodBag server không xóa — lỗi riêng đã tái hiện|

S1/S2 ready200, PID/restart count không đổi so release. Log tài khoản có nhiều request4000 liên tiếp nhưng không có exception liên quan trong error tail. Không xác nhận mọi lời gọi4000 đều cùng params vì log không lưu params.

**Kết luận:** lỗi/thiếu sót ở flow mồi được đưa ra ánh sáng bởi chốt kiểm tra mới. Bản sửa vừa rồi chưa xử lý đủ tình huống mồi còn2 khi câu3 và bỏ hết mồi. Không phải lỗi mất cá sau relog. Chưa triển khai fix trong phiên chẩn đoán này.

## 6. Bước tiếp theo

1. Cách dùng tạm đã kiểm trên clone: tắt câu3 để câu1, hoặc bỏ mồi5512 đang thiếu để dùng5514 còn90. Không dùng “bỏ hết” vì nhánh đó đang lỗi.
2. Khi được yêu cầu sửa: xác định cơ chế tài nguyên65 và mồi phụ/batch, chọn mồi theofoodBag một cách server-authoritative; không mất mồi dư và không hưởng sai loại mồi.
3. Sửa empty-foodBag/unequip về mồi mặc định, phản hồi trạng thái chính xác và thông báo thiếu đúng loại mồi.
4. Regression thêm tồn0/1/2/3, mồi kế tiếp, hết toàn bộ, chế độ1/3, disconnect/relog. Không bỏ chốt chống mất pending, không phát bù.
