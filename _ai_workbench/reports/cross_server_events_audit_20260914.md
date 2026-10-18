# Audit sự kiện liên server — 14/09/2026

Phạm vi: read-only, đối chiếu source/config và live VPS `103.116.105.154`; không sửa code, không restart, không ghi Mongo/Redis.

## Kết quả live

- Thời điểm đọc live: khoảng `2026-09-14 00:22 GMT+7`.
- `lhs-s1001`, `lhs-s1002`, `lhs-s1003` đều `online`; `/ready` các cổng `8080/8083/8084` đều `200`.
- Không có Redis key `cross:node:*` hoặc `cross:events*` trong lần SCAN; chưa có bằng chứng node liên server đang heartbeat/publish.
- Trong log 24 giờ gần nhất, Cross Rival có request thật trên S1 (tag `6551/6553/6563/6570`, tổng 7) và S3 (tags `6550/6551/6553/6560/6561/6563/6567/6570/6571`, tổng 46); S2 không có tag Cross Rival. Các request này xác nhận handler đang được gọi, không xác nhận backend ghép server hay settlement liên server.

## Phân loại module

| Module | Lịch config | Trạng thái runtime | Nhận định |
|---|---|---|---|
| Cross Rival (`6550–6583`) | `CrossRivalOpenConfig` gần nhất là match 4, kết thúc `26/07/2026`; mọi row config hiện đã quá hạn | Mongo còn `crossRivalInfo` match 4: S1 `1996`, S2 `849`, S3 `661`; các row có `endTime` trong tương lai một phần; log S3 có request tag `6551` lúc `00:01` và `00:50` | Handler đang bị mở kéo dài: `resolveCrossRivalOpenState()` ép `endTime >= now + 24h`, nên không fail-closed sau cutoff. Đây là “mở theo runtime/logic”, không phải một kỳ liên server đã được lịch hóa đúng. `score>0`: 0 ở cả 3 DB. |
| Cross Arena (`5000–5002`, fight type `16/17`) | Không có `CrossArenaOpenConfig`/lịch mở riêng | Có state S1 `9`, S2 `2`, S3 `0`; challenge list gọi `loadSameServerArenaOpponents()`, sau đó mới rơi về robot; `RankService` không có key `crossArena` (chỉ `arena`, `tower`) | Endpoint có thể trả dữ liệu, nhưng hiện không phải đấu liên server thật và không có BXH crossArena bền vững. |
| Top Arena (`6200–6221`, tag fight `2350`) | Các kỳ config gần nhất kết thúc `20/07/2026`; kỳ kế tiếp trong config là năm `2077` | Mongo cả 3 DB không có `topArenaInfo`; handler tự sinh robot/default `matchEndTime` khoảng 24h, không gate theo `TopArenaOpenConfig` | Config đang đóng; UI/handler có thể hiện một phiên synthetic, không phải event live đã mở. |

## Event dễ nhầm nhưng không phải liên server

- Kim Mã/hoạt động type 44 (`44001/44002`) đang mở theo cửa sổ từng server `28/08–26/09/2026`. `buildActivity44RankPacket()` lọc `Player.find({ serverId })`, nên BXH là per-server.
- Câu cá `6006` đang ở kỳ `13/09 19:00–20/09 19:00 GMT+7`; settlement kỳ trước đã `done` riêng S1/S2/S3 (`event_rank_v2_100x_6006_...`). Đây cũng không phải BXH liên server.

## Source evidence

- `src/handlers/cross-rival.js:127-145,383-394`: resolver chọn match lịch sử và kéo `endTime` tối thiểu thêm 24h.
- `src/handlers/arena.js:913-923,1099-1107,1972-2008`: Cross Arena lấy đối thủ cùng server, ghép robot và dựng rank từ chính challenge list.
- `src/services/RankService.js:9-12`: chỉ khai báo key `arena` và `tower`, không có `crossArena`.
- `src/handlers/activity.js:444-468`: Activity44 rank query có điều kiện `serverId`.

## Kết luận hiện tại

Chưa xác nhận có sự kiện liên server nào đang chạy đúng nghĩa. Cross Rival là trường hợp đáng chú ý nhất: lịch đã đóng nhưng handler/runtime vẫn cho phép truy cập do logic kéo dài cutoff; Cross Arena và Top Arena chỉ là endpoint/synthetic state, chưa có transport/BXH liên server live.

## Hậu kiểm sau triển khai

Đã triển khai candidate backend luân phiên theo chấp thuận người dùng. Cấu hình mới đặt anchor `14/09/2026 00:00 GMT+7`, chu kỳ 7 ngày, rotation `crossRival/crossArena/topArena`, `CROSS_EVENT_ENABLED=1`. Syntax, contract lịch, core 714 bảng, PM2 và readiness đều PASS. Native cross-server E2E và settlement qua cutoff vẫn chưa chạy; trạng thái này không được coi là nghiệm thu cuối.
