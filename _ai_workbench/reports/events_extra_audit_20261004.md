# Audit sự kiện bổ sung — 04/10/2026

Phạm vi: đọc snapshot live, source đã chụp và đọc trực tiếp các bảng runtime trên VPS; không thay đổi production.

## Kết quả

| Nhóm | ID | Trạng thái | Lý do |
|---|---|---|---|
| Activation Pass (type 7, trả phí) | 7001, 7051 | Chưa bật | Runtime có `Activity7TypeConfig` (payId 10301, chu kỳ 7 ngày) và `Activity7Config` reward. Tuy nhiên rotation đang `enabled:false` và `ActivityCycleSchedule.SUPPORTED_TYPES` chưa có type 7. |
| Login Privileges (type 9, trả phí) | 9001, 9002, 9004, 9005, 9051, 9052, 9101 | Chưa bật | Runtime có `Activity9TypeConfig`/`Activity9Config` (payId 10501/10502, reward theo ngày). Rotation đang `enabled:false`, scheduler chưa hỗ trợ type 9 và service chưa reset records khi hết chu kỳ. |
| Fishing (type 33) | 33001, 33002, 33051, 33201–33204, 33301–33304 | Đã có luồng riêng | Bị `FishingEventGateService` chặn khỏi generic activity; chỉ nên mở qua Fishing schedule/service hiện có. |
| Type 34 | Không có ID trong ActivityConfig | Không có ứng viên | Handler yêu cầu `Activity34Config`, config không có trong snapshot. |
| Type 35 | 35201, 35202 | Không nên bật | Handler chỉ tăng `row.record`; không thấy reward/config chuyên dụng. |
| Các type còn lại | 1–6, 8, 10–32, 36, 38–42, 45–48, 50–51, 53–62 | Không nên bật | Không có handler nghiệp vụ tương ứng; rơi vào fallback generic, không chứng minh là sự kiện hoàn chỉnh. |

## Kết luận

Runtime `ConfigService` hiện load 718 bảng; các bảng `Activity7TypeConfig`, `Activity7Config`, `Activity9TypeConfig`, `Activity9Config` thực sự tồn tại trong `/linhhoasu/lhs/newServer/scripts/_tables_dump/`.

Type 7 là ứng viên có thể bật sau khi thêm scheduler support và kiểm tra entitlement trả phí không bị cấp lại. Type 9 chưa an toàn cho vòng xoay vô hạn: `ensureActivity9State` không rollover row đã hết hạn, còn `operateLoginPrivileges` giữ `records`/`recordList` và coi recharge record cũ là entitlement. Cần bổ sung reset cycle rõ ràng và kiểm thử claim trước khi bật. Không bật bằng cách chỉ sửa registry.

## Audit handler native bổ sung — 04/10/2026

- Type 21 (Monopoly), 27 (Knife), 37 (Alchemy), 49 (Box Draw) và 52 (Fulu) có nhánh nghiệp vụ thật trong `handlers/activity.js`, gồm đọc config, tiêu vật phẩm hoặc tính thưởng, cập nhật row và packet riêng. Chưa tìm thấy E2E native chuyên biệt cho các type này; chỉ có probe/candidate cho type 52.
- Type 30 (Secret Treasure) hiện chỉ dựng packet đọc/trạng thái `1760–1763`; nhánh `handleActivityOperate` không tăng tiến độ task, không trừ chi phí và không phát `Activity30Config.rewards`/`floorRewards`. Không được coi là event hoàn chỉnh để mở public.
- Type 37 có xử lý generate/draw/score, nhưng snapshot config live chọn trước đó không chứa `ActivityScoreConfig`; cần read-back bảng này trên production trước khi khẳng định claim mốc điểm hoạt động. Bản tables dump local có bảng tương ứng nên không suy diễn snapshot thiếu là lỗi runtime.
- Activation Pass type 7 không phụ thuộc cờ `enabled:false` của registry để hoạt động: `ActivationPassService` đã được gọi ở payload/operate/recharge và tự rollover chu kỳ sau khi hết hạn. Receipt live trước đó đã PASS 28 kiểm tra UI/claim/replay/relog và 18 kiểm tra cash/amount/duplicate. Đây là quyền trả phí theo payId `10301`, không nên mở thành event miễn phí.
- Allowlist triển khai an toàn: 21/27/37/49/52 chỉ sau khi xác minh config/chi phí/client; giữ type 30 đóng; giữ Activation Pass theo entitlement; TopArena vẫn bị chặn do rollback trước đó.
