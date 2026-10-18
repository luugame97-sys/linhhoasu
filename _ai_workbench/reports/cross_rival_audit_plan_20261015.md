# Tiên Vực Tranh Phong — audit và kế hoạch sửa S1–S8

> Cập nhật sau audit: người dùng đã cho phép sửa. Safety release đã lên S1–S8; gameplay mới chưa mở. Xem `cross_rival_fix_progress_20261015.md` để biết trạng thái hiện hành. Nội dung bên dưới giữ bằng chứng trước sửa.

Ngày: 15/10/2026, giờ Việt Nam (GMT+7). Phạm vi: CrossRival trong ảnh người dùng; client đang phục vụ, source/config VPS, tám node game, dữ liệu sự kiện và thư. **Chưa sửa/deploy/restart production; không gửi gameplay RPC hay ghi dữ liệu người chơi.**

## 1. Kết luận

Đây không chỉ là lỗi hiển thị hoặc thiếu mở server. Backend hiện còn nhiều nhánh mô phỏng: phe mặc định, bản đồ riêng từng người, BXH giả, trận luôn thắng và thao tác cộng điểm thiếu kiểm tra. Cần hoàn thiện nghiệp vụ CrossRival trước khi coi event chơi được và công bằng trên toàn bộ server.

“Toàn bộ server tham gia” được hiểu là người chơi đủ điều kiện trên S1–S8 đều có đường tham gia hợp lệ; **không tự bỏ cấp 100, miễn vé hay đổi kinh tế**. Client có thiết kế bốn phe và `roomScale=4`; chưa có bằng chứng cho phép biến thành tám phe trong một màn hình.

Audit đã đủ bằng chứng để lập kế hoạch sửa, **chưa phải nghiệm thu gameplay đầy đủ**: chưa có native E2E đa người chơi được ủy quyền, chưa kiểm toàn bộ asset/hitbox/responsive và chưa chạy tải lên production.

## 2. Bằng chứng hiện hành

- Lúc 12:49 ICT: S1–S8 online, cùng `/linhhoasu/lhs/newServer`; `CROSS_EVENT_ENABLED=1`; `/ready` cả tám node HTTP 200, Mongo/Redis true. Process khởi động sau mtime các file CrossRival đã kiểm.
- Kỳ hiện tại `C4_1791738000000`: 00:00 ngày 12/10 đến 00:00 ngày 19/10/2026, lặp bảy ngày. CrossArena là track riêng, không được thay đổi trong bản sửa này.
- Mặc dù mảng `serverIds` chỉ ghi 1001–1005, `serverPool.autoInclude` bao phủ 1001–1099; **S6–S8 không bị loại khỏi pool**. Các node dùng chung identity DB `lhs_s1001`, player DB riêng.
- Gate hiệu lực: ngày server >=1, cấp >=100. Binary gốc ghi ngày 22, nhưng server overlay và addon client hiện hành cùng đưa về ngày 1; đã kiểm fixture addon. Không kết luận client đang khóa ngày 22 chỉ từ binary.
- Cả 12 bảng `CrossRival*` giống nhau giữa bốn binary server/web. HTTPS index, main bundle và addon CrossRival có hash khớp VPS.
- State hiện kỳ đọc được trên tám DB đều phe 1, điểm 0. Các state này có thể được tạo khi login và bao gồm hồ sơ bot; **không coi số state là số người thực sự chơi**.

| Server | Gate cấp 100 | Ready Mongo/Redis | Entry trong BXH chung kỳ C4 |
|---|---|---|---:|
| S1 | Mở | OK | 3 |
| S2 | Mở | OK | 0 |
| S3 | Mở | OK | 1 |
| S4 | Mở | OK | 1 |
| S5 | Mở | OK | 0 |
| S6 | Mở | OK | 1 |
| S7 | Mở | OK | 2 |
| S8 | Mở | OK | 3 |

11 entry trên đều điểm 0/phe 1. S2/S5 chưa có entry không chứng minh bị chặn; gate của hai server đã kiểm độc lập.

Kỳ C3: settlement ghi `done`, 14 người nhận. Read-back đúng kiểu ObjectId: 7 thư còn tồn tại khớp người nhận/server/attachments, 8 dấu claim, giao nhau 1; hợp của hai nguồn phủ **14/14**. Cả 14 score=0. Có bằng chứng đường phát thư cá nhân hoạt động; không có bằng chứng mất quà trong mẫu này, cũng không đủ cơ sở quy kết gian lận. Điều kiện hiện tại cho score>=0 và tie-break theo playerId, cần chốt tiêu chuẩn tham gia hợp lệ trước release mới.

