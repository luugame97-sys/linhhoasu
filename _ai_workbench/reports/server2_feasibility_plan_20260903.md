# Kế hoạch mở Server 2 — Linh Họa Sư

## 1. Kết luận

**Có thể mở S2**, nhưng **không được chỉ bỏ comment `lhs-s1002` và đổi `running=true`**. Làm như vậy có ba lỗi chắc chắn:

1. S2 sẽ đụng cổng `8081` của S1 vì `AGENT_HTTP_PORT` đang dùng giá trị mặc định.
2. Danh sách server hiện gán cùng endpoint `/ws` của S1 cho mọi server, nên chọn S2 vẫn nối tới S1.
3. S2 dùng MongoDB/Redis riêng, trong khi account/token/role được tạo tại S1; WS S2 sẽ không tìm thấy token hoặc nhân vật.

Phương án đúng là: **dùng chung định danh tài khoản + auth session, tách riêng dữ liệu gameplay S1/S2, định tuyến HTTP/WS theo server**.

## 2. Hiện trạng production (read-only)

| Hạng mục | Hiện trạng |
|---|---|
| PM2 | `lhs-s1001`, `lhs-real-bots`, `lhs-dist`, `lhs-admin` online; chưa có `lhs-s1002` |
| S1 | WS `9200`, HTTP `8080`, agent HTTP `8081` |
| Khung S2 | Có sẵn trong ecosystem nhưng bị comment; WS `9201`, HTTP `0`, DB `lhs_s1002`, Redis prefix `s1002:` |
| MongoDB | Chỉ có `lhs_s1001`; chưa có `lhs_s1002` |
| Dữ liệu S1 | 598 account, 1.627 player; toàn bộ player thuộc server 1001 |
| ServerConfig | S2 (`1002`) tồn tại nhưng `running=false`, `status=0` |
| Nginx | Chỉ có `/ws -> 9200`; chưa có route S2 |
| WebGM | `LHS_SERVER_COUNT=1`, chỉ khai báo S1001; một API base tới `8080` |
| Tài nguyên | 6 CPU, khoảng 12,5 GB RAM khả dụng, 22 GB disk trống; đủ chạy S2 không bot để canary |

Lưu ý: `lhs-s1001` đang dùng khoảng 88,7% một core và worker bot khoảng 18%. Không nên bật 580 bot cho S2 ngay ngày đầu.

## 3. Kiến trúc đề xuất

```text
Client/WebGM
   ├─ HTTP login/server list ──> S1 gateway :8080
   ├─ WS S1 /ws ───────────────> lhs-s1001 :9200
   └─ WS S2 /ws-s2 ────────────> lhs-s1002 :9201

Identity/Auth dùng chung
   ├─ Account + GameServer: central identity connection
   └─ Auth token: Redis prefix dùng chung riêng cho auth

Gameplay tách biệt
   ├─ S1: Mongo lhs_s1001 + Redis s1001:
   └─ S2: Mongo lhs_s1002 + Redis s1002:
```

Điều này giữ cùng tài khoản/mật khẩu khi vào S1 hoặc S2, nhưng nhân vật, bang hội, bảng xếp hạng, thư và tiến độ không trộn lẫn.

## 4. File cần sửa

### Game server — bắt buộc

