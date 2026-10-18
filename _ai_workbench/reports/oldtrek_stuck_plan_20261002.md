# Kế hoạch xử lý dứt điểm kẹt Hoang Cổ Mê Hàng — 02/10/2026

## Kết luận audit hiện tại

- Lịch mùa live đang đúng: season 2, stage `ON`, khởi hành được phép. Lỗi không còn là lỗi lịch cũ.
- Live read-only tìm thấy **1 trạng thái event quá hạn đang giữ chuyến đi ở S6**: event `4017`, mini-game type `1`, deadline đã hết, `sailing=true`, khoảng cách lưu `2126.845/2400`. Identity đã băm trong audit; chưa gán cho tài khoản người dùng.
- Tìm thấy **3 trạng thái đã đủ khoảng cách nhưng vẫn còn sailing** ở S1/S5. Đây là dấu hiệu pending settlement/orphaned arrival cần xử lý theo CAS, không được reset hàng loạt.
- Log live có `tag=7000` gửi chậm khoảng `6.8s` ở S2 và `7.9s` ở S3. Đây là yếu tố làm người chơi thấy treo lâu, chưa đủ chứng minh là nguyên nhân gốc của ảnh.
- Không thấy mã `OLD_TREK_*` trong cửa sổ log audit. Log yên không chứng minh flow client đã hết kẹt.
- Client native `sendEndTrek()` hiện bỏ qua payload lỗi; `checkHandleEvent()` chỉ mở mini-game khi `currentEvent` đã được đồng bộ vào model. Guard v4 có refresh khi gặp pending, nhưng chưa có recovery contract riêng cho event hết hạn và chưa có E2E tài khoản thật.
- Audit không ghi player/DB/RPC thật. Evidence: `_ai_workbench/temp/oldtrek_stuck_plan_20261002/audit.json`.

## Kế hoạch triển khai theo stop-gate

### P0 — Chốt state machine và bằng chứng

1. Dùng các trạng thái server-authoritative: `SAILING`, `ARRIVED`, `EVENT_PENDING`, `EVENT_EXPIRED`, `SETTLEMENT_PENDING`, `SETTLED`.
2. Mọi phản hồi `7000/7001/7002/7005/7008` phải có `stateRevision`, `trekUid`, `currentEvent`, `arrived`, `settlementPending`, `requestId` và mã lỗi có thể xử lý.
3. Không dùng toast chung để suy luận nguyên nhân; log structured theo `tag`, `requestId`, `trekUid`, `stateRevision`, `result`, `code`, latency và save outcome.

**Stop gate:** fixture phải chứng minh mỗi chuyển trạng thái và replay không nhân thưởng/không mất vật phẩm.

### P1 — Sửa server, không tự xoá tiến độ

1. Tách hàm `reconcileOldTrekState()` chạy trong `PlayerMutationService` và CAS theo `userId + stateRevision + trekUid`.
2. Khi event quá hạn: dùng cùng `OldTrekEventService` để kết thúc theo policy rõ ràng (thành công/thất bại và `shipExp`/reward được cấu hình). Không xoá event hoặc tự cấp thưởng nếu policy chưa xác định.
3. Khi `dist >= targetDistance` và không còn event: tạo settlement receipt idempotent; `7005` và retry dùng cùng receipt, chỉ commit một lần.
4. Khi còn event pending, `7005` trả event + `updateData` + `recoveryRequired`, không trả lỗi chung. Khi save không xác nhận, fail-closed và không gửi ACK thành công.
5. Giữ `eventLedger/rewardLedger`; giới hạn replay và không ghi full player document vào receipt.

**Stop gate:** test expired event, arrived-without-settlement, concurrent `7005`, stale revision, timeout sau commit và retry đều PASS; `productionWrites=0` trong harness.

### P2 — Sửa client/native guard

1. `sendEndTrek` phải xử lý cả success và error callback; giải phóng mask/loading trong mọi nhánh.
2. Với `OLD_TREK_EVENT_PENDING`/`recoveryRequired`, áp dụng snapshot authoritative một lần rồi gọi `checkHandleEvent()` đúng một lần theo `eventUid`; không gửi lại tăng tốc hoặc kết thúc vô hạn.
3. Với `EVENT_EXPIRED`, mở UI recovery/hoàn tất do server chỉ định; không tự đoán reward từ đồng hồ thiết bị.
4. Khi `7002` thành công, xử lý `7006` push trước khi mở settlement; khi `7008` trả snapshot mới, tránh callback cũ ghi đè revision mới.
5. Cache-bust index/addon sau khi server contract đã ổn định.

**Stop gate:** VM client fixture mô phỏng `7005 → 7008 → event panel → 7002 → 7006 → settlement`, timeout, disconnect, duplicate push và stale revision.

### P3 — Dữ liệu tồn đọng và hiệu năng

1. Dry-run liệt kê chỉ các role có `currentEvent.deadline < now` hoặc `sailing && dist >= targetDistance`.
2. Backup snapshot từng role; apply bằng CAS và receipt idempotent; không reset season, không xoá cargo, không sửa role không nằm trong manifest.
3. Profiling riêng `tag=7000`: queue wait, clone, Mongo save, response send. Tối ưu sau khi state machine đúng; không che latency bằng retry client.

**Stop gate:** manifest trước/sau khớp, 0 role ngoài scope thay đổi, 0 duplicate reward, p95 `7000` giảm so với baseline và không còn request treo dài trong cửa sổ soak.

### P4 — Rollout và rollback

1. Lấy live làm baseline, syntax/config contract, stage từng file, backup không ghi đè, CAS/hash read-back.
2. Canary S6 trước vì audit có event quá hạn; readiness Mongo/Redis và log invariant sau restart. Sau đó rolling S5→S1.
3. Deploy client sau server, kiểm tra public/loopback hash và cache-bust.
4. Rollback chỉ các file có hash đúng preimage; không rollback player DB bằng restore toàn bộ.

## Tiêu chí hoàn tất

- Không còn `sailing=true` với event quá hạn không có recovery receipt.
- Không còn `dist >= targetDistance` bị kẹt ở `SETTLEMENT_PENDING`/`endCache` sau retry hữu hạn.
- Mỗi event/settlement retry trả cùng receipt, không nhân reward và không mất cargo/economy.
- Client không cần thoát vào lại để tiến hành event hoặc kết toán.
- S1–S6 readiness, hash public, structured error/log và E2E QA đều đạt.

## Phần còn cần để chạy E2E

- Cần một tài khoản QA được ủy quyền và server cụ thể để tái hiện flow trên nhân vật thật. Audit hiện tại không tự chọn hoặc mutate role người chơi.

## Triển khai recovery v5 — 03/10/2026 00:15 ICT

- Candidate 9/9 recovery + client guard PASS. S6 canary rồi rolling S1–S5, readiness 6/6, hash server `50939476…`.
- Client guard v5/public index cache-bust deploy PASS; không ghi player/DB.
- Còn 1 event hết hạn và 3 arrival stale trong read-only audit; chưa tự sửa role, cần dry-run/CAS + QA E2E.
