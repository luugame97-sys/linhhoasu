# Kế hoạch fix chi tiết Thử Thách – Võ Đạo Hội

Ngày: 12/09/2026  
Phạm vi: Arena/Võ Đạo Hội thường (`2600/2601/2602`, thao tác H5 đi qua `2300 type=2`).  
Trạng thái: **planning-only**, chưa sửa source, chưa deploy, chưa restart, chưa ghi DB/Redis.

## 1. Mục tiêu nghiệm thu

Sau khi hoàn tất, các điều kiện sau phải đúng đồng thời:

1. BXH, hạng bản thân, top 3 và điểm dùng cùng một nguồn authoritative theo từng server; không lấy challenge list làm BXH.
2. Một lần khiêu chiến hợp lệ trừ đúng 1 vé item 10, tăng đúng lượt, tính đúng điểm/thưởng và chỉ xử lý một lần khi retry.
3. Refresh trừ đúng phí item 2, bị khóa theo cooldown server, trả list mới có version/token và không giữ dữ liệu cũ sai.
4. Trận người thật dùng snapshot đội hình/lực chiến hợp lệ của đối thủ; token sai/hết hạn không được fallback sang người khác.
5. Cooldown bảo hộ, reset ngày, log trận và kết toán ngày/tuần hoạt động đúng contract.
6. DB, Redis, packet, UI, mail và relog khớp nhau; không có duplicate reward/cost.

## 2. Các quyết định phải chốt trước khi code

Không tự suy đoán các điểm cân bằng sau; cần owner/game-design sign-off và ghi vào versioned config:

- `arenaTicketMax=3`, `initArenaTicket=3` là cap/tồn vé hay còn cơ chế hồi theo thời gian; hiện chưa có `AssetsRefreshConfig` cho item 10.
- `arenaDailyCount/maxCount` có phải giới hạn trận/ngày hay chỉ là số liệu UI; nếu là giới hạn thì giá trị chính thức là bao nhiêu.
- Công thức điểm thắng/thua theo điểm đối thủ (Elo/bảng mốc/công thức khác), giới hạn điểm tối thiểu/tối đa và tie-break.
- Reward trận thắng/thua và cách ánh xạ `ArenaBaseConfig.arenaReward` theo section.
- Múi giờ kết toán 23:00, phạm vi daily/weekly reset và danh sách server áp dụng.
- Bảo hộ 30 giây áp dụng cho mọi thất bại/thắng hay chỉ khi bị tấn công thành công.

## 3. Pha 0 – Inventory, freeze và đối soát (read-only)

**Đầu ra:** `arena-preflight.json`, `arena-rank-diff.csv`, manifest hash/backup.

1. Xác định process, source hash và config đang chạy trên S1/S2; không dùng local hash thay cho production hash. Đối chiếu `lhs-s1001`, `lhs-s1002`, Redis prefix `s1001:`/`s1002:`.
2. Snapshot có kiểm soát:
   - Redis ZSET rank Arena theo từng prefix (giữ score/member/TTL/thời điểm).
   - Mongo Player: `playerId`, `userId`, `serverId`, `arenaScore`, `arenaDailyCount`, các field Arena hiện có.
   - Account roles, mail/transaction liên quan reward Arena, log runtime tag `2600/2601/2300`.
3. Lập diff DB ↔ Redis: missing member, extra member, score mismatch, duplicate/invalid ID, rank tie. Không xóa/rebuild ZSET production ở pha này.
4. Bật kế hoạch kill-switch/read-only cho Arena nếu trong lúc triển khai phát hiện dupe hoặc drift; không dừng dịch vụ ngoài phạm vi.
5. Restore drill snapshot trên staging trước khi cho phép mutation production.

## 4. Pha 1 – Chuẩn hóa contract và state

### 4.1 State additive

Thêm state versioned, không xóa field cũ:

```text
arenaStateVersion
arenaDayKey
arenaDailyCount
arenaRefreshAt
arenaProtectUntil
arenaChallengeVersion
arenaLastSettlementDay
arenaLastSettlementWeek
```

Reset theo timezone đã chốt, chạy idempotent khi login và trong handler; không reset dựa trên giờ máy client.

### 4.2 BXH authoritative

- `RankService.js`: giữ ZSET theo Redis prefix của từng server; bổ sung API lấy Top-N, rank self, score self và tiebreak ổn định.
- `arena.js:1444-1476`: bỏ `self + challengelist` làm `ranklist/toplist`.
- `handleArenaInfo`: lấy top rows từ rank repository, hydrate field hiển thị bằng projection; challenge list là payload riêng.
- `performArenaFight`: không trả `rankList: challengelist`; trả rank/score/top snapshot authoritative sau settlement.
- Backfill có kiểm soát từ Mongo theo projection, chạy staging → dry-run → production có checksum/count. Bao gồm player score `0` nếu contract yêu cầu; không backfill mù.

### 4.3 Challenge snapshot/token

