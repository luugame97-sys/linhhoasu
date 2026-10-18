# Hoàn tác giao diện login TW (02/09/2026)

## Kết quả

- Đã khôi phục giao diện login về như trước khi thử nền TW.
- `start.min_52ac8d58.js`: mapping trở lại `inChina ? login_bg : login_bg_tw`.
- `main.min_a6195824.js`: lớp animation và điều kiện hiển thị trở lại bản cũ.
- `index.html`: cache token trở lại `20260831_tien_duyen_fix_v1`.
- Không sửa backend, database, asset ảnh hoặc logic đăng nhập.
- Không restart dịch vụ.

## Hậu kiểm

| Kiểm tra | Kết quả |
|---|---|
| Mapping cũ | 1 marker |
| Ép TW | 0 marker |
| Điều kiện visual `AppInfo.inChina` | 1 marker |
| Cache token mới TW | 0 marker |
| HTTP index/start/main/ready | `200/200/200/200` |
| Browser QA | Nền trắng mặc định trở lại |
| Console | Chỉ cảnh báo autoplay thông thường |

## Backup

- `/linhhoasu/_ai_workbench/backups/login_tw_rollback_before_20260901_172347/`

Các fix khác trước đó vẫn được giữ nguyên; rollback chỉ gồm đúng ba file của thử nghiệm hình ảnh TW.
