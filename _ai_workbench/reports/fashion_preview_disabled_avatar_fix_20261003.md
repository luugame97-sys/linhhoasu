# Tắt preview thời trang custom và sửa avatar cá nhân — 03/10/2026

## Kết luận kiểm chứng

- Bundle Trung nguyên bản `main.min_a6195824.js.bak` vẫn dùng `checkSuitShow()` → `IsSuitActive()` và `GetSuitList()`/`getAllSuit(false)` lọc ownership. Không có cơ chế native xem trước đồ chưa sở hữu.
- `_ai_workbench/temp/cozy_rip/main.min_a6195824.js` có marker `LHS_FASHION_CATALOG_20260909`; đây là artifact đã patch, không dùng làm bằng chứng native Trung nguyên bản.

## Đã thay đổi production

- Gỡ `lhs-fashion-hidden-preview-v1.js` khỏi manifest và xóa file public; URL trả `404`.
- Giữ native fashion Trung nguyên bản; không thay mua/nâng cấp/nhuộm/ownership.
- Nâng `lhs-avatar-upload-v1.js` lên v2: bridge `PlayerInfoModel.getPlayerIconData()` để truyền `avatarurl/avatarUrl` cho renderer `HeadItem`, cập nhật cả hai key sau upload và phát event refresh.
- Server avatar v1 giữ nguyên: `avatarUrl`/`avatarUploadAt`, tag `1807`, cooldown 7 ngày, kiểm signature/size.

## Rollout/evidence

- Backup/CAS: `/linhhoasu/_ai_workbench/backups/fashion_preview_disabled_avatar_v2_20261003_074053`.
- Receipt: `_ai_workbench/temp/fashion_preview_disabled_avatar_20261003/deployment.json` — `DEPLOYED_VERIFIED`.
- Static-only, `processRestarts=0`, `directPlayerWrites=0`, `remotePlayerWrites=0`.
- Loopback/public index marker chỉ còn `20261003_avatar_upload_v2`; avatar addon hash khớp candidate; preview addon `404`.
- Readiness sau rollout: S1–S6 HTTP 200; PM2 PID/restart không đổi.

## Còn thiếu

- Chưa upload lại bằng tài khoản QA và chưa browser E2E xác nhận ảnh hiển thị trên từng vị trí UI. Người chơi cần Ctrl+F5, upload lại ảnh một lần; nếu URL đã lưu nhưng icon cũ còn cache, reload game rồi mở lại Ngoại quan/khung người chơi.

### QA avatar sau bản v2

- Fixture native-shaped xác nhận `getPlayerIconData()` trả đồng thời `avatarurl` và `avatarUrl` từ `PlayerInfoModel.playerInfo.avatarUrl`; đây là field mà `PlayerBgItem/HeadItem` dùng để ưu tiên ảnh URL.
- URL đã lưu trước đó không cần upload lại nếu vẫn còn trong player; chỉ cần Ctrl+F5/đăng nhập lại. Nếu player chưa có `avatarUrl`, upload một ảnh mới sau khi reload.
