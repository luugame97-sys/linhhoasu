# Audit nguồn nhận Ngọc Hoa Nhiễm ID 118 — 05/09/2026

## 1. Tóm tắt công việc

- Xác định item nhuộm màu là `118 – Ngọc Hoa Nhiễm`.
- `AssetsConfig.itemWay=[11]`; `ItemWayConfig[11]` hiển thị “Nhận thông qua sự kiện vận hành”.
- Kiểm tra config production, Activity runtime S1/S2, WebShop, Giftcode, mốc tích nạp và các rương liên quan.
- Kết luận: hiện chưa có nguồn kiếm/mua ổn định đang hoạt động cho người chơi.

## 2. File/thư mục đã thay đổi

- Source game/production: không thay đổi.
- Chỉ thêm báo cáo trong `_ai_workbench/reports/`.

## 3. Lỗi đã gặp & giải pháp

| Phát hiện | Nguyên nhân | Kết luận | Cách tránh lặp lại |
|---|---|---|---|
| Item ghi có nguồn nhưng không có nút đi tới | ItemWay 11 chỉ có tên, không có `systemId/sceneId` | Client chỉ hiện mô tả chung | Nguồn item cần route UI cụ thể |
| Activity 29 có thưởng ID 118 nhưng hiện không mở | Không có ActivityBase row và không có activity row trên S1/S2 | Không thể nhận ở thời điểm audit | Kiểm tra schedule/runtime trước khi giới thiệu nguồn |
| Rương 94401 mô tả có thể ra ID 118 nhưng dùng có nguy cơ quà rỗng | Server `RED_PACKET_REWARD_POOLS` thiếu 94401 | Cần sửa trước khi mở lại Activity 29 | Contract mọi rương useType 102 |

## 4. Kỹ năng / kinh nghiệm mới

- Phải phân biệt nguồn có trong catalog với nguồn đang active ở runtime.
- `itemWay` không có `systemId/sceneId` chỉ là mô tả, không chứng minh tính năng nguồn đang mở.

## 5. Trạng thái hiện tại

- Activity 29: 22 template có `fundReward=118×10` ở cấp 1; hiện không có schedule/runtime row.
- Rương tự chọn `93001/93002/93003`: có lựa chọn `118×40`; các rương này là advanced reward cấp 1 của Activity 29, hiện không có nguồn active.
- Rương `94401`: là free reward cấp 10/20 của Activity 29; mô tả nói có thể ngẫu nhiên nhận ID 118×1 nhưng server chưa có pool 94401.
- WebShop live: không bán item ID 118.
- Giftcode live: không có code chứa item ID 118.
- Mốc tích nạp live: không có mốc chứa item ID 118.
- Mongo RedemptionCode S1/S2: không có code chứa ID 118.

## 6. Bước tiếp theo

1. Nếu muốn người chơi có nguồn ngay, thêm ID 118 vào WebShop hoặc một mốc nhiệm vụ/sự kiện đang hoạt động.
2. Nếu mở Activity 29, cần seed schedule/lifecycle và sửa pool rương 94401 trước.
3. Cân bằng gợi ý phải tính theo chi phí nhuộm phổ biến 40 vật phẩm/màu và 50 vật phẩm ở một số bộ đặc biệt.