## 3. Lỗi và việc còn thiếu

Các số dòng bên dưới thuộc snapshot **VPS**, không dùng source local làm baseline. Snapshot ở `_ai_workbench/temp/cross_rival_20261015/baseline/`.

### P0 — tính đúng đắn, điểm và giao dịch

| ID | Phát hiện/bằng chứng | Tác động và hướng sửa |
|---|---|---|
| CR01 | `handlers/cross-rival.js:1275`: `6580` cộng điểm ngay, không kiểm core tồn tại, còn HP, quyền vào map, khoảng cách, tiến độ đánh hoặc receipt. RAM: core=999 ngoài map, 25 request cùng thời điểm → 3.000 điểm; core HP=0 vẫn +120. | Có đường tạo điểm không hợp lệ. Server phải xác thực đối tượng và trạng thái, chỉ hoàn thành hành động sau deadline, khóa/CAS tài nguyên chung và chống phát lại. |
| CR02 | `cross-rival.js:720,738`: tự tạo collect từ ID đầu vào; `6557` không cần mở/hết thời gian, lặp ba lần →150 điểm, không cập nhật BXH chung. | Rương/tài nguyên thiếu lifecycle, độc quyền thu thập và đồng bộ điểm. Không dùng ID client làm bằng chứng tồn tại. |
| CR03 | `cross-rival.js:549,562`: `reEnter=1` bỏ qua vé dù chưa vào map; camp=999/line=999/tọa độ rất lớn được chấp nhận. `6550` xem bản đồ lại sửa membership và save. Fly không kiểm cooldown cũ. | Bypass vé/di chuyển/quyền map. Re-entry phải suy ra từ membership còn hạn phía server; endpoint đọc không được đổi state tham gia. |
| CR04 | `cross-rival.js:161,1047,1085`: combat dựng đối thủ theo chỉ số người gọi, `win=1`, target bất kỳ vẫn thành công; hoàn tất ngoài map vẫn được +120 ở loại 63. | Chưa có chiến đấu có thẩm quyền. Phải dùng target thật và battle engine, lưu kết quả trước khi trả animation, kiểm phe/map/deadline/death/protection. |
| CR05 | `cross-rival.js:339,373,497,582`: camp/core/flag/box nằm trong player, camp mặc định 1; BXH chung chỉ được dùng một phần. | Chưa có chiến trường dùng chung. Cần group/cycle/room/camp/entity authoritative; không thể sửa chỉ bằng mở flag S1–S8. |
| CR06 | Upsert điểm `.catch(()=>undefined)` rồi tiếp tục báo thành công; save player không kiểm kết quả null; không có CrossRival receipt/CAS gắn kinh tế với điểm. | Có thể lệch điểm player/BXH sau lỗi DB, stale save hoặc reconnect. RAM đã tái hiện success khi upsert ném lỗi và khi save trả null. Cần durable receipt/outbox/reconciliation; không được báo commit thành công khi chưa xác nhận. |

Giới hạn bằng chứng CR06: WSServer có queue theo socket và cache response; shop có khóa chung. Không được mô tả hệ thống là hoàn toàn không có khóa, hoặc coi gọi Promise.all trực tiếp handler là chứng minh double-claim live. Rủi ro cần kiểm là reconnect, request mới, stale snapshot và nhiều worker.

### P1 — gameplay, client và phần thưởng

