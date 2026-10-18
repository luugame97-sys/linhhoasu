# Deploy Hồn ngọc loại 23–28 level 11–100 — 13/09/2026

- Tạo **540 item template mới**: 6 loại `23–28` × 90 level (`11–100`), ID chạy `25101–25996` theo loại/level.
- Giữ nguyên level 1–10; mỗi level mới có `synthesisValue=3`, recipe `3 viên level trước → 1 viên level sau`; level 100 không có level tiếp theo.
- Bổ sung `GemLevelConfig`, `GemComposeConfig`, `AssetsConfig`, `GemShapeConfig`, `LanguageConfig`; item mới dùng lại icon level 10 tương ứng để không bị thiếu resource. `GemBaseConfig.maxQuickLevel/filterLevel/comFilterLevel` mở đến 100.
- Deploy server/client/fashion config, language config và cache token index qua backup `/linhhoasu/_ai_workbench/backups/gem_level100_20260913_pre`; sau đó sửa icon bằng deploy thứ hai, backup `/linhhoasu/_ai_workbench/backups/gem_level100_icons_20260913_pre`.
- Live post-check sau lượt cuối: S1/S2/S3 `/ready=200`, PM2 online, config có 588 GemLevel rows tổng (48 cũ + 540 mới), level 100 type 23–28 tồn tại, log lỗi cấu hình rỗng. Evidence: `temp/gem_level100_20260913/deploy.json`, `icons-deploy.json`.

## Lưu ý economy

- Từ 1 viên level 10 lên level 100 cần `3^90 = 8.727.963.568.087.712.425.891.397.479.476.727.340.041.449` viên level 10.
- Đây là đúng tỷ lệ 3:1 người dùng yêu cầu; chưa phải economy thực tế hợp lý. Không tự cộng item cho player.
- Native E2E ghép level 10→11 chưa chạy vì không có tài khoản QA đủ 3 viên level 10 cùng loại; cần QA tự cấp/chuẩn bị item rồi test.
