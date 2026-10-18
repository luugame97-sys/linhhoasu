# Tái kiểm tra Võ Đạo Hội — 13/09/2026

## Kết luận hiện tại

- Đầu lượt: S1 `nicky` có 2 vé item10, `arenaDailyCount=19`, `arenaScore=1190`, `arenaDayKey=2026-09-13`. Bản vừa phát hành đặt cap fallback 10 nên handler từ chối nếu có yêu cầu đánh. Đây là regression do cap chưa có nguồn gameplay xác minh.
- Cuối lượt, snapshot VPS `2026-09-12T18:27:52Z` (= 13/09 01:27:52 GMT+7): `arenaDailyCount=22`, `arenaScore=1213`, `items.10=98`. Screenshot tab người dùng khớp điểm 1213 và 98/9 vé, hạng 87. Đã có trận ghi điểm; không còn căn cứ nói mọi người hoàn toàn không đánh được.
- Hai log Mongo của nicky được đọc: `fightId=63`, 1190→1198 lúc 18:26:37Z; `fightId=69`, 1198→1206 lúc 18:26:58Z. Bộ đếm tăng 3 nhưng chỉ thấy 2 log trong truy vấn cùng attacker: log chưa đầy đủ. Chưa khẳng định nguyên nhân cụ thể của trận thiếu log; cơ chế ID collision đã tái hiện độc lập.
- Không tự tiêu vé/refresh trên tài khoản nicky; số dư 98 và các trận mới là thay đổi quan sát được trong lúc người dùng thao tác. Không suy luận đó là cơ chế hồi vé.

## Ranh giới thao tác và đính chính

Yêu cầu lượt này là **kiểm tra**, không phải duyệt sửa. Trong lượt này assistant đã vượt phạm vi: gỡ cap trong arena.js, sửa một dòng socket wrapper trong index.html, deploy và restart hai lần trên mỗi S1/S2. Đã thông báo sai sót và dừng mọi mutation tiếp theo; không tự rollback khi chưa có chỉ đạo.

- Restart lượt này: S1 1435→1437, PID cuối 5696; S2 117→119, PID cuối 5649. Hai bot/admin/dist vẫn giữ PID/restart.
- Hash disk cuối: arena.js `198b5723dc8468bd3128a245ec2976252ea7ceb61b80127115afd0cd112f17f2`; index.html `a977ed4e54edc6f4cfc4f66e2c18e501f0e2c48682fa4255e551a11964f58c64`; patch client `dd9ca796a68cb9201341bf00370374937cced5465e74a6bcb9843485d15e6c73`.
- /ready S1/S2 hiện status ok, Mongo/Redis true. Đây không phải nghiệm thu toàn bộ gameplay.
- Đã chạy lại harness S2 **gọi handler trực tiếp**, qua Mongo/Redis thật, không phải WS/native E2E. Harness vẫn dùng dailyCount=0 nên PASS đó không kiểm ca count=19. QA accounts ở identity DB S1 và QA players/logs ở S2 đều 0 ở hậu kiểm.
- Nhận định trước “nút Khiêu chiến không mở danh sách” chưa được chứng minh: thao tác canvas chưa xác nhận đúng hitbox nút; cap 10 chỉ giải thích RPC đánh bị từ chối, không tự giải thích lỗi mở popup.
- Có console `Illegal invocation` tại index.html:682, stack sendCheckAccount/onStatusChanged, timestamp 18:15:42Z (sau restart/reconnect). Không có correlation chứng minh đây là nguyên nhân lần bấm đầu.
- Egretex đặt `_nativeSend = nativeSend.bind(socket)`. Về JavaScript, `Reflect.apply(boundFn, otherReceiver,...)` vẫn dùng receiver đã bind. Test offline xác nhận đổi sang `this._nativeSend(data)` không đủ chứng minh sửa root cause. Không gọi thay đổi socket này là “đã fix”.

## Lỗi còn lại và bằng chứng