| ID | Phát hiện/bằng chứng | Cần hoàn thiện |
|---|---|---|
| CR07 | `ensureCrossRivalInfo` giữ stage=2. Fixture 09:00,12:00,19:58,20:10,21:00 đều stage2; client có Du kích 10:00–19:55, Kịch chiến 20:00–20:30. | Một lịch authoritative gồm phase, phaseEnd, combat cutoff, exchange cutoff, settlement cutoff; gửi phase thay đổi cho client. Hàm client tên GMT8 nhưng thực tế đã dùng GMT+7, không sửa nhầm timezone. |
| CR08 | Client BXH/shop tính mốc `endTime - 1 ngày + secondtStageEnd`; backend nhận điểm đến hết cycle lúc 00:00. | Cuối kỳ có khoảng lệch 3 giờ 30 giữa mốc native 20:30 và cycle 00:00. Phải tách thời điểm ngừng chiến đấu với thời gian xem/đổi quà; không để nhận điểm muộn lọt snapshot. |
| CR09 | Trang chính báo 6 core/phe nhưng server khởi tạo 3; collects/wanders ban đầu rỗng; tọa độ friend/enemy cố định, fallback `cr_1001/cr_2001`. | Sinh đúng entity theo Position/Scene config, spawn/respawn, HP, defender, số line và occupancy thật. Không dùng nhân vật giả để che map trống. |
| CR10 | Không có room membership/broadcast CrossRival thực: movement trả về người gửi; chat lưu trong player và push chính người đó; player-count chủ yếu đếm bản thân. | Nối presence/broadcast liên node, giới hạn room/line, reconnect/disconnect, delta sequence và full resync. Presence Redis không thay DB authoritative cho phần thưởng. |
| CR11 | `cross-rival.js:856`: BXH cá nhân chèn 19 `cr_rank_*`; rank thủ lấy `score-900`, bỏ qua defKill. Info/detail/chat nhiều nơi hard-code serverId=1 hoặc clone người hỏi. Client tie-score xếp phe4 trước, server phe1 trước. | Ba BXH dùng cùng snapshot thật; profile/đội hình đúng target, serverId thật, tie-break thống nhất. Snapshot phát thưởng phải tương ứng BXH đã hiển thị. |
| CR12 | Server không cập nhật taskProgress[1] (điểm tối đa một lượt) và [4] (điểm phe); 14/20 mốc config dùng hai loại này. Camp=5.000.000 vẫn claim được 0 mốc. Thắng thủ không tăng defKill. | Tính task từ sự kiện server, persist và push đúng mốc; phòng thủ/điểm lượt/điểm phe/claim phải nhất quán sau relog. Claim tuần tự cùng session hiện đã chống lặp bằng taskRecord, cần giữ và bổ sung receipt/CAS. |
| CR13 | `6582` chỉ đặt attacking/endTime; không có tick hoàn tất tương ứng trong handler/services đã quét. Đồ buff chủ yếu lưu timestamp, chưa gắn đầy đủ với engine chiến đấu/HP/ẩn thân/tội nghiệt. | Hoàn thiện cột/cờ, thu thập, hủy, chết/hồi sinh, buff và hiệu ứng thực tế; test hết thời gian/offline/restart. Không chỉ làm animation. |
| CR14 | `CrossEventSettlementService.js:9` chỉ chọn bảng quà điểm cá nhân cho CrossRival; chưa có nhánh camp/defence. Cả bảng điểm và thủ có khoảng 51–500 và 500–9999 chồng hạng500. | Bổ sung quà theo đúng loại, group, eligibility; sửa khoảng chồng. Fixture `rewardsFor(...,500)` ném `CROSS_REWARD_OVERLAP`: nếu đủ 500 người, có thể chặn tạo snapshot cả kỳ. Giữ idempotency thư đang có. |
| CR15 | Addon `lhs-cross-events-v2.js` luôn thêm callback vào Rpc, kể cả native `6560` fire-and-forget; server trả `6500/msgUid=0`, không ACK UID của request. | Nguyên nhân contract của timeout 6560. Giữ phân biệt request ACK và push, không bọc callback khi native không yêu cầu; kiểm đầy đủ enter/leave. Không sửa timeout bằng tăng thời gian chờ. |
| CR16 | Native `sendMapEnter` chỉ kiểm truthy response; fixture lỗi `REQUEST_BACKPRESSURE` vẫn chạy enter-map. `sendTaskReward` mở reward dù response lỗi/thiếu rewardInfo. | Kiểm result/schema trước đổi view/state; lỗi chỉ báo thông điệp, không mở map/quà rỗng; chống bấm lặp, hủy callback cũ, timeout có thể retry an toàn. Fixture chưa chứng minh native renderer crash, không gán TypeError nếu chưa thấy. |
| CR17 | Shop tab21/22 có 20 món. Vé310 là món22000001, giá100 item1, giới hạn4/ngày; limitType6 của quà/buff không được reset bởi resetDay hoặc đổi CrossRival cycle. Fixture qua kỳ mới vẫn hết lượt món21000001, trong khi vé ngày reset đúng. | Xác nhận ý nghĩa limitType6 theo native; bổ sung namespace/quota theo kỳ nếu đúng là hạn kỳ. Gate shop CrossRival theo quyền mở/kỳ, giữ kiểm count/cost/limit và khóa chung hiện có; không ảnh hưởng shop khác. |
| CR18 | Login `account.js:902` gửi coreScore; rob-box tăng score nhưng không tăng coreScore. Các RPC đọc lobby/BXH/camp/move vẫn save toàn player. | Chuẩn hóa field score/login/push/relog; tách query khỏi mutation. Log bounded có slow 6560/6567 khoảng0,58–0,66s và queue backlog, nhưng chưa phải profile p95/p99 toàn event. |

