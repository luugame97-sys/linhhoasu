# Audit sâu Hoang Cổ Mê Hàng — 16/10/2026

Phạm vi: read-only trên VPS `103.116.104.165`, S1–S9; không gọi RPC xác thực, không ghi player/DB, `productionWrites=0`.

## Lỗi xác nhận được

1. **24 hồ sơ bị kẹt trong state hành trình** (S1:1, S2:0, S3:1, S4:1, S5:3, S6:3, S7:7, S8:8, S9:0). Trong đó: 15 event hết hạn nhưng vẫn còn `sailing/currentEvent`; 4 hồ sơ đã tới đích nhưng còn event hết hạn; 5 hồ sơ đã tới đích nhưng không còn event để kết toán. Đây là dữ liệu Mongo thật, không phải suy đoán từ ảnh/UI. Bằng chứng: `_ai_workbench/temp/oldtrek_stuck_check_20261012/live.json` (chạy lại lúc 16/10).
2. **BXH live không bao phủ toàn bộ người chơi của mùa hiện tại.** Lịch hiện tại là mùa 4, nhưng dữ liệu lưu vẫn còn season cũ: S1 `1:934, 2:59, 3:67, 4:48`; S2 `1:275,2:3,3:5,4:3`; S3 `1:190,2:2,3:1,4:3`; S4 `1:147,2:2,3:1,4:2`; S5 `1:138,2:21,3:5,4:3`; S6 `2:141,3:11,4:4`; S7 `2:37,3:182,4:27`; S8 `3:38,4:176`. `OldTrekArenaService.roster(season)` chỉ query `oldTrekInfo.season === season`, còn `ensureOldTrekInfo()` rollover khi người chơi vào lại. Vì vậy BXH thay đổi theo việc ai đăng nhập/được rollover; người chưa vào bị loại khỏi BXH live. Settlement có archive fallback nhưng BXH live không có.
3. **Recovery hiện chưa phải background recovery.** `reconcileOldTrekPendingEvent()` chỉ được gọi trong các action 7001/7005/7008; `OldTrekSettlementService` chỉ chạy phát thư BXH. Không thấy worker quét và tự sửa các hồ sơ idle/stale, nên state kẹt có thể tồn tại cho tới khi người chơi bấm đúng luồng.
4. **Độ trễ gây cảm giác treo vẫn còn tái hiện trong log:** S1 có `slow send tag=7000` 3.498s và 7.361s; S3 5.184s; S4 3.001s; các request 7008/7010 trên S1/S4/S8 khoảng 0.5–1.1s. Đây là latency thật, chưa phải bằng chứng crash process.

## Lệch cấu hình cần xử lý

- `OLD_TREK_EVENT_ENGINE_ENABLED=1` và `OLD_TREK_SETTLEMENT_ENABLED=1` đang có trên cả 9 node, nhưng `OLD_TREK_SCOPED_CAS=1` chỉ có S5, S8, S9; S1–S4, S6–S7 không có. Đây là drift fleet. Nó không tự chứng minh là nguyên nhân duy nhất vì handler hiện tại vẫn đi qua generic `savePlayer(...oldTrekCAS)`, nhưng mọi nhánh phụ thuộc `OldTrekSnapshotService`/scoped save không đồng nhất giữa server.
- Public index hiện đang phục vụ `lhs-oldtrek-errors-v1.js?v=20261002_oldtrek_guard_v5` và `lhs-oldtrek-minigames-v1.js?v=20260921_v1`. Guard có retry/reload theo callback hoặc thao tác người chơi, không thay thế được background sweep; minigame marker vẫn cũ, cần native QA riêng trước khi gọi là lỗi gameplay.

## Chưa đủ bằng chứng để kết luận

- Chưa có native authenticated E2E được ủy quyền để tái hiện treo trên canvas, hoàn thành event, nhận settlement và chụp BXH trước/sau rollover.
- Chưa có dấu hiệu process chết/restart liên tục trong mẫu đọc; lỗi hiện thấy là state stale + latency và BXH thiếu roster, không phải crash đã chứng minh.

## Ưu tiên sửa

1. Tạo một reconcile worker idempotent/CAS quét `currentEvent` hết hạn, `arrived` và `arrived_without_event`, ghi ledger/settlement đúng một lần; chạy tuần tự S1–S9 và read-back.
2. Tách BXH live khỏi trạng thái “đã đăng nhập”: rollover/adopt mùa hiện tại phải chạy server-side trước khi query roster, hoặc query cả archive/current với policy rõ ràng; dùng cùng một nguồn snapshot cho BXH và settlement.
3. Đồng nhất `OLD_TREK_SCOPED_CAS` trên cả fleet sau khi xác định nhánh gọi thật; bổ sung metric/tag cho queue 7000/7008/7010 và native E2E sau deploy.
