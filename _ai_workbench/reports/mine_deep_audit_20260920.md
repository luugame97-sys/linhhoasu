# Audit sâu Thái Cổ Thần Đình (Mine) — 20/09/2026

## Kết luận đã tái hiện

Hoạt động được nhận diện là `MineMainPanel`, RPC `2800–2804`; không phải Old Trek. Production hiện đã chạy candidate CAS `mine_fix_20260919_175920`:

- `src/handlers/mine.js`: SHA-256 `63d557621b3257984adae4e99f98c6da8421faad8b3956d35ea00498195e7b60`.
- `src/services/MineExitValidationService.js`: SHA-256 `2bff007763aeeb90efe9dc3f1ab4c5967cd5208803b359f71a9fd724426792e0`.
- S1–S5 online; S1–S4 `/ready=200`; không có production/player write trong audit.

### P0 — Validator từ chối đường đào hợp lệ của native

Native `MineAStar.tryOffsetPath` khi click block bị chiếm tìm một ô đi bộ cạnh block (`targetOffsetList`), rồi client gửi `meter/col` của block anchor nhưng `path` kết thúc ở ô cạnh block. Client `MineMainPanel.onTouchEnd` xác nhận điều này.

Repro native/server:

```json
{
  "nativeType": 1,
  "nativePath": [{"col":3,"meter":3},{"col":4,"meter":3},{"col":4,"meter":4},{"col":4,"meter":5}],
  "validator": {"valid":false,"code":"MINE_DIG_PATH_TARGET"}
}
```

Handler E2E cùng fixture trả `2801 result=1`, `reason=MINE_DIG_PATH_TARGET`, `blockMap=[]`, item55 giữ nguyên. Candidate kiểm tra `last == target` trong `MineExitValidationService.validateDig`; đó là sai contract. Client callback vẫn đọc response nhưng không có block nào được cập nhật nên người chơi thấy click không có tác dụng.

Evidence: `_ai_workbench/temp/native_dig_contract_check.js`, `_ai_workbench/temp/native_dig_handler_repro.js`, candidate `MineExitValidationService.js` dòng 46–90 và `mine.js` dòng 429–439.

### P1 — Bomb 58 chỉ phá block anchor, không phá vùng 5×5

Native dùng `MineBaseConfig.boomShape` 5×5 và `boomCenter [-2,-2]`. Candidate chỉ đổi `target` ở `mine.js` dòng 440–461. Fixture có hai block trong vùng nổ: response `blockMap` chỉ có uid1 status1, uid2 vẫn status0; item58 đã bị trừ. Đây là sai gameplay/economy: người chơi mất bomb nhưng vùng nổ không được xử lý đầy đủ.

Evidence: `_ai_workbench/temp/bomb_repro.js` và output handler repro.

### P1 — Rocket 59 sai cả điều kiện sẵn sàng và hiệu ứng phá

Native cho phép rocket khi `finish && getMeter()+1 >= _maxMeter`, với `_maxMeter` được tính từ block map hiện tại. Candidate dùng `40 * deep + 6`. Fixture map đã finish ở meter30, max block meter21: native cho phép nhưng candidate trả `MINE_ROCKET_NOT_READY`, item59 không bị trừ. Client còn dùng `MineBaseConfig.rocketheight=12` để chọn rocket khi còn tối đa 12 tầng; candidate không đọc `rocketheight` và chỉ đổi một `target` trong `blockMap`, không trả toàn bộ vùng bị rocket phá. Đây là hai sai khác độc lập đã xác định bằng fixture/static trace.

### P1 — Path làm bẩn state bằng block giả

Sau khi validate, candidate chạy `findOrCreateBlock` cho **từng ô path** rồi đánh dấu status1. Nhiều ô path native là ô đi bộ trống, không phải block. Mongo live đã có mẫu đúng dấu hiệu này: Talo S1 có 86 block, trong đó nhiều block status1 ở các tọa độ path (meter3–20) không thuộc các hàng block ban đầu. Cách này làm phình map, thay đổi `maxMeter`, có thể làm sai exit/bomb/rocket và không thể truy nguyên block UID native.

