# Lực chiến — điều tra và kế hoạch sửa triệt để

Ngày 13/09/2026. Trạng thái: đã điều tra local và VPS, chưa triển khai fix. Lượt này chỉ đọc production; không sửa dữ liệu, chạy trận, deploy, restart hoặc đổi cấu hình.

## 1. Kết luận

Không chỉ là viết tắt khó đọc. Có ít nhất ba tầng lỗi độc lập: thang tính client/server khác nhau; đơn vị Việt hóa và font không tương thích; nguồn/snapshot lực chiến khác nhau giữa các màn hình. Sửa một formatter sẽ không giải quyết được số sai.

### Những lỗi đã xác nhận

| Mức | Lỗi | Bằng chứng và ảnh hưởng |
|---|---|---|
| P1 | Client/server khác thang danh nghĩa ×100 và khác làm tròn | Native `calPowerByAttr` trả `ceil(sum(attrs × weight))`; server `calcPowerScore` trả `floor(sum/100)`. Chạy hàm thật với cùng attrs và cùng AttrConfig trên VPS: `4.600` so với `46`. Không phải tỷ lệ đúng 100 ở mọi số, nhất là số nhỏ/đã floor. HUD/self tự tính, hồ sơ người khác nhận số server. |
| P1 | Font lực chiến bỏ mất hậu tố Việt | `font_num_zhanli_fnt` chỉ có `.0123456789万亿千？`; thiếu `Vạn`, `Tỷ`, dấu phẩy. Egret bỏ vẽ glyph không tồn tại. Chuỗi `1.00Tỷ` có thể chỉ vẽ `1.00`. |
| P1 | Đơn vị tiếng Việt sai hệ số | `overLengthPower` chia `10^8` nhưng gắn chữ `Tỷ` (`10^9`). 100 triệu bị ghi thành `1.00Tỷ`; generic `overLength` chia `10^12` nhưng gắn `Triệu`. Không được đổi các language key dùng chung một cách mù quáng. |
| P1 | Arena query thiếu thành phần | Challenger projection không lấy `items`; bonus skin gia viên phụ thuộc `items[skinId]`. Snapshot nicky S1: full `621.107`, qua projection `618.447`, lệch `2.660` đơn vị server. Đây là lỗi còn sót trong phần lực chiến của bản Arena trước. |
| P1 | Virtual bot ngoài map khác hồ sơ | Bot dùng `RobotAttrsConfig`/`combatPower` cho map, nhưng snapshot profile không giữ robot attrs, rồi tính lại như player thường. Fixture bằng nguồn/config production: map DTO `176.996`, profile calculation `13.678`; hai số cùng công thức server legacy `/100` nhưng từ hai bộ attrs khác nhau. Đây không phải chỉ lỗi font hoặc bằng chứng scale thuần túy. |
| P2 | Các đường render trong cùng PowerCell khác format | `dataChanged` dùng `overLengthPower`; `setValue` dùng `toString`; animation dùng số nguyên raw. Có thể đổi kiểu hiển thị khi số tăng, giảm hoặc kết thúc animation. |
| P2 | Nhánh ngôn ngữ en hỏng | `overLenghPowerEn` trả chuỗi literal `"null"`. Chưa khẳng định user đang ở en; đây là lỗi source xác nhận. |
| P2 | Layout quá nhỏ và ép khoảng cách | PowerCell bitmap có letterSpacing `-3/-5`; HUD scale `.65`, profile `.64`, Arena/BXH `.6`. Cần kiểm bố cục theo pixel, không chỉ thay text. |
| P2 | Có nguồn số giả/cũ ngoài Arena | TopCombat self fallback `1000`; Island self dùng `1000 + level*100`. Chat/guild ưu tiên cached power nhưng không xác thực revision. |

### Những phần còn phải chứng minh trước khi sửa

- Self HUD cộng nhiều module client, không phải chỉ cùng attrs rồi đổi hệ số. Curios, SpecSpirit, ValhallaFormation chưa thấy reader tương ứng trong `BattleService`; có nguy cơ thiếu thành phần, phải so riêng từng module. Không kết luận mọi bonus này đã mất trong mọi tình huống.
- Profile người khác thường đọc Mongo; self dùng session, managed bot có resolver live. Cần đo stale window khi nâng cấp/đổi đồ/chuyển phiên.
- Map giữ `_mapSelfInfo`; push hiện gắn nhiều với thay đổi appearance, chưa đảm bảo mọi thay đổi lực chiến đều cập nhật viewer.
- Lần quan sát browser đang ở popup kết quả trận, không có cặp HUD/hồ sơ cùng nhân vật. Chưa gắn chính xác câu “bên ngoài 1 lẻ, bấm vào 1” với raw packet tại thời điểm người dùng thấy. Không coi số sát thương trong popup là lực chiến.

