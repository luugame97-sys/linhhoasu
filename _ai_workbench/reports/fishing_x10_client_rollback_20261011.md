# Rollback lỗi vào game — 11/10/2026

- Triệu chứng: sau publish addon x10, người chơi không vào được game.
- Đính chính sau kiểm tra 07:27 ICT: index local cũ được publish trong đợt x10/rollback chứa hai script không tồn tại trên VPS (`lhs-homeland-guard-v1.js`, `lhs-toparena-v3.js`). Loader dừng ở 404. Kết luận trước về lớp `FishingCard` chưa có bằng chứng runtime.
- Đã rollback dòng manifest `lhs-fishing-x10-v1.js?v=20261010_fishing_x10_s1` khỏi index bằng CAS.
- Đã thay file addon bằng bản no-op an toàn để cả index cũ còn cache cũng không chạy logic x10.
- Server S1 và gói `11000022` giữ nguyên; không rollback server purchase handler.
- Public sau rollback: index HTTP 200, không còn marker load addon; addon HTTP 200 và chỉ chứa rollback no-op.
- Backup index: `/linhhoasu/_ai_workbench/backups/fishing_x10_client_rollback_20261011_001012`.
- Backup addon: `/linhhoasu/_ai_workbench/backups/fishing_x10_client_s1_20261011_001222`.
- Phục hồi bổ sung: trả về exact live index `fd9611f0…` trước x10; kiểm index + 51 URL JS PASS và browser hiển thị màn đăng nhập. Backup `/linhhoasu/_ai_workbench/backups/restore_live_manifest_20261011_002652`.
- Người chơi cần đóng tab game, mở lại bằng Ctrl+F5; nếu service worker còn cache, xóa cache site rồi mở lại.
