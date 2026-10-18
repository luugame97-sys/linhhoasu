# Gem cấp 10 tự chọn — candidate 02/10/2026

- Bag `100097`, `AssetsConfig.type=101`, icon `random_gem_select_10`.
- `AssetsUseConfig[100097]` chọn đúng một trong `[25091,25092,25093,25094,25095,25096]`, mỗi túi 1 viên.
- Shop `10000007`: cost `[{id:1,count:1049760}]` (Nguyên Bảo), reward `100097 x1`.
- Giá 1,049,760 theo chuỗi hiện tại và recipe đặc biệt cấp 6→7 (4 viên cấp 6), không dùng giá 787,320.
- Candidate chỉ áp dụng qua `ConfigService` scoped module; không ghi production.

## Kiểm chứng

- Sáu lựa chọn index 0..5: mở thành công, trừ đúng 1 túi, nhận đúng gem cấp 10.
- Chọn rỗng, index ngoài phạm vi, số lượng chọn sai, nhiều index: từ chối và giữ túi.
- Mở 2 túi cùng lựa chọn: nhận 2 gem riêng, không double consume.
- 6 gem ID đều tồn tại trong `GemLevelConfig`, level=10, type=18, quality=9, synthesisLevel=0.
- JS syntax PASS. Shop row được tạo trong candidate; fixture mua thật cần mock PlayerMutation/Mongo vì test workspace không có kết nối DB.

## Files

- `server/config/gemLevel10Choice.js`
- `server/services/ConfigService.js`
- `test_gem10_choice.js`
