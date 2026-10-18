# Session Report — Tiền đồng, Trân quý Cá chép và thưởng câu cá

## 1. Tóm tắt công việc

**Đã triển khai S2 → S1, hoàn tất09:08:04 GMT+7 ngày07/09/2026.** Không dùng tiền/đồ người chơi thật để QA; không tự bù lượt mua hoặc câu trước đây.

### Tiền đồng119

| Nội dung | Quy tắc đã triển khai |
|---|---|
| Nguồn | Bán cá mới được câu trong ngư trường sự kiện type33 đang mở |
| Tỷ lệ |20% mỗi con bán, nhận ngẫu nhiên1–3 Tiền đồng |
| Huyền Vũ | Thẻ11000009 còn hạn tăng25% số tiền nhận; phần lẻ lưu qua các lần bán/relog |
| Chống lặp | Nguồn cá gắn UID/instance trên server, xóa khi bán; gửi lại UID không cấp thêm |
| Phạm vi | Phải đang bán trong ngư trường sự kiện đúng kỳ; cá cũ trước bản sửa/cá thường không có nguồn hợp lệ không được farm tiền |
| Cuối kỳ | Tồn119 đổi thành Bạc1:1.000 ở heartbeat hoặc lần thao tác hợp lệ tiếp theo; ghi dấu để không đổi hai lần |
| Đổi đồ | Giá gốc cửa hàng119; limit theo ActivityShopConfig/kỳ, không tin frontend |

Đây là bảng cân bằng riêng được user yêu cầu thiết kế, không phải tỷ lệ chính thức Trung Quốc. Trung bình trước bonus khoảng0,4 Tiền đồng mỗi con đủ điều kiện bán; có Huyền Vũ khoảng0,5. Không tính lại quá khứ, không reset tiền68/69 hoặc các nguồn cá khác.

### Trân quý của Cá chép94501

Quà mới tự mở trong đường nhận phần thưởng sự kiện/thư. Túi đã tồn có nút sử dụng ở client mới, tối đa100 túi/lần; QA đã mở66 túi. Một túi roll một dòng:

| Item | Số lượng | Xác suất |
|---|---|---|
|68 — tiền câu cá|100–300|50%|
|69 — Ngọc cá|1–3|25%|
|135 — nguyên liệu tẩy|1–3|15%|
|5535 — bí quyển câu cá|1–3|8%|
|65 — Đùi Gà|5|1,9%|
|29040 — thời trang|1|0,1%|

Giữ quyền sở hữu native của thời trang; không chỉ cộng một item giả. Consume và thưởng cùng snapshot/save xác nhận. Khi save lỗi, session mất hiệu lực để tải DB mới; không giữ snapshot đã biến đổi rồi ghi đè về sau.

### Nhân thưởng đúng phạm vi ảnh

Năm gói Đại hội6006, ID11001401–11001405: Nguyên bảo300/680/1.280/3.280/6.480 →300.000/680.000/1.280.000/3.280.000/6.480.000. Giữ giá30/68/128/328/648, số Đùi Gà, mồi và giới hạn mua. Các gói này không có vé tăng tốc nên không tự thêm item6.

BXH Đại hội6006: Nguyên bảo x1.000 và vé tăng tốc item6 x10.000. Hạng1:1.000.000 Nguyên bảo +1.000.000 vé; hạng2:800.000 +800.000; hạng3:600.000 +600.000; các hạng còn lại cùng hệ số. Quà ngoại quan, mảnh và Đùi Gà giữ nguyên. Không nhân mọi gói nạp/sự kiện khác của game.

## 2. File/thư mục đã thay đổi

Source chính `linhhoasu/lhs/newServer/`:

- Thêm `src/config/fishingEconomy.json`, `src/services/FishingEconomyService.js`.
- Sửa FishingGameplayService/FishingEventService; handler fish/item/raid/mail/playerPayload. Tổng9 source/config file.
- Binary server `linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin`; binary client cùng tên dưới `linhhoasu/webgame/game/update/resource/assets/excel/` và ngôn ngữ `lang_cn/config_lang_c2fa8585.bin`.
- Client index cache token `20260907_fishing_economy_v1`; giữ bundle/banner fix trước đó nguyên byte.

Tools inspect/build/22-test/stage/preflight/QA/release/rollback-verify/local-merge/residue ở `_ai_workbench/tools/`. Candidate/evidence `temp/fishing_economy_20260907/`; baseline `temp/fishing_audit_20260906T212212Z/`.

Backup phát hành `/linhhoasu/_ai_workbench/backups/fishing_economy_20260907_020722/`; canary đầu `/linhhoasu/_ai_workbench/backups/fishing_economy_20260907_020501/`. Local `backups/fishing_economy_local_20260907/`, report `backups/fishing_economy_reports_20260907/`. Bản server local có SystemConfig khác sẵn, đã giữ nguyên bảng đó, chỉ ghép bốn bảng cần đổi; không tuyên bố binary server local khớp byte toàn bộ VPS.

## 3. Lỗi đã gặp & giải pháp

