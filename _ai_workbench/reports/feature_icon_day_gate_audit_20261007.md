# Audit điều kiện mở menu tính năng trong ảnh — 07/10/2026

## Kết luận

- Chính sách `featureDayAccess` đã đưa các điều kiện ngày thông thường trong `SystemConfig` về ngày 1, đồng thời áp dụng cho client và server.
- Nhiều mục vẫn xám do điều kiện nhiệm vụ mở khóa, cấp nhân vật hoặc phụ thuộc hệ thống; đó không phải lỗi ngày.
- Đính chính sau khi kiểm tra consumer native: **Hồn thú** còn metadata `SystemConfig[231].openDay = 43`, nhưng `UnlockSystem.isSystemUnlock`, `PetSoulIconRule` và `PetSoulMainPanel.openCheck` chỉ xét `conditions`, cache unlock và `forceLockSystem`. Row live không có điều kiện type5. Vì vậy metadata 43 không chứng minh nguyên nhân khóa thực tế; điều kiện thực là cấp 135 và phụ thuộc System206.

## Đối chiếu các mục

| Mục | Điều kiện hiện tại | Điều kiện ngày? |
|---|---|---|
| Pháp tướng | Nhiệm vụ mở `10031` | Không |
| Tu luyện/Tụ linh | Luồng `spec-spirit` 3610–3617; không có gate ngày SystemConfig | Không |
| Hồn ngọc | Nhiệm vụ `10084` | Không |
| Tinh linh | Nhiệm vụ `10109` | Không |
| Hồn thú | Phụ thuộc Tinh linh `206`, cấp 135; còn metadata `openDay=43` | Không có điều kiện ngày thực tế trong row live |
| Pháp bảo | Nhiệm vụ `10170` | Không |
| Cá thần hoạch/Câu cá | Nhiệm vụ `10185`; activity câu cá có lịch xoay vòng riêng | Không phải server-day |
| Thần binh | Nhiệm vụ `90021` | Không |
| Võ hồn | Nhiệm vụ `90003` | Không |
| Huyết mạch | Cấp 95; day gate đã về 1 | Không còn |
| Bí bảo | Cấp 110; day gate đã về 1 | Không còn |
| Yêu linh | Cấp 130; day gate đã về 1 | Không còn |
| Hồng nhan | Luồng thời trang/ngoại quan; entry không có gate ngày riêng. Một số catalog showType 0/1/2 vẫn giữ lịch riêng | Không ở entry |

## Vì sao hiện thấy nhiều mục chưa kích hoạt

Ngày server không đủ để kết luận Hồn thú đang bị chặn. Cần đối chiếu cấp 135, System206/nhiệm vụ10109, phản hồi unlock và `AppInfo.params.forceLockSystem` của tài khoản gặp lỗi. Chưa có dữ liệu người chơi bị ảnh hưởng để xác định nguyên nhân riêng.

System `315` và `322` là hai lịch đặc biệt được giữ nguyên theo chủ đích; không thuộc các icon xác định trong ảnh. Các catalog thời trang showType 0/1/2 và FishScene 6/7 cũng là lịch nội dung riêng, không phải gate mở menu chung.

## Bằng chứng

- Runtime live `SystemConfig` đọc được: `201/209/212/213/215/216/219/220/222` không còn day gate; `231.openDay=43` còn nguyên.
- QA chỉ đọc, không ghi player/deploy: `_ai_workbench/temp/feature_day1_20261005/postcheck.json`.
- Chính sách: `linhhoasu/lhs/newServer/src/config/featureDayAccess.js`, `featureDayAccess.json`; client: `linhhoasu/webgame/game/js/lhs-feature-day1-v1.js`.
