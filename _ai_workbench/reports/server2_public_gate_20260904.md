# Session Report — Public S2 và khóa vào đến 17:00 04/09/2026

## 1. Tóm tắt công việc

- Đã cho S2 (`serverId=1002`) xuất hiện công khai trong danh sách server.
- S2 hiển thị trạng thái chưa mở (`state=4`) trước `17:00 ngày 04/09/2026`, múi giờ Asia/Bangkok (UTC+7).
- Đã khóa server-authoritative trên cả HTTP và WebSocket: trước giờ mở trả `SERVER_NOT_OPEN`; từ đúng timestamp `1788516000000` trở đi tự cho phép, không dùng cron và không cần restart.
- Đã định tuyến S2 đúng endpoint `lhs.mg365.fun:81/ws-s2`; Nginx `/ws-s2` trỏ riêng tới `127.0.0.1:9201`.
- Account/GameServer và auth session dùng chung từ identity S1; MongoDB/Redis gameplay S2 vẫn tách riêng.
- Không tạo account/player S2 trong kiểm thử trước giờ mở và không phát sinh giao dịch/phần thưởng.

## 2. File/thư mục đã thay đổi

### Source chính

- `linhhoasu/lhs/newServer/src/services/ServerAccessService.js`: gate theo `running/status/openTime`.
- `src/handlers/serverList.js`: state theo giờ, endpoint theo server, chặn protocol `2820/2818/2819` trước giờ mở.
- `src/handlers/account.js`: chặn trực tiếp tag đăng nhập WebSocket trước giờ mở.
- `src/net/WSServer.js`: trả `code/openTime` khi login bị gate và đóng socket xác thực thất bại.
- `src/net/HTTPServer.js`: proxy fail-closed các protocol account/role của S2 tới HTTP node `8083`.
- `src/services/AuthSessionService.js`: cho phép auth session dùng prefix Redis identity chung trong khi gameplay giữ prefix riêng.
- `src/db/models/Account.js`, `src/db/models/GameServer.js`: dùng identity database cấu hình bởi `IDENTITY_MONGO_DB`.
- `linhhoasu/lhs/newServer/ecosystem.config.js`: endpoint S2, node router, auth prefix và identity DB.
- Production Nginx `/www/server/panel/vhost/nginx/game.lhs.conf`: thêm `/ws-s2 -> 127.0.0.1:9201`.
- Production MongoDB `lhs_s1001.gameservers`: S2 `running=true`, `status=1`, `isNew=true`, `openTime=1788516000000`.

### Tool/evidence

- `_ai_workbench/tools/test_server_scheduled_access.js`.
- `_ai_workbench/tools/qa_server2_public_gate.js`.
- `_ai_workbench/tools/publish_server2_schedule.js`.
- `_ai_workbench/tools/deploy_server2_public_gate_20260904.py`.
- `_ai_workbench/tools/audit_server2_postdeploy.py`.
- Evidence: `_ai_workbench/temp/server2_public_gate_deploy_20260903_172734.json`.
- Snapshot hậu kiểm: `_ai_workbench/temp/server2_public_gate_snapshot_20260903_214725/`.
- Backup production: `/linhhoasu/_ai_workbench/backups/server2_public_gate_pre_20260903_172734/`.
- Backup local: `_ai_workbench/backups/server2_public_gate_pre_20260903_170000/`.

## 3. Lỗi đã gặp & giải pháp

| Lỗi | Nguyên nhân | Cách xử lý | Cách tránh lặp lại |
|---|---|---|---|
| Core contract lỗi `connection.models` | Mock Mongoose của contract không cung cấp `connection` | Model identity fallback an toàn sang `mongoose.model` khi connection mock không tồn tại | Model dùng connection tùy chọn phải tương thích test double |
| Local không nạp được native `bcrypt_lib.node` khi instantiate toàn HTTPServer | `node_modules` local thiếu binary bcrypt phù hợp Windows | Dùng syntax/unit/core local và live integration trên đúng runtime CentOS production | Native addon phải test trên runtime đích, không lấy lỗi ABI local làm kết luận production |
| Một số bot timeout handshake sau restart S1 | 580 socket reconnect rải tải trong khi listener vừa khởi động | Không restart worker; chờ cơ chế reconnect/backoff tự hồi phục | Hậu kiểm restart S1 phải đợi realBots đạt lại 580 và backlog socket về 0 |
| Local có một số file hạ tầng cũ hơn production | Các phiên trước deploy trực tiếp rồi chưa đồng bộ đủ local | Tạo candidate từ snapshot production, không upload đè bằng bản local cũ; sau deploy mới đồng bộ source | Luôn hash local/remote và abort khi production drift |

## 4. Kỹ năng / kinh nghiệm mới

- Public visibility và quyền vào game là hai trạng thái độc lập: `running=true` để hiển thị, còn `openTime` được enforce ở mọi đường đăng nhập.
- Multi-server an toàn cần dùng chung identity/auth nhưng tách Player/gameplay MongoDB và Redis.
- Proxy protocol sang node khác phải fail-closed; không fallback về S1 khi S2 lỗi vì có thể tạo nhân vật sai database.
- Gate được kiểm tra ở cả HTTP cấp token và WebSocket tag đăng nhập để không thể bypass bằng client sửa đổi hoặc token cũ.

## 5. Trạng thái hiện tại

- Lúc hậu kiểm `04:48 ngày 04/09/2026 +07`: S2 công khai, `running=1`, `status=1`, `state=4`, `openTime=1788516000000`.
- Kiểm thử live trước giờ mở: HTTP `2820` và WebSocket tag login đều trả `SERVER_NOT_OPEN` cùng đúng `openTime`.
- Contract mô phỏng đúng mốc: trước 17:00 bị khóa; từ đúng 17:00 trả trạng thái mở.
- `lhs-s1001` PID `29479`, `lhs-s1002` PID `28386`, cả hai online; chỉ mỗi process được restart đúng một lần trong deploy.
- `lhs-real-bots`, `lhs-dist`, `lhs-admin` không restart.
- S1 và S2 `/ready=200`; MongoDB/Redis healthy; `9200/9201` listen loopback; route `/ws-s2` có mặt.
- Bot S1 đã hồi phục `580/580`; cửa sổ hậu kiểm cuối không có handshake timeout mới.
- S2 còn `0` account và `0` player gameplay; không có dữ liệu QA rác.
- Evidence SHA-256: `12c717a3f572b38db4246e18675a5b176d95b7e3cc93d2d0a652430c27fb7275`.

## 6. Bước tiếp theo

1. Chủ server không cần thao tác lúc 17:00; gate tự mở theo timestamp server.
2. Ngay sau 17:00, thực hiện native acceptance: mở danh sách → chọn S2 → tạo nhân vật → vào thành chính → relog.
3. Xác minh Player mới chỉ xuất hiện trong `lhs_s1002`, S1 không đổi inventory/progress.
4. Tiếp tục kiểm tra WebGM/mail/Webshop/Giftcode/Donate theo `serverId=1002` trước khi quảng bá đầy đủ các dịch vụ phụ.