| Lỗi | Nguyên nhân | Cách xử lý | Tránh tái diễn |
|---|---|---|---|
|119 không có nguồn|Chỉ show/cost chưa grant|Nguồn UID theo kỳ, roll ở bán cá|Manual/auto/replay/scene/expiry|
|94501 nằm túi không dùng|Type99 và thiếu use/pool|Use config + tự mở quà mới + handler túi tồn|Test66 túi/concurrent/savefail|
|Cửa hàng119 thiếu giới hạn server|Policy cũ chỉ phủtype43|Nhánh119 riêng theo kỳ/ActivityShopConfig|Sai sự kiện, hết limit, request trộn|
|Bản vá mail có thể bỏ native reward|Generic mail chỉ gom ít reward types|Expand94501 trước vòng xử lý mail|Giữ grant đường native theo từng vật phẩm|
|Canary đầu mini-game trảresult1|Chưa xác định được nguyên nhân từ assertion đầu không ghi response; không được kết luận đã tìm ra root cause|RollbackS2, kiểm toàn hash/ready; bổ sung diagnostic; canaryS2/S1 sau đềuPASS|Giữ failed-attempt-1.json; nếu tái diễn đọc reason/revision/ticket trước xử lý|
|Syntax deploy helper lỗi else|Thiếu khoảng trắng trong tool Python|py_compile chặn trước execution|Kiểm syntax trước kết nối|
|Local config hash khác|SystemConfig local đã khác baseline|Ghép các bảng đã xác minh, giữ phần khác|Không copy toàn binary mù|
|Test local chạy thiếu dependency|NODE_PATH không còn sau lượt tool|Chạy lại đúng dependency,22PASS|Không coi lỗi harness là lỗi game hoặc giấu fail|

Không đổi database người chơi thật, không reset các túi cũ, không thu/bù gói đã mua. Warning isNew từ model cũ không sửa ngoài phạm vi. Nội dung mớiUTF-8; không sửa rộng asset/ngôn ngữ.

## 4. Kiểm thử và kinh nghiệm

-22 nhóm local/Linux stagingPASS: xác suất boundary20%,1–3, bonus25% phần lẻ/relog, không tiền từ cá cũ/sai scene/kỳ, cùng UID không double, conversion cuối kỳ một lần,94501auto/manual66/concurrent/badquantity/savefail/commit-timeout, toàn pool boundary, currency shop price/limit/foreign/mixed, normal/auto sale replay, dữ liệu provenance không lộ payload, rank payout nhân đúng và resolver gói giữ giá.
-Core stagingPASS với714 bảng. Binary server/client giải/ghi/giải lại đủ714 bảng; bốn bảng đổi là ShopConfig,Activity6RankConfig,AssetsConfig,AssetsUseConfig; các bảng khác giữ nguyên. Ngôn ngữ sửa hai tooltip.
-Live QA S2/S1 bằng nhân vật tạo riêng: mở66 túi, mở quà mini-game tự động, replay không cấp lại, gói11001401 cấp300.000 Nguyên bảo (token QA), vào scene101 và bán3 cá có119; S2 nhận1, S1 nhận4 trong mẫu. Đây là kết quả ngẫu nhiên mẫu nhỏ, không dùng để ước lượng tỷ lệ20%.
-Đăng nhập lại giữ túi94501=0 và số119 đúng. Không gọi provider/cash upstream hoặc dùng account thật. Rank cuối kỳ và bonus25% được test fixture, chưa chờ kỳ live kết thúc.
-Hậu kiểm13/13 artifact hash và HTTP config/lang/index đúng; ready8080/8083=200.
-QA residue: players/mails/bottles/Redis sessions/process harness đều0. Mẫu log tối đa256KiB/file sau phát hành chưa thấy error mới; không suy toàn log sạch.

## 5. Trạng thái hiện tại

Gói delta `temp/fishing_economy_20260907/Fishing_Economy_20260907.zip` gồm16 entry, CRC và hash từng entry đã kiểm. Không chứa credential, snapshot player hoặc tài khoản QA. Metadata/hash toàn gói ở `package.json`. Chín file source local tương đương nội dung VPS; binary server local giữ khác biệt SystemConfig ngoài phạm vi.

Đã phát hành09:08:04 GMT+7. S1 PID3021/restart1385; S2 PID32727/restart57 tại hậu kiểm. S1 tăng1restart; S2 tăng3 (canary đầu, rollback, bản cuối). Dist30824/admin30856/bot1600/1576 giữ nguyên. Không restart PHP/Nginx hoặc game khác.

Giới hạn: chưa screenshot native UI với client/config mới trên thiết bị vật lý; kiểm code/config display và RPC thực đã đạt. Chưa cash upstream thật, chưa live cuối kỳ hoặc thử toàn bộ ô bảng rơi bằng RNG thật. Canary mini-game đầu là lỗi ngắt quãng chưa xác định root cause, đã lưu evidence và không ghi thành “đã fix nguyên nhân”.

## 6. Bước tiếp theo

Tải lại game một lần để lấy config/cache mới. Mở túi94501 trong Túi đồ; tới ngư trường sự kiện, câu cá mới rồi bán để nhận119. Cửa hàng giới hạn theo kỳ, tiền hết kỳ chuyển Bạc ở heartbeat/thao tác kế tiếp, không phải job cập nhật đồng loạt người offline ngay lập tức.

Nếu đổi bảng rơi sau này phải đổi version/provenance, kiểm nguồnUID, kỳ và snapshot; không sửa tỷ lệ để làm test RNG mẫu nhỏ xanh. Rollback giữ state receipt/currency, không xóa hoặc hoàn lại vật phẩm đã nhận. Bản client nền web/banner trước vẫn được giữ.
