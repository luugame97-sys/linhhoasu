# Hoàn tất triển khai Võ Đạo Hội — 13/09/2026

## Đã sửa và phát hành

- Client giữ nguyên `ranklist/toplist` khi packet chỉ cập nhật điểm/hạng; refresh/fight có timeout, giải phóng pending khi `Rpc` throw và intent idempotent ổn định qua reconnect.
- Server chọn đối thủ unseen-first, snapshot có TTL/owner/version; refresh không thu phí nếu danh sách không đổi; fight kiểm tra stale/protection và khóa mutation theo player.
- Receipt Redis có lease pending 30 giây để reclaim sau crash; outcome ledger lưu cùng player save để retry không trừ vé/điểm hai lần; refresh và fight đều được bảo vệ.
- `fightId` scoped server/player/request/target; `arenaLogUid` numeric an toàn; log DB có target profile, score và revenge; log view hợp nhất DB + embedded, outbox retry.
- BXH/profile dùng projection đầy đủ của BattleService/RoleAppearance; rebuild Redis staging + rename atomic, loại bot/record mồ côi.
- Vé Võ Đạo Hội khởi tạo theo `ConstConfig.initArenaTicket=3`, hồi về mức khởi tạo khi sang ngày mới; không giảm số dư vượt cap hiện có. Công thức điểm cố định: base 10 + floor((điểm đối thủ − điểm mình)/100), clamp 1..50, thắng cộng/thua trừ.
- Settlement có snapshot provider server-side (điểm tại cutoff bằng current score đảo các fight sau cutoff), roster immutable, lease/mail idempotent; bật scheduler S1/S2 với activation `1789318800000` (14/09/2026 00:00 GMT+7), không trả bù lịch sử.
- Socket guard v3 bắt native WebSocket descriptor, kiểm tra branded receiver/generation và gọi native send bằng `Reflect.apply`; fallback index cũng dùng native descriptor.

## Kiểm chứng

- Local: client 20/20, socket 20/20, read-model 24 + 50 randomized refresh, settlement in-memory PASS, hardening 10/10, core contract 714 tables PASS.
- Live VPS `103.116.105.154`: archive SHA-256 `7aad08a86288273cf663ccadfccda6841b2cb3539bbaa22b61027f446975b551`; S2→S1 restart scoped; PM2 online; `/ready` S1 `200`, S2 `200`.
- Live smoke cô lập: đánh thật 1 lần, trừ đúng 1 vé; retry fight không đổi vé/điểm; refresh trừ đúng 100 bạc; retry refresh không trừ thêm; log Mongo tồn tại; kết quả `PASS checks=5`.
- Redis↔Mongo eligible rank: S1 `332/332`, S2 `99/99`; QA player/log residue `0`.
- Settlement dry-run S1/S2: snapshot hợp lệ lần lượt 332/99 người; cấu hình thưởng ngày/tuần đọc được.

## Còn giới hạn nghiệm thu

- Chưa có người dùng đăng nhập thủ công để xác nhận hitbox/native UI và phản công trên giao diện thật trong lượt này. Backend/WS contract đã qua smoke; cần một thao tác native cuối cùng sau khi user đăng nhập.
- Settlement sẽ phát kỳ đầu sau activation; cần kiểm tra mail thực tế sau cutoff đầu tiên và đối chiếu receipt/roster.
