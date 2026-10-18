# Kế hoạch triển khai Arena / CrossArena đồng bộ S1–S4

Yêu cầu: sửa tới khi hoàn chỉnh, kiểm riêng tất cả server, báo cáo bằng chứng. Bản audit gốc: `arena_crossarena_audit_20260917.md`.

## Phạm vi và nguyên tắc

- Võ Đạo Hội = Arena/System305; Đỉnh Phong = CrossArena/System317. Không thay công thức BattleService hoặc chức năng Thiên Hạ Đệ Nhất.
- Một bộ source client/server phát hành chung cho bốn node. Võ Đạo Hội và kết toán tương lai bật đồng bộ S1–S4; giữ lịch sử activation S1/S2, S3/S4 bắt đầu từ thời điểm phát hành, không tự trả bù lịch sử.
- Giữ lịch đã phê duyệt: Cross Rival → CrossArena → TopArena, 7 ngày/kỳ, pool S1–S3. S4 nhận cùng bản sửa nhưng server phải trả lý do ngoài nhóm; không tự thêm S4 vào mùa hiện hành.
- Không đổi đồ/điểm người chơi thật để thử. QA dùng dữ liệu RAM hoặc tài khoản QA riêng có namespace, snapshot, điều kiện dọn chính xác. Không đổi clock/lịch production để giả lập kỳ CrossArena.
- Không rollout khi test lỗi. CAS/hash trên baseline live, backup chọn lọc không ghi đè, rollback cả source/client/config đã đổi; restart từng game node, không restart admin/dist/bot.

## Giai đoạn và tiêu chí thoát

1. **Baseline / chuẩn bị**: xác nhận đúng app, PM2, hash, env, config phí/thưởng/hồi vé, contract native. Lưu baseline source được sửa; giữ các thay đổi ngoài phạm vi. Lập manifest và ma trận S1–S4.
2. **Arena**: projection đối thủ dùng đủ dữ liệu; receipt/replay có entity/events hợp lệ, giữ nguyên outcome/không trừ vé hoặc nhận thưởng lần hai, hồi quy reconnect và ledger cũ. Kiểm log/phản công/thu phí/refresh/cooldown và rollback khi save lỗi.
3. **CrossArena**: gate theo server/kỳ/unlock; vé110, phí refresh, thắng/thua theo đúng CrossArena config; snapshot owner/version/TTL; lock/receipt/outcome bền vững và outbox; daily reset, nhật ký/phản công; không tính lại trận khi retry.
4. **Roster / BXH chung**: định danh ObjectId24 + server + attrs/ngoại quan thật, chỉ fallback robot đúng quy tắc khi thiếu đối thủ, không che lỗi DB thành thành công. BXH/self-rank lấy cùng nguồn chung và cùng tie-break, không dựng từ năm đối thủ. Điểm phải gắn đúng event/cycle, không ghi chéo sự kiện.
5. **Kết toán**: tính đúng kỳ trước theo schedule, bỏ kỳ âm, catch-up kỳ chưa xong; snapshot bất biến, deterministic mail/receipt, chống duplicate/restart, không hồi sinh thư hết hạn. Đồng bộ Arena payout S3/S4 từ activation mới; kiểm riêng từng server và recipient ownership.
6. **Client**: pending/timeout/error và intent cho CrossArena, model constructor/instance đúng; partial packet không xóa BXH; lỗi đóng kỳ/ngoài nhóm hiển thị rõ; giữ HUD/full-power/healthbar và main hiện hành.
7. **Kiểm thử trước deploy**: RAM handler/config thật; cost/reward win+loss, duplicate/concurrency, stale/invalid target, disconnect/relog, insufficient inventory, save/Redis/DB fault, day/season boundaries; cross-server roster và cutoff/mail recovery; native model + giao diện/battle contract. Tất cả bốn cấu hình server đều được chạy, S4 kiểm gate ngoài pool.
8. **Phát hành có rollback**: staged tests PASS → backup/CAS → client/server đồng bộ → restart lần lượt S4,S3,S2,S1. Mỗi node cần ready ổn định, protocol QA phù hợp kỳ đang mở, hash/log/invariant. Bất kỳ fail phải dừng rollout, đánh giá/hoàn tác; không để node chạy lẫn bản cũ/mới mà báo hoàn thành.
9. **Bàn giao**: báo cáo ma trận từng node, test tự động so với native E2E, backup/rollback, activation, hạn chế còn lại. Không gọi hoàn chỉnh nếu còn tiêu chí bắt buộc chưa đạt; không suy nghiệm thu từ HTTP200.

## Trạng thái

- [x] Đọc audit, xác nhận baseline live và scope.
- [x] Sửa server và client.
- [x] Kiểm thử candidate và fault/recovery.
- [x] Deploy đồng bộ S1–S4, hậu kiểm từng node.
- [x] Báo cáo nghiệm thu cuối: `arena_crossarena_release_20260917.md`.

## Kết thúc triển khai

- Đã deploy,97ca mới +714bảng nền +16lượt Mongo/Redis QA +8ca native UI +SDK/WS cả4node PASS. Hậu kiểm16:50 GMT+7 hash/env/boot snapshot đúng; tài khoản/player/log QA0.
- Pool S1–S3 giữ nguyên; Arena payout S3/S4 bật cho kỳ tương lai. Không giả lập production đang mở CrossArena; các giới hạn nghiệm thu tương lai ghi trong báo cáo bàn giao.
- Có1rollback do probe trước khi cổng khởi động; đã xác minh baseline và deploy lại. S4 tổng3restart, các node còn lại1; dịch vụ khác không restart.

## Ghi nhận candidate trước phát hành

- Đã lưu baseline source chọn lọc tại `_ai_workbench/backups/competitions_fix_20260917/`; các file dự kiến sửa ban đầu đều khớp live/local.
- Candidate server/client: CrossArenaService riêng, shared receipt/log, đúng phí/thưởng/hồi vé, roster/attrs/BXH chung, cycle gate, replay/outbox và invalidation khi commit không rõ. Arena đã có projection đầy đủ, replay entity/events và resolver phản công ngoài danh sách5.
- Candidate settlement: daily+cycle CrossArena theo bảng native, roster cutoff từ player DB các server + đảo outcome sau cutoff/outbox, snapshot bất biến, cursor từng node, kiểm claim ledger; bỏ previous-event sai/kỳ âm.
- 32 gameplay RAM +19 settlement RAM +16 native-model/client VM PASS; hồi quy client Arena cũ PASS. Chưa staging/real Mongo+WS/native UI hoặc deploy/activation. Các test phí refresh/protection/fault mở rộng, Arena handler và per-node acceptance vẫn đang bổ sung.
