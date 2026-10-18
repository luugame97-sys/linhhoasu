# Session Report — Khả năng tự động mặc trang bị mạnh hơn

## 1. Tóm tắt công việc

- Đã audit read-only client production, FSM `Ủy thác tự động`, server tag `2200/2201`, `EquipService` và lịch sử triển khai/rollback tính năng tương tự.
- Kết luận: **có thể triển khai**, nhưng phải làm đồng thời client + server-authoritative; không an toàn nếu chỉ bỏ popup hoặc tự gọi tag 2200 ở client.
- Phiên này chưa sửa hoặc bật tính năng trên production.

## 2. File/thư mục đã thay đổi

- Không sửa source/runtime production.
- Tạo tool snapshot read-only `_ai_workbench/tools/snapshot_auto_equip_audit.py`.
- Evidence source production: `_ai_workbench/temp/auto_equip_audit_20260904_044658/`.
- Tạo báo cáo `_ai_workbench/reports/auto_equip_feasibility_20260904.md` và `.html`.

## 3. Lỗi đã gặp & giải pháp

| Lỗi/rủi ro | Nguyên nhân | Phương án xử lý | Cách tránh lặp lại |
|---|---|---|---|
| Bản thử 31/08 vẫn mở popup đồ mạnh | Static contract đã PASS nhưng native client không đi hết nhánh auto-equip; binding/trạng thái checkbox không được xác nhận E2E | Dựng lại từ source production hiện tại và test native thực tế | Không tuyên bố hoàn tất từ marker/static contract |
| Client có thể mặc món yếu | Tag 2200 hiện không có guard tăng lực dành cho auto mode | Gửi cờ auto riêng; server tính lại power và chỉ chấp nhận `newPower > currentPower` | Không tin power do client tính/gửi |
| Auto-sale có thể bán nhầm | Tag 2201 hiện bán mọi UID có trong open list | Safe mode chỉ bán món yếu hơn món đang mặc; cấm UID đang dùng ở mọi preset | Server trả `ignoredUids`, client dừng nếu có món bị chặn |
| Nhiều món cùng slot | Nếu mặc theo thứ tự rơi có thể chọn món không mạnh nhất | Gom theo slot và chọn strict max trước khi gọi 2200 tuần tự | Contract nhiều món cùng type và thứ tự đảo |

## 4. Kỹ năng / kinh nghiệm mới

- `EquipCheckModel.CheckAutoStop()` đang tách danh sách dừng/manual khỏi danh sách bán; checkbox `enoughPower` hiện chỉ khiến đồ mạnh được giữ lại để mở popup.
- `IdleFightStateSelect.dealSelect()` là điểm chuyển thích hợp để chạy auto-equip trước `openHeroReplaceView`.
- Client có `YV.calPower()`; server cần hàm tương đương dựa `AttrConfig.power`, không nhận kết quả client.
- `EquipModel.getEquipFromPlan(uid)` trả list ID của open list; sau RPC 2200 thành công client phải remove new UID, replace active preset và đưa đồ cũ về sale list đúng list.

## 5. Trạng thái hiện tại

- Production không có `autoDelegateEquip`, `safeAutoDelegate`, `requirePowerUpgrade` hay marker tự mặc.
- Client hiện tại: khi checkbox lực chiến bật và có đồ mạnh, `CheckAutoStop` giữ món đó rồi `IdleFightStateSelect` mở popup so sánh.
- Server `replaceOpenEquipToPlan()` hiện thay đồ từ open list mà chưa kiểm tra power tăng nghiêm ngặt.
- Server `saleOpenEquips()` hiện chưa bảo vệ theo power/preset trong chế độ auto.
- Source production đã snapshot; hash: EquipService `c58859919419...`, item.js `06330978c628...`, main JS `4de77d94ecd5...`, index `1d6ee833bf1a...`.
- Không restart dịch vụ và không thay đổi trang bị/dữ liệu người chơi.

## 6. Bước tiếp theo

1. Đổi checkbox native `Dừng khi lực chiến cao hơn` thành tùy chọn opt-in `Tự động mặc trang bị mạnh hơn`, mặc định tắt để không làm người chơi hiện tại tự động mặc ngoài ý muốn.
2. Client chọn món mạnh nhất mỗi slot, gọi 2200 tuần tự; chỉ sau ACK thành công mới cập nhật model và đưa đồ cũ vào danh sách bán.
3. Server guard auto 2200 strict power-up; auto 2201 bảo vệ tất cả preset và mọi món không yếu hơn.
4. Test fixture: slot trống, một/multiple upgrade, bằng power, yếu hơn, giữ phẩm chất/thuộc tính, preset khác, RPC fail/retry, relog và restart.
5. Native E2E bằng tài khoản QA có snapshot/restore: bật tùy chọn → rơi đồ mạnh → tự mặc → bán đồ cũ/yếu → tiếp tục ủy thác, không mở popup.
