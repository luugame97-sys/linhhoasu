# Kế hoạch xử lý arenaReceiptLedger

## Phạm vi và tiêu chí

Được phép: vá lỗi nhét document đối thủ vào receipt, kiểm thử, triển khai có kiểm soát và dọn đúng trường dư sau backup. Không đổi công thức điểm, sàn 0, vé, thưởng, battle, thời hạn/giới hạn receipt, CrossArena, bot hoặc cấu hình mạng. Không kèm bản tối ưu auto-sale đang có ở local. Không hứa hết mọi lag: lỗi ledger và CPU các handler khác phải đo riêng.

## Các bước bắt buộc

1. **Preflight chỉ đọc:** xác thực SSH host key; đọc source live và hash, PM2 PID/restart/env được chọn lọc, readiness/health S1–S6; xác định toàn bộ writer (game, worker, admin, scheduler). Audit BSON size và vị trí `arenaReceiptLedger[i].targetScore.document` trên 6 DB. Ghi baseline queue/save/slow handler trong cửa sổ có traffic. Nếu SSH timeout, source drift hoặc không xác định được writer: chỉ làm local, không deploy/cleanup.
2. **Vá nhiều lớp:** kết quả defender chỉ chuyển các trường scalar được phép vào receipt; sanitize entry cũ trước lookup/merge/replay; sanitize toàn ledger trước clone và save, kể cả deferred/snapshotProvided. Chỉ loại trường document đã xác nhận là dư, giữ nguyên metadata chưa biết ở receipt cũ. Không xóa cả receipt hoặc đổi thứ tự/giới hạn retention ngoài hành vi hiện hữu.
3. **Regression offline:** ledger mới/cũ, duplicate merge, replay thành công/lỗi, sâu nhiều cấp, idempotent, null/malformed; pending/done/duplicate, thắng/thua/sàn 0, robot/CrossArena, commit trước/sau lỗi, reconnect, pair-lock; full/partial/deferred/snapshotProvided save và save fail/stale. Assertion giữ nguyên ID, fightId, vé, thưởng, score, receipt/outbox; chặn kết nối mạng trong harness. Đo UTF-8 bằng Buffer.byteLength; BSON phải đo bằng $bsonSize/BSON serializer, không gọi string.length là bytes.
4. **Backup và candidate live:** lưu bytes/hash source live trước swap, manifest và rollback; candidate áp đúng delta lên live, không chép đè PlayerService local vì chứa auto-sale chưa triển khai. Chạy syntax + regression trên candidate với đúng phiên bản runtime/dependency. Dừng khi hash/preimage không khớp. File helper mới phải cài trước các consumer; swap nguyên tử cùng filesystem.
5. **Canary S6:** trước restart lưu backup kiểu BSON của các ledger sắp bị tự làm sạch; thông báo nguy cơ ngắt kết nối ngắn. Rolling restart chỉ S6, giữ env/bot. Chờ ready + WS health, kiểm hash/PID và log mới. Quan sát tối thiểu 5 phút có traffic thực; không tự tạo player hoặc trận. Không đủ traffic thì kết luận E2E còn thiếu, không giả là PASS. Nếu lỗi ACK/save, score/receipt invariant hoặc lỗi mới: dừng rollout và rollback source canary theo CAS. Không rollback player full-document.
6. **Triển khai S1–S5 tuần tự:** mỗi server phải qua cùng gate. Khi dùng source chung trên đĩa, process cũ có thể lazy-load code mới: kiểm dependency trước, không coi chỉ restart S6 là cách ly source tuyệt đối. Nếu cần cách ly thật, dùng release directory riêng hoặc maintenance được xác nhận; không tự đổi cwd/kiến trúc chạy.
7. **Cleanup tồn dư có maintenance/fencing:** chỉ sau khi toàn bộ writer chạy bản bảo vệ. Dừng nhận phiên mới và drain/stop writer từng server theo cơ chế live đã xác minh; xác nhận supervisor không tự bật lại. Backup exact preimage từng ledger bằng BSON/canonical EJSON giữ kiểu, ghi fsync + hash rồi đọc giải mã lại trước update. CAS theo _id + toàn ledger preimage; chỉ `$unset` các path `arenaReceiptLedger.<index>.targetScore.document`, không `$set` lại player/ledger từ snapshot cũ. Conflict => bỏ qua và re-audit, không ép ghi. Ghi receipt migration trước/sau, counts/hash. Không chạy script cleanup cũ vốn backup sau write/không CAS. Không có fencing đáng tin thì hoãn cleanup, không thao tác DB trực tiếp khi session còn có thể ghi đè.
8. **Nghiệm thu:** quét toàn 6 DB: 0 trường document tồn dư, không mất entry/ID/score/receipt/vé/thưởng; phân biệt BSON size giảm với CPU giảm. Sau mở lại, kiểm 2 cửa sổ có traffic để phát hiện tái nhiễm, queue/save/slow handler theo server/tag. Kiểm điểm/vé qua các trận thật do người chơi tạo nếu có; thiếu trận phải báo E2E chưa đủ. Không dùng HTTP200 đơn lẻ làm chứng minh hết lag.

## Rollback và stop gates

- Source: restore byte-identical từ backup đúng hash, restart từng process và kiểm readiness. Nếu quay lại code có lỗi, phải khóa/fence nhánh phát sinh lỗi trước; không âm thầm mở lại luồng làm phình ledger.
- Data: không tự hoàn tác blob dư vào production. Nếu cần phục hồi do mất semantics, chỉ restore phần ledger được xác minh bằng CAS sau khi fence writer và có snapshot hiện tại; tuyệt đối không ghi đè điểm/vé/thưởng bằng full-player backup.
- Dừng khi backup thiếu/không giải mã được, CAS drift, kiểu dữ liệu lạ, writer ngoài danh sách, health lỗi, lỗi save mới, sai điểm/vé/receipt hoặc cleanup tái nhiễm. Không tiếp tục sang server sau.
- Không thay đổi security/firewall để vượt lỗi kết nối. SSH timeout hiện là blocker cho deployment, không phải bằng chứng server sập.

