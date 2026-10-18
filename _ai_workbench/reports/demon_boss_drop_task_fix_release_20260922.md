# Fix Yêu Vương → nhiệm vụ Rơi thăng bậc — 22/09/2026

## Đã triển khai

- Giữ `raidInfo.demonBossInfo.stage` là mốc Yêu Vương cao nhất đã vượt; login không còn hạ nó theo `roleStage - 1`.
- Càn quét stage đã vượt ghi thêm `other_attr_info.mainTaskProgress.dungeonBossMaxMapId`, nên task `activeId=39` bền vững qua relog.
- Thắng Yêu Vương thật cũng ghi cùng mốc progress.
- ACK càn quét/claim gửi lại các task type7 của tier hiện tại và các mốc boss type7 đã hoàn thành; client cập nhật ngay, không cần đăng xuất.
- Giữ nguyên guard stage tương lai, giới hạn càn quét, chi phí, cleanout reward; không cấp mốc chưa vượt và không phát thưởng vượt ải hồi tố.

## Kiểm chứng

- Fixture thực dùng config/task/runtime code: **10 nhóm PASS**, gồm ca tier3 boss17, ca tier10→11 đã vượt boss36, relog, task type7 client cache, thăng bậc trừ đúng 450 Nguyên bảo, thiếu cấp/thiếu cấp rơi/thiếu boss bị từ chối.
- Core gameplay contract và role-level 2000 regression: **PASS**.
- Live read-only: stage17 → login vẫn17; `TaskConfig[70203] activeId=39 target17`; normalized task = `17/17 status20`; `playerWrites=0`.
- Bản migration v3 khôi phục frontier từ task Yêu Vương type7 đã hoàn thành (không tự tạo mốc mới). Với `votinh135/S2` → nhân vật `ZâmCaCa`, task `70210` đã lưu `36/36`, nên sau chuẩn hóa stage/frontier =36; task hiện tại `972011` vẫn đúng `36/37`, chưa tự đánh dấu boss37.
- Bản v4 gọi migration ngay trong handler thăng bậc, nên người chơi đang online không cần relog trước khi kiểm điều kiện.
- UI đã rút gọn task Yêu Vương thành `Yêu Vương: mốc N`; chỉ đổi text client, điều kiện/progress giữ nguyên. HTTP index/addon PASS, không restart game process.
- 5/5 node online; readiness Mongo/Redis 5/5 PASS.

## Release / backup

- Server files: `linhhoasu/lhs/newServer/src/handlers/dungeon.js`, `raid.js`.
- Backup local: `_ai_workbench/backups/demon_boss_drop_task_fix_20260922/`.
- Backup production: `/linhhoasu/_ai_workbench/backups/demon_boss_drop_task_fix_20260922/`.
- Backup migration v3: `/linhhoasu/_ai_workbench/backups/demon_boss_drop_task_fix_20260922_v3/`.
- Evidence: [release.json](I:/Linhhoasu/server/server/_ai_workbench/temp/demon_boss_drop_task_fix_20260922/release.json).

Lưu ý: ảnh người chơi đang ở **180/190**, nên vẫn phải đạt cấp nhân vật190 trước khi thăng bậc; bản fix này chỉ xử lý điều kiện Yêu Vương và đồng bộ nhiệm vụ.
