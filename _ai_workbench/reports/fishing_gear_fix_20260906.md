# Session Report — đã sửa cường hóa cần câu và bè

Ngày 06/09/2026. **Đã triển khai S2 trước, S1 sau; mỗi server được kiểm qua WebSocket/DB/relog trước khi hoàn tất. Đã sửa chuyển bậc/chi phí, cấp mới, MAX và hiệu ứng tiết kiệm mồi của bè. Không phát bù hoặc chuyển đổi cấp/chỉ số lịch sử.**

## 1. Tóm tắt công việc

- Tiếp tục kế hoạch đã được người dùng duyệt. Lấy source/config/client mới từ production tại snapshot07:34:29 UTC+7, không dựa vào source local chưa kiểm chứng.
- Thay hai bộ tính chi phí/tiến độ cần và bè bằng helper chung FishingGearService. Bỏ7 hàm cũ dùng level-only để tự chọn nâng bậc và giá fallback.
- Client gửi rõ `level`, `fast`, `grade`, boolean upgradeAll, expectedState và mã giao dịch. Server không chuyển yêu cầu nâng bằng Ngư Tệ thành nâng bậc bằng tinh thể.
- Đạt cấp trần nhưng thanh exp chưa đầy: vẫn nạp exp bằng Ngư Tệ68, giữ cấp hiện tại. Khi đầy thanh, dừng và chờ người chơi chủ động chọn nâng bậc.
- Nâng bậc thành công: dùng đúng gradeUpCost69, tăng rank, bắt đầu cấp1/exp0. Chỉ số sau nâng khớp preview và công thức combat; không cộng cấp cũ hai lần.
- Rank cuối/cấp1400: hoàn thành thanh exp cuối thì MAX; UI ẩn các nút nâng, server không trừ thêm. Không có profile người thật nào ở rank10/cấp1400 trong baseline cần ngoại lệ chuyển đổi.
- Bổ sung bonus104 của bè vào xác suất tiết kiệm mồi phụ, cộng với dòng tẩy104 và giữ cap25%. Chỉ hưởng khi đã mở hệ thống223 và có ID/bậc bè hợp lệ, không dựa riêng vào ID6201 mà normalizer từng tự điền.
- Tái sử dụng requestId/balanceRevision/receipt của luồng tẩy/hộp. Tính trên clone, save một lần xác nhận, chỉ sau đó trả success; retry không nâng/trừ lần hai. Request cũ/sai thao tác/sai kiểu không tiêu hao.
- ACK4010 đi trước push4010 để callback so rank cũ chính xác khi phát hiệu ứng nâng bậc. Không đổi đường queue/save chung của server.

### Quy tắc sau sửa

| Trạng thái | Nút/thao tác | Tài nguyên |
|---|---|---|
| Cấp dưới trần, exp chưa đầy | Nâng thường hoặc nhanh |68 theo levelUpCost; đủ thanh tăng1 cấp và exp về0|
| Cấp đạt trần, exp chưa đầy | Nâng thường hoặc nhanh để đầy thanh cuối |Vẫn68, không tự trừ69|
| Cấp trần và exp đầy, còn bậc sau | Nâng bậc chủ động |69 theo gradeUpCost; bậc mới cấp1/exp0|
| Bậc10/cấp1400/exp cuối đầy | MAX |Không trừ, không nâng thêm|

Nâng nhanh chỉ hoàn thành thanh kế tiếp hoặc dùng phần Ngư Tệ có thể chi trả, không chạy xuyên sang nâng bậc. Không đổi giá cấu hình hoặc bảng cân bằng tẩy/hộp.

### Ví dụ đúng mốc từng bị kẹt

| Đồ | Bắt đầu | Hoàn thành thanh | Nâng bậc riêng |
|---|---|---|---|
|Cần|Bậc2/cấp20/exp0|200 Ngư Tệ →exp200, không trừ tinh thể|30 tinh thể →bậc3/cấp1/exp0|
|Bè|Bậc1/cấp10/exp0|100 Ngư Tệ →exp100, không trừ tinh thể|15 tinh thể →bậc2/cấp1/exp0|

