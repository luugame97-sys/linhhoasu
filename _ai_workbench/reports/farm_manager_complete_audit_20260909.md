# Audit hoàn chỉnh Dược Điền và Quản gia điền — 09/09/2026

## Phạm vi và trạng thái kiểm tra

Audit này dùng ảnh người dùng, bundle local/CN, server hiện hành và fixture memory. Không sửa source, không deploy, không DB người chơi.

- Client local: `linhhoasu/lhs/js/main.min_a6195824.js`.
- Client CN: `_ai_workbench/temp/fashion_cn_recovery_20260909/raw/js/main.min_dc9b2913.js`.
- Client patch: `linhhoasu/webgame/game/js/lhs-farm-alchemy-v2.js`.
- Server route thực tế: `linhhoasu/lhs/newServer/src/handlers/index.js` → `handlers/farm.js`; `farm1.js` không được route import.
- Bằng chứng fixture: `_ai_workbench/temp/farm_manager_audit_20260909/manager-audit.json`.
- Bộ regression hiện có: `test-farm-alchemy-fix.js` PASS 48/48; `test-farm-foundation.js` PASS 18/18. Hai bộ này chưa bao phủ đầy đủ entitlement và read-only persistence của Quản gia.

Ảnh cho thấy UI đang bật “Đang tự động…”, có hai nồi đang nấu và các ô cây/huyền bí. Ảnh chỉ chứng minh cờ UI; chưa chứng minh server đã nhận thành công từng RPC, đã lưu DB hay đã phát thưởng đúng.

## Lỗi còn tồn tại

### P0 — Nấu ô thứ hai không kiểm tra thẻ ở server

Client chỉ cho ô thứ hai khi có thẻ Quản gia `11000012`, nhưng `handleCook()` nhận `index=1` qua RPC thường `2416` mà không kiểm entitlement. Fixture không có thẻ vẫn nhận:

```text
result=0, index=1, cookReward=20, cookTime=30
```

Người gửi packet trực tiếp hoặc client cũ có thể mở nồi thứ hai miễn phí. Alias dành cho Quản gia `2428` có kiểm thẻ, nhưng không thay thế việc khóa RPC gốc `2416`.

### P0 — Poll đọc ruộng làm thay đổi state nhưng không lưu

`handlePlantDetailAuto()` là đường đọc. Nó gọi `ensureFarmInfo()`, hàm này tự tạo/cây lại các ô huyền bí đã mở. Fixture xóa ba ô huyền bí rồi poll chính mình:

```text
liveBlocks=3, persisted=false, writesDelta=0
```

Nghĩa là UI có thể thấy cây mới trong phiên hiện tại, nhưng reconnect/restart có thể mất state hoặc roll lại. Đây cũng là rủi ro nếu một đường read-only khác gọi `buildFarmInfoData()`.

### P0 — Trợ giúp nâng nhà và trợ giúp đánh trộm chưa có implementation

Hai handler hiện trả cố định:

- `2414`: `FARM_ASSIST_UNAVAILABLE`.
- `2415`: `FARM_ASSIST_UNAVAILABLE`.

Config cũng đang đặt `assistance.enabled=false`. UI/client vẫn có hàm gửi hai RPC, nên người chơi có thể thấy nút nhưng thao tác luôn thất bại.

### P1 — Quyền lợi Quản gia tăng cơ hội bánh bao chưa áp dụng

Client/config hiển thị `PrivilegeConfig[11000012].groups[17]=1000`, tương đương 10% và mô tả “nấu bánh bao có cơ hội nhận gấp đôi”. Server gọi `calcCookBaoziRewardCount()` không nhận player, không đọc quyền lợi và chỉ trả các mức 5/10/15/20/25. Vì vậy phần thưởng nấu không có nhánh double theo thẻ.

### P1 — Tự động offline chưa hoàn chỉnh

Client có luồng `2424` nhận cache offline, nhưng server policy đặt:

```json
"offline": {"enabled": false}
```

Không có scheduler/checkpoint server cho việc offline tự gieo, thu hoạch, nấu hoặc giới hạn theo thời gian thẻ. `cacheOffline` chỉ là nơi nhận thưởng đã được tạo bởi luồng khác; không phải bằng chứng auto offline đang hoạt động.

### P1 — Lợi ích hạt hằng ngày của Quản gia chưa được chứng minh/áp dụng riêng