## 2. Kiểm chứng hiện tại

### Thực thi formatter và đọc font thật trên VPS

| Số raw đầu vào | Formatter hiện tại trả | Ký tự bitmap hiện có thể vẽ | Hiển thị đầy đủ đề xuất |
|---:|---|---|---|
| 999999 | `999999` | `999999` | `999.999` |
| 1000000 | `100.00Vạn` | `100.00` | `1.000.000` |
| 1234567 | `123.46Vạn` | `123.46` | `1.234.567` |
| 100000000 | `1.00Tỷ` | `1.00` | `100.000.000` |
| 123456789 | `1.23Tỷ` | `1.23` | `123.456.789` |
| 1000000000 | `10.00Tỷ` | `10.00` | `1.000.000.000` |

Cột bitmap là kết quả đối chiếu glyph với mã renderer, không phải ảnh chụp của những giá trị test này.

### Phép tính cùng snapshot/cấu hình

- Cùng attrs `{1:1000,2:100,3:10,4:10}`: native `4.600`, server `46`.
- Cùng attrs rất nhỏ `{1:1,2:1,3:1,4:1}`: native `82`, server `0`. Không thể chữa mọi trường hợp bằng `serverScore*100` vì số đã floor.
- Nicky S1 tại snapshot 13/09 khoảng 07:33 GMT+7: server full `621.107`; chạy công thức native trên chính server attrs được `62.110.738`. Đây không phải số HUD live đã chụp; HUD có thể đang tổng hợp attrs khác.
- Hai mẫu khác: full/projection S1 `3.487.982/3.472.967`; S2 `2.597.739/2.583.753`. Không sửa các player này.
- Raw BinJson round-trip local và VPS giữ nguyên các số thử, gồm `2^32`, `10^12`, `Number.MAX_SAFE_INTEGER`. Chưa thấy mất số trong codec cho tập này; không đồng nghĩa native WS E2E đã pass.
- Test relog power hiện có PASS 28 ca; chỉ chứng minh Gem/PetSoul refresh theo fixture, không bảo đảm toàn bộ nguồn attrs.

### Baseline production không được ghi đè bằng local

- Đã so hash 14 file liên quan. Bundle main/start, font lực chiến, BattleService, BotPopulationService, playerPayload, Arena và chat khớp local.
- `basic.js`, `guild.js`, language bin, server config bin không khớp. Đã đọc lại những hàm liên quan trực tiếp trên VPS để xác nhận kết luận; chưa tải đè bản local.
- Server/client AttrConfig có cùng hash nội dung `500da7dddaeefe29398d8bbaa63e251d0a2bff74a0e1fc4d4711ee177cd31e19`, nên lỗi `/100` không do hai bộ trọng số khác nhau.
- Main SHA-256 `2cc9a3811fd61cc421c3ce240982aae84582593e38d5d8c679a7a2af8c9d6c42`; font lang `ef1897302b4c4eac77e42bc528e2654a465f45ff277fc3adcf8c12975b2c6039`; language production `7d8d7aef89650e5f3f718e17b59ca697eaeb2138ca5948f4190ab50afc5c8b4b`.
- HTTP công khai port81 trả language/font/relog patch với hash đúng các file đã kiểm trên VPS; đây là kiểm tài nguyên được serve, không phải nghiệm thu UI.
- Runtime đã có S1/S2/S3 chung thư mục source, nhưng vòng đời process khác nhau. Khi triển khai phải kiểm inventory lại và quyết định rollout từng server; không restart wildcard hoặc vô tình sửa cấu hình S3 kế thừa S2.

## 3. Chuẩn hiển thị đề xuất

