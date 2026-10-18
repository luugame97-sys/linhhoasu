# Kiểm tra Võ Đạo Hội và Đỉnh Phong Diễn Võ — 17/09/2026

## Kết luận và phạm vi

Cả hai còn lỗi. Đỉnh Phong Diễn Võ chưa đạt yêu cầu đấu liên server và an toàn kinh tế/kết toán. Chỉ audit: không sửa source game, deploy, restart, gọi gameplay trên tài khoản thật hoặc ghi Mongo/Redis production.

- Inventory live cuối: 13:27 GMT+7, VPS `103.116.105.154`, app `/linhhoasu/lhs/newServer`, public client `/linhhoasu/webgame/game`.
- Tên được xác minh bằng language pack đang phục vụ: System305 = Võ Đạo Hội/Arena (`2600–2602`, fight `2300 type2/3`); System317 = Đỉnh Phong Diễn Võ/CrossArena (`5000–5002`, fight `2300 type16/17`). Không gộp TopCombat/TopArena/Thiên Hạ Đệ Nhất vào kết luận này.
- Hash live `arena.js`: `a86888ed1b0e2773a86e9a4dc036d08b0de4f590804812432a52d156141557ff`; `app.js`: `15cef28a63bd8cf706c9f8f47d02353066d673e317a956251bb9bc72871bf5ca`.
- Addon Arena public/disk cùng hash `3f390d95a5bc6845a56bedc0ababb7af31cf63354877da1ea353359bb1ee0352`; main thực tế `main.min_drop100.js`, hash `9b030e70cdfd3ecd1655df13b9e13cb96f2fcf81761ef969fff9a4f8a58708cb`.
- Các source server trong inventory đều có mtime trước lần khởi động hiện tại. Bốn node online, `/ready` đều 200; PID/restart không thay đổi trong audit. Đây không phải bằng chứng gameplay hoàn thiện.

## Võ Đạo Hội

| Mức | Phát hiện | Bằng chứng hiện tại |
|---|---|---|
| P1 | Gửi lại trận đã xử lý trả dữ liệu trận rỗng; client tiếp tục báo lỗi. | Handler ghi ledger với `entitys:[]`, rồi ưu tiên ledger trước Redis receipt. RAM: lần đầu 2 entity, replay 0; vé 3→2→2. Chạy chính addon public trong VM: hook cài đủ, không mở battle, báo “Dữ liệu trận Võ Đạo Hội chưa đầy đủ…”. Không phải trừ vé hai lần, mà là contract phục hồi kết quả sai. |
| P1 | Snapshot đối thủ thật bỏ bonus skin gia viên. | Query `loadSameServerArenaOpponents` thiếu `items`, trong khi BattleService dùng items để tính bonus công trình từ skin. Fixture đã chuẩn hóa ngoại quan, có công trình và skin: `calcPowerScore` 126587→105247; HP 1933220→1540520. Đây là sai attrs thực đưa vào trận, không chỉ lỗi rút gọn chữ số. |
| Cấu hình | S3/S4 chưa bật kết toán thưởng Arena. | S1/S2 có ENABLED=APPROVED=1 và activation14/09. S3 unset, S4 bằng0; cả hai chưa có Arena settlement/mail. Chưa tự bật vì cần chốt activation và chính sách trả bù. |

Source: `src/handlers/arena.js:298,914,959,2593,2725`; `src/services/BattleService.js:378`; `webgame/game/js/lhs-arena-v1.js:126`.

Điểm đã hoạt động có bằng chứng:

- Trận Arena đầu tiên RAM trừ đúng1 vé; replay không trừ thêm; đối thủ không hợp lệ bị từ chối.
- Kỳ thưởng ngày14/15/16-09 của S1/S2 đều có receipt `done`. Kỳ16/09: S1 598/598, S2 129/129 người được ghi delivered. DB hiện có1567 mail Arena S1 và364 mail S2; không suy mail đã xóa/đã nhận là phát thiếu chỉ từ tổng hiện tại.
- Chưa đến cutoff tuần đầu sau activation; không tuyên bố đã nghiệm thu mail tuần thực tế.

## Đỉnh Phong Diễn Võ