UI/config có mô tả tăng lượng hạt kỳ dị hằng ngày cho Quản gia. `FarmRecoveryService` hiện chỉ đưa item `29` lên cap lấy từ `PlantBuildConfig`, không có bước áp modifier riêng của thẻ. Cần chốt item nào là “hạt kỳ dị” và hệ số official trước khi sửa; không tự cộng bù lịch sử.

### P1 — Đường legacy gieo tháng vẫn có thể tạo cảm giác thành công giả

Client còn gọi tag `2420`, nhưng server trả `USE_NORMAL_PLANT`. Callback client hiện chỉ dispatch cập nhật ô, không kiểm `result`. UI legacy có thể refresh như vừa gieo dù server không trừ hạt/không tạo cây. Cần ẩn đường cũ hoặc hiển thị lỗi rõ ở client.

### P2 — Hai implementation farm dễ lệch

`farm.js` là runtime; `farm1.js` chứa gần như toàn bộ handler thứ hai nhưng không được import. Sửa nhầm file sẽ không tác động game và dễ làm các test/đối chiếu sai phiên bản.

### P2 — Chưa có E2E tài khoản thật cho Quản gia

Local port `8080/8083` hiện không lắng nghe trong lượt audit; browser đang ở màn cổng/login, không có phiên QA đã đăng nhập. Vì vậy chưa kết luận được các lỗi hiển thị cụ thể của tài khoản trong ảnh, lịch sử reward hoặc relog thực tế.

## Những phần đã có bằng chứng đang hoạt động

- Mapping hạt thường `29/30/31 → PlantConfig 38/39/40`.
- Phân biệt cây thường và ô huyền bí.
- Thu hoạch một ô/thu hoạch tất cả, chống nhận lặp.
- Khóa thao tác trộm, outbox settlement và replay receipt trong fixture.
- Auto online phía client có vòng kiểm tra nấu, thu hoạch/trộm và dùng cheese; alias thẻ `2426/2427/2428` có guard thẻ ở server.
- Các mục trên vẫn cần native E2E để khẳng định UI, packet và persistence trên tài khoản thật.

## Đối chiếu build Trung

Không thấy tính năng Dược Điền mới riêng trong snapshot CN để port ngay:

- `PlantBaseConfig`: local 20, CN 20, không thêm/đổi/xóa.
- `PlantConfig`: 7/7, không diff.
- `PlantBuildConfig`: 3/3, không diff.
- `PlantLevelConfig`: 40/40, không diff.
- `PlantMagicConfig`: 12/12, không diff.
- `PlantTiredConfig`: 11/11, không diff.
- `PlantThiefConfig`: 4/4, không diff.
- `AlchemyBaseConfig`: 5/5; `AlchemyFormulaConfig`: 148/148; `AlchemyRoleConfig`: 60/60, không diff.
- Các RPC farm `2400–2428` có số reference tương ứng giữa hai bundle.
- `PrivilegeConfig[11000012]` giống nhau ở hai build: group 17 = 1000, group 18 = 3.

Kết luận: phần thiếu hiện nay là **server entitlement, persistence và implementation chưa hoàn chỉnh**, không phải chỉ thiếu bảng CN. Không nên chép config CN để chữa Quản gia.

## Kế hoạch fix hoàn chỉnh

### Giai đoạn 1 — khóa lỗi và bảo vệ kinh tế

1. Kiểm thẻ ở server cho `2416` khi `index=1`; alias và RPC gốc phải cùng một luật.
2. Tách `ensureFarmInfo()` thành normalize thuần và mutation có cờ `changed`; mọi auto-roll ô huyền bí phải được save cùng transaction hoặc không chạy trong read-only poll.
3. Sửa reward nấu theo `player` và quyền lợi group 17; lưu `policyVersion/rollId`, giữ replay idempotent và kiểm phân phối 100.000 lượt.
4. Chặn/ẩn `2420` ở client; nếu còn packet thì trả lỗi và không dispatch success UI.
5. Giữ `2414/2415` fail-closed cho tới khi có contract trợ giúp; không đổi thành ACK 0 giả.

### Giai đoạn 2 — hoàn thiện Quản gia online

1. Xác minh state machine: bật/tắt, hết hạn thẻ, reconnect, server restart, mất ACK và request trùng.
2. Kiểm từng luồng: gieo lại/thu hoạch, nấu hai slot, nhận bánh, cheese, auto-steal filter, refresh neighbor, cache reward.
3. Khóa sender/owner/target cho auto-steal và trợ giúp; không để client tự quyết reward hoặc thời gian.
4. Đồng bộ UI sau mỗi ACK/error: item, slot, block, log, filter, trạng thái “Đang tự động”.
5. Nếu mở lợi ích hạt hằng ngày, đưa modifier vào config versioned và chỉ áp dụng từ chu kỳ mới.

