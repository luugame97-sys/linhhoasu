# Bàn giao sửa Võ Đạo Hội / Đỉnh Phong Diễn Võ — 17/09/2026

## Kết quả

Đã triển khai cùng một bản sửa lên toàn bộ bốn game node S1–S4. Hậu kiểm lúc **16:50:51 GMT+7**: source/public hash đúng, bốn node online và ready200, QA SDK/WebSocket từng node PASS, không còn tài khoản/player/log QA.

Phạm vi: Arena/System305 và CrossArena/System317. Không thay BattleService, main bundle, HUD số đầy đủ hay addon PowerCell. Không coi TopCombat/TopArena là Đỉnh Phong; các caller dùng chung lịch chỉ được bổ sung tên event rõ ràng để không ghi nhầm điểm.

## Nội dung đã sửa

### Võ Đạo Hội

- Query đối thủ dùng cùng projection đầy đủ, có `items`; bonus công trình từ skin gia viên được đưa vào attrs trận.
- Ledger mới giữ actor/attrs/outcome; replay dựng lại event hiển thị hợp lệ, không mô phỏng lại kết quả, thu vé hay cấp thưởng lại. Tương thích receipt cũ thiếu entity/events.
- Khi hồi phục trả hạng/điểm và số dư hiện tại, không đẩy số dư cũ về client. Log phục hồi giữ thời điểm trận gốc để không làm sai cutoff.
- Phản công tra đúng đối thủ từ nhật ký ngay cả khi đối thủ không nằm trong danh sách5; không cho phản công trận thắng hoặc dùng lại nhật ký đã xử lý.
- Commit Mongo không rõ kết quả: vô hiệu hóa session và yêu cầu đăng nhập lại để đối soát, không ghi đè bằng snapshot rollback cũ.
- Snapshot kết toán loại người tạo sau cutoff, hợp nhất log/outbox/ledger để đảo các trận sau cutoff; kiểm claim ledger trước khi tạo lại mail.

### Đỉnh Phong Diễn Võ

- Luồng riêng `CrossArenaService`: gate server/kỳ/điều kiện mở, owner/version/TTL cho danh sách, chống xử lý trùng và kiểm xung đột request.
- Vé110 và phí làm mới đúng cấu hình; hồi1 vé/7200giây, tối đa10, không giảm số vé mua dư hoặc tự cộng bù vé cũ.
- Thưởng thắng/thua lấy `CrossArenaBaseConfig`, không lấy thưởng Arena. Điểm/log phản ánh đúng delta thực khi chạm sàn0.
- Shared roster giữ ObjectId24, serverId, attrs và ngoại quan thật; ưu tiên người thật, chỉ bù robot khi thiếu. Lỗi DB/roster trả lỗi có thể thử lại, không che bằng thành công giả.
- BXH/self-rank dùng cùng nguồn chung, không dựng từ mình+5 đối thủ. Xem hồ sơ đọc đúng DB của server đích.
- Shared protection, nhật ký, phản công theo nhật ký trận thua, reset ngày; receipt/outbox bền vững và khôi phục sau lưu/relog.
- Không đánh ngoài kỳ hoặc ghi điểm vào sự kiện khác. Client v3 có timeout, pending, intent ổn định, partial merge và thông báo lỗi rõ. Callback client cũ cũng không bị TypeError khi nhận từ chối.

### Kết toán và cấu hình các server

- Tính đúng cửa sổ đã kết thúc, bỏ kỳ âm, catch-up có cursor riêng từng node.
- CrossArena có thưởng ngày23:00 theo rule native `LanguageConfig[30033107]`/`[30080689]` và thưởng cuối kỳ theo rotation đã duyệt. Snapshot cutoff lấy player DB các server, đảo outcome sau cutoff kể cả outbox chưa đồng bộ.
- Snapshot bất biến, mail ID/eventKey cố định; phát tại DB của người nhận, kiểm claim ledger, không tạo lại mail hết hạn.
- Arena payout S1/S2 giữ activation14/09; **S3/S4 đã bật**, activation mới17/09, kỳ ngày đầu tiếp theo là **23:00 ngày17/09**. Không tự trả bù lịch sử. Đã ghi cấu hình ecosystem và PM2 boot snapshot để giữ sau reboot.
- Pool liên server **vẫn S1–S3**, 7 ngày/kỳ: Cross Rival→CrossArena→TopArena. S4 nhận cùng code và chặn đúng ngoài nhóm, không tự thêm vào pool. Kỳ CrossArena kế tiếp: **21/09 00:00–28/09 00:00 GMT+7**.

## Ma trận live

| Node | Ready | SDK/WS Arena, phản công, retry, relog | CrossArena hiện tại | Arena payout | PID cuối |
|---|---|---|---|---|---|
| S1 |200|PASS|Chặn đúng ngoài kỳ|Bật|4215|
| S2 |200|PASS|Chặn đúng ngoài kỳ|Bật|1310|
| S3 |200|PASS|Chặn đúng ngoài kỳ|Bật|30830|
| S4 |200|PASS|Chặn đúng ngoài pool|Bật|25441|