| Mức | Phát hiện | Bằng chứng tái hiện trên mã/config live, persistence RAM |
|---|---|---|
| P0 | Không trừ vé và thiếu chống xử lý trùng trận. | Người chơi fixture có0 vé110 vẫn được xử lý. Gửi lại cùng yêu cầu làm dailyCount tăng2, điểm1010→1019, thưởng được cộng lần nữa. Ca này ép kết quả thắng để kiểm nhánh kinh tế; không phải kiểm độ đúng simulator. |
| P0 | Cho đánh ngoài kỳ và ghi điểm nhầm sự kiện. | Lịch hiện là `crossRival`, handler CrossArena vẫn ACK0. `upsertScore` tự lấy loại sự kiện hiện hành nên hai write RAM được gắn `crossRival`, không phải `crossArena`; có thể ghi đè điểm của cùng người chơi ở sự kiện khác. Chưa khẳng định dữ liệu thật đã bị ảnh hưởng. |
| P1 | Thưởng trận lấy nhầm cấu hình Arena. | Thắng cấp bạc2000 + item7×2; config CrossArena yêu cầu item89×10. Nhánh thua source không cấp gì, trong khi CrossArena có `arenaFailReward` item89×5; nhánh thua ghi nhận bằng đọc source/config, chưa có ca deterministic riêng. |
| P1 | Danh sách liên server bị lỗi `_id`, rồi fallback cùng server/robot. | Đặt clock fixture đúng kỳCrossArena, cung cấp một CrossEventEntry S2: mapper gọi `buildPlayerView` nhưng không truyền ObjectId24. Log `ARENA_PLAYER_DBID_INVALID`; đối thủ S2 biến mất, trả robot1–5. Payload entry cũng chưa chứa bộ attrs đầy đủ. |
| P1 | BXH không phải thứ hạng liên server. | `buildCrossArenaRankRows` chỉ ghép mình +5 đối thủ. Với rank-provider fixture=42, info trả hạng6, sau fight trả42; ranklist chỉ có6 hàng. RankService hiện đã có keyCrossArena nhưng prefix vẫn riêng từng server; màn info không đọc shared roster làm BXH. |
| P1 | Làm mới không thu phí/không chặn cooldown, có thể trả nguyên danh sách. | Hai lần liên tiếp đều ACK0 khi0 kim cương; danh sách giống hệt. Config phí10 kim cương; handler chỉ đặt refreshtime thêm30s. |
| P1 | Nhật ký và reset bộ đếm ngày chưa hoàn chỉnh. | Sau hai trận RAM loglist vẫn0; sang ngày tiếp theo dailyCount vẫn2. Nhánh append/persist ArenaFightLog chỉ chạy khi `!crossArena`. DB read-only S1 có10 state, S2 có2 state, tổnglogCount0; không suy diễn lịch sử khai thác từ state này. |
| P0 | Scheduler chọn sai tên sự kiện của kỳ vừa kết thúc. | Chạy nguyên callback `tickCross` trong VM: khi sangCrossArena, kỳ trước đáng lẽcrossRival lại mang têncrossArena; khi sangTopArena, kỳ trước đáng lẽcrossArena lại mang têntopArena. Vì key kỳ cũ ghép sai event, settlement đọc nhầm/rỗng roster. |

Source: `src/handlers/arena.js:1100,1982,2382,2434,2616,2725,3906,3934`; `src/services/CrossServerEventService.js:19,26`; `src/app.js:122`.

Lịch live đã được phê duyệt trước: S1–S3, mỗi kỳ7 ngày, Cross Rival→CrossArena→TopArena. Ngày17/09 đang ởCross Rival; CrossArena theo lịch21/09 00:00 đến28/09 00:00 GMT+7. Lỗi settlement trên được tái hiện ở các mốc tương lai trong RAM, không khẳng định đã mất thưởng một kỳ CrossArena chưa kết thúc. DB hiện có một settlement kỳâm `C-1` rỗng, được tạo trước kỳ đầu bởi cùng callback; không dùng record này làm bằng chứng trả thưởng đúng.

## Kiểm chứng và giới hạn

- Probe chạy bằng Node qua SSH stdin trên code/config cài ở VPS. Logger, PlayerService, model persistence, Redis được thay bằng RAM; TCP/TLS/HTTP/fetch bị chặn trước import. `networkAttempts=0`, `productionWrites=0`. Không tạo tài khoản QA hoặc ghi file trên VPS.
- Test cũ chạy lại trên live source + đúng public main: client Arena v2 PASS; read-model24 checks +50 randomized PASS; hardening10 PASS; settlement RAM PASS. Một warning schema Mongoose `isNew` được tách khỏi assertion failures.
- Các test cũ chưa bao phủ projection thực trong handler, replay ledger→addon, kinh tế CrossArena hoặc callback chuyển kỳ. Không dùng số PASS này để phủ nhận các lỗi mới.
- Chưa đăng nhập người chơi thật để kiểm UI/hitbox, phản công, native cross-server combat hoặc mail-claim E2E. Không kết luận mọi lỗi đã được liệt kê hết.
- Probe có kết quả TopCombat trong trường `outOfScopeFindings` từ bước phân biệt tên; không dùng chúng như lỗi Đỉnh Phong.
- Hạn chế fixture đã chỉnh trong audit: projection stub cần giữ trường nested `roles.*`; chọn đối thủ cần RNG cố định để không ngẫu nhiên loại fixture; model client cần RankView để cờ installed phản ánh đủ hook. Kết quả cuối nằm ở evidence dưới.

Evidence: `_ai_workbench/temp/competitions_audit_20260917/{inventory,probe,regression}.json`.
Runner: `_ai_workbench/tools/audit_competitions_20260917.py`, ba JS cùng prefix. Chỉ có mode đọc/kiểm thử RAM, không có mode deploy.

## Thứ tự xử lý đề xuất, chưa triển khai

1. CrossArena: chặn sai kỳ/server; vé/phí/thưởng theo đúng config; ledger/transaction chống retry trước khi mở kỳ tiếp theo.
2. Sửa roster đủ định danh + attrs và BXH chung; sửa chọn previous event ở scheduler, kiểm thử qua cutoff với receipt/mail bất biến.
3. Arena: sửa contract replay và đồng bộ projection; hồi quy cả handler→addon, không chỉ read-model riêng.
4. Chốt riêng việc bật thưởng Arena S3/S4; sau sửa cần native E2E trên QA được ủy quyền.