### Giai đoạn 3 — trợ giúp xã hội và offline

1. Contract exact cho build assist/fight assist: helper, owner, limit, cooldown, giảm thời gian, kết quả chiến đấu.
2. Dùng lock nhiều role và outbox/CAS; không ghi thưởng hai lần khi owner/helper mất ACK.
3. Chỉ bật offline khi có checkpoint timeline, cap giờ, thẻ hết hạn, thiếu hạt, chuyển offline↔online và relog/restart.
4. Không auto trộm, mua hoặc tiêu tài nguyên premium trong offline nếu chưa có luật riêng.

### Giai đoạn 4 — nghiệm thu

- Fixture server-authoritative và fault injection.
- Native browser QA với tài khoản thử riêng: mua thẻ → bật Quản gia → gieo → chín → tự thu → nấu slot 1/2 → nhận bánh → tự trộm theo filter → tắt/hết hạn → relog/restart.
- Đối chiếu item delta, reward ledger, farmInfo, log, receipt và DB readback.
- Staging S2 rồi S1, hash/CAS/backup/rollback; chỉ mở từng nhóm feature flag.

Chưa port tính năng mới từ CN trong đợt này vì audit không thấy farm-specific delta. Cần sửa các lỗi P0/P1 trên trước rồi mới cân nhắc mở trợ giúp hoặc offline.

## Trạng thái triển khai fix — 09/09/2026

Đã triển khai candidate `farm_manager_fix_20260909` sau khi stage trên baseline live hiện tại.

Đã sửa và đã lên S2 → S1:

- Server kiểm thẻ Quản gia cho nồi thứ hai ngay cả khi gọi RPC thường `2416`; không còn bypass bằng packet cũ.
- Poll `2408` dùng snapshot cho cả ruộng của chính mình; không materialize ô huyền bí hoặc reset state vào object authoritative khi chỉ đọc.
- Reward bánh bao đọc quyền lợi `PrivilegeConfig` group 17 ở server và áp double chance server-side.

Bằng chứng canary sau restart cả hai server: `test-farm-alchemy-fix.js` 51/51, `test-farm-foundation.js` 18/18, `productionWrites=0`, `networkAttempts=0`, ready `8080/8083=200`. Hash live candidate: `5810ba0b29b681ae7c27255ca19c84fdb00d3eee6997c2ca1d8987bde9ea211d`. Backup/manifest: `/linhhoasu/_ai_workbench/backups/farm_manager_fix_20260909_065530` và `_ai_workbench/temp/farm_manager_fix_20260909/release.json`.

Chưa bật: trợ giúp xã hội `2414/2415`, auto offline, modifier hạt hằng ngày. Các phần này tiếp tục trả lỗi an toàn hoặc giữ tắt cho tới khi có contract và QA riêng.

## Port cân bằng bón ruộng người khác — 09/09/2026

Đã bật `neighborFeed` với luật giới hạn:

- Chỉ dùng item phân `32`.
- Giảm `300 giây` mỗi đơn vị.
- Tối đa `5 đơn vị/người gửi/ngày`.
- Tối đa `5 đơn vị/ô/mỗi chu kỳ cây`.
- Khóa sender + owner, kiểm tra ô mở/cây đang lớn/không bị trộm.
- Trừ phân ở người gửi, lưu finishTime ở chủ ruộng, push block update cho chủ ruộng và không cấp reward mới.

Canary S2/S1 đạt: farm tests 52/52, foundation 18/18, productionWrites/networkAttempts=0, ready 8080/8083=200. Backup/manifest: `/linhhoasu/_ai_workbench/backups/farm_neighbor_feed_20260909_070657` và `_ai_workbench/temp/farm_neighbor_feed_20260909/release.json`.

Sau port này còn khóa: trợ giúp xã hội 2414/2415, auto offline và modifier hạt riêng của Quản gia. Ba phần này cần contract/request creation hoặc checkpoint kinh tế riêng, chưa bật bằng phỏng đoán.

## Trạng thái hiện tại

Đã hoàn tất phần server-authoritative cho trợ giúp nâng nhà/đánh trộm, gồm tương thích client cũ không gửi UID và chống replay/xóa nhầm lượt chuột. Đã deploy S2→S1, ready200. QA giao thức production và regression local đạt; native UI bang còn cần thao tác người chơi thật để xác nhận hiển thị yêu cầu và nút giúp.