### P1 — Target chưa gắn với UID/shape native

Validator hiện chỉ kiểm tra target nằm trong bounding map và điểm cuối path; nó chưa xác nhận target là ô thuộc UID block đang được click, cũng chưa ánh xạ endpoint offset về block anchor. Kết hợp với `findOrCreateBlock`, request tới ô trống có thể tạo block mới tùy tọa độ. Đây là cùng nhóm lỗi authoritative geometry với P0 và phải sửa cùng một transaction.

### P1 — 15 tài khoản đủ điều kiện bị chặn trước RPC 2800

Client `MineMainPanel.openCheck()` yêu cầu `UnlockSystem.isSystemUnlock(311)`. SystemConfig 311 yêu cầu level≥75 và server run day≥3. PM2 `FORCE_UNLOCK_SYSTEM_IDS` hiện không có 311. Mongo read-only cho thấy nhóm đủ điều kiện nhưng thiếu persisted unlock: S2 4, S3 5, S4 6 (tổng 15). Các tài khoản này không gửi 2800 nên không thể mở hoạt động; đây là gate drift riêng với lỗi đào P0.

Evidence: live unlock audit 20/09; source `upgrade.js` dòng 603–720; client bundle `MineMainPanel.openCheck`.

### P1 — Auto-dig tính sai chi phí power

Client `doAutoDig` kiểm tra `MineBaseConfig.autoPowerCost=3` rồi gửi `2801` với `itemId=-1`. Candidate quy mọi `itemId<=0` thành item55 nhưng luôn gọi `consumeItem(..., 1)`. Vì vậy auto-dig chỉ trừ 1 power mỗi lượt thay vì 3; đây là sai lệch kinh tế/tiến độ đã thấy trực tiếp từ hai contract.

### P1 — Tài khoản mới bị đổi cycle 0 thành cycle 1

`PlayerMigrationService` khởi tạo `mineInfo.cycle=0`, còn `ensureMineInfo` ép `Math.max(1, cycle)`. Client đọc cycle trực tiếp để chọn `MineLevelConfig[cycle]`, và config có cả cycle0/cycle1 với dữ liệu khác nhau. Vì vậy tài khoản mới nhận map cycle1 ngoài ý muốn. Cần xác định transition native trước khi sửa dữ liệu cũ.

### P1 — Source workspace lệch production

`linhhoasu/lhs/newServer/src/handlers/mine.js` local là bản cũ và thiếu `MineExitValidationService`; production là hash `63d557…`. Mọi patch tiếp theo phải rebase từ snapshot remote/candidate, nếu sửa local rồi deploy nguyên file sẽ làm mất hotfix response-shape/allowlist hiện tại.

### P2 — Error response không đồng nhất với contract client

Các nhánh không có player của 2800/2802/2803/2804 trả `{result:-1}` thiếu `events`, `blocks/blockMap`, `dealResult`, `rewardInfo` hoặc `rewards`, trong khi client truy cập trực tiếp các field này. Đây là lỗi replay/session stale có thể gây TypeError hoặc để mask không được mở; chưa phải nguyên nhân chính của fixture P0.

### P2 — Độ trễ hàng đợi làm nặng triệu chứng đứng

Có log Mine `2801` S3 0,5–1,6 giây và một queue wait 7,447 giây ngày 19/09; S1 có `2800` khoảng 1,005 giây. Các queue cực lớn được ghi trước lần restart hiện tại, nên chưa kết luận đây là nguyên nhân duy nhất. Cần đo lại sau khi sửa geometry.

## Kế hoạch fix có kiểm chứng