Ví dụ đã kiểm bằng nhân vật QA, **không phải đã nâng giúp nicky**. Đồ hiện có của người chơi không đổi khi đăng nhập lại. Cấp1 là cấp trong bậc mới, không phải giảm bậc;54 phép so thuộc tính qua9 mốc của2 loại đều không giảm tổng chỉ số.

## 2. File/thư mục đã thay đổi

### Source chính local/production

| File | Vai trò |
|---|---|
|`linhhoasu/lhs/newServer/src/services/FishingGearService.js`|Mới: state/plan/apply/response dùng chung, chi phí và bonus bè|
|`linhhoasu/lhs/newServer/src/services/FishingBalanceService.js`|Cộng bonus bè104 vào tiết kiệm mồi, giữ cap25%|
|`linhhoasu/lhs/newServer/src/handlers/fish.js`|Handler nâng chung, mã giao dịch/state, clone+save, truyền player để kiểm bonus bè|
|`linhhoasu/webgame/game/js/main.min_a6195824.js`|6 hàm native: gửi thao tác, nútgrade, preview cap; thêm thông báo lỗi vào24 bảng lỗi|
|`linhhoasu/webgame/game/index.html`|Cache key20260906_fishing_gear_v1|

BattleService/playerPayload không cần đổi: công thức và payload đã đúng nếu đầu vào rank/level/exp được tạo đúng. Không đổi bin config, giá, WebGM, DB schema, PlayerService, WSServer hoặc bot worker.

### Công cụ, evidence, backup

- Tools mới: `build_fishing_gear_client_20260906.js`, `prepare_fishing_gear_tests_20260906.js`, `test_fishing_gear_fix_20260906.js`, `check_fishing_gear_unlock_20260906.py`, `release_fishing_gear_20260906.py`, `qa_fishing_gear_live_20260906.js`, `sync_fishing_gear_local_20260906.py`, `final_fishing_gear_20260906.py`; tất cả dưới `_ai_workbench/tools/`.
- Baseline bất biến: `_ai_workbench/temp/fishing_audit_20260906T003428Z/`.
- Candidate/evidence: `_ai_workbench/temp/fishing_gear_fix_20260906/`: manifest.json, unlocks.json, gear-fixtures.json, gear-tests.json, stage.json, final-staging-tests.json, canary-progress.json, deploy.json, final-check.json, local-sync.json.
- Remote staging cuối: `/linhhoasu/_ai_workbench/temp/fishing_gear_20260906_004412/`.
- Remote backup: `/linhhoasu/_ai_workbench/backups/fishing_gear_20260906_004412/`. Có preimage4 file cũ; helper là file mới. Rollback chỉ source có kiểm hash, không rollback dữ liệu người chơi.
- Local backup: `_ai_workbench/backups/fishing_gear_local_20260906/`; report backup: `_ai_workbench/backups/fishing_gear_fix_reports_20260906/`.
- Gói source-only: `temp/fishing_gear_fix_20260906/fishing_gear_fix_v1_20260906.zip`,6 entry, yêu cầu bản fishing_custom_balance_v1. SHA-256 cuối cùng nằm trong final-check.json. Không đóng gói credential, runtime người chơi hoặc DB snapshot.
- Đã cập nhật báo cáo MD/HTML này và session_report.md/.html; không tạo tool rác ở root.

## 3. Lỗi đã gặp & giải pháp

