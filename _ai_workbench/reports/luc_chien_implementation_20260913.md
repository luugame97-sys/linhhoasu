# Triển khai lực chiến — candidate, chưa phát hành

## Trạng thái

Đã bắt đầu theo kế hoạch ngày 13/09/2026. Chưa deploy, restart, ghi DB hay sửa cấu hình production. Không coi offline PASS là hoàn thành tính năng.

## Phần đã triển khai local

- `webgame/game/js/lhs-power-display-v1.js`: formatter full `123.456.789`, compact `≈123,46 triệu`, `≈1,23 tỷ`, delta `+34.567`/`−34.567`, invalid hiện `—`. PowerCell và PowerTipItem dùng Unicode label, giữ icon; format thống nhất khi tween chạy/dừng/cancel. Tooltip chạm xem số đầy đủ; không sửa AutoIncrementLabel toàn cục, tiền, sát thương, language bin.
- `webgame/game/index.html`: thêm script candidate, chưa upload production.
- `src/services/PowerDisplayService.js`: phép tính display native weighted sum riêng, không chia số đã floor; giá trị raw + unit/version + entity/server/kind + fingerprint thuộc tính/config. Fingerprint là định danh nội dung, **không phải revision tăng dần để chống stale**.
- `handlers/playerPayload.js`, `handlers/basic.js`, `services/ArenaReadModelService.js`, `handlers/arena.js`: thêm field display; giữ nguyên legacy `power/powerScore`. Client candidate chưa tự đổi nguồn các model sang field mới vì chưa vượt cổng parity.
- `services/BotPopulationService.js`: giữ attrs robot trong private display snapshot, map/profile display cùng nguồn. Không boot lại bot hay sửa bot production.
- Arena query lấy thêm items cho display, trong khi legacy combat source vẫn bỏ items như baseline cũ. Đây là tách presentation an toàn; **lỗi combat snapshot thiếu bonus chưa được sửa**, không trình bày nó là gameplay PASS.

## Bằng chứng kiểm thử

- `_ai_workbench/tools/test_power_display_20260913.js`: **109 checks PASS**.
- Chạy các hàm animation và calculator native trích từ bundle thật trong VM; số biên tới MAX_SAFE, dữ liệu không hợp lệ, unit rollover, tween interruption, tooltip cleanup, delta label, identity/fingerprint và bot đều có kiểm tra.
- Arena test so `robotAttrs` candidate với hàm baseline thật; bằng nhau, legacy score giữ nguyên trong fixture skin gia viên; field display bằng full read model.
- `test_arena_read_model.js`: 24 + 50 randomized PASS; `test_vo_dao_hoi_fix_20260912.js`: 14 PASS; relog fixture 28 PASS; core contract 714 bảng PASS. Các PASS này không thay thế coverage thiếu trong G1/G3/G5.
- `BattleService.js` chưa sửa, SHA-256 `1416b1270726acbd3afb7ea07d34f5cae99763611a025cc093967b0d96b3e484`.
- Native quan sát trước phát hành: HUD nicky đang hiện `1.0` không có đơn vị đọc được. Không inject candidate vào phiên người chơi, không nhận thưởng/đánh trận.

## Baseline và phạm vi

- `_ai_workbench/temp/power_display_20260913/baseline.json`: 12 file chọn lọc + inventory process; baseline snapshot chỉ đọc từ VPS.
- Hash `basic.js`, `guild.js`, `WSServer.js` local khác production. Diff text `basic.js` hiện cho thấy chỉ patch display ngoài khác biệt encoding/EOL; khi release vẫn phải dùng CAS và giữ encoding của baseline. Guild/WSServer chưa sửa.
- Không sử dụng các deploy script Arena cũ. Helper `power_display_release.py` chỉ có snapshot mode, từ chối ghi đè baseline đã có. Không có deploy chạy trong lượt này.

## Điểm cần quyết định trước khi hoàn tất G1

**Đã được người dùng quyết định ở lượt tiếp theo:** cho phép sửa cả bonus chiến đấu theo native. Không hỏi lại lựa chọn này. Hai hướng bên dưới là lịch sử quyết định, không còn là blocker cần user phê duyệt.

Server và native không chỉ khác `/100`: HUD native cộng Curios/SpecSpirit/ValhallaFormation và các nhánh thuộc tính theo logic riêng, trong khi calculator server chưa có reader tương đương cho một số nguồn. Hai hướng có hệ quả khác nhau:

1. **Hiển thị theo sức mạnh server thực sự đang dùng**, giữ thang số native nhưng lấy attrs server: không đổi kết quả trận; HUD một số người có thể giảm so với số client tự tính cũ. Khi đó cần công khai điều chỉnh số hiển thị, không giả bảo toàn mọi bonus native.
2. **Sửa cả bonus server để khớp nguồn native hợp lệ**: phải port/kiểm chứng từng nguồn và cập nhật combat snapshot thật. Đây là mở rộng sang gameplay, có thể đổi thắng/thua, auto-equip/sell, xếp/chọn đối thủ; cần người dùng đồng ý và regression riêng.

Không tự chọn bằng cách nhân tất cả số server ×100, không phát hành client/server trộn đơn vị, không nhận số do client tự khai báo làm authority.

## Việc còn lại, chưa PASS

- Chốt hướng xử lý bonus và component differential đầy đủ; source display chung cho self/profile/map/chat/guild/TopCombat/Island.
- Wire client field display có kiểm tra version/unit/identity; bảo đảm callback/dataChanged không tạo vòng lặp hoặc sửa model dùng gameplay.
- Commit revision/freshness, invalidation và push sau thay đổi attrs; multi-session, packet muộn, relog đủ mọi module.
- Native layout actual EUI ở các kích thước mục tiêu, các PowerCell subclass/skin và PowerTip; tooltip modal semantics; player/bot/profile raw packet cùng snapshot.
- Merge từ production baseline, syntax từng file, canary staging/G5, sau đó mới backup/deploy scoped và nghiệm thu live.

## Đợt sửa bonus native đã được duyệt — 13/09/2026

Candidate local mới, chưa deploy/ghi DB/restart:

- Thêm `NativeBonusService`: reader SpecSpirit theo slot/cấp/sao/entry/suit/echo; reader ValhallaFormation theo kết nối reciprocal, active node, punish level, knot multiplier/element/entry. Không chuẩn hóa lại inventory hoặc cấp quyền sở hữu trong reader.
- Nối 2 reader vào `BattleService.calcPlayerPower` trước bước áp thuộc tính liên kết. SpecSpirit tạo cả attr355 nhưng **không đồng nghĩa simulator đã thực thi hiệu ứng khiên**; effect semantics còn phải đối chiếu riêng.
- Sửa linked attrs theo `RoleModel.attrModify` native: dataType1 cộng phẳng; dataType2 cộng từng phần trăm dựa vào cùng giá trị gốc thay vì nhân chồng. Giữ đúng thứ tự phép toán JS để không lệch floor 1 đơn vị.
- Arena bỏ nhánh cố tình loại `items` khỏi combat source; snapshot chiến đấu và display đều dùng ownership skin gia viên đã query. Đây là correction gameplay đã được user duyệt, không còn giữ hành vi thiếu bonus như candidate trước.
- Hút máu khi đầy HP không sinh `heal=1` giả nữa; khi thiếu HP vẫn hồi thật, có kháng đủ thì không hồi. Không đổi diễn giải hút máu thành % lượng hồi hoặc tự thêm luật PK khác.

Kiểm thử:

- `test_native_bonus_parity_20260913.js`: **415 checks PASS**; 80 SpecSpirit + 60 formation fixtures bằng hàm native thật, 100 full-map randomized linked attrs, deterministic PK (heal/no heal/resist/full HP), role không có bonus giữ baseline attrs. Battle baseline so JSON sau loại prototype VM, không xóa assertion vì chênh cross-realm.
- `test_power_display_20260913.js`: **111 checks PASS**; cập nhật assertion Arena phải dùng full attrs có skin cho trận thật, không còn assert bảo toàn lỗi thiếu items.
- ReadModel 24 + 50 random PASS; Arena contract14 PASS; core714 PASS. Chưa phải đủ native live acceptance hoặc regression mọi nhánh auto-sell.
- BattleService candidate hash `a9529db3ec27f1d233020c784bfcbeb8ead3a7d2341743852ac3315430f598b4`; production vẫn baseline cũ, chưa upload.

Đo read-only VPS bằng `audit_native_bonus_impact_20260913.py`: chạy candidate trong VM, Mongo raw chỉ đọc, không upload helper vào runtime. 13 mẫu S1/S2; nicky tại snapshot khoảng 08:10 GMT+7 có formation bonus `{1:1800,5:100,6:80}`, legacy power `621107 → 621245`. Vài mẫu khác giảm do sửa nhân chồng phần trăm (ví dụ `1488052 → 1477122`). Các số này là projection trên bản sao, **không phải dữ liệu đã ghi production, không phải số HUD hoặc kết quả PK live**.

Việc tiếp tục: Curios base/passive/task/fish/echo; parity các nguồn đã có nhưng cách cộng khác (pet, formation, item,…); semantics khiên và các special attrs trong simulator; wire display client không recursion; freshness/revision; staging/native UI và release cuối. Không đánh dấu toàn bộ bonus/gameplay đã khớp native từ hai component PASS.