1. **Sửa geometry/UID trước (P0):** port đúng `targetOffsetList` và `targetNoneOffsetList`; phân nhánh block bị chiếm, ô trống, type1/type3; map endpoint tự do về UID/shape anchor; giữ kiểm tra start, adjacency, head/feet và bounds; reject endpoint giả. Không ghi DB nếu validation fail.
2. **Sửa mutation atomic:** không gọi `findOrCreateBlock` cho path cell. Chỉ resolve các UID block thật bị đào; cập nhật status/digCount/event đúng anchor; trả toàn bộ `blockMap` thay đổi. Thêm CAS/transaction để retry không trừ item hai lần.
3. **Sửa item58:** tính đúng vùng nổ từ `boomCenter` + `boomShape`, gom UID duy nhất, cập nhật toàn bộ block bị ảnh hưởng và trả tất cả thay đổi; test biên map, nhiều block, replay.
4. **Sửa item59:** dùng `maxMeter` authoritative được tính từ map hiện tại; port hiệu ứng `rocketheight`/cell-to-UID native và trả toàn bộ block anchors bị phá; kiểm tra target/path hợp lệ; test map finish ngắn, map đủ config depth và auto-dig gần cửa thoát.
5. **Sửa auto-dig cost:** phân biệt request auto hoặc charge đúng `autoPowerCost`; test delta item55 cho manual/auto, retry và thiếu tài nguyên.
6. **Sửa gate 311:** đối chiếu 15 tài khoản đủ điều kiện, refresh unlock bằng cùng predicate native rồi CAS từng player; quyết định riêng có force-open 311 cho tài khoản mới hay giữ điều kiện. Không cấp thưởng hồi tố.
7. **Chuẩn hóa response/UX:** mọi lỗi 2800–2804 trả đủ native fields; client xử lý `result!=0`, đóng global mask và hiện reason thay vì chạy callback trên mảng undefined.
8. **Kiểm thử bắt buộc trước deploy:** native differential cho type1/type3/bomb/rocket; handler E2E success/reject/replay; map-state invariant (không có block giả, UID không đổi); `node --check`; test live read-only + rolling restart + readiness; sau đó soak P95/P99 queue Mine.

## Trạng thái triển khai 20/09/2026

- Đã sửa candidate đúng từ live CAS: validator native endpoint/UID/type3, không tạo block giả trên path, bomb vùng 5×5, rocket theo `rocketheight`/`maxMeter`, auto-dig charge `autoPowerCost` + `autoRowNum`, cycle0, replay sau finish và response error shape.
- Test local: native geometry **39/39**, native contract **7/7**, handler enforcement **10/10**, syntax PASS.
- Đã rolling deploy cả S1–S5 hai lượt; backup cuối `/linhhoasu/_ai_workbench/backups/mine_fix_20260920_011822`; runtime hash handler `9977d32efc81f3b126c8295f02e3be1887cb8e7e1b8e76e5be79f3def7678016`, validator `bf02291cf06afcc606909814c50ec7153861e47cac958d8e8e4f3b483da6cb94`.
- Hậu kiểm: PM2 cả5 online, `/ready` 8080/8083/8084/8085/8086 đều 200, require smoke PASS, productionWrites/playerWrites=0.
- Chưa force system311: S5 mới mở ngày 20/09 và config native yêu cầu server day≥3; đây là policy gate cần giữ nguyên trừ khi chủ game yêu cầu mở sớm.

### Browser evidence bổ sung — S5 bị chặn trước RPC 2800

- QA read-only trên production `http://103.116.105.154:81/`, server S5, nhân vật đang hiển thị cấp169. Từ **Động Phủ** mở `LandEntrancePanel`; bundle production map `entranceType=4`/asset `ltrk_bm_tgsd` tới system311 và callback chỉ gọi `MineModel.tryStartLevel()` sau `UnlockSystem.isSystemUnlock(311)`.
- Tile type4 hiện màu xám/khóa trên map S5. Bấm tile không mở `MineMainPanel`; console log của tab lọc `2800` rỗng, tức request `2800` chưa hề rời client. Đây là gate drift độc lập với lỗi validator `MINE_DIG_PATH_TARGET`.
- Cùng phiên chỉ thấy cảnh báo không liên quan (RPC `6560`, audio autoplay, spine và map `onEnterMove`); không thấy lỗi `2800–2804`. Cần kiểm tra cờ/persisted unlock system311 của runtime S5 trước khi dùng S5 để nghiệm thu đào.
