# OldTrek S6 canary review — 07/10/2026

Phạm vi read-only: kiểm tra hash runtime, PID/readiness và source candidate sau canary S6.

## Kết quả

- Ba file runtime trên remote khớp candidate: `old-trek.js` `5b7f46...06af`, `PlayerService.js` `d9bb76...5579`, `OldTrekSnapshotService.js` `3067c5...60aa`.
- S1–S7 online; S6 PID `683527`; readiness 7/7 tại 10:37:46Z HTTP200, Mongo/Redis true. Snapshot mode `640 root:www`.
- Log S6 có `OLD_TREK_SAVE_NOT_CONFIRMED` trước thời điểm restart 09:30; không thấy lỗi OldTrek tương ứng sau restart trong cửa sổ bounded đã đọc.

## Blocker trước khi mở rộng

Đường dẫn source là shared cho toàn fleet nhưng chỉ restart S6. Exact `handlers/index.js` eagerly require `old-trek.js`, và handler eagerly require PlayerService: các node đang chạy giữ phiên bản cũ qua Node module cache, ordinary lazy require cùng đường dẫn không tải lại. Restart bất ngờ/cache eviction mới làm nạp candidate ngoài đợt rolling dự kiến. Không thể kết luận fleet đã sửa.

`PlayerService.loadPlayer()` gọi `oldTrekSnapshots.remember(player)` cho mọi lần load. Hàm này flatten, sort đệ quy và SHA-256 toàn player document; đây là chi phí chung cho mọi node và mọi luồng, không chỉ OldTrek. Cần loại bỏ khỏi hot path hoặc đưa sau gate OldTrek trước khi rollout thêm node.

Không có thay đổi production/player trong lần review này.
