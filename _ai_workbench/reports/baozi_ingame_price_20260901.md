# Giá Bánh bao trong game và quy ước tính giá (01/09/2026)

## Kết quả đối chiếu game gốc

- Item Bánh bao: ID `4`.
- Nguyên bảo: ID `1`.
- Gói game `ShopConfig[11001]`: tốn `100` Nguyên bảo, nhận `40` Bánh bao, kèm `30` Lệnh Tông môn (ID `184`) và `4` Bùa tăng tốc (ID `6`).
- Giá quy đổi thuần theo gói: `100 / 40 = 2,5 Nguyên bảo/Bánh bao`.
- Đây là giá của gói có quà kèm, không phải bảng giá bán lẻ riêng cho Bánh bao.

## Quy ước đã chốt

- Dùng cho tính quà Donate/ưu đãi và các phép cân bằng nội bộ: **1 Bánh bao = 1 Nguyên bảo**.
- Không sửa `ShopConfig[11001]`, client, server hoặc dữ liệu người chơi.
- Khi báo cáo cần ghi rõ đây là **giá trị quy ước**, không phải giá gốc của shop game.

## Bằng chứng

- Config production đọc qua `ConfigService` tại `103.116.105.154`.
- Gói `ShopConfig[11001]` và bản local được quét read-only.
- Remote config path: `/linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin`.
- Evidence local: `_ai_workbench/temp/baozi_ingame_price_remote_20260901.json`.
- Không deploy và không restart trong lần chốt quy ước này.
