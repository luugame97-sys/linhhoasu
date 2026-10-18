# Càn quét Yêu Vương các mốc đã vượt — 22/09/2026

## Kết quả

- Các dòng Yêu Vương đã vượt (`stage <= mốc đã mở`) nay hiện nút **Càn quét**; nút gửi đúng stage của dòng, không luôn ép về mốc gần nhất.
- Server chặn stage tương lai, giữ nguyên mốc cao nhất, không làm tụt tiến độ.
- Mỗi càn quét nhận `cleanoutRewards` của stage và cộng `dungeonBossChallengeCount` để hoàn thành nhiệm vụ khiêu chiến; không phát lại phần thưởng vượt ải lần đầu.
- Giới hạn dùng chung theo ngày GMT+7. Mức gốc runtime là 6; quyền hiện có được cộng theo group 2 (ví dụ 6 + 2 = 8 như UI). Ngày đầu rollout giữ bộ đếm cũ; sang ngày mới tự reset.

## File và backup

- Server: `linhhoasu/lhs/newServer/src/handlers/raid.js`, `linhhoasu/lhs/newServer/src/handlers/dungeon.js`.
- Client: `linhhoasu/webgame/game/js/main.min_drop100.js`, `linhhoasu/webgame/game/index.html` (cache token `20260922_demon_boss_sweep_v1`).
- Backup local: `_ai_workbench/backups/demon_boss_sweep_20260922/`.
- Backup production: `/linhhoasu/_ai_workbench/backups/demon_boss_sweep_20260922`.

## Kiểm chứng

- Test càn quét cô lập: **PASS 5 ca**, gồm stage cũ, stage tương lai, giữ mốc, cộng nhiệm vụ, giới hạn 8, reset ngày và bảo toàn bộ đếm cũ; `productionWrites=0`.
- Core gameplay contract: **PASS**.
- Role-level 2000 regression: **PASS**.
- Sau deploy: cả 5 node `online`; readiness Mongo/Redis **5/5 PASS**; hash 4 file và HTTP `index.html`/`main.min_drop100.js` khớp local.
- Bản v2 sau kiểm thử sâu cô lập phép tính quyền trên snapshot, tránh khởi tạo `fashionInfo` khi request bị từ chối; backup v2 `/linhhoasu/_ai_workbench/backups/demon_boss_sweep_20260922_v2`, read-back hash/readiness 5/5 PASS.
- Chưa dùng tài khoản thật và chưa tiêu Nguyên bảo/nhận quà thật trong QA.
