# S4 — lịch mở 17:00 ngày 16/09/2026 (UTC+7)

## Kết quả

- Đã triển khai S4 `serverId=1004`; giờ mở authoritative `1789552800000` = `2026-09-16T10:00:00Z` = 17:00 Việt Nam. Public từ bây giờ nhưng trước giờ mở trả `state=4` / `SERVER_NOT_OPEN`; từ đúng giờ gate tự cho vào, không cần cron hay thao tác thủ công.
- Runtime `lhs-s1004`: HTTP `127.0.0.1:8085`, WS `127.0.0.1:9203`, public `/ws-s4`. Gameplay Mongo `lhs_s1004`, Redis `s1004:`; identity và auth dùng chung `lhs_s1001` / `s1001:`.
- Bot S4 theo cấu hình 580 của S3, có launcher riêng `scripts/start-scheduled-bots-s4.js`; không load worker/kết nối trước 17:00. Read-back trước giờ: 0 player, 0 account tham chiếu role S4; worker log đúng giờ chờ.
- WebGM thêm slot4, route `1004 -> http://127.0.0.1:8085`; feature webshop/recharge/daily bật, 16 giftcode WebGM active và 50 mốc Donate dùng catalog chung. Không copy giftcode/claim hay player từ server cũ.
- Giữ nguyên nhóm liên-server đã được duyệt S1–S2–S3; không tự thêm S4 vào pool. S4 giữ arena settlement tắt theo effective runtime S3; event settlement activation từ giờ mở S4.

## Phạm vi và an toàn

- Candidate tạo từ file đang chạy trên VPS, chỉ nối thêm block S4 vào ecosystem; không upload toàn bộ source local. `serverList.js`, `AccountService.js`, `HTTPServer.js` không thay đổi hash; giữ bản vá login, không khôi phục fallback `lastSelectedServerId`.
- Backup không ghi đè: `/linhhoasu/_ai_workbench/backups/server4_launch_20260916` (ecosystem, Nginx, WebGM env, PM2 dump, metadata/routing); file có secrets chỉ giữ trên VPS với quyền hạn chế.
- Chỉ thêm một gameserver row1004, không sửa metadata S1–S3 và không sửa/xóa tài khoản hoặc nhân vật thật.
- Restart game nodes lần lượt để nạp đúng ba biến routing S4; giữ nguyên effective env khác, đặc biệt không bật nhầm arena trên S3 bằng ecosystem stale. S1 `1498→1499`, S2 `172→173`, S3 `47→48`; admin/dist/bot cũ giữ PID/restart. S4/bot S4 restart0.

## Kiểm chứng

- Syntax Node + test bot gate PASS: config strict, không load/kết nối trước giờ, khởi động đúng một lần tại mốc giờ, readiness retry, clock correction và stop cancellation.
- Config compare PASS: các app cũ chỉ đổi WS_PUBLIC_PORT_1004, WS_PUBLIC_PATH_1004, SERVER_NODE_HTTP_MAP. Disk hashes sau deploy khớp candidate; các gameserver row cũ nguyên vẹn; PM2 save thành công.
- Readiness HTTP8080/8083/8084/8085 và WS9203 đều healthy Mongo/Redis.
- Launch QA trên 5 đường 8080/8083/8084/8085/81: list/latest đều S4, đúng `/ws-s4`, openTime và state4. 20 probe HTTP/REST + 2 WS probe bị chặn `SERVER_NOT_OPEN`, không tạo account/player. 6 kiểm tra logic mốc 16:59:59.999 / 17:00 PASS bằng clock giả lập, không mở gate thật.
- Native-protocol QA riêng S1/S2/S3 qua Nginx public: SDK → WS tag1 và tag500 → refresh không serverId → relog → explicit server routing → trở về S1 PASS. Mỗi server đúng 1 role trong đúng DB, không duplicate; `realPlayerWrites=0`. Đã xóa account/player/rank/token QA của lượt test; DB read-back không còn account/player QA.
- WebGM route S4 đúng; unknown ID fail-closed; lookup account không tồn tại trả `PLAYER_NOT_FOUND` (không phải gửi thưởng thật).
- External IP `103.116.105.154:81`: latest S4, SDK gate và WS `/ws-s4` PASS. `https://lhs.mg365.fun` hiện do vhost WebGM nhận (root302 login, `/gameMsg.do`404); đây là cấu hình có sẵn, không đổi trong lượt S4. Game cổng81 đã xác minh.
- Hậu kiểm 09:57–10:05 UTC+7: không có restart thêm; log S4 chỉ có SERVER_NOT_OPEN do QA, bot chưa vào. Error tail cũ S1–S3 có `Connection is closed` không timestamp; không dùng đó để khẳng định zero-error toàn bộ. Login QA thực tế đã PASS.

## Còn thiếu và rollback

- Chưa đến 17:00 nên chưa thể nghiệm thu native player đăng nhập/tạo nhân vật S4 và redeem giao dịch thật sau mở. Không bypass gate hoặc tạo player S4 để giả nghiệm thu.
- Nếu cần rollback: CAS đặt riêng row1004 private, stop riêng `lhs-s1004`/`lhs-real-bots-s4`, khôi phục đúng file/biến routing đã đổi từ backup sau đối chiếu; `nginx -t`, reload, readiness. Không drop DB hoặc xóa player phát sinh sau mở.
- Evidence triển khai: `_ai_workbench/temp/server4_launch_20260916/evidence.json`; VPS `/linhhoasu/_ai_workbench/temp/server4_launch_20260916/evidence.json`.
- Tools: `deploy_server4_launch_20260916.py`, `qa_server4_launch_20260916.js`, `qa_multiserver_launch_login_20260916.js`, `test_s4_bot_gate_20260916.js`.
