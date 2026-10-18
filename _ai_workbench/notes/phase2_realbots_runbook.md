# Phase 2 – real WebSocket bots (cập nhật 02/09/2026)

## Phạm vi

`lhs-real-bots` là worker riêng tạo kết nối WebSocket native thật. Mỗi bot có một player Mongo riêng để server có thể load role, nhưng bot được đánh dấu `isBot=true` và không được tính vào `online:count`.

Worker chỉ được phép gửi login, heartbeat, map enter/leave/move, chat map và luồng ủy thác quái map `2000 -> 2001`. Router chặn các tag mua hàng, nạp tiền, mail, guild, PvP/ranking và luồng farm ải cũ `2300/2301`.

Thoại của bot được lấy từ `src/data/chat.txt` theo đúng tên nhân vật. Nhân vật không có mục riêng sẽ dùng fallback an toàn.

## Cấu hình canary hiện tại

Các biến nằm trong `/linhhoasu/lhs/newServer/.env` trên VPS, quyền file `600`. Không ghi token vào source, log hoặc báo cáo.

```text
BOT_WORKER_ENABLED=1
BOT_WORKER_COUNT=58
BOT_WORKER_WS_URL=ws://127.0.0.1:9200
BOT_WORKER_SERVER_ID=1001
BOT_WORKER_MAP_IDS=10001,10016,10018
BOT_WORKER_MAP_LINE=0
BOT_WORKER_CHAT_ENABLED=1
BOT_WORKER_HEARTBEAT_MS=20000
BOT_WORKER_MOVE_MIN_MS=30000
BOT_WORKER_MOVE_MAX_MS=60000
BOT_WORKER_CHAT_MIN_MS=120000
BOT_WORKER_CHAT_MAX_MS=300000
BOT_WORKER_FARM_ENABLED=1
BOT_WORKER_FARM_MIN_MS=120000
BOT_WORKER_FARM_MAX_MS=240000
BOT_WORKER_FARM_COUNT=1
BOT_WORKER_FARM_MOVE_SETTLE_MS=750
BOT_WORKER_FARM_CLAIM_DELAY_MS=1800
BOT_WORKER_FARM_CLAIM_TIMEOUT_MS=12000
BOT_WORKER_FARM_RESPAWN_MS=10000
BOT_WORKER_FARM_LOG=1
BOT_WORKER_CONNECT_INTERVAL_MS=750
```

## Kiểm tra

1. `pm2 status`: `lhs-real-bots` và `lhs-s1001` phải `online`; không restart `lhs-dist`/`lhs-admin`.
2. `/health`: `bots.real.count=58`, đúng 1 bot thật mỗi map; virtual population là 580 (10 bot ảo mỗi map).
3. Redis: các key `s1001:session:lhs_real_bot_*` tồn tại; không dùng các key này để cộng online.
4. Mongo: các player bot có `isBot=true`, `botWorker=phase2`.
5. Log worker phải có login/map/chat; worker không có error.
6. Theo dõi CPU, RAM, event-loop, WS queue, chuỗi `2000/2001`, `runtime.mapMonsters` và restart count.

## Hợp đồng quái map

- `MapMonsterService` đọc `animBorns` từ map resource thật, hiện có 58 map/1.233 slot.
- Claim được khóa theo server/map/line/index và WebSocket owner; trùng mục tiêu trả `busy`, claim hết hạn không được nhận thưởng.
- Bot gửi `1402` tới tọa độ quái rồi mới gửi `2000`; sau ACK thành công mới gửi `2001`.
- Bot tự mặc món mạnh hơn và bán đồ yếu qua `EquipService`; open list không được tích lũy vô hạn.
- Người chơi thật giữ nguyên hợp đồng client native; chỉ managed bot bị kiểm tra khoảng cách server-side.

## Rollback

Đặt `BOT_WORKER_ENABLED=0` trong `.env`, sau đó `pm2 restart lhs-real-bots --update-env` và `pm2 save`. Nếu cần tắt cả code managed-bot, khôi phục backup `phase2_realbots_pre_*` rồi chỉ restart `lhs-s1001`.

Không xóa player bot tự động trong rollback để tránh thao tác phá dữ liệu; có thể giữ làm account kỹ thuật hoặc xóa riêng sau khi xác nhận danh sách ID.
