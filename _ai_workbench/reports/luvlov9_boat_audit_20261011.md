# Audit lỗi thuyền `luvlov9` — 11/10/2026

## Phạm vi

- Read-only trên các DB S1–S8; không dùng mật khẩu, không sửa player, không cấp bù.
- Tài khoản `luvlov9` có role S1 và S3; role đang hoạt động/đăng nhập gần nhất là S3 `HiênViênHoàngĐế`, userId `u_Wk_1003_30e104_1789301370774`.

## Bằng chứng authoritative trên S3

- `shopInfo.buyRecords[13000201] = 1` và `rechargeInfo.records` có `{ id: 13000201, count: 1 }`.
- Cấu hình `ShopConfig[13000201]`: cost `item 300102 x50` (**虚鲲号图纸 / bản vẽ Hư Côn Hộ**), reward `item 300002 x1` (**虚鲲号 / Hư Côn Hộ**).
- Player hiện không còn `item 300102`, còn `item 300002 = 1`.
- `other_attr_info.oldTrekInfo.skin = 300001` và `shipSkins = [300001]`; thuyền `300002` chưa được kích hoạt.
- `itemUseRecords` không có dòng 300102/300002; handler shop hiện không ghi timestamp/requestId chi tiết nên không thể xác định thời điểm bấm mua từ log.

## Kết luận

Đây là lỗi thật, không có dấu hiệu khai báo sai: giao dịch mua đã được lưu và trạng thái túi phù hợp với việc đã trừ 50 bản vẽ, nhưng phần thưởng thuyền bị xử lý như item túi (`items[300002]`) thay vì cập nhật quyền sở hữu `oldTrekInfo.shipSkins`. Vì client kiểm tra `checkHaveShip()` từ `shipSkins`, giao diện vẫn hiện `0/50` và không cho kích hoạt.

Chưa sửa hoặc cấp bù trong lượt audit. Cần sửa riêng reward path cho các ID nằm trong `OldTrekShipDressConfig`, sau đó đối soát idempotent player này trước khi bù/kích hoạt.

Evidence: `_ai_workbench/temp/luvlov9_boat_audit_20261011.json`.
