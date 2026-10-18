# Thiên Giáng Phúc Lộc — server candidate 07/10/2026

Chỉ candidate và kiểm thử RAM; không deploy, restart, thao tác browser hoặc ghi player.

## Baseline chính xác

- Live `/linhhoasu/lhs/newServer/src/handlers/activity.js`: SHA256 `097a2b1c8dc222460d01cffb69035251eb7abb0f94914622512924a09a0f2ba6`.
- Live PlayerService: `e77202165c7f0eeadecbaac81f5e2655228a3144bce52e1149e5d4410a898678`.
- Snapshot: `_ai_workbench/temp/event_goal_20261007/fulu/before/`.
- Candidate: cùng thư mục `candidate/handlers/activity.js`, `candidate/services/Activity52Service.js`, `candidate/services/PlayerService.js`.

## Sửa trong phạm vi type52

- Intercept type52 trước generic upsert/mutation. Event phải có row đang mở, không bị disabled; không tự tạo event từ RPC.
- Kiểm input/module/color/multiple, đầy đủ config/pool/reward support trước consume. `flattenObjectRows` cũ đã recursive: không có bằng chứng current config arrangement thiếu. Lỗi consume-trước-validation tái hiện khi config missing/invalid, không khẳng định người chơi từng mất đồ.
- `Activity52ArrangeConfig[event][prize][type]`: giữ showRate/weight, mỗi lượt chọn một thưởng, scale multiplier; màu được hoán vị đồng đều theo partition native; matching color cấp `exchangeId * display * multiple`.
- Giữ score cộng multiplier; 79+5 thành84. Khi score>=guaranteedTimes chỉ chấp nhận single và force prize1; reset score0 sau lượt bảo đảm. Không reset khi jackpot tự nhiên. Reset sau guarantee là suy luận vòng meter được root chấp thuận, không tuyên bố parity CN server vì không có source backend gốc.
- `special=0`: native dùng special làm số hồ lô cầu vồng; không nhầm thành cờ guarantee và không tự tạo xác suất cầu vồng.
- Claim đúng times*(completed+1), giới hạn triggerTimes.
- Draw/claim cần requestId/cycleKey; client cũ thiếu trả `FULU_CLIENT_RELOAD_REQUIRED`. Cycle key: `id:startTime:endTime`.
- Tag1775 và ACK1700 có id/requestId/cycleKey, ACK có draw để khôi phục nếu push thất lạc. Error có datas current row cho UI rollback.

## Giao dịch

PlayerMutation lock → drainPendingSaves → load DB snapshot mới → clone draft → mutation/receipt → confirmed save CAS → publish authoritative snapshot (cả level mới để tránh session stale).

`activity52CAS` opt-in trong PlayerService: guard chính xác mọi field bị đổi cộng `level`, `activityInfo`, `items`, `currencies`, `other_attr_info`; native reward side effects tự được đưa vào changed/guard. Chỉ `$set` changed fields, không save toàn player. Các caller cũ không đổi.

Receipt cũ phục hồi kết quả mà không tiêu/cấp lại; replay sau đổi kỳ không phát draw cũ; save null/throw invalidate session, không ACK success. Không hoàn phí mù khi commit có thể đã xảy ra.

## Kiểm chứng

`node _ai_workbench/tools/test_fulu_candidate_20261007.js`: 28 cases PASS. Gồm config missing/invalid, input, thiếu phí, nonce/cycle, claim cap, guarantee,79+5, seed multiplier, concurrent same receipt, request conflict, null/throw save, ACK loss after commit, CAS external mutation, absent cycle, replay qua kỳ, stale session, capture filter `$and` của candidate PlayerService.

RAM harness dùng Config52/Arrange52 local đã native-agent xác nhận hash khớp live; reward grant và DB được mock. RewardSync dùng module thật, CurrencySync/NativeItem phụ thuộc mock. Kiểm thêm item delta `-5`, changed absolute995; replay items rỗng, changed absolute; stale session190 → DB191 giữ191. Không phải test Mongo hoặc native E2E. Syntax 3 JS PASS.

## Handoff

- Root gate phải đứng TRƯỚC type52 dispatch mới ở đầu `handleActivityOperate`; không để helper bypass maintenance gate.
- Chưa thay source local runtime. Không chạy lại `prepare_fulu_candidate_20261007.py`: script từ chối overwrite candidate đã tồn tại.
- Cần integration test live config/reward services, QA admin S1 (select→single/multi→claim đủ điều kiện→relog), read-back DB/receipt và client animation/error handling trước mở người chơi.
- Không tự cấp nguyên liệu/điểm bằng DB để ép guarantee hoặc claim trên account thật.

## Candidate hashes

- activity.js: `791f374a0d412b482abaa6eb9955a0cb81ea707be54594e5c2feb175230c620f`
- Activity52Service.js: `5820414111c7be9f2d631cbd0821c35e8cd5877dcb1014ad06070287f152e09a`
- PlayerService.js: `f183bdb9537715cffeaa5ed55e4c6370113672f793efc08439bd985d2daf45ac`
