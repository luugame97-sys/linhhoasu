# Login kẹt 100% — 08/10/2026

## Nguyên nhân

Client đã tải xong asset nhưng `tag=1` login batch bị chờ `savePlayer()` đồng bộ. MongoDB lúc đó có các operation timeout 5 giây, WSServer giữ request tới 15–20 giây rồi đóng socket; vì batch hydrate chưa trả xong nên client đứng ở 100%.

Mongo process không chết: `mongod -f /www/server/mongodb/config.conf` vẫn nghe `127.0.0.1:27017`; query player đơn lẻ sau đó nhanh. Vấn đề là login chờ một save normalization không thiết yếu trong cùng request.

## Sửa

- `account.js` candidate đổi login normalization save sang `savePlayerDeferred()` nếu có; login tiếp tục dựng/trả batch, save vẫn đi qua queue hiện tại và lỗi được log.
- Source candidate SHA256: `5f92756d3a830d93895cee9738a861fe464069cfbf2067268ffd1e0be49ed9da`.
- Backup: `/linhhoasu/_ai_workbench/backups/login_stuck_fix_20261008_052700`.

## Triển khai và kiểm chứng

- Canary S1 qua backup/CAS, restart và `/ready` PASS.
- Browser login S1 sau canary vào được map; WSServer log ghi tag1 hoàn tất với batch hydrate, không còn chuỗi Mongo timeout ở lần đó.
- Rolling S2–S7 hoàn tất; mỗi node `/ready` Mongo/Redis PASS. PIDs S2–S7 đổi đúng do restart; admin/dist/bots không restart.
- Manifest: `_ai_workbench/temp/login_stuck_20261008/release.json`, phase `fleet_ready`, playerWrites `0`.

## Giới hạn còn theo dõi

- Mongo có thể vẫn chậm dưới tải cao; cần theo dõi login/save latency tiếp. Không tăng timeout để che lỗi.
- Lỗi `NotAllowedError` autoplay âm thanh trên browser độc lập với login và không chặn dữ liệu game.