Live QA dùng tài khoản và cả đối thủ QA riêng. Đối thủ không đăng ký vào danh sách role người chơi; không đánh hay sửa player thật. Trận kiểm tra qua SDK/WS là phản công một nhật ký QA được chuẩn bị trước, không giả danh lịch sử người chơi thật. Bản cũ đã tái hiện `ARENA_TARGET_STALE` trên cả4node; bản mới xử lý thành công và không tính hai lần.

## Bằng chứng kiểm thử

- **97 ca mới PASS**:43 gameplay CrossArena,18 Arena recovery/per-node,19 settlement,17 native-model/client VM. Có refresh/cooldown/thiếu tiền, no-change, shared protection, win/loss, stale/cutoff, request conflict, concurrency, lỗi lưu trước/sau commit, outbox outage, claim/delete/expiry mail.
- Kiểm tra nền **714 bảng config PASS** trên staging và installed; các test lịch, Arena settlement và client Arena trước đó vẫn PASS.
- **16 lượt tích hợp Mongo/Redis thật** trong4DB QA có marker sở hữu: seed/info/fight+relog/settlement; CrossArena active S1–S3, gate S4. Có đối thủ/hồ sơ thật ở DB server khác, đúng vé/thưởng, shared action duy nhất và mail đúng DB.
- **8 ca giao diện native PASS**, viewport mặc định660×912, không JS error/warning/tài nguyên thiếu trong lượt cuối. Dùng cửa sổ/model gốc và handler candidate qua RPC RAM cục bộ; kiểm đến callback dữ liệu trận, **không phải toàn bộ hoạt ảnh chiến đấu trong thế giới hoặc login production bằng GUI**. Giao diện phụ trợ notification/preset được cô lập trong fixture.
- SDK/WebSocket production:6 nhóm kiểm tra mỗi node, đủ S1–S4; Mongo read-back, retry trong phiên và qua đăng nhập lại. Không dùng tài khoản người chơi thật.

## Rollout và khôi phục

- Backup cuối: `/linhhoasu/_ai_workbench/backups/competitions_20260917_094033` (source/client/ecosystem và PM2 dump trước phát hành).
- Stage: `/linhhoasu/_ai_workbench/temp/competitions_20260917_073606`.
- Có **1 lần hoàn tác** ở S4: script kiểm health khi cổng chưa mở sau restart. Source đã được xác minh trở về đúng baseline,4ready200, rồi bổ sung chờ ready trước bước ổn định và phát hành lại. Không phải lỗi gameplay candidate.
- Tổng restart trong yêu cầu này: **S1+1, S2+1, S3+1, S4+3** (gồm rollout dừng và rollback). Bot/admin/dist giữ nguyên PID/restart. Log window của rollout thành công không có lỗi mới thuộc điều kiện chặn phát hành.
- Không tự rollback sau nghiệm thu; nếu cần khôi phục phải kiểm drift, dùng đúng backup/source hash và env trước release, rồi restart đúng node. Không copy đè cấu hình local ecosystem vì baseline local/live từng lệch; runtime candidate được dựng từ bản live + override chỉ Arena S3/S4.

## Hash và bằng chứng

- `arena.js`: `05c905b939c1973f04765fc2dcf1da7bc31e2cb007f7d00ea97da693ff2d41d0`
- `CrossArenaService.js`: `85bcc9935dc21cc96e01d5b5f7b08d708233836ab4ae2ca958984953fed3da9d`
- `CrossEventSettlementService.js`: `ce66d69c2542aa1be859ee8c773eb9b36e66348c18800944080f17d1c4935a95`
- Addon public: `78042893c15c2afbbe953488f71ade779eb0ce4a79d4834b16cafbbd456e5f76`, version `20260917_competitions_contract_v3`.
- Index public: `2fa21737b6523ff51297b3c3cfb440307be9c50ed46f360b0b92f29bccf85a9b`.
- `temp/competitions_release_20260917/release.json`: manifest, test output, per-node QA, env, restart và lần rollback.
- `temp/competitions_release_20260917/postcheck.json`: hash/public/env/boot snapshot và đếm residue cuối.
- `temp/competitions_release_20260917/visual.json`: kết quả native fixture.
- Kế hoạch: `reports/arena_crossarena_fix_plan_20260917.md`; audit gốc: `reports/arena_crossarena_audit_20260917.md`.

## Dọn dẹp và giới hạn còn lại

- Đã dọn4DB QA có marker cùng Redis key của chúng; account/player/fight-log QA production đều0. Đây là dữ liệu thử tự tạo, có thể tạo lại bằng script, không xóa dữ liệu người chơi thật.
- Đã dừng server QA local18753 và đóng tab QA; giữ tab game của người dùng. Giữ script, backup và bằng chứng cần thiết.
- Chưa tới cutoff thật23:00 của S3/S4 hoặc kỳ CrossArena21/09. Những mốc tương lai đã kiểm trong QA, **chưa gọi là phát thưởng/đấu kỳ mới thực tế trên production**. Không ép đổi lịch để tạo bằng chứng giả.
- Người chơi cần **Ctrl+F5** hoặc đóng/mở lại game để nạp addon v3. Không cần nâng lực chiến hoặc xóa dữ liệu nhân vật.
