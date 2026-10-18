# Ops audit Thần Đình Thái Cổ / Mine — 20/09/2026

Phạm vi: read-only trên VPS `103.116.105.154`, không ghi player/DB, không restart.

## Live/deploy

- Source live `src/handlers/mine.js`: SHA-256 `63d557621b3257984adae4e99f98c6da8421faad8b3956d35ea00498195e7b60`.
- `src/services/MineExitValidationService.js`: `2bff007763aeeb90efe9dc3f1ab4c5967cd5208803b359f71a9fd724426792e0`.
- `src/handlers/index.js`: `810e14732e7bef3c6769492858b5cef784d9c2c8f84787dc4caaaa7c34425d01`.
- CAS evidence: `_ai_workbench/temp/mine_fix_20260920/deploy_20260919_175920.json`.
- PM2 `lhs-s1001..s1005` online, cwd `/linhhoasu/lhs/newServer`, exec `src/app.js`; S1–S4 `/ready` 200 (8080/8083/8084/8085), S5 `/ready` 200 (8086).
- Runtime env: `FEATURE_SIDE_TASKS_ENABLED=1`, `FEATURE_SIDE_TASK_ROOTS=90020`; `FORCE_UNLOCK_SYSTEM_IDS=10010,209,216,219,220,222` (311 không force); S2–S5 `IDENTITY_MONGO_DB=lhs_s1001` dùng shared GameServer config.

## Route/client/gate

- Live routes index đăng ký `2800` start, `2801` dig, `2802` deal event, `2803` finish, `2804` claim box.
- Client `MineMainPanel.openCheck()` kiểm `UnlockSystem.isSystemUnlock(311)` trước khi mở; đây là hệ `SystemConfig[311]` “Thần Đình Thái Cổ”.
- `SystemConfig[311]` điều kiện level >=75 và serverRunDay >=3. S5 mở 10:00 ngày 20/09 nên serverRunDay=1 trong ngày mở; bị khóa theo config hiện hành.
- Index hiện dùng `main.min_drop100.js?v=20260920_server_open_time_v1`; bundle served SHA `45707b493820f489955d8322d09bd0a171d44ee0b4074f3d957425f0abdcead5`. Nginx bundle cache `max-age=604800, immutable`, nhưng query cache key đã đổi sau hotfix.

## Logs/live player evidence

- Sau uptime hiện tại (S1–S4 restart khoảng 01:43 GMT+7), không có lỗi `2801–2804`; S1 có `2800` chậm 1005ms lúc 01:04 trước lần restart hiện tại.
- Queue depth >42k và wait ~1,220,000ms ngày 19/09 là log process cũ, trước restart hiện tại; không dùng làm lỗi đang xảy ra.
- Hứa Thanh S3 hiện có hệ 311, `mineInfo.currentLevel`: level0/cycle1, meter21, playerMeter19/playerCol1, 144 blocks (92 dug), 7 events, finish=false, item55=193; log không có 2800–2804 gần đây. Read-only BFS theo map hiện tại tìm được 18 block mục tiêu kề đường đi; state không chứng minh bị khóa hình học.
- Persisted DB còn 15 hồ sơ không-bot theo cờ đơn giản, level>=75 nhưng thiếu 311 (S2=4,S3=5,S4=6); tất cả stale (>24h, không có record recent). In-memory refresh với đúng `SERVER_ID` + `IDENTITY_MONGO_DB=lhs_s1001` thêm được 311 cho sample S2/S3/S4. Chưa có bằng chứng refresh production hỏng cho account đang online.

## Lỗi/việc cần xác minh tiếp

1. Nếu account bị khóa: lấy userId/server cụ thể, kiểm packet login `systemUnlockInfo.unlockedSystem` và log tag `7000`; nếu thiếu 311 dù level/day đủ thì chạy refresh/CAS có journal.
2. Nếu account đã có 311 nhưng không có tag 2800: lỗi nằm client click/open hoặc cache/session; kiểm DevTools RPC và tải lại bằng cache key mới.
3. Nếu có tag 2801 `result=1`: lưu `reason` (`MINE_DIG_*`) và request path để đối chiếu MineExitValidation; không tự reset `mineInfo` hay cấp thưởng.
4. Giữ backend validation hiện tại; không bypass 311 hoặc disable path validation khi chưa có request/path evidence.

## Probe hygiene

- Một probe gọi ServerConfigService.findServerConfig() trên DB rỗng lhs_s1005, làm seed tạm 12 gameservers docs. Đã lưu backup _ai_workbench/temp/s5_gameservers_accidental_seed_20260920.json, xóa đúng 12 docs sau khi kiểm tra timestamp seed-only (before=12, deleted=12, after=0), rồi drop collection rỗng và xác nhận `exists=false` như trước probe. Không restart/player writes.
