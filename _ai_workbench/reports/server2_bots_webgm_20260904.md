# Session Report — Bot và WebGM cho Server 2

## 1. Tóm tắt công việc

- Đã cấu hình S2 giống S1 với `580` bot ảo và `580` bot thật, phân bố `10 bot/map` trên `58` map.
- Thêm process riêng `lhs-real-bots-s2`, kết nối `ws://127.0.0.1:9201`, `serverId=1002`; dữ liệu bot chỉ ghi MongoDB `lhs_s1002` và Redis prefix `s1002:`.
- Bot thật dùng protocol native `1402 -> 2000 -> 2001`, server quyết định monster/reward; không thực hiện purchase, recharge, guild hoặc ranking.
- Đã bổ sung WebGM server `1002` và route API riêng `http://127.0.0.1:8083`; S1 tiếp tục dùng `8080`.
- WebGM login/role lookup/mail/WebShop/Tích Donate/Donate SePay/daily check-in và ledger được giữ theo server người chơi chọn.
- Đã kiểm thử bridge gửi 1 thư item số lượng 1 tới bot S2, xác nhận thư nằm đúng `lhs_s1002` và xóa sạch thư QA ngay sau kiểm tra.
- Đã phát hiện và khóa thêm REST `/api/user/login` trên cả S1/S2 để WebGM không thể tạo role S2 trước 17:00.
- Đã chạy E2E hoàn nguyên cho GiftCode, Tích Donate và WebShop bằng role người chơi S2 thật; toàn bộ ledger/mail đi đúng S2 và dữ liệu QA đã được xóa.

## 2. File/thư mục đã thay đổi

### Production

- `/linhhoasu/lhs/newServer/ecosystem.config.js`: bật bot ảo S2 và thêm worker `lhs-real-bots-s2`.
- `/linhhoasu/webgame/gm/config.php`: chọn API base theo server; role lookup, ownership check, mail và clear action đi đúng node.
- `/linhhoasu/webgame/gm/.env`: thêm `LHS_SERVER_COUNT=2`, S2 ID/key/name và API base `8083`; không thay đổi secret.
- PM2: thêm process `lhs-real-bots-s2`; chỉ restart `lhs-s1002`, không restart S1/bot S1/WebGM/Nginx.
- `/linhhoasu/lhs/newServer/src/net/HTTPServer.js`: enforce `ServerAccessService` cho REST user login trên cả node.

### Local/tool/evidence

- `linhhoasu/lhs/newServer/ecosystem.config.js`: đồng bộ cấu hình production mới.
- `_ai_workbench/tools/snapshot_server2_bots_webgm.py`.
- `_ai_workbench/tools/update_webgm_s2_env.py`.
- `_ai_workbench/tools/audit_webgm_server2_contract.php`.
- `_ai_workbench/tools/qa_webgm_s2_mail.php`.
- `_ai_workbench/tools/deploy_server2_bots_webgm_20260904.py`.
- Evidence: `_ai_workbench/temp/server2_bots_webgm_deploy_20260903_222442.json`.
- Snapshot hậu kiểm: `_ai_workbench/temp/server2_bots_webgm_snapshot_20260903_223128/`.
- Backup production: `/linhhoasu/_ai_workbench/backups/server2_bots_webgm_pre_20260903_222442/`.
- Backup local: `_ai_workbench/backups/server2_bots_webgm_local_pre_20260904/`.
- Evidence REST gate: `_ai_workbench/temp/server2_rest_gate_deploy_20260903_223519.json`.
- Evidence GiftCode/Tích Donate: `_ai_workbench/temp/webgm_s2_feature_qa_20260904_032816.json`.
- Evidence WebShop: `_ai_workbench/temp/webgm_s2_webshop_qa_20260904_033150.json`.

## 3. Lỗi đã gặp & giải pháp

