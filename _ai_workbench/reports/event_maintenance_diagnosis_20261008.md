# Vì sao vẫn hiện “Sự kiện đang bảo trì” — 08/10/2026

## Kết luận

Thông báo này hiện là **phản hồi chủ động của exposure gate**, không phải lỗi Mongo/Redis hay OldTrek. Không phải mọi event đã hoàn tất gameplay QA.

## Bằng chứng live

- `EventExposureGate.js` live SHA256: `d99f1d97b64d77bdc5ef408d3efa70e0cd06f254e84ba273237babf46a002462`.
- Guarded types: `21, 27, 30, 52`; allowlist `APPROVED_NATIVE_QA_VERSIONS` của bốn family vẫn rỗng.
- Với identity người chơi thường: `21001`, `27001`, `30001`, `52001` trả `isBlocked=true`; `37001`, `43002`, `44002`, `49001` không bị gate này chặn.
- Ngoại lệ chỉ dành cho Talo/S1 đúng `userId + playerId` QA; không phải allowlist public.
- Khi type bị chặn, server trả tag `1700`, `code=EVENT_MAINTENANCE`, message `Sự kiện đang bảo trì, vui lòng thử lại sau.`; task claim có thể trả tag `1000`/`1801` cùng mã.
- Client live `lhs-event-maintenance-v1.js` SHA256 `82084725e4ee42327e9ad556f724d271767d9e9261bd955a7353b1f5cfbfecbb`; hook tags `1700/1000/1801` và hiện toast `Sự kiện đang được bảo trì` khi response bị từ chối.
- Player cũ vẫn có thể giữ activity rows 21/27/30/52; row tồn tại không đồng nghĩa event được phép chơi. Vì vậy client có thể gửi request khi hydrate/mở panel và nhận maintenance.

## Trạng thái hệ thống

- S1–S7 `/ready` 200, Mongo/Redis true; OldTrek scoped-CAS không có lỗi mới trong cửa sổ hậu kiểm.
- Đây là fail-closed đúng chủ ý cho event chưa đủ contract/native QA, không được bỏ gate bằng cách bật cờ registry.

## Phạm vi còn cần xử lý

Nếu muốn hết toast cho người chơi thường, cần chọn một trong hai hướng có kiểm chứng: (1) ẩn/ngừng gọi panel cho các ID đang bị khóa; hoặc (2) hoàn tất native QA rồi thêm allowlist và canary từng event. Không tự mở 21/27/30/52 chỉ để tắt thông báo.

Không có production mutation, player write hoặc deploy trong lượt chẩn đoán này.