| Lỗi | Nguyên nhân | Đã sửa | Cách tránh lặp lại |
|---|---|---|---|
|Kẹt ở trần hoặc trừ69 khi nút báo68|Server chỉ xét level rồi tự chọn grade|Thao tác rõ ràng và state kỳ vọng; cấp+exp đầy mới grade|Ma trận mọi bậc,0/thiếu1/vừa đủ/dư|
|Cấp sau grade/chỉ số vượt preview|Giữ cấp cũ khi fullLevelAttrs đã cộng tích lũy|Bậc mới cấp1/exp0, preview/combat khớp|9 mốc×2 loại,54 thuộc tính không giảm|
|MAX vẫn có nút nâng|Server dừng ở trần/exp0 nhưng native cần exp đầy|Cho hoàn thành thanh cuối rồi trạng thái tối đa chung|Test lần nâng cuối và mọi thao tác sau MAX|
|Bè không miễn mồi theo104|Chỉ đọc tẩy cần|Cộng attrs104 của bậc bè khi mở223, cap25%|RNG cố định tại biên1500/2100/2500bps|
|Bè mặc định gây mở khóa giả|Normalizer luôn điền6201|Bonus và nâng kiểm ledger mở khóa, không chỉ raftId|Probe người chưa mở và ID sai|
|Request chậm thành giao dịch khác|Không có action/expectedState|Validate thao tác+state+revision trước tiêu hao|Retry, stale, conflict, receipt đã bị đẩy khỏi danh sách|
|Sai âm/hiệu ứng tăng bậc cần|Push4010 cập nhật rank trước ACK|Đưa ACK trước push; giữ push native|Native callback và thứ tự packet|
|Save lỗi giữ mutation dở|Mutation trước save|Clone, save xác nhận, session null khi chưa rõ commit|12 ca save null/throw cho2 loại×3 thao tác|
|Patch nhiều hàm để thừa dòng trống|Xóa hàm bằng AST giữ newline|Dọn đúng vùng vừa sửa trước staging cuối|Review diff, không refactor ngoài phạm vi|
|Một lần WS ready timeout|Readiness WebSocket dao động đã thấy trước đây|Kiểm lại đạt, không restart hoặc đổi dịch vụ khác|Không dùng HTTP ready thay live QA|

Giữ nguyên audit RED trước làm lịch sử; suite fix mới có điều kiện PASS theo kết quả đúng, không đổi probe cũ để che lỗi.

## 4. Kỹ năng / kinh nghiệm mới

- Native model isUnlockRaft chỉ đọc raftId; trong backend này không đủ vì ensureFishInfo/playerPayload điền mặc định cả trước khi mở. Ledger systemUnlockInfo.unlockedSystem là bằng chứng server đang dùng; nicky đã có215/223 dù cấp câu6, không ép lại ngày/cấp mở khóa gốc và làm mất quyền đã có.
- Phải so loại thao tác và tài nguyên trước khi trừ, không chỉ kiểm đủ số dư. Retry với expectedRevision cũ không được trở thành một lần nâng khác sau chuyển bậc.
- Nâng nhanh không cần lặp tới10.000 lần; tính trực tiếp số bước đủ thanh/đủ tiền, giữ cùng kết quả nhưng tránh lặp mutation.
- Chốt max-rank là một phần, không thay thế trạng thái MAX đầy đủ. Snapshot mới có0 profile ở rank10/cấp1400 nên không cần chuyển đổi ngoại lệ lịch sử.
- Bậc mới về cấp1 không hạ chỉ số: fullLevelAttrs của bậc mới đã chứa phần tích lũy trước. Giữ cấp cũ mới là cộng thừa.

## 5. Trạng thái hiện tại

### Kiểm thử

- **39 nhóm kiểm thử PASS**, gồm **1.800 tổ hợp**2 loại×10 bậc×5 state×3 thao tác×6 mức số dư, nút/preview/MAX native, replay/relog/state-invalid/unlock, save failure và bonus bè.
- **70 kiểm thử hồi quy PASS** cho mồi FIFO, tẩy/hộp, đơn, linh hồn dự phòng, full entity, thông báo lỗi và layout hộp native.
- Core gameplay contract PASS local/staging với714 bảng; cú pháp3 source và main PASS.
- Các hàm native chạy trong VM dùng chính main đã sửa: nút Nâng bậc gửi action grade, khi exp tại trần chưa đầy chi phí vẫn68, nút MAX ẩn, ACK/state/preview khớp. Không chỉ mô phỏng lại lời mô tả.
- 39 test cuối được chạy lại trên staging Node20 với fixture tối giản đã bỏ định danh người chơi. Stage đầu38 nhóm, sau bổ sung1 nhóm nút grade native; source candidate không đổi vì bổ sung test.

