# Sửa phát thưởng xếp hạng Kim Mã và câu cá — 13/09/2026

## Kết quả

- Đã deploy `rank-mail-20260913-v2` trên `/linhhoasu/lhs/newServer`; S1/S2/S3 runtime `EVENT_SETTLEMENT_ENABLED=1`, activation `1789292110847`. Hậu kiểm 16:54 GMT+7: online, `/ready` 8080/8083/8084 = 200, hash source/config khớp local; không có error marker EventSettlement mới trong phần log kiểm tra.
- Sửa phạm vi **Activity44 Kim Mã**, **Activity6 id6006 thi câu cá** và các **Activity33 có bảng rank** theo rotation hiện hành. Không tuyên bố đã audit/sửa mọi event khác. Không đổi phần thưởng hiện có, gameplay RNG, điểm, inventory hoặc balance trong đợt sửa scheduler.
- Câu cá: bỏ đường heartbeat tự cộng quà rank; mọi người online/offline dùng cùng scheduler gửi Mail, chốt sau end +60 giây. Kỳ đầu hết **19:00 ngày 13/09/2026 GMT+7**; khoảng 19:01–19:01:30 scheduler mới bắt đầu phát. Chưa đến hạn tại thời điểm bàn giao nên **chưa nghiệm thu một kỳ production thật**, chưa native claim E2E.

## Cơ chế

- Snapshot roster bất biến vào `eventrewardsettlements`, cả người đã nhận trực tiếp vẫn đứng trong rank nhưng delivery được skip. Phân server, loại bot/managedBot, score>0, thứ tự tie theo playerId, đủ tất cả bracket kể cả 501+.
- Mail `_id`/eventKey xác định từ server+event+window+player; resume dùng snapshot cũ, không tính lại top. Receipt không TTL; Mail 30 ngày từ cutoff. Xóa mail sau hoàn tất không khiến phát lại. Nếu mail được nhận/xóa trong khoảng lỗi receipt, kiểm tra `mailClaimLedger` trước tạo lại.
- Chụp điểm sau role mutation locks và drain pending saves. Scheduler không ghi đè `fishInfo.eventStats` hay toàn bộ Player; tránh làm mất catch mới và tranh chấp session.
- Kim Mã legacy: giữ hạn từng row cũ, chờ **hạn muộn nhất** trên mỗi server rồi chốt chung; không xếp hạng mỗi người thành nhóm riêng hoặc chỉ lấy những người vừa hết hạn. Nhân vật mới dùng window cố định theo config, không tự kéo thêm 13 ngày mỗi login. Đã hiệu chỉnh S3 theo row cuối sinh trong thời gian chuyển bản: end `1790415628301`; không sửa row người chơi.
- Bảng rank Kim Mã sửa lọc server/bot/zero score, dedupe peer online, trả đúng activityId và thống nhất tie order. Không mở lại event đã hết trên tài khoản cũ.
- Người đã nhận gói xin lỗi top1+2+3 của **kỳ legacy** được giữ hạng và skip thưởng rank bù thêm; lưu receipt theo batch đã xác nhận. Kỳ mới phải được cấu hình window/identity mới, không tự mở lại kỳ cũ.

## File chính

- `src/services/EventRewardSettlementService.js`
- `src/services/NewYearEventSchedule.js`, `src/config/eventRewardSettlement.json`
- `src/db/models/EventRewardSettlement.js`
- `src/handlers/activity.js`, `src/services/FishingEventService.js`, `src/app.js`

## Kiểm chứng

- 24 test: scope, zero/bot, tie, >100 rank, prior-paid giữ rank, invalid identity/window/score/config, cutoff/grace, snapshot bất biến, retry sau lỗi insert/receipt, parallel worker, xóa mail, claim ledger, TTL, compensation skip, heartbeat không grant trực tiếp, catchup sau restart.
- Mongo integration DB QA biệt lập: đúng schema production Mail/ObjectId và EventRewardSettlement/Mixed, tạo 3 thư/3 receipt, retry không thêm; native `toClientMail` giữ đúng attachments/sender/id. DB QA đã xóa sau kiểm chứng theo marker sở hữu. Đây là kiểm thử backend + serialization, không phải native UI claim.
- Core contract 714 bảng PASS; syntax PASS. Read-only live validate **184 bracket** reward qua RewardGrantService PASS.
- Evidence: `_ai_workbench/temp/event_settlement_fix_20260913/prepared.json`, `deploy.json`, `finalize.json`, **`final-verification.json`** (bản cuối, sau chỉnh cutoff S3). `deploy.json` là trước điều chỉnh 1 mốc S3.

## Đối soát batch xin lỗi — cần lưu ý

- 16:24 đã xác nhận 94/48/11 thư. Đến 16:49 còn 93/48/10 thư: hai user `u_Wk_1001_770460_1788525948362` (HanhGia_1001_2a89b2f5e6_) và `u_Wk_1003_7f616f_1789285151641` (Tí Bắp).
- Trong lượt này đã chạy lại writer cũ và tạo **2 thư mới** lúc 16:50. **Không có bằng chứng rằng hai thư cũ chưa được nhận**: việc không còn Mail có thể do đã nhận rồi xóa. Vì vậy có nguy cơ cấp gói xin lỗi lần hai cho hai user trên; không coi đây là xác nhận thiếu thưởng. Không tự thu hồi hay trừ tài sản khi chưa đối soát được nguồn.
- Đã khóa CLI `audit_newyear_rank_mail_20260913.py --apply` bằng `BATCH_CLOSED` để tránh tái diễn. Receipt lâu dài hiện có 94/48/11 người; batch này không được replay bằng cách tìm Mail còn thiếu.

## Deploy/rollback

- Đợt đầu v1 đã chép/reload nhưng runtime flag chưa bật, 0 thư settlement; sau rà lỗi đã thay v2. Backup v1 bị ghi đè do retry, **không dùng làm baseline gốc**.
- Backup trước v2: `/linhhoasu/_ai_workbench/backups/event_settlement_fix_v2_20260913_pre`; CAS manifest trong prepared.json. Bản v2 deploy có cổng receipt mismatch nên dừng trước reload; tiếp tục đúng bước receipt/reload, không replay chép file hay ghi đè backup.
- Nếu rollback: **tắt EVENT_SETTLEMENT_ENABLED ở runtime/ecosystem trước**; chỉ restore file có baseline trong prepared.json/backup đã xác minh rồi scoped restart. Không dùng service v1 với flag bật; không xóa/replay receipt hay mails, không restore toàn bộ Player.
- Kỳ câu cá thật 19:01 cần đối chiếu snapshot recipients/delivered với Mail/eventKey, xác nhận native nhận thư/relog; phần này còn chờ cutoff, không chạy cưỡng ép thời gian production.
