# Fulu/type52 — server follow-up QA (08/10/2026)

## Phạm vi

Chỉ candidate `Activity52TaskService.js`; không deploy/restart, không DB/player production writes. `Activity52Service.js` staged nguyên trạng, chưa sửa. Config lấy `fulu_qa_20261008/baseline.json`; service/MainTask/playerPayload/receipt lấy exact-live snapshot cùng đợt.

## Hai lỗi đã tái hiện và sửa candidate

1. `sync(player, player.taskInfo)` xóa task7500x trước `ledger()` đọc trạng thái nhận cũ. Khi chưa có ledger, task75001 đã nhận (`status30`, dailyTaskDayKey hôm nay) bị chuyển thành20; claim tiếp theo cấp thêm233. Sửa: derive rows/khởi tạo ledger trước khi xóa và thay rows.
2. Claim là packet đầu tiên ngày mới có thể dùng `items19=80` hôm qua để nhận task75003 và cấp232×2. Adapter52 chưa reset điểm hằng ngày; generic refresh diễn ra sau handler ở exact-live snapshot WSServer (await routePromise dòng921, refresh dòng962). Sửa hẹp: task75003 không tính điểm khi có `dailyTaskDayKey` thuộc ngày khác; không reset/chỉnh items19 hoặc logic task chung. Daily day chưa có vẫn giữ tương thích hiện tại; daily point reset do generic normalizer quản lý.

## Bằng chứng

- `_ai_workbench/tools/test_fulu_server_followup_20261008.js before`: 17 PASS / 4 FAIL (hai ca mỗi lỗi: derived state và claim thực qua service RAM).
- Cùng tool `candidate`: 21/21 PASS; actual MainTask/playerPayload fresh-first-increment và midnight-first-increment đều đếm đủ100 bagel/3 arena, không có lỗi mất baseline như nghi vấn ban đầu.
- Bao phủ thêm duplicate/distinct concurrent claim×8, receipt conflict/cycle rollover, commit rồi mất ACK, save refusal, verified54 UID/dedupe, baseline lifetime, legacy context và closed-event cleanup.
- Harness cũ `test_fulu_candidate_20261007.js` với `FULU_TASK_SERVICE_FILE` trỏ helper candidate mới: 41/41 PASS. Các module khác trong harness cũ vẫn dùng snapshot/candidate07; không gọi đây là exact-live full E2E.
- Test mới VM/RAM, mock persistence/reward sync; không Mongo/browser/live-network. Chưa chứng minh migration condition từng xảy ra với player thật; đây là lỗi được tái hiện bằng precondition hợp lệ, không khẳng định exploit đã xảy ra.

## Bàn giao

- Root đã lấy `PlayerMutationService.js` exact-live08; bỏ fallback07 và rerun before/candidate + old41 đều cho kết quả trên.
- Replay branches ở hai helper tải DB để dựng packet nhưng không thay session canonical như fresh-success branch. Cần đánh giá thêm stale-session/post-handler save và pending in-memory state; chưa sửa/khẳng định mất dữ liệu thực tế.
- Không đổi giá, trọng số, guarantee, multiplier, native dispatch hoặc task54 semantics. Chờ root/client QA và người dùng duyệt trước mọi release.

## Follow-up lỗi người dùng báo multiplier2–5 đứng

- Thêm5 ca exact-live `activity.handleActivityOperate` + `Activity52Service`, effective config baseline, synthetic bag233=159/232=33/score13/selectedColor4, chạy index1–5 riêng biệt.
- Cả5 PASS trên before lẫn candidate: debit đúngN, score/record tăngN, push1775 có tổng5 màu, reward số nguyên dương/scaledN, ACK.draw khớp1775, nonce/cycle đúng, replay không debit lại. Không sửa Activity52Service vì chưa tái hiện lỗi server multi.
- Grant adapter được mock là inventory-item path, không kiểm mọi native body-item reward; save/CAS mock RAM. Chưa chạy safe addon/native render trong test này. Nếu request multi chưa đến server/chưa có receipt, ưu tiên trace client trước-send và animation state, không suy ra server hoạt động đầy đủ chỉ từ harness.

## Exact isolated Mongo follow-up

- Runner: `_ai_workbench/tools/run_fulu_followup_mongo_20261008.py`; output `_ai_workbench/temp/fulu_qa_20261008/qa/server_followup_mongo.json`.
- Database riêng `lhs_qa_fulu_followup_20261008`; 9 synthetic `qa_fulu_followup_*` documents, cleanup `9`, remaining `0`, production/account writes `0`.
- Before exact installed helper: **4/4 defect assertions FAIL as expected** — legacy claimed task cấp thêm233 (160 thay vì159), stale yesterday points cấp thêm232 (35 thay vì33); cùng các test candidate multi vẫn không dùng before helper.
- Candidate Module-compiled trong test process: hai defect **PASS**; installed real RewardGrant/PlayerService/FeatureReceipt + Mongo thật kiểm claim×8, draw×8 multiplier1–5, durable reward persistence, replay no delta, conflict, và competing CAS exactly one winner. Tất cả PASS.
- Native reward rows thực tế đã gồm body-item/currency IDs (ví dụ 229,6,71,100701,232), không chỉ inventory mock. Không sửa require cache/global production; không restart/deploy.