- Khi mở/refresh, server phát `challengeVersion` + token cho từng mục tiêu; token ràng buộc `serverId`, `attackerId`, `targetId`, score, snapshot hash, thời điểm tạo và expiry.
- Snapshot có power/formation attrs đủ để mô phỏng; robot phải có cờ `isRobot` riêng.
- Lưu snapshot server-side (Redis TTL hoặc store tương đương), không nhét payload lớn không cần thiết vào packet/player.
- Khi fight: token sai, hết hạn, khác server hoặc target đã đổi snapshot → trả lỗi rõ ràng và yêu cầu tải lại; tuyệt đối không chọn phần tử đầu/index thay thế.

## 5. Pha 2 – Sửa server transaction và luật chơi

### 5.1 Khiêu chiến (`arena.js`, `raid.js`, `handlers/index.js`)

Thứ tự xử lý bắt buộc:

1. Validate session, `type=2`, schema request, target/token và thời gian bảo hộ.
2. Atomic day rollover → kiểm tra cap chính thức → kiểm tra item 10.
3. Dedupe trước mutation bằng key `serverId/playerId/requestId(or msgUid)/challengeVersion`; retry trả lại response đã lưu.
4. Consume item 10 và tăng count bằng CAS/transaction; lỗi ở bất kỳ bước nào không làm mất vé/lượt.
5. Mô phỏng bằng snapshot đối thủ thật; không dùng `generateOpponentAttrs(player.level, index)` cho player thật.
6. Tính score theo `ArenaRulesService`/config đã sign-off; clamp và ghi pre/post score.
7. Cấp reward theo config, tạo item/currency delta tuyệt đối và lưu player.
8. Ghi rank update qua outbox/retry idempotent; không để DB thành công nhưng Redis mất điểm hoặc ngược lại.
9. Ghi fight log và trả packet đầy đủ: `fightId`, score, rank, rankList/topList, challenge list/version, balance, reward.

### 5.2 Refresh (`handleArenaRefresh`)

- Kiểm cooldown server 3 giây bằng `arenaRefreshAt`.
- Consume item 2 × 100 atomically theo `ArenaBaseConfig`; thiếu tiền trả lỗi, không đổi list.
- Rotate challenge seed/version/token, lưu timestamp, trả `refreshtime`/remaining cooldown và metadata đầy đủ.
- Không trả `result=0` giả khi build list lỗi; lỗi phải giữ state cũ và có mã retry-safe.

### 5.3 Bảo hộ target

- Sau fight hợp lệ, cập nhật `arenaProtectUntil = now + 30s` bằng CAS tại target.
- Không đưa target đang bảo hộ vào challenge list; packet 2603 phải mang timestamp mới.
- Nếu target offline, ghi state bền vững để relog vẫn đúng.

### 5.4 Vé và giới hạn

- Server đọc `ConstConfig.initArenaTicket/arenaTicketMax`; bổ sung policy hồi vé rõ ràng vào config chính thức nếu feature cần hồi theo thời gian.
- Login/day rollover phải normalize vé và phát balance authoritative; client không được tự tăng vé.
- Không dùng `arenaDailyCount` thay cho ticket balance nếu hai khái niệm khác nhau.

### 5.5 Reward, log và settlement

- Tạo `ArenaRulesService` đọc `ArenaBaseConfig`, không hardcode `100 + level*10`.
- Persist log tối thiểu: fightId, msgUid/requestId, server, attacker/target, snapshot hash, pre/post score, cost, reward, result, timestamp; index theo player/time/fightId.
- Thêm `ArenaSettlementService`/job dùng marker khóa `(serverId, period)`:
  - chốt snapshot rank lúc 23:00 theo timezone đã duyệt;
  - áp `ArenaDayRankRewardConfig` và `ArenaWeeklyRankRewardConfig`;
  - gửi mail idempotent;
  - đánh dấu đã kết toán và reset state đúng chu kỳ.
- Chạy dry-run reward/recipient/count trước payout; repair lịch sử chỉ sau ledger và phê duyệt riêng.

## 6. Pha 3 – Hiệu năng và độ bền

1. `loadSameServerArenaOpponents`: projection đúng field, giới hạn candidate, explain index cho `roles.serverId`/`roles.userId`; không load full Player nếu không cần.
2. Cache summary power/snapshot ngắn hạn; không `calcPlayerPower` lặp cho mọi row trong mỗi request.
3. Tách build list khỏi ACK fight; push target/log detached nhưng phải có receipt/outbox.
4. Instrument tag `2600`, `2601`, `2300 type=2`: route time, Mongo/Redis timing, queue depth, reject/duplicate count, rank drift.
5. Guardrail: circuit/read-only khi p95 vượt SLA, queue tăng đơn điệu, hoặc DB↔Redis drift vượt ngưỡng.

## 7. Pha 4 – Sửa client H5

Artifact hiện hành: `linhhoasu/webgame/game/js/main.min_a6195824.js`; ưu tiên sửa source build nếu có, chỉ patch minified sau khi có fixture contract.