| Lỗi | Nguyên nhân | Cách xử lý | Cách tránh lặp lại |
|---|---|---|---|
| Remote Python không hiểu `from __future__ import annotations` | VPS dùng Python 3.6 | Bỏ future import không cần thiết; deploy dừng trước mutation | Tool chạy remote phải tương thích Python 3.6 của VPS |
| Schema gate báo ledger VIP chưa tách server | `auth_codes` dùng `used_server_id`, không dùng tên chung `server_id` | Verifier kiểm tra đúng cột theo từng bảng | Audit schema theo contract thực tế, không giả định cùng tên cột |
| WebGM chỉ khai báo S1 và mọi call dùng `LHS_GAME_HTTP_BASE=8080` | Cấu hình cũ single-server | Thêm API base theo từng server và truyền server key xuyên suốt role/mail/clear/login | Mọi bridge đa server phải route theo session server ở backend |
| Nguy cơ WebGM gửi quà S2 vào S1 | Role lookup/mail trước đây luôn gọi node 8080 | S2 lookup/mail gọi 8083 và kiểm tra `accountId + userId + serverId` | HTTP 2xx không đủ; phải readback mail trong đúng DB gameplay |
| REST `/api/user/login` có thể tạo role trước giờ mở | Gate ban đầu chỉ phủ protocol native và WebSocket | Thêm `ServerAccessService` trước auth/create-role trên REST ở S1 và S2 | Mọi entrypoint đăng nhập phải dùng chung access gate |
| Audit bot báo `claims=0` dù log farm liên tục | Tool đọc nhầm `bots.mapMonsters` thay vì `runtime.mapMonsters` | Sửa parser và readback lại `claims=22647`, `completed=22646` | Kiểm chứng schema health bằng log native trước khi kết luận |
| E2E PHP đầu lỗi `require_once ../config.php` | Wrapper chạy sai working directory | Chạy action từ `/linhhoasu/webgame/gm/api`; setup được cleanup tự động | PHP legacy relative include phải giữ đúng cwd khi test CLI |

## 4. Kỹ năng / kinh nghiệm mới

- WebGM ledger đã có scope phù hợp: `auth_codes.used_server_id`; các bảng `giftcode_logs`, `daily_checkins`, `sepay_logs`, `recharge_milestone_claims`, `webshop_orders`, `gm_logs` dùng `server_id`.
- Ví tiền Xu Web vẫn thuộc tài khoản chung, nhưng order/history và quyền nhận quà được ghi theo server hiện tại.
- WebShop và Tích Donate đang bật; Daily check-in đang bật. GiftCode thực tế hoạt động theo từng mã `giftcodes.is_active`; action `submit_giftcode` không phụ thuộc cờ `giftcode_enabled`.
- S2 bot cần process riêng để không trùng state/socket worker S1; cùng ID dạng `lhs_real_bot_###` vẫn an toàn vì gameplay database/prefix tách riêng.

## 5. Trạng thái hiện tại

- S1: `580` bot thật, hoạt động bình thường; không restart.
- S2: `580` bot thật + `580` bot ảo, process `lhs-real-bots-s2` online, restart count `0`.
- MongoDB S2: `580` player, toàn bộ là bot; `0` người chơi thật tại thời điểm hậu kiểm.
- S2 `invalid=0`, `claims=22.647`, `completed=22.646`; log live liên tục có `map-farm open ok` và `map-farm claim ok` trên nhiều map.
- Tải hậu kiểm cuối: load `1,45`; RAM khả dụng khoảng `12.038 MB`; swap còn `5.096 MB`; đủ biên an toàn.
- WebGM login HTTP 200 và có lựa chọn S1/S2; S2 API base là `127.0.0.1:8083`.
- REST gate: cả `8080` và `8083` trả HTTP 403 `SERVER_NOT_OPEN` trước 17:00; probe không tạo thêm role/Player.
- Có 1 role người chơi S2 đã phát sinh trước khi vá REST gate; giữ nguyên vì ownership Account/Player hợp lệ, không phải artifact bot/QA.
- E2E role routing: role S2 được lookup qua `8083`, đúng `serverId=1002`; cùng role không xuất hiện trong kết quả S1.
- E2E GiftCode: response thành công; `giftcode_logs`, delivery batch và `gm_logs` đều S2; mail `S2=1`, `S1=0`.
- E2E Tích Donate: response thành công; claim/event key/GM log đều S2; mail `S2=1`, `S1=0`; không cộng/trừ ví thật.
- E2E WebShop: order `paid`, `server_id=1002`, đúng role S2; order S1 bằng 0; mail `S2=1`, `S1=0`; ví Xu đã phục hồi đúng số ban đầu.
- Cleanup readback: GiftCode QA `0`, milestone QA `0`, SePay QA `0`, WebShop item/order QA `0`, claim/log/mail QA `0`; Player item không đổi.
- Evidence SHA-256: `11fee47d8557f5552b5ca737637a88e6d31178c21bb749f5080d29e06b883ebc`.

## 6. Bước tiếp theo

1. Sau 17:00, người chơi đăng nhập WebGM chọn S2 và thao tác bình thường; backend đã route/validate theo S2.
2. Theo dõi giao dịch thật đầu tiên của S2 bằng `webshop_orders.server_id=1002`, `sepay_logs.server_id=1002` và mail `targetServerId=1002`.
3. Không cần bật cờ GiftCode riêng; chỉ cần mã cụ thể có `is_active=1`, chưa hết hạn/hết lượt và người chơi chưa claim mã đó trên S2.
