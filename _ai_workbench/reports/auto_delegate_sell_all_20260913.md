# Ủy thác tự động — bán tất cả trang bị

## Đã thực hiện

- Thêm policy `sellAllEquipments` ở server settlement (`handlers/box.js`). Khi bật, trang bị rơi không được tự mặc dù mạnh hơn; chúng đi qua cùng đường bán trang bị và vẫn bảo vệ UID đang nằm trong bộ trang bị hiện tại.
- Tag `2201` nhận và phản hồi lại cờ `sellAllEquipments`; `EquipService.saleOpenEquips` bỏ qua bộ lọc “chỉ bán đồ yếu hơn” khi cờ này bật nhưng vẫn không cho bán đồ đang mặc.
- Cờ được giữ từ request mở rương `2000` sang claim `2001` cho managed bot.

## Kiểm chứng

- `node --check` PASS cho `handlers/box.js`, `handlers/item.js`, `services/EquipService.js`.

## Còn thiếu

- Bundle client đang minified và chưa có control UI mới trong lượt này; cần patch native `AutoOpenBoxPanel` để thêm checkbox “BÁN TẤT CẢ TRANG BỊ”, gom cùng nhóm điều kiện thêm, rút gọn nhãn dài, rồi truyền `sellAllEquipments` ở RPC 2201/2000. Chưa deploy production.