Chưa có bằng chứng người chơi đã khai thác các đường cộng điểm sai: snapshot live kỳ C4 đang 0 điểm. Các ví dụ khai thác ở trên chỉ chạy trong RAM.

## 4. Kế hoạch triển khai theo cổng nghiệm thu

### Bước 0 — kiểm soát rủi ro, chưa triển khai trong audit này

- Dùng snapshot VPS và hash hiện tại làm baseline; lập manifest thay đổi riêng CrossRival. Không upload nguyên source local vì có drift, kể cả lịch TopArena.
- Khuyến nghị chặn tạm **riêng thao tác CrossRival có thể tạo điểm/tiêu hao** bằng mã bảo trì có UI rõ ràng trong thời gian sửa. Giữ xem thông tin an toàn và đường thoát/cancel; không trả BXH giả như dữ liệu thật.
- Guard này là thay đổi production cần duyệt trước. Không tắt `CROSS_EVENT_ENABLED` chung vì tác động CrossArena/settlement; không tự thu hồi/bù quà lịch sử.

Điều kiện qua bước: danh sách RPC bị guard rõ, thoát map vẫn hoạt động, không có trừ vé/quà khi từ chối, các event khác giữ nguyên.

### Bước 1 — chốt luật nhóm, lịch và contract

- Giữ chu kỳ bảy ngày, GMT+7, cấp100/ngày1, vé/cost/reward hiện có trừ lỗi config đã được duyệt sửa.
- Đề xuất ít thay đổi nhất: **hai cụm, mỗi cụm bốn server**, mỗi server một phe, cùng một rule set. Phân cụm phải xét tuổi server, người hoạt động và phân bố lực chiến; chưa mặc định S1–S4/S5–S8 là công bằng.
- Nếu muốn S1–S8 gặp trực tiếp trong một chiến trường, cần chọn phương án bốn liên minh chứa nhiều server và chốt phân phe/điểm/quà; đây là thay đổi luật lớn hơn, không tự áp dụng.
- `groupId + cycleKey` cố định trong kỳ; định danh serverId/playerId thật, campId và visual index tách riêng. Không thêm phe5–8 vào UI bốn cổng.
- Chốt `combatEndAt`, `exchangeEndAt`, `settleAt`; giờ nghỉ phải từ chối combat. Mốc chưa đến/còn nghỉ/hết kỳ phải hiển thị đúng lý do.
- Định nghĩa player hợp lệ nhận quà, xử lý score0/tie, điểm thủ, điểm lượt, điểm phe; ai được quà phe và giới hạn200 trong base config có ý nghĩa gì. Không suy ra luật chính thức chỉ từ tên field.
- Viết contract matrix tag6550–6583, push6500–6502 và shop1202/1210: schema, ACK/push, lỗi, quyền, idempotency, side effect.

Điều kiện qua bước: có rule manifest duy nhất, packet fixture đúng native, ranh giới lịch không mâu thuẫn và quyết định ghép cụm được duyệt.

### Bước 2 — backend chiến trường và an toàn dữ liệu

- Tận dụng Mongo identity, Redis/bus và battle/reward service sẵn có; không thêm dependency hoặc thay kiến trúc toàn game.
- Tạo state chung theo group/cycle/map/line: camp roster, core/flag, collects, defender, membership. Player chỉ giữ progress cá nhân, lịch sử/receipt cần thiết.
- Xác thực đầy đủ membership, tọa độ, đối tượng, phe, HP, protection, phase, thời gian thu thập, cooldown và vé. Re-enter/revive do state server quyết định.
- Kết quả chiến đấu dùng target snapshot thật, không nhận thắng/điểm từ client. Cập nhật hai phía, camp và nhiệm vụ theo cùng battle/action ID.
- Mutation cần role/entity locking, revision/CAS, requestId/receipt bền vững và outbox điểm/broadcast. Kết quả lặp không thêm thưởng; lỗi giữa debit/commit phải truy hồi được. Không nuốt lỗi DB.
- Deadline/respawn/cancel/restart do server xử lý; dùng session/presence TTL cho kết nối, không dùng làm căn cứ phát thưởng.

