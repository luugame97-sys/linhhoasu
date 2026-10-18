# Session Report — Điều chỉnh quà Donate và gửi bù

## 1. Tóm tắt công việc

- Mốc Donate tuần từ **400.000đ đến 5.000.000đ** tăng Bánh Bao x10; mốc thấp hơn giữ nguyên.
- Tất cả mốc Donate đang hoạt động có Điểm kỹ năng (item 5) đổi sang Đùi Gà (item 65) theo tỷ lệ **10:1**.
- Đã xử lý **38 nhân vật / 429 lượt nhận có bằng chứng**: thu 3.825.000 Điểm kỹ năng, gửi 382.500 Đùi Gà và bù 5.400.000 Bánh Bao cho 11 nhân vật.
- Mỗi nhân vật có receipt bất biến, một thư event key duy nhất; retry không thu/gửi lần hai.

Claim ID 422 (S1) có thư báo đã nhận nhưng không có mailClaimLedger khớp và không còn số điểm trong túi. Claim này được giữ manual review, không thu 10.000 điểm và không gửi bù suy đoán.

## 2. File/thư mục đã thay đổi

- Production: cập nhật `recharge_milestones.reward_items` của 50 mốc; thêm `DonateRevisionService.js`, `donateRevision20260907.json` và endpoint HMAC `/api/internal/player/donate-revision-20260907` trên S1/S2.
- Player đã xử lý có `moderation.donateRevision20260907`; snapshot trước sửa nằm tại `/linhhoasu/_ai_workbench/backups/donate_conversion_20260907/`.
- Evidence/snapshot/plan/test tại `_ai_workbench/temp/donate_revision_20260907/`; tools tại `_ai_workbench/tools/`. Không đưa secret vào artifact.

## 3. Lỗi đã gặp & giải pháp

| Lỗi | Nguyên nhân | Cách xử lý | Cách tránh lặp lại |
|---|---|---|---|
| Tuần 400k+ ít Bánh Bao | Cấu hình cũ không tăng theo bậc | Tăng item 4 đúng x10 từ 400k | Kiểm boundary 400k/500k/5m |
| Điểm skill cần đổi | Item 5 cũ | Thu item 5, gửi item 65/10:1 | Receipt native, không sửa túi mù |
| Mail cũ đã xóa | Recipient không còn đủ chứng cứ | Dùng audit + ledger + mail; mơ hồ giữ lại | Không dùng claim × cấu hình mới |
| Player online/save queue | Snapshot có thể bị ghi đè | Mutex, drain save, readback và sync session | Không dùng deferred save cho reward |
| Retry mất phản hồi | Không có key/snapshot cố định | Event key duy nhất và receipt trên player | Retry cùng key, không tạo claim mới |

## 4. Kiểm thử / bằng chứng

- Catalog PHP 7.4.33/MySQL 5.7.44: 153 checks PASS; 50 mốc skill, 15 mốc tuần.
- Native service fixture: 18 tests PASS; allowlist, server, confirmation, mutex, rollback, timeout, mail idempotency và conflict.
- Mongo QA riêng: 9 checks PASS; concurrent convert chỉ một receipt/thư, database QA đã xóa.
- Sau apply: 38 receipt, 38 mail; 36 mail còn trong Mongo, 2 mail đã claim nhưng được chứng minh qua receipt/ledger; 0 mail trùng; 38 backup player.
- S1/S2 ready 8080/8083 = 200, source hash đúng, PM2 online; không restart ngoài hai process game được chỉ định.

## 5. Trạng thái hiện tại

- Mốc tuần và chuyển đổi/bù đã commit, verify thành công; không có `pending_delivery`.
- Mốc tháng 12/14/16/18/20 triệu **chưa thêm** vì chưa có bảng quà cụ thể được duyệt.
- Claim 422 giữ manual review; không tự thu, reset hoặc bù.
- Không thể suy luận toàn bộ thư cũ đã tồn tại sau khi người chơi xóa; chỉ xử lý trường hợp có bằng chứng đủ.

## 6. Bước tiếp theo

1. Nếu xử lý claim 422, cung cấp mail ID/log hoặc phê duyệt manual riêng.
2. Nếu thêm mốc tháng tới 20 triệu, duyệt item/số lượng trước khi tạo row mới, giữ nguyên lịch sử claim.
3. Người chơi tải lại game để nhận thư điều chỉnh; không bấm nhận lại thư cùng event key.