| File | Thay đổi cần làm |
|---|---|
| `/linhhoasu/lhs/newServer/ecosystem.config.js` | Bật block `lhs-s1002`; dùng `WS_PORT=9201`, `HTTP_PORT=8083`, `AGENT_HTTP_PORT=0`, `SERVER_ID=1002`, DB `lhs_s1002`, Redis `s1002:`; sao chép toàn bộ flag bảo mật của S1; bot S2 mặc định tắt |
| `src/app.js` | Khởi tạo/đóng kết nối identity và auth Redis dùng chung; giữ gameplay DB/Redis theo từng process |
| `src/net/HTTPServer.js` | Cho phép bind HTTP nội bộ S2 vào `127.0.0.1`; forward các protocol account/role tới node đúng server; public `/api/user/login` định tuyến theo `serverId` |
| `src/handlers/serverList.js` | Trả endpoint riêng từng server; route `2820/2818/2819` đúng S1/S2; không tạo role S2 trong DB S1 |
| `src/services/AuthSessionService.js` | Dùng auth Redis chung thay vì Redis gameplay có prefix `s1001:`/`s1002:`; dual-read token S1 cũ trong giai đoạn chuyển tiếp |
| `src/services/AccountService.js` | Account dùng central identity DB; khóa/atomic role creation để hai server không tạo trùng hoặc ghi đè mảng roles |
| `src/db/models/Account.js` | Chuyển model Account sang connection identity dùng chung |
| `src/db/models/GameServer.js` | Chuyển ServerConfig sang identity connection; không để DB S2 trống tự seed 12 server `running=true` |
| `src/services/ServerConfigService.js` | Đọc config trung tâm và kết hợp route node theo server |

### Nginx — bắt buộc

| File | Thay đổi cần làm |
|---|---|
| `/www/server/panel/vhost/nginx/game.lhs.conf` | Thêm `/ws-s2 -> 127.0.0.1:9201`; giữ `/ws -> 9200`; WebSocket upgrade, timeout và header giống S1 |

### WebGM — bắt buộc nếu S2 phải dùng đầy đủ Webshop/Giftcode/Donate

| File | Thay đổi cần làm |
|---|---|
| `/linhhoasu/webgame/gm/.env` | `LHS_SERVER_COUNT=2`, thêm key/ID/name S1002 và base API nội bộ S2 `127.0.0.1:8083` |
| `/linhhoasu/webgame/gm/config.php` | Chọn API base theo server; lookup role, gửi thư, dọn mail/bag và login phải đi đúng node; không gửi quà S2 vào DB S1 |
| `api/user_api.php` | Kiểm tra các action lấy đúng server session; phần lớn đã server-scoped nhưng phải test route mail/role S2 |
| `api/sepay_webhook.php` | Xác minh Donate S2 ghi `server_id=1002` và cấp entitlement đúng node |
| `admin/admin_api.php` | Lọc/điều phối người chơi, mail, khóa và log theo node S1/S2 |

### Game admin riêng — nên sửa trước khi public S2

| File | Thay đổi cần làm |
|---|---|
| `/linhhoasu/lhs/LHS-admin/server.js` | Gateway `/game` hiện chỉ trỏ một origin; thêm lựa chọn/upstream theo server |
| `/linhhoasu/lhs/LHS-admin/admin-users.html` | Thêm server selector và truyền server mục tiêu cho thao tác người chơi/mail/log |

## 5. File nên thêm

| File mới | Mục đích |
|---|---|
| `src/db/identityMongo.js` | Kết nối Account/GameServer dùng chung; có thể trỏ tới DB S1 hiện tại để không migrate 598 account ngay |
| `src/db/authRedis.js` | Redis connection/prefix auth dùng chung, tách khỏi rank/gameplay Redis |
| `src/services/ServerNodeRouterService.js` | Mapping `1001 -> :8080,/ws`, `1002 -> :8083,/ws-s2`; chỉ cho phép upstream loopback |
| `src/services/IdentityLockService.js` | Lock ngắn theo account khi tạo/chọn role, chống concurrent login hai server |
| `config/server-nodes.json` | Mapping node không chứa secret; có validate và fail-closed |
| `scripts/test-multiserver-contract.js` | Contract account chung, role tách, endpoint đúng, token đúng node, no cross-leak |
| `_ai_workbench/tools/deploy_s2_canary.*` | Deploy/checkpoint/rollback idempotent; cờ `running=true` là bước cuối |

