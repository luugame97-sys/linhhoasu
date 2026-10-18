# Audit sự kiện hết hạn / đang đóng — 14/09/2026

## Phạm vi

- Read-only MongoDB live S1/S2/S3, lúc `2026-09-14 07:07 GMT+7`.
- Chỉ tính player không phải bot (`isBot != true`, `managedBot != true`), không ghi dữ liệu.
- `expired`: row có `endTime <= now`; `disabled`: ID nằm trong `activityInfo.disabledEntryIds`.

## Kết quả

| Server | ID hết hạn (có ít nhất một row) | Row hết hạn | ID đóng hoàn toàn (không còn row mở) | ID disabled |
|---|---:|---:|---:|---:|
| S1 / 1001 | 6 | 677 | 1 | 0 |
| S2 / 1002 | 4 | 125 | 1 | 0 |
| S3 / 1003 | 2 | 4 | 1 | 0 |
| Hợp nhất ID | **6** | **806** | **1** | **0** |

- Hợp nhất ID hết hạn: `6006, 7001, 9001, 33001, 43001, 44001`.
- ID hết hạn hoàn toàn ở cả ba server: `33001` (vòng câu cá cũ).
- Không có sự kiện nào đang bị đóng bằng cờ `disabledEntryIds`.
- Một ID có thể vừa có row hết hạn vừa có row đang mở vì activity window được lưu theo từng người chơi/server; do đó không cộng máy móc danh sách ID.

## Đối chiếu đang mở

- Cả S1/S2/S3 hiện có row mở cho: `6006, 7001, 9001, 33002, 43001, 44001`.

