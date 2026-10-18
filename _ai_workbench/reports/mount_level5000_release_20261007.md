# Mở rộng cấp thú cưỡi lên 5.000 — 07/10/2026

- Đã triển khai `SwordLevelConfig` từ cấp 1–1.000 lên 1–5.000 cho phẩm chất 2, 3, 4, 6, 7 trên server và client.
- Giữ nguyên toàn bộ hàng 1–999. Hàng 1.000 giữ nguyên thuộc tính nhưng đổi chi phí từ terminal `0` thành chi phí nâng lên 1.001. Hàng 5.000 là terminal với chi phí `0`.
- Công thức chi phí ID20 mỗi bước: hệ số phẩm chất × cấp hiện tại; hệ số lần lượt `10/20/50/100/200`. Thuộc tính cấp 1.001–5.000 nối theo độ dốc hàng 999→1.000: `+20/+25/+30/+40/+50`.
- Chỉ số 51/52/53 tại cấp 5.000: phẩm 2 `100.320`, phẩm 3 `125.515`, phẩm 4 `150.710`, phẩm 6 `201.100`, phẩm 7 `251.490`.
- Không cần migration người chơi: handler và client đọc động số hàng; nhân vật đang ở cấp 1.000 có thể nâng tiếp sau khi đăng nhập lại/tải cấu hình mới. Sao và kỹ năng không thay đổi.
- Đã cập nhật 5 file runtime: hai binary server, hai binary client và `index.html` cache marker `20261007_mount_level5000_v1`. Backup chọn lọc: `/linhhoasu/_ai_workbench/backups/mount_level5000_20261007_pre`.
- Kiểm thử: builder binary PASS (hàng cũ không đổi ngoài chi phí hàng 1.000), ConfigService PASS 718 bảng, handler RAM PASS cho 999→1.000, 1.000→1.001, 4.999→5.000 và chặn 5.000→5.001; không ghi player/network trong QA.
- Hậu kiểm production: S1–S7 đều `/ready` `status=ok`, Mongo/Redis true; runtime đọc đúng max 5.000 và mốc thuộc tính/chi phí; public client/fashion hash đúng; log không có lỗi decode/uncaught/EADDRINUSE. Chỉ restart 7 game node; WebGM/bot giữ PID.
- Tổng nguyên liệu từ cấp 1→5.000 ở phẩm 7 là `2.499.500.000` item20 (vượt int32 nhưng vẫn trong miền số an toàn của JS/Mongoose Mixed/Number). Chưa thực hiện nâng cấp bằng tài khoản thật.

Evidence: `_ai_workbench/temp/mount_level5000_20261007/build.json`, `deploy_final.json`, `postcheck.txt`; builder `_ai_workbench/tools/build_mount_level5000_20261007.js`.