Điều kiện qua bước: tất cả test lỗi CR01–CR06 chuyển thành từ chối an toàn; hai node nhìn cùng HP/điểm/presence; không trừ tiền hoặc cấp quà hai lần khi retry/restart.

### Bước 3 — client, nhiệm vụ và shop

- Addon hẹp để sửa ACK/push, result/schema, phase và resync; giữ giao diện native, không dựng lại UI hay đổi màu ngoài phạm vi.
- Hiển thị người/phe/rank/count/HP thật; bỏ fallback giả. Thông báo rõ cấp chưa đủ, thiếu vé, giờ nghỉ, nhóm chưa mở và bảo trì.
- Nối đủ task1/2/3/4, defKill và receipt claim; đồng bộ score và quota sau relog. Shop hạn kỳ chỉ reset trong đúng kỳ, vé4/ngày vẫn giữ nguyên nếu không có duyệt khác.
- Kiểm nguồn vé, số dư310/311, giá/giới hạn, từng buff và hồi sinh; không tự thêm vé miễn phí.
- Cache-bust đúng addon/binary liên quan; kiểm cả client mới, cache cũ, máy mobile và reconnect. Overlay ngày1 phải được áp dụng trước các gate UI tương ứng.

Điều kiện qua bước: không timeout giả6560, không mở view/quà khi request thất bại; UI/DB cùng số liệu sau refresh và relog.

### Bước 4 — BXH và settlement

- BXH cá nhân/phe/thủ lấy cùng dữ liệu authoritative và tie-break. Freeze snapshot đúng cutoff theo group, không còn ghi điểm kỳ cũ sau cutoff.
- Sửa rank500 thành hai khoảng không giao nhau; kiểm toàn bộ miền hạng, không chỉ top1.
- Tách khóa thưởng theo `event/group/cycle/rewardType/recipient`, mailId/eventKey bất biến; catch-up và replay không sinh thêm thư. Không làm trùng quà cá nhân đã phát bằng scheduler cũ.
- Kiểm receipt cũ và dữ liệu kỳ đang chạy trước migration. Ưu tiên bật schema/luật mới ở kỳ mới; nếu chuyển giữa kỳ phải có phương án giữ điểm hợp lệ và xác nhận riêng. Không reset hàng loạt player.

Điều kiện qua bước: số người đủ điều kiện = số thư/claim/ngoại lệ có lý do; kiểm read-back đúng DB và kiểu `_id`; tám worker chạy đồng thời vẫn không phát trùng.

### Bước 5 — QA, canary và rollout

| Nhóm | Bài kiểm bắt buộc |
|---|---|
| S1–S8 | Mỗi node có phiên QA đủ quyền: mở lobby → vào map → thấy người server khác trong cùng cụm → hành động → ra/vào → relog. Server ngoài cụm không lọt state. |
| Gate | Cấp99/100; server chưa mở/ngày1; đúng pool/ngoài pool; vé0/1; re-entry hợp lệ/giả; bot policy không bị thay đổi. |
| Lịch | 09:59:59/10:00,19:54:59/19:55,19:59:59/20:00,20:29:59/20:30, cuối ngày và cuối kỳ; restart đúng ranh giới. |
| Gameplay | PvP thắng/thua/thủ, core đủ6, cờ, rương, cướp, buff từng loại, chết/hồi sinh, hết lượt ở map, cancel/disconnect, respawn. |
| Cạnh tranh | Hai người trên hai node cùng một rương/core; request trùng/đổi UID/out-of-order; reconnect khi đang commit; node chết giữa debit/award. |
| Nhiệm vụ/shop | Đủ20 mốc, claim lại; thiếu tiền, mua1/multi, hết quota, qua ngày/qua kỳ, item310/311 đúng; không ảnh hưởng shop ngoài tab21/22. |
| BXH/quà | 0,1,499,500,501 và giới hạn thiết kế; tie; cá nhân/phe/thủ; người offline; replay settlement, mail có/đã claim/expire; authoritative read-back. |
| Client | Desktop/mobile, back/close/chuyển map nhanh, cache cũ/mới, reconnect, response thiếu field/lỗi, asset/hitbox, không console error mới. |
| Hiệu năng | Đo query count/DB writes và p50/p95/p99 ở tải đại diện; không full-save cho xem BXH/move; không benchmark gây áp lực lên production. |