1. Số nguyên đầy đủ là nguồn để người chơi đọc và tính: `1.234.567`. Dấu chấm phân cách hàng nghìn, không bị hiểu thành số thập phân.
2. HUD chính và hồ sơ hiển thị số đầy đủ; bảng/dòng đối thủ cũng ưu tiên đầy đủ. Cho số dài một dòng đủ rộng, không giảm font liên tục cho vừa.
3. Chỉ dùng compact khi diện tích thực sự thiếu; luôn ghi rõ đơn vị và ký hiệu xấp xỉ: `≈1,23 triệu`, `≈123,46 triệu`, `≈1,23 tỷ`, `≈1,23 nghìn tỷ`. Bấm/chạm phải xem được số đầy đủ, không chỉ có hover trên PC.
4. Không dùng `Vạn`, không dùng `1.00` không đơn vị. Compact không được dùng để xếp hạng, tính chênh lệch hoặc quyết định gameplay.
5. Thiếu/chưa tải dữ liệu: `Đang tải…` hoặc `—`, không gán giả `0/1/1000`. Raw zero hợp lệ vẫn hiện `0`. Lỗi tải có trạng thái thử lại; không hiện số stale như thể mới.
6. So sánh/tooltip: tính từ hai số raw, ví dụ `1.234.567 − 1.200.000 = +34.567`; không trừ hai chuỗi compact đã làm tròn.
7. Animation tăng/giảm và số tĩnh dùng cùng formatter; dừng/đóng/mở lại phải hiện chính xác giá trị đích. Dấu `+/-`, màu và dấu phân nhóm phải đọc được.
8. Giữ style/icon game; thay riêng phần text lực chiến sang Unicode label hoặc tách số với label Unicode. Không thay toàn bộ bitmap font hay AutoIncrementLabel của tiền/sát thương.

## 4. Kế hoạch triển khai theo thứ tự và cổng kiểm tra

### G0 — Chốt baseline và contract trước mutation

- Backup chọn lọc đúng file sẽ sửa trên VPS; lấy hash, source runtime, phiên bản client/resources, config và inventory S1/S2/S3. Với file lệch, merge từ baseline production, không copy nguyên local.
- Lập manifest tất cả producer/consumer lực chiến: self, profile500/502, map, chat, guild, BXH/Arena, TopCombat/Island, battle preview/result/history; self/other online/offline, virtual/managed bot, robot cấu hình.
- Đóng băng fixture gameplay trước thay đổi: kết quả trận theo seed, score Arena, cost/reward, lựa chọn/bán cá, lựa chọn/bán trang bị và sorting hiện có.
- Thu một cặp raw packet + UI HUD/profile cùng player/server/snapshot. Chỉ dùng thao tác đọc; test tăng attrs sẽ chạy ở QA cô lập khi triển khai được duyệt.
- Cổng qua: baseline/hash + owner file rõ; không có trường `power` nào được đổi ý nghĩa mà chưa xác định consumers.

### G1 — Thống nhất con số gốc cho hiển thị

- Đề xuất giữ thang native HUD: số nguyên `ceil(sum(effectiveAttrs × AttrConfig.power))`. Server cấp số hiển thị có version; không để mỗi màn tự chọn `power`, `combat`, `totalPower` không rõ đơn vị.
- Thêm helper thuần cho display (ví dụ `PowerDisplayService`), không sửa trực tiếp `BattleService.calcPowerScore` dùng gameplay. Tính từ attrs gốc; tuyệt đối không lấy số đã floor rồi nhân 100.
- Explicit override `attrs.powerScore/999` và NPC chỉ có `combatPower` cần quyết định contract riêng về đơn vị; không xem override như attr có trọng số hoặc tự nhân 100. Không thêm dependency, không đổi hệ lưu trữ ngoài phạm vi.
- Hợp đồng công khai đề xuất: value raw, unit/version, entity type, canonical ID + serverId, source revision và thời điểm snapshot. Tận dụng revision có sẵn nếu có; không refactor kiến trúc lưu player chỉ để đổi cách in số.
- Ưu tiên field mới như `combatPowerValue` + `combatPowerVersion`; client mới ưu tiên field này. Giữ legacy `power/powerScore` nội bộ cho đến khi audit mọi consumer. Client cũ/fallback không được trộn hai đơn vị.
- So contribution từng module client/server: equip/preset, level/stage, formation, mount, spirit, gem, pet, pet soul, fashion, item bonus, artifact/orb, fate, fishing, bloodline, homeland, Elf, Valhalla/formation, OldTrek, Curios, SpecSpirit. So cả linked/% attrs, order, rounding, slot và cap.
- Nguồn chưa parity phải được xử lý/công khai giới hạn, không đơn giản lấy server làm chuẩn rồi làm HUD mất bonus. Nếu phát hiện cần sửa combat attributes, tách bản sửa gameplay với kiểm chứng/ủy quyền tương ứng; không lén đổi trong patch format.
- Cổng qua: cùng entity + revision + mode cho cùng raw display; component fixtures và composite đều đúng; legacy gameplay fixture giữ nguyên.

### G2 — Khép kín dữ liệu profile, bot và đối thủ

