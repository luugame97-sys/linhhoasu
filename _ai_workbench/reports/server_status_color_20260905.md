# Chấm server đang mở màu xanh — 05/09/2026

## 1. Tóm tắt công việc

Đã triển khai chấm xanh cho server đang mở; server đóng/bảo trì/chưa tới giờ mở giữ chấm đỏ. Áp dụng chấm cạnh tên server trên màn hình đăng nhập và chấm chỉ báo trong danh sách máy chủ.

## 2. File/thư mục đã thay đổi

- Client `linhhoasu/webgame/game/js/main.min_a6195824.js`: thêm helper màu, hook SetCurServerName và renderer danh sách server. Duyệt ảnh redpoint trong serverBg nên không phụ thuộc private skin part _Image8.
- `linhhoasu/webgame/game/index.html`: cache key riêng main `20260905_server_status_color_v1`.
- Không sửa bitmap gốc, config.bin/EUI, state/status/isNew, lịch mở, quyền login hoặc server đang chọn.
- Tool: prepare_server_status_color.py, patch_server_status_color.js, test_server_status_color.js, deploy_server_status_color.py trong workbench/tools.
- Snapshot/test/deploy: `_ai_workbench/temp/server_status_color_20260905/`.
- Backup production: `/linhhoasu/_ai_workbench/backups/server_status_color_20260905_115625/`; local `_ai_workbench/backups/server_status_color_local_20260905/`.

## 3. Lỗi và giải pháp

| Phát hiện | Nguyên nhân | Sửa | Tránh lặp |
|---|---|---|---|
| Server mở vẫn chấm đỏ | Skin đặt ảnh login_bm_redpoint cố định | Filter đổi kênh đỏ/xanh theo trạng thái server khi refresh | Không đổi ảnh toàn cục vì server đóng vẫn cần đỏ |
| Danh sách dùng nhãn mới/đầy thay vì trạng thái mở | Cờ isNew và running có ý nghĩa khác | Thêm chấm độc lập, giữ nhãn mới/đầy | Không đổi state backend để tô màu |

## 4. Kỹ năng / kinh nghiệm mới

- Server mở: running không false/0, status dương, state không0/4/5, openTime đã tới theo đồng hồ server client.
- Dùng ColorMatrixFilter hoán đổi R/G giữ alpha và hình ảnh tròn gốc. Server đỏ dùng ảnh không filter.
- Indicator mới không bắt touch, không ảnh hưởng click chọn server. LoginUI và LoginUINew dùng chung refresh tên.

## 5. Kiểm tra và trạng thái

- 18assertions PASS: state1/2/3 mở xanh, đóng0/4/5 đỏ, status0/runningfalse đỏ, chưa tới giờ đỏ, ranh giới giờ xanh; không mutate row, không đổi ảnh nền khác.
- Hồi quy menuỦy thác27checks PASS; node --check bundlePASS.
- Haiartifacthashproduction khớp candidate; main trả quaHTTP đúnghash521721e7…; cachekey mới. PM2 trước/sau không thay, khôngrestartdịch vụ.
- Chưa nghiệm thu hình ảnh trên client thực tế của người dùng; người dùng tự test theo yêu cầu trước.

## 6. Hướng dẫn test

Ctrl+F5 rồi đăng nhập lại: chấm cạnh S1/S2 đang mở phải xanh. Mở danh sách máy chủ xem chấm tương ứng. Nếu sau này server bị đóng/chưa tới giờ mở, chấm đỏ khi danh sách/trạng thái được tải lại. Không tự khóa server để thử màu.