### QA thực tế và an toàn triển khai

- S2 restart →QA PASS rồi mới S1 restart →QA PASS. Cả hai: bắt đầu cần2/20/0 và bè1/10/0; nạp tổng300 Ngư Tệ, không trừ69; relog giữ exp đầy; bấm grade dùng30+15 tinh thể; bậc mới3/2,cấp1/exp0; nâng thường thêm2 Ngư Tệ/2exp; relog lần2 đúng.
- Replay trước/sau relog không trừ lặp; request từ client cũ và stale bị chặn. Thuộc tính cá fixture không bị reroll. Tẩy và mở hộp vẫn dùng chung revision/ledger đúng.
- Hai nhân vật QA đã xóa đúng userId/playerId, cuối qaRemaining0. Không đăng nhập hoặc gọi RPC trên nicky/người thật; không phát bù, không hạ cấp/thu hồi chỉ số.
- 153 artifact đã kiểm hash PASS;5 file của release đúng,148 artifact khác giữ nguyên.3 source local khớp candidate; main/index HTTP cổng81 đúng hash.
- PID cuối S1=3592/restart1372,S2=870/restart36. Mỗi tiến trình game chỉ restart1 lần trong phiên; dist30824,admin30856,bot1600/1576 giữ nguyên PID/restart count.
- HTTP ready8080/8083=200,WS ready9200/9201=ok ở hậu kiểm cuối. Error tail không có TypeError/ReferenceError/Unhandled/FATAL/SyntaxError. Có1 lần WS readiness6 giây timeout rồi đạt ở lần kiểm tiếp; không tuyên bố đã sửa mọi vấn đề tải/kết nối lại.
- Chưa nghiệm thu hình ảnh UI trên phiên người thật hoặc giữ dữ liệu QA xuyên thêm một lần restart sau khi tạo. Đã kiểm hàm native thật và WS/DB/relog thật; không ghi PASS những bước chưa làm.

### Phạm vi còn lại

- Không đổi giá/đền bù, không chỉnh dữ liệu đã tăng sai trong quá khứ. Nếu cần chuyển đổi lịch sử phải có yêu cầu riêng và preview.
- RNG linh hồn, di vật/sự kiện, tập trung/cá lớn/hiệu suất mồi và kích hoạt mảnh Thiên Công vẫn là phần chưa nghiệm thu của các phiên trước; release này không tuyên bố hoàn thiện toàn bộ câu cá.
- Dòng tẩy104+bè104 dùng cap25% hiện hành; không tăng cap trong phiên này.

## 6. Bước tiếp theo

1. Tải lại game/đăng nhập lại để nhận client20260906_fishing_gear_v1. Client cũ thiếu action/requestId sẽ được yêu cầu cập nhật, không tiêu hao.
2. Với đồ đang kẹt: nâng thường/nhanh để đầy exp bằng Ngư Tệ, sau đó mới dùng nút Nâng bậc khi đủ tinh thể. Không cộng tiền hoặc nâng hộ ngẫu nhiên.
3. Kiểm tra trực tiếp UI cần/bè, chi phí và chỉ số sau nâng; báo lại nếu có trạng thái không khớp. Không dùng tài khoản người thật để chạy QA.
4. Nếu cần audit ảnh hưởng quá khứ: làm preview chỉ đọc từ receipt/log/backup, không hạ cấp/thu hồi hoặc phát bù tự động.
5. Rollback dùng preimage đúng hash, chỉ restart game được chỉ định; giữ nguyên giao dịch/receipt và dữ liệu DB mới, không restore players từ baseline cũ.
