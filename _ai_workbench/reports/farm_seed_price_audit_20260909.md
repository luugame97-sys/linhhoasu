# Kiểm tra giá hạt giống Dược Điền — 09/09/2026

## Kết luận

Giá tăng tới **500** hiện khớp cấu hình, không phải lỗi tự nhân giá:

| Lượt mua trong ngày | Giá Nguyên bảo |
|---:|---:|
| 1 | 10 |
| 2 | 25 |
| 3 | 35 |
| 4 | 50 |
| 5 | 125 |
| 6 | 200 |
| 7 | 200 |
| 8 | 250 |
| 9 trở đi | 500 |

Bảng này giống hệt giữa config local và snapshot CN:

- Shop `6000001`: thưởng item `30`, `costAgain = 25,35,50,125,200,200,250,500`.
- Shop `6000002`: thưởng item `28`, dùng cùng thang giá.
- `limitType=1`; `FarmShopService.resetDay()` reset lượt mua farm khi sang ngày GMT+7.
- Server tính giá theo `boughtCount` trước từng lượt, nên không có lệch off-by-one trong thang giá.

## Khi nào mới là lỗi

Giá 500 chỉ là bất thường nếu người chơi gặp một trong các trường hợp:

1. Chưa mua đủ 8 lượt trong cùng ngày nhưng đã thấy 500.
2. Sang ngày GMT+7 mà giá vẫn giữ bậc cũ.
3. Client hiển thị giá khác packet/server khi mua.
4. `shopInfo.farmShopDay` bị thiếu hoặc `buyRecords[6000001/6000002]` chứa lượt cũ từ migration, khiến lần mở shop đầu tiên kế thừa record lịch sử.

Chưa có UID/server/thời điểm và số lượt mua trong ngày để kết luận tài khoản cụ thể rơi vào các trường hợp trên. Không nên reset record hoặc hoàn Nguyên bảo chỉ dựa vào việc nhìn thấy giá 500.

## Bằng chứng code

- Config: `ShopConfig[6000001]`, `ShopConfig[6000002]`.
- Tính giá: `linhhoasu/lhs/newServer/src/services/FarmShopService.js`.
- Reset ngày và mua: `linhhoasu/lhs/newServer/src/handlers/item.js`.
- Snapshot CN: `_ai_workbench/temp/fashion_cn_recovery_20260909/raw/assets/excel/config_3d6c97d1.bin`.