- Dùng chung projection đủ dữ liệu cho mọi read model lực chiến; ca skin gia viên phải làm full/projection bằng nhau. Tách public display với attrs snapshot chiến đấu để không đưa `displayPower` vào `attrs.powerScore/999`.
- Lưu ý Arena hiện dùng projection để tạo cả `robotAttrs` của đối thủ. Bổ sung `items` trực tiếp sẽ thay sức mạnh trận, không chỉ UI. Phần display được sửa theo snapshot đầy đủ; sửa combat snapshot phải có regression thắng/thua/điểm/vé riêng và được duyệt trong phần correction gameplay, không âm thầm kèm patch format.
- Phân loại bot rõ: virtual bot từ snapshot attrs cấu hình, managed bot từ player data, Arena robot từ config combat snapshot. Map/chat/profile của một bot phải dùng cùng nguồn; không fallback `level*100` khi đã có attrs.
- Profile500/502 tra đúng entity/server; giữ alias `dbid`/playerId protocol tương thích, tránh lấy record khác rồi báo power=1 hoặc placeholder.
- TopCombat/Island/player summary bỏ số giả cho player thật, dùng resolver thống nhất; không áp luật player vào NPC cố định chưa có profile.
- Cổng qua: entity × producer contract coverage đầy đủ, numeric payload + profile ID đúng; không có trường hợp successful response nhưng power thiếu/NaN/khác unit.

### G3 — Đồng bộ cache và vòng đời

- Cập nhật display sau thay đổi đã commit, không từ snapshot đang sửa dở. Trả value/revision theo ACK hiện có hoặc push thích hợp; chặn response cũ ghi đè mới.
- Invalidate map/profile/guild/Arena read cache khi nguồn attrs đổi: cả trường hợp cùng equip ID nhưng attrs khác, fashion nâng sao không đổi skin, đổi pet/slot, đổi preset và bonus hết hạn.
- Login nhiều packet: chờ/đánh revision trạng thái, không để 500 → Gem3900 → PetSoul6900 gây tụt số. Tái sử dụng relog guard hiện tại, mở rộng theo nguồn được xác minh.
- Profile online lấy committed authoritative snapshot có freshness rõ; offline đọc Mongo. Nhiều phiên/reconnect không được chọn tùy tiện session cũ.
- Lịch sử trận giữ lực chiến lúc đánh; profile hiện tại dùng hiện tại. Ghi mode/time để hai giá trị có lý do khác nhau, không sửa log quá khứ cho bằng profile hôm nay.
- Cổng qua: không cần đổi trang bị/cần câu hoặc relog mới hiện số đúng; response đảo thứ tự không làm tụt revision; mất kết nối hiện unknown rõ.

### G4 — Formatter và layout lực chiến

- Tạo formatter riêng (`formatPowerFull`, `formatPowerCompact`, `formatPowerDelta`) theo chuẩn mục 3; dữ liệu vào raw numeric, dữ liệu ra text chỉ dùng render.
- Tích hợp cả `PowerCell.dataChanged/setValue/playAnim/stopAnim`, HUD mới/cũ, RoleInfo, OtherPlayerInfo, Arena, RankItem và PowerTip tăng/giảm. Không sửa generic `CommonUtils.overLength` hoặc language key dùng chung trong release lực chiến này.
- Chuyển label lực chiến có hỗ trợ Unicode, dấu phân nhóm/đơn vị; kiểm width thật sau scale và căn baseline với icon. Giữ vùng chạm, không để text che nút/đối thủ.
- Font tối thiểu đề xuất 14–16px ở kích thước hiển thị thực; HUD/hồ sơ ưu tiên lớn hơn. Kiểm 360/390/430px và desktop, số dài tới giới hạn hỗ trợ; chọn compact theo layout cố định nếu không đủ chỗ.
- Cổng qua: mọi glyph hiện đúng, đủ số, không bị cắt/hụt suffix, không đổi format khi animation kết thúc; số chính xác luôn có thể xem trên mobile.

### G5 — Regression, staging và native E2E