## Trạng thái chuẩn bị ngày 28/09 (lịch sử)

- Preflight SSH tới host game được cấu hình: TCP timeout trước xác thực; chưa đọc được source/runtime/DB live trong lượt này.
- Local không có Git; cần backup chọn lọc và manifest trước sửa. Các thay đổi local có trước phải được giữ nguyên.
- Chưa deploy, restart hoặc cleanup production. Kết quả kiểm thử sẽ được cập nhật sau khi chạy.

## Triển khai 29/09/2026, 00:32–00:55 ICT

- VPN khôi phục SSH, preflight 6/6 ready và WS health OK. Live arena hash đúng nền `c57c343b…`; PlayerService live `355f8a86…` khác local vì chưa có tối ưu auto-sale. Candidate PlayerService tạo từ source live, chỉ thêm lọc ledger; không deploy auto-sale hoặc chỉnh bot/công thức điểm.
- Live candidate: arena `d2ebb6cf333a2a37e99be053b5533984b5691daf174f881bc2a64ca79cc7cd02`; PlayerService `bdfe9e48978a90021504458073879425764015e167c853e4424fe8c93efb077e`. Local PlayerService vẫn có sửa auto-sale trước đó; không dùng hash local thay cho hash live.
- Backup source + PM2 + BSON: `/linhhoasu/_ai_workbench/backups/arena_ledger_hardening_20260929_003556`. Trước deploy có 5 raw BSON player, read/serialize round-trip hash 5/5. Backup bổ sung `cleanup_pre/bson/` trước cleanup. Không công bố player documents hoặc PM2 environment.
- Source swap CAS/hash 2/2; canary S6 từ 00:40 đến 00:47, PID ổn định, ready OK, không save failure/exception mới trong mẫu. Vẫn login chậm/socket1006 nên không kết luận hết lag. Rolling game/worker S5→S1; có restart thừa S1 game/worker và S2 worker do lệnh trước còn chạy khi trả output. Đã kiểm PID/restart cuối; không quy các lần này là crash tự phát. Không thay ecosystem và các env gameplay/bot/DB được đối chiếu.
- Kiểm thử offline trên runtime Node20/source VPS: competitions 43/43, Arena recovery 18/18, zero-sum 11/11, save boundary mới 10/10 (full, snapshotProvided, deferred, failure, stale, preservation, idempotence), settlement PASS. Mạng bị chặn trong harness; productionWrites=0. Evidence local `temp/arena_ledger_live_preflight_20260929/live-tests.json`.
- Cleanup lúc 00:53: CAS theo `_id + arenaReceiptLedger` và chỉ `$unset` path document, 5 player/14 entry, 0 conflict. Receipt remote `cleanup_pre/cleanup_receipt.json` SHA `12ebc9aad7c12ca32f925e2a1a9ee9503f7682eae498419d5244751c0ef585b9`. Blob đã xóa có thể phục hồi từ raw BSON, không tự restore full player.
- Hậu kiểm 00:54:51: 6 DB không còn document dư; cả 5 player khớp byte-serialized BSON dự kiến (preimage trừ đúng document). Điểm, receipt, vật phẩm/vé, tiền, outbox và phần ledger còn lại giữ nguyên. BSON giảm tổng 1.490.131 byte; không diễn giải thành mức giảm RAM/CPU.
- 6/6 ready200, WS ok; game và worker online, env chọn lọc không đổi. Source hash đúng candidate. Evidence `temp/arena_ledger_live_preflight_20260929/acceptance-first.json`.
- Live 00:55: một receipt mới từ người thật S6 đánh mục tiêu thật, trạng thái done, 0 document dư; không tự tạo trận/player. S1–S5 chưa có receipt mới trong cửa sổ 00:51–00:55. Chưa đủ bằng chứng UI/relog/win+loss toàn fleet.

### Sai lệch quy trình và giới hạn phải giữ khi bàn giao

- Cleanup **không thực hiện maintenance/fencing như bước 7**; đã chạy sau khi toàn game nạp guard với CAS. Hậu kiểm 5/5 full-document cho thấy không mất dữ liệu ở lần này, nhưng không biến CAS thành bằng chứng đã fence tất cả writer. Không lặp lại cách này cho migration khác; yêu cầu fencing khi còn writer/snapshot không được bảo vệ.
- Regression Node20/source VPS chạy sau source swap/canary, không phải trước swap như bước 4. Các test đã PASS nhưng không ghi lại lịch sử thành gate pre-swap đạt.
- Manifest BSON và cleanup receipt đã parse, kiểm hash từng file và BSON round-trip lại; bản `.validated.json` có hash giống bản gốc. Raw BSON giữ nguyên, không backup dạng JSON mất kiểu. Evidence `backup-verification.json`.
- Supervisor có churn từ trước (trên 10.000 restart), log `SUPERVISOR_ALREADY_RUNNING`. Chưa sửa/xóa lock hoặc đổi policy; lỗi này cần xử lý riêng. Không gán nó cho patch ledger.
- Source chung trên đĩa: canary chỉ cách ly tiến trình restart, không phải release directory riêng. Không thay kiến trúc/cwd.
- Tổng thể: code + cleanup đã triển khai; nghiệm thu dữ liệu/hash/health đạt ở các snapshot nêu trên. Chưa có kiểm chứng lâu dài hoặc toàn bộ E2E, và chưa chứng minh mọi lag/1006 được giải quyết.
