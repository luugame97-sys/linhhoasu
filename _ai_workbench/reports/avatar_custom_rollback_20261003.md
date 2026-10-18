# Rollback toàn bộ avatar custom — 03/10/2026

## Kết quả

- Đã khôi phục server/index về preimage trước avatar custom.
- Đã xóa `AvatarUploadService`, handler tag `1807`, addon avatar client và marker manifest.
- Preview addon đã bị gỡ từ bước trước; URL preview/avatar custom đều trả `404`.
- Không ghi player/DB; rolling restart S6→S1 hoàn tất, readiness Mongo/Redis 6/6.

## Bằng chứng

- Receipt: `_ai_workbench/temp/avatar_custom_rollback_20261003/rollback.json` — `ROLLED_BACK_VERIFIED`.
- Backup trạng thái trước rollback: `/linhhoasu/_ai_workbench/backups/avatar_custom_rollback_20261003_075510`.
- Preimage khôi phục: `handlers/index.js`, `Player.js`, `playerPayload.js`, `basic.js`, `index.html` khớp backup rollout trước avatar.

## Dữ liệu còn giữ

- Ảnh đã upload và các field `avatarUrl/avatarUploadAt` cũ không bị xóa để tránh phá hủy dữ liệu ngoài phạm vi. Code gốc hiện không đọc/hiển thị hoặc cho upload chúng.