- Thứ tự môi trường: RAM contract → Mongo/Redis QA tách biệt → native QA **ít nhất hai node** → smoke đủ tám node. Cần tài khoản QA được ủy quyền, không tự tạo/sử dụng người chơi thật hay gửi quà thử vào production.
- Cài backend tương thích trên các node khi feature gate còn đóng. Client public dùng chung nên không bật sớm khi một phần fleet còn protocol cũ. Canary liên server cần group/allowlist kín, không chỉ thử một S1 rồi suy rộng.
- Trước ghi: fresh hash/CAS, backup chọn lọc đúng preimage và dữ liệu nhóm bị tác động, lưu rollback manifest. Restart tuần tự đúng process, không đụng bot/đấu giá/CrossArena.
- Sau ghi: hash runtime + HTTPS served hash, PM2 PID/restart invariant, `/ready` Mongo/Redis8/8, native QA, điểm/tiền/quà read-back và log theo thời gian release.
- Rollback khi dữ liệu lệch, reward duplicate, contract lỗi, readiness hỏng hoặc latency vượt baseline đã duyệt. Đóng gate CrossRival trước; không rollback mù schema/receipt đã phát sinh hoặc xóa mail/điểm mới.
- Chỉ mở tất cả nhóm khi không còn P0/P1 bắt buộc, QA đa server và settlement-after-cutoff đạt. Không dùng HTTP200 hay unit PASS làm bằng chứng hoàn thành event.

## 5. Kiểm thử đã thực hiện và giới hạn

- `test_cross_rival_audit_20261015.js`: **22 ca tái hiện lỗi/thiếu sót +4 control** trên exact snapshot VPS, config live, fake clock, dependency bị chặn/giả trong RAM. 76 save-call và56 score-call đều vào stub, không tới DB.
- `test_cross_rival_client_audit_20261015.js`: **6 quan sát lỗi client/config +1 control overlay ngày mở**; trích hàm từ bundle đang phục vụ và chạy addon trong VM. Hai quan sát rank500 cùng một nguyên nhân config, không phải hai lỗi độc lập.
- Syntax cho probe JS PASS. Không test production mutation, không load test, không thay config/scheduler, không trigger cutoff hoặc phát thư giả.
- Probe bổ sung ban đầu vượt timeout; đã giới hạn runtime50s, đọc chọn bảng config thay vì decode toàn bộ, tách kiểm config/public/mail. Các probe sau có evidence thành công; không còn tiến trình audit cũ trong mẫu ps đã kiểm. Không dùng lần timeout làm bằng chứng service hỏng.
- Read-back thư ban đầu dùng string `_id` chưa đúng native Mongo type; đã sửa đọc cả ObjectId và kiểm lại. Kết luận cuối là14/14 resolved, **không** giữ kết luận “mất6 thư”.

## 6. Artifact và bàn giao

- Báo cáo này: `_ai_workbench/reports/cross_rival_audit_plan_20261015.md`.
- Evidence: `_ai_workbench/temp/cross_rival_20261015/{live-audit,config-supplement,public-supplement,mail-supplement,ram-characterization,client-characterization}.json`.
- Source VPS chọn lọc: `_ai_workbench/temp/cross_rival_20261015/baseline/`; main bundle SHA256 `1ceeddf2711cf0ec19ed13a39c5c20517bd03cfad255baa7f773d0b4380548c2`; handler SHA256 `11beb33adbc936b772c4448b412c50f31869a69912930df2c39a718497b88512`.
- Công cụ audit/fixture: `_ai_workbench/tools/audit_cross_rival_20261015.py`, `probe_cross_rival_20261015.js`, `probe_cross_rival_supplement_20261015.js`, `test_cross_rival_audit_20261015.js`, `test_cross_rival_client_audit_20261015.js`. Chúng không phải candidate fix.
- Bước tiếp theo cần duyệt: bắt đầu guard/fix CrossRival; mô hình ghép nhóm bốn phe; luật eligibility/quà/cutoff còn thiếu; QA identities và phạm vi kiểm thử. Chưa có code sửa gameplay để deploy.