| Nhóm | Ca bắt buộc | Điều kiện pass |
|---|---|---|
| Numeric | `0,1,999,1000,9999,999999,10^6,10^8,10^9,10^12`, mỗi mốc ±1; >32bit; MAX_SAFE; invalid/null/NaN | Không mất precision, không scientific notation, không giả số, unit Việt đúng |
| Biên compact | Làm tròn gần `999,995 triệu/1 tỷ`, delta ±1 | Không nhảy unit mâu thuẫn, mở được raw full, rounding policy duy nhất |
| Thuộc tính | Mỗi module đơn lẻ, tổ hợp, linked percent, pet slot/formation, skin gia viên | Same snapshot -> cùng raw display; không cộng hai lần hoặc bỏ bonus |
| Entity | Self, online/offline player, managed bot online/offline, virtual bot, Arena robot | HUD/map/chat/profile/BXH/challenge cùng contract, identity đúng |
| Lifecycle | Nâng/hạ attrs, đổi preset/đồ cùng ID, hết hạn buff, reconnect/crash client, nhiều phiên, packet muộn | Không cần relog để đúng; không response cũ đè mới |
| UI | HUD cũ/mới, hồ sơ từ map/chat/guild/BXH, Arena list/result/log, tooltip, animation | Font readable; full number/compact đúng; không tràn/hụt/tạo hitbox lỗi |
| Gameplay guard | Battle, auto fish/equip, bán vật phẩm, Arena score/ticket/reward, rank sort | Không đổi hành vi do display patch; nếu có, tách và xử lý trước rollout |
| Production acceptance | Raw server snapshot/packet + client model + screenshot cùng entity/revision | Ít nhất 1 player thật và từng loại bot có evidence end-to-end; HTTP200/unit PASS không thay thế |

Mở rộng các test có sẵn, không nhân bản bộ test mỏng: `test_power_relogin_fix_20260907.js`, `test_arena_read_model.js`, `test_bot_population_contract.js`, `test_map_bot_contract.js`, core contract. Hai script audit mới là diagnostic, chưa phải bộ nghiệm thu fix.

### G6 — Phát hành và rollback

- Chỉ phát hành sau G0–G5. Backup/manifest từng file + hash expected; kiểm cú pháp từng file riêng; không lệnh `node --check` nhiều tên tưởng là đã check hết.
- Server additive contract tương thích trước; client patch có version/cache-busting sau. Duy trì fallback có unit/version đúng, không chuyển nửa số sang thang mới.
- Canary S2, kiểm raw/UI/state consistency và gameplay guard; sau đó S1. S3 kiểm tình trạng mở server/owner trước khi đưa vào rollout, không restart hoặc kế thừa config ngầm.
- Hậu kiểm hash served resource, PID/ready, lỗi console/socket/font, payload size và latency. Đặt tiêu chí so với baseline; không full player query cho mọi dòng UI nếu có snapshot/revision cache hợp lệ.
- Rollback đúng allowlist file/flags; raw player progression, điểm Arena và log lịch sử không cần migration chỉ vì đổi presentation.
- Chỉ đánh dấu hoàn thành khi checklist per surface/entity có bằng chứng. Không hứa “không còn lỗi nào” từ vài test smoke.

## 5. Mã nguồn chính và artifact

- [BattleService: score/100](I:/Linhhoasu/server/server/linhhoasu/lhs/newServer/src/services/BattleService.js:683)
- [Client formatter/PowerCell](I:/Linhhoasu/server/server/linhhoasu/webgame/game/js/main.min_a6195824.js:184); [client weighted sum](I:/Linhhoasu/server/server/linhhoasu/webgame/game/js/main.min_a6195824.js:212); [OtherPlayerInfoPanel](I:/Linhhoasu/server/server/linhhoasu/webgame/game/js/main.min_a6195824.js:222)
- [Profile lookup](I:/Linhhoasu/server/server/linhhoasu/lhs/newServer/src/handlers/basic.js:736); [tag500 payload](I:/Linhhoasu/server/server/linhhoasu/lhs/newServer/src/handlers/playerPayload.js:1367)
- [Arena partial projection](I:/Linhhoasu/server/server/linhhoasu/lhs/newServer/src/handlers/arena.js:965); [Arena read model](I:/Linhhoasu/server/server/linhhoasu/lhs/newServer/src/services/ArenaReadModelService.js:10)
- [Virtual bot factory](I:/Linhhoasu/server/server/linhhoasu/lhs/newServer/src/services/BotPopulationService.js:384); [map snapshots](I:/Linhhoasu/server/server/linhhoasu/lhs/newServer/src/net/WSServer.js:1531)
- [Audit formatter/font](I:/Linhhoasu/server/server/_ai_workbench/tools/audit_power_formatter_20260913.js)
- [Audit calculator/projection/bot/codec](I:/Linhhoasu/server/server/_ai_workbench/tools/audit_power_pipeline_readonly_20260913.js)

Hai script chỉ đọc; script pipeline chỉ truy vấn Mongo khi có `--mongo`, dùng raw driver/VM và không boot handler/Mongoose model. Chạy production qua SSH stdin với `POWER_AUDIT_ROOT=/linhhoasu`, không upload helper vào runtime. Không chứa credential.