Nếu muốn cross-server chat/sự kiện thật, cần thêm connection Redis dùng chung cho `CrossBus.js` và `NodeRegistryService.js`. Ngày mở đầu nên giữ các tính năng cross-server tắt cho tới khi contract riêng PASS.

## 6. Trình tự triển khai an toàn

### Pha 0 — snapshot

1. Backup ecosystem, Nginx, WebGM `.env/config`, source liên quan.
2. Dump Account/GameServer S1 và lưu hash.
3. Giữ S2 `running=false` trong toàn bộ giai đoạn kỹ thuật.

### Pha 1 — identity/auth chung

1. Tách Account/GameServer sang identity connection.
2. Tách auth session sang Redis auth prefix chung, dual-read token S1 cũ.
3. Test cùng account đăng nhập được ở cả hai process, không đổi mật khẩu.

### Pha 2 — node S2 private

1. Tạo DB `lhs_s1002` rỗng và indexes bằng app migration.
2. Chạy `lhs-s1002` chỉ bind loopback: HTTP `8083`, WS `9201`; `AGENT_HTTP_PORT=0`.
3. Bot S2 tắt; không public Nginx; không bật server list.

### Pha 3 — routing

1. S1 gateway forward protocol login/tạo/chọn role sang S2 theo `serverId`.
2. Server list trả S1 `/ws`, S2 `/ws-s2`.
3. Nginx thêm route `/ws-s2`; `nginx -t` rồi reload.
4. WebGM và admin chọn upstream theo server.

### Pha 4 — staging/canary

1. Tài khoản test có role riêng S1 và S2; relog/restart vẫn giữ đúng.
2. Kiểm tra PID socket: S1 tới `9200`, S2 tới `9201`.
3. Kiểm tra Mongo: S1 player chỉ ở `lhs_s1001`, S2 player chỉ ở `lhs_s1002`.
4. Test native: server list → chọn S2 → tạo nhân vật → chọn hệ → vào thành chính → đánh quái → thư → relog.
5. Test WebGM S2: login, Webshop, Giftcode, Donate, mail và log bằng giao dịch test được phê duyệt; không dùng tiền thật mặc định.
6. Soak ít nhất 30–60 phút; theo dõi CPU, event loop, save queue, Mongo/Redis.

### Pha 5 — mở public

1. Đặt tên `S2`, openTime mới, `status=1`.
2. Chỉ sau khi mọi gate PASS mới đổi `running=true` cho ID 1002.
3. Bật không bot hoặc số bot thấp; tăng bot sau khi theo dõi tải thực.

## 7. Rollback

1. Đổi S2 `running=false` trước để ngăn đăng nhập mới.
2. Dừng riêng `lhs-s1002`; giữ nguyên DB `lhs_s1002`, không xóa player.
3. Gỡ route `/ws-s2` và reload Nginx.
4. Khôi phục WebGM/server router từ backup; S1 không cần rollback dữ liệu.
5. Nếu lỗi lớp identity/auth, dual-read giúp token S1 cũ tiếp tục trong TTL; rollback code rồi restart riêng `lhs-s1001`.

## 8. Tiêu chí hoàn thành

- Chọn S2 thực sự nối PID `lhs-s1002`, không phải S1.
- Một tài khoản dùng cùng mật khẩu nhưng có hai nhân vật độc lập.
- S1 không đổi progress/inventory khi chơi S2 và ngược lại.
- Bang hội, arena/rank, thư, webshop/donate và log đúng server.
- Restart/relog không mất role, token hoặc quà.
- S1 `/ready=200`; S2 private `/ready=200`; không có lỗi auth/ROLE_NOT_FOUND.
- Rollback ẩn S2 trong một thao tác và không xóa dữ liệu.

## 9. Trạng thái phiên này

- Chỉ audit read-only và lập kế hoạch.
- Chưa tạo DB S2, chưa bật process/port/server list, chưa sửa source hoặc Nginx production.
- Evidence: `_ai_workbench/temp/server2_audit_20260903/summary.json`.
