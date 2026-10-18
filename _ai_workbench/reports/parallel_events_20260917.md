# Đỉnh Phong thường trực + hai sự kiện luân phiên — 17/09/2026

## Phạm vi được duyệt

- Đỉnh Phong Diễn Võ luôn mở theo điều kiện cấp100/server ngày7; BXH tuần độc lập, thưởng ngày23:00 và tuần00:00 thứHai, GMT+7.
- Tiên Vực Tranh Phong và Thiên Hạ Đệ Nhất luân phiên7ngày. Giữ nguyên kỳ Tiên Vực14–21/09 và key hiện tại; không cắt kỳ hoặc trả bù tùy ý. Tiếp theo Thiên Hạ21–28/09, Tiên Vực28/09–05/10.
- Nhóm tham gia vẫnS1–S3; code/gate cập nhật cùng bản trên S1–S4. Không gỡ điều kiện ngày/cấp hoặc sửa phần thưởng.
- Không viết lại gameplay/phân nhánh giải đấu TopArena; thay đổi lịch, gate, đồng bộ metadata client và kết toán theo từng sự kiện.

## Kế hoạch

1. Baseline live, hash/CAS và backup chọn lọc; kiểm kỳ/roster/receipt hiện tại trước chuyển.
2. Tách `cycleFor(event)` khỏi vòng sự kiện nổi bật. CrossArena có namespace mùa riêng, activation mới, không phát thưởng trước activation.
3. Settlement liệt kê cả hai luồng, gộp cùng cutoff: chỉ nâng cursor khi mọi sự kiện cùng thời điểm đã được xử lý. Giữ snapshot/mail/claim-ledger cũ.
4. Gate backend và payload đóng/mở theo từng tính năng; đồng bộ client bằng lịch server, không bypass unlock cấp/ngày.
5. Unit/native-model, cutoff/concurrency/crash, Mongo/Redis QA riêng, live SDK/WS từng node. Kiểm các node chưa đủ ngày là LOCKED đúng điều kiện, không gọi là server lỗi.
6. Stage → backup/CAS → restart S4,S3,S2,S1 → hậu kiểm source/public/env/process/QA cleanup. Giữ sửa lực chiến, HUD, Arena và cấu hình thưởng trước đó.

## Trạng thái

Đã phát hành production và hậu kiểm thành công lúc **22:30:36 ngày17/09/2026 GMT+7**. Cả4node dùng `cross-parallel-v2`, readiness200, hash source/client công khai khớp. Có hai lần rollback bởi bộ kiểm release, sau đó phát hành lại đầy đủ; code game không đổi giữa các lần.

| Server | Đỉnh Phong hiện tại | Điều kiện giữ nguyên |
|---|---|---|
| S1 | OPEN | Nhân vật cấp100 |
| S2 | OPEN | Nhân vật cấp100 |
| S3 | LOCKED | Đủ ngày7 lúc00:00 ngày19/09; nhân vật cấp100 |
| S4 | SERVER_NOT_IN_POOL | Vẫn ngoài nhóm S1–S3 |

Tiên Vực/Thiên Hạ vẫn yêu cầu cấp100 và server ngày22. Vì vậy các node dùng chung lịch nhưng tuổi server khác nhau có thể khóa khác nhau đúng điều kiện. Tiên Vực C0 vẫn14–21/09; Thiên Hạ21–28/09; Tiên Vực28/09–05/10, lặp liên tục.

## Thay đổi đã kiểm chứng

- `cross-parallel-v2`: `cycleFor(event)` trả mùa riêng; giữ key Tiên Vực `C0_1789318800000`. Đỉnh Phong dùng namespace `W_crossArena`, mốc mùa đầu 17/09 22:00 → 21/09 00:00 GMT+7, sau đó tuần liên tục.
- Kết toán duyệt cả hai luồng và xử lý hết nhóm cùng cutoff trước khi lưu cursor; giới hạn trang không cắt đôi nhóm. Snapshot, Mail ID, receipt và claim-ledger tiếp tục chống trả trùng. Không phát thưởng trước activation.
- Gate các route Tiên Vực/Thiên Hạ phía server, giữ đường thoát/hủy bản đồ; trạng thái mùa mới lưu lại mùa cũ. Tiên Vực C0 giữ điểm/camp/taskRecord; kết thúc trận từ mùa cũ bị từ chối.
- RPC6199 trả lịch từ server. Addon `lhs-cross-events-v2.js` nạp bảng ngày native theo kỳ thật, cập nhật mỗi30giây, khóa dữ liệu quá hạn và loại phản hồi từ server/nhân vật cũ. Giữ gate cấp/ngày/pool của client và backend.
- Không thay BattleService, cấu hình giá trị thưởng, HUD, PowerCells hoặc bản sửa đơn vị lực chiến.

