# Mở rộng thú cưỡi lên cấp 1000 — 13/09/2026

- Giữ nguyên cấp 1–150, phẩm chất 2/3/4/6/7 và sao tối đa 40.
- Thêm cấp 151–1000 trong `SwordLevelConfig` server, client cơ sở và client fashion; item nâng cấp vẫn là **Tinh túy ID 20**.
- Công thức phí: cấp `L → L+1` dùng `L × hệ số phẩm chất`, hệ số Q2/Q3/Q4/Q6/Q7 lần lượt `10/20/50/100/200`. Dòng cấp 1000 không có cấp kế tiếp và phí đặt 0.
- Thuộc tính cấp mới tiếp tục tăng tuyến tính từ delta cấp 149→150; không sửa bảng khác. Sao 40 không đổi.
- Sửa `mount.js`: thiếu item trong production trả lỗi, không save/không trả success giả; trước đây vẫn trả `result=0` dù level không tăng.
- Thêm client `lhs-mount-fix-v1.js`: chỉ animation/refresh thuộc tính khi RPC `3204` thành công; lỗi giữ nguyên state.

## Nguyên liệu từ cấp 150 lên 1000

| Phẩm chất | Tinh túy ID 20 |
|---:|---:|
| Q2 | 4.883.250 |
| Q3 | 9.766.500 |
| Q4 | 24.416.250 |
| Q6 | 48.832.500 |
| Q7 | 97.665.000 |

Tổng theo luồng nâng từng cấp, chưa trừ số dư người chơi; không bao gồm chi phí/hoàn nguyên liệu khi nuốt hoặc reset.

## Kiểm chứng/deploy

- Candidate builder: `_ai_workbench/tools/build_mount_level1000_20260913.js`; output giữ 713 frame khác byte-exact và 1–150 không đổi.
- Deploy server/client/fashion config + handler + client guard qua backup `/linhhoasu/_ai_workbench/backups/mount_level1000_20260913_pre`.
- Live post-check: cả Q2/Q3/Q4/Q6/Q7 đều 1000 cấp; index marker `20260913_spirit_mount_level1000_v1`; S1/S2/S3 `/ready=200`; PM2 online; error markers rỗng.
- Evidence: `_ai_workbench/temp/mount_level1000_20260913/deploy.json`, `postcheck.json`.
- Chưa có native E2E tại cấp 150→151 hoặc 999→1000 vì cần fixture có item 20 tương ứng; không tự cộng item cho người chơi.