1. **Rank view** (byte khoảng `1613371`): bỏ gán hạng self bằng `s+1`; dùng `rankInfo.rank` authoritative. Tách model `ranklist/toplist` khỏi `challengelist`.
2. **ArenaModel** (byte khoảng `5909806`): merge đủ score/rank/dailyCount/maxCount/refreshtime/challengeVersion; score `0` không fallback `1000`.
3. **Refresh** (byte khoảng `1600921`): disable khi request đang bay/cooldown; sau ACK chỉ nhận state server; lỗi giữ rank/score cũ và đánh dấu list stale.
4. **Cost/ticket:** enable theo balance server (`item10`, item2), nhận delta từ tag 1202/1201; không coi local `checkItemEnough` là authorization.
5. **Fight target:** gửi token/version/enemyId của đúng row; stale-target yêu cầu reload 2600, không tự đổi index.
6. **Error guard** (byte khoảng `6241473`): kiểm `result`, `enemyid`, `fightResult`, `entitys` trước khi truy cập; map lỗi cost/cooldown/stale thành toast và mở khóa UI an toàn.
7. **Log/packet:** merge log theo fightId, không append khi ACK lỗi; relog phải hiển thị log persisted.
8. Cache-bust/index token mới, kiểm hash public/internal và hướng dẫn hard refresh/đóng mở game.

## 8. Pha 5 – Bộ kiểm thử bắt buộc

### Unit/contract

- BXH Top-N, self rank 37 không bị đổi thành rank row 1; tie-break ổn định; player score 0.
- Cost thiếu/vừa đủ; consume item10 đúng một lần; refresh item2 ×100 đúng một lần.
- Daily rollover/cap theo timezone; nhiều socket cùng player; retry cùng requestId.
- Token đúng/sai/hết hạn/khác server/target đổi snapshot; target bảo hộ.
- Score formula các mốc thấp/bằng/cao; thắng/thua; robot vs player thật.
- Save thành công nhưng Redis lỗi, Redis thành công nhưng save lỗi; outbox retry không duplicate.
- Reward config và settlement marker ngày/tuần; mail exactly-once.
- Malformed server response không làm client TypeError.

### Native E2E S1 và S2

Tài khoản QA riêng, số dư được snapshot trước/sau:

`login → mở 2600 → kiểm rank/top/list → refresh → kiểm phí/cooldown → đánh robot → đánh player thật → kiểm snapshot/kết quả/điểm/vé/lượt/log/bảo hộ → đóng WS → relog → đối chiếu Mongo/Redis/UI`.

Lặp lại với thắng, thua, target stale, duplicate click và Redis/Mongo fault injection. HTTP 200 hoặc fixture memory không đủ làm gate.

### Load/settlement

- Bot canary 20–30 phút, sau đó soak nhẹ; không để bot đánh/refresh vượt quota.
- Theo dõi p50/p95/p99, queue depth, CPU/RSS, duplicate reward, cost delta, rank drift.
- Chạy settlement dry-run, sau đó xác minh một mốc 23:00 thật: recipient/count/amount/mail marker và reset state.

## 9. Rollout và rollback

### Rollout

1. Immutable artifact + manifest hash; backup riêng từng file/config và snapshot Redis/Mongo selective.
2. Feature flag `arenaV2` mặc định off; deploy S1 canary allowlist trước, không restart broad.
3. Native smoke S1 → theo dõi 15–30 phút → S2; mỗi server kiểm PID, readiness, hash, log error và rank diff.
4. Mở dần 10% → 50% → 100% sau khi tất cả gate pass; giữ old artifact và kill-switch.

### Điều kiện abort

- Bất kỳ cost/reward duplicate hoặc mất dữ liệu.
- Rank UI khác authoritative snapshot/Redis; target sai; token stale vẫn đánh được.
- p95 vượt SLA hoặc cao hơn 2× baseline, queue tăng dồn, Redis↔Mongo drift tăng.
- Settlement gửi trùng/thiếu mail hoặc reset sai timezone.

### Rollback

1. Tắt feature flag, ngừng request mới, drain fight đang chạy.
2. Phục hồi artifact/config đúng hash; chỉ restore ZSET nếu xác nhận corruption và dùng CAS, không ghi đè write mới hợp lệ.
3. Replay outbox idempotent; không restore Mongo/player hàng loạt.
4. Nếu có lệch điểm/vé/thưởng, đóng settlement và lập reconciliation ledger (player, old/new score, ticket, item delta, timestamp, evidence); bù chỉ sau hai bước duyệt.
5. Native smoke read-only, đối chiếu invariant trước khi mở lại.

## 10. Deliverables và tiêu chí hoàn tất

- Contract/config decision record đã được duyệt.
- Source diff + unit/contract tests + native E2E evidence S1/S2.
- Preflight/rank-diff/settlement dry-run và manifest hash.
- Backup/restore drill và rollback log.
- Báo cáo post-release 24 giờ và xác minh settlement 23:00 kế tiếp.

Chỉ đánh dấu hoàn tất khi tất cả P0/P1 trong audit đã có bằng chứng runtime, không chỉ `node --check`, fixture hoặc HTTP 200.