## Kiểm thử

- 781 ca trong7suite PASS trên candidate VPS:24lịch/gate/chuyển mùa/cursor;13client;43CrossArena;19settlement;18Arena recovery;17client trận đấu;647lực chiến. Thêm contract xoay vòng cũ và core714bảng PASS.
- 16 lượt Mongo/Redis trên4DB QA riêng: chiến đấu giữa server, persistence/relog/replay, thưởng ngày và hai thưởng tuần cùng cutoff PASS. Đã dọn4DB và8Redis key đúng ownership.
- 7 ca trình duyệt với model/view Egret native PASS: hai sự kiện song song, đổi kỳ, khóa ngoài pool; không có error/warning. Đây là RAM QA, không phải tài khoản thật hoặc một mùa giải production đã diễn ra.
- Bản installed chạy lại đủ các suite PASS. SDK/WS production cuối:14nhóm S1 +14nhóm S2 +12nhóm S3 +12nhóm S4 PASS, gồm đăng nhập/relogin, trận QA, trừ vé đúng và replay không trả thêm; `realPlayerWrites=0`, `qaResidue=0` từng node. Tất cả tài khoản/role/log/entry/action QA đã dọn đúng ownership.
- Read-back giữ nguyên2entry Tiên Vực C0 điểm0 và settlement âm cũ đãdone; không xóa/backpay. Không có settlement mùa mới trước cutoff23h. PIDs bot/admin/dist giữ nguyên; tổngrestart do hai rollback: S1+3, S2/S3/S4+5. Sau khi ready, bộ kiểm log không có lỗi mới; các cảnh báo shutdown đã biết được ghi riêng trong evidence.
- Lần phát hành đầu: SDK/WS cả4node PASS; rollback ở bước cuối vì `test-cross-server-events.js` dùng đường dẫn tương đối khi chạy từ staging. Đã sửa test nhận `COMPETITION_APP`, kiểm tra lại chính chế độ installed-loader trước khi retry.
- Lần thứhai: S4/S3/S2 SDK/WS PASS; bộ kiểm log rollback do `EPIPE`/`Connection is closed` của lúc dừng S2 có cùng giây với PM2 uptime mới. Log23:19:21 GMT+8 có524save-on-close warning; tiến trình mới ready23:19:25. Bộ kiểm đã làm tròn ranh giới mili giây lên giây kế tiếp, chỉ phân loại hai mẫu shutdown đã biết ở đúng node; lỗi khác hoặc giây sau vẫn chặn release. Không sửa lifecycle WSServer trong task lịch sự kiện.

## Bằng chứng và khôi phục

- `temp/parallel_events_20260917/release.json`: hashes, staging/integration/native QA, từng lần phát hành, node QA và log.
- `temp/parallel_events_20260917/post-live.json`: gate/lịch/DB và PM2 hậu kiểm; addon SHA256 `e9bc28e7b8b5e14a789c4176828fe19376a44bae887851e1aa15574851d4c94a`.
- `temp/parallel_events_20260917/visual.json`; baseline/manifest trong `backups/parallel_events_20260917/`.
- Backup production lần cuối: `/linhhoasu/_ai_workbench/backups/parallel_events_20260917_150405_retry_retry`; khôi phục chọn lọc có kiểm hash, restart đúng bốn game node.
- Tab/server QA local đã đóng. File bằng chứng và backup local khoảng0,35MB; giữ để đối soát, không có bộ dependency/build mới cần dọn.

## Giới hạn xác nhận

- Lịch và kết toán đã được thử qua ranh giới giả lập; chưa tới thưởng thật23:00 tối17/09 và chuyển tuần00:00 ngày21/09. Không ghi nhận QA là bằng chứng người chơi thật đã nhận những đợt thưởng tương lai.
- Thiên Hạ vẫn dùng phần gameplay/phân nhánh giải đấu hiện có. Bản này sửa lịch, metadata, gate và kết toán; không chứng nhận toàn bộ giải đấu loại trực tiếp native đã hoàn chỉnh.
- Lifecycle dừng WSServer còn cảnh báo lưu lúc đóng khi Redis đã ngắt; không sửa trong scope lịch. Cần audit riêng nếu xử lý việc drain khi shutdown, không coi việc phân loại đúng log trong release là đã sửa lỗi lifecycle này.
- Người chơi Ctrl+F5 một lần để lấy addon lịch mới; các lần chuyển mùa sau dùng lịch server tự cập nhật.