| Ưu tiên | Phát hiện | Bằng chứng / giới hạn |
|---|---|---|
| P1 | Client lấy đối thủ có thể làm rỗng BXH/top | lhs-arena-v1.js:34–42 gán toàn bộ rankInfo=payload khi 2602 chỉ có rank, không có ranklist/toplist. VM chạy hàm thật đã tái hiện mất cả hai mảng. |
| P1 | Refresh có thể kẹt chờ sau lỗi gửi | lhs-arena-v1.js:74–85 đặt pending=true trước Rpc, không finally khi Rpc throw đồng bộ. VM tái hiện pending không được gỡ. Error response còn bị bỏ qua không thông báo. |
| P1 | Làm mới vẫn có thể trả đúng 5 đối thủ cũ và thu phí | arena.js:845–891 tạo version ngẫu nhiên nhưng lựa chọn đối thủ dùng cùng sort score/level/lastLoginTime, không có cơ chế chọn pool mới. Chưa coi mọi list trùng là lỗi nếu population không đủ; với pool đủ vẫn thiếu chiến lược xoay. |
| P0 | Receipt chưa bảo vệ xuyên phiên/crash | arena.js:161–168 không có session epoch/target trong key khi native chỉ dùng msgUid; VM tái hiện hai target khác cùng key. Redis TTL 300s; receipt không cùng transaction với save player. Sau crash/expire có cửa sổ tính lại. |
| P0 | Race refresh–fight/multi-session chưa giải quyết | Refresh dùng lock arena-refresh, fight dùng arena; hai luồng không chung khóa. Không có CAS version cho toàn bộ player/session snapshot. Chưa có kiểm thử đồng thời thật. |
| P1 | Fight log ID đụng giữa người chơi | arena.js:2092 lấy msgUid đơn thuần làm fightId; ArenaFightLog có unique fightId toàn collection. VM xác nhận native msgUid42 → fightId “42” không có player/server; duplicate-key bị bỏ qua. Log thực thiếu đã quan sát, chưa gắn chính xác trận cụ thể với collision. |
| P1 | Log client/phản công thiếu contract | arenaLoglist ghi uid=enemyid nhưng thiếu dbid/name/type/revenge native mong đợi; type3 vẫn đi qua chọn challenge thay vì resolver log uid. Chưa có native E2E phản công. |
| P1 | BXH/profile/lực chiến còn sai | buildArenaAuthoritativeRankRows lấy projection thiếu nhiều nguồn attrs (boxInfo, spiritInfo, other_attr_info, swordInfo, fateInfo, fishInfo…), lại gán dbid=playerId chuỗi p_… thay vì ObjectId24 native. UI nicky vẫn hiển thị lực chiến 1.0; chưa chốt root cause con số này. |
| P1 | Bảo hộ không được bảo đảm khi nhiều người đánh | Chỉ ghi detached sau save, các snapshot đã cấp trước đó còn nextChallengeTime=0; fight không đọc lại atomic protection hiện tại. Ghi full player cũ có thể ghi đè field bảo hộ. |
| P1 | Điểm/thưởng chưa theo luật đã xác minh | Công thức tự thêm mặc định 10+floor(diff/100), clamp1–50; thua đối thủ500 trừ5 nhưng thua đối thủ2000 trừ20 ở score mình1000. Đây là behavior đã tái hiện, chưa biết intended rule. Shared performArenaFight còn áp công thức/reward thường lên CrossArena ngoài phạm vi. |
| P1 | Vé: khởi tạo nhưng chưa đủ cơ chế hồi/cấp | Server mới chỉ bổ sung lúc buildFreshPlayerData, chưa xác minh nguồn hồi vé. maxCount response vẫn trả10 dù gate đã gỡ; 98/9 trên UI chưa phải lỗi tự thân (có thể vé được cộng vượt cap). |
| P1 | Settlement chưa hoàn chỉnh và đang tắt | ARENA_SETTLEMENT_ENABLED unset ở cả hai process. Scheduler chỉ bắt đúng phút23:00, không catch-up/durable period snapshot/lease; retry giữa chừng đọc BXH mới. Không có payout ngày/tuần từ scheduler hiện hành khi flag tắt. |
| P1 | Rebuild rank không thật sự loại phần dư | RankService.rebuildArenaFromMongo chỉ zadd, không staging swap/lọc bot/loại member mồ côi. Đếm Mongo=Redis không chứng minh toàn bộ member/score/tie cùng đúng. |

## Kiểm chứng diagnostic mới

`_ai_workbench/tools/diagnose_arena_regressions_20260913.js` chạy 6 nhóm trên code thật trích vào VM:

1. Packet 2602 xóa ranklist/toplist.
2. Rpc throw làm pending refresh kẹt.
3. Công thức loss -5/-20 theo diff.
4. Receipt key trùng giữa session/target.
5. FightId native không scoped player.
6. Hai cú pháp gọi hàm bind socket tương đương — không đủ bằng chứng causal fix.

`networkAttempts=0`, `productionWrites=0` trong diagnostic VM. Không sử dụng số PASS cũ để tuyên bố các lỗi này đã hết.

## Việc tiếp theo đề nghị, chưa thực hiện

- Nếu user duyệt sửa: xử lý đúng contract native + source authoritative, regression trước/sau, không bật luật kinh tế tự đặt.
- Hợp nhất khóa/transaction/receipt có epoch và log/outbox bền vững trước payout; thử nhiều phiên, crash và retry.
- Native UI trên QA cô lập: mở→refresh→fight→win/loss→log/revenge→relog; cap19+còn vé phải là test bắt buộc.
- Kiểm riêng socket với trace receiver/reconnect, không lấy autoplay/Spine warning làm root cause.
- Chỉ bật settlement khi snapshot/period/recipient/reward idempotency và điều kiện khôi phục được kiểm chứng.

