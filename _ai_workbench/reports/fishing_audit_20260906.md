# Session Report — kiểm tính năng câu cá

**Có lỗi thật phía server gây cá mới hiện chỉ số cao nhưng khi vào lại bị trả về chỉ số cũ.** Đã tái hiện bằng handler và hàm client hiện hành. Ngoài lỗi này còn nhiều thiếu sót về dữ liệu, điều kiện và phần thưởng. Phiên này chỉ chẩn đoán, **chưa sửa hoặc bù cá**.

Snapshot production: 06:10:26 ngày06/09/2026 UTC+7. Nhân vật trong ảnh được đối chiếu theo tên nicky, cấp116; không đăng nhập hoặc thao tác tài khoản đó.

## 1. Tóm tắt công việc

- Đọc báo cáo phiên trước, lịch sử lỗi animation câu cá và source liên quan. Lỗi đang kiểm là dữ liệu/logic, không tự mở lại điều tra input-freeze đã tạm dừng.
- Lấy148 artifact source/config/mainJS từ production bằng SSH read-only. Không upload, restart hoặc gọi RPC gameplay trên production.
- Mongo chỉ find với projection phần câu cá; dữ liệu định danh trong evidence được băm. S1 có674 profile câu cá của người thật, S2 có68; số profile không đồng nghĩa đã chơi câu cá.
- Đọc toàn bộ handler fish.js/fish-soul.js, login payload, công thức combat liên quan và các hàm native nhận/giữ cá.
- Chạy21 probe chẩn đoán trên source production snapshot, DB/save giả trong bộ nhớ, chặn socket network. Tất cả probe tái hiện được hành vi cần kiểm; **21 probe không phải21 lỗi độc lập và không có nghĩa tính năng PASS**.
- Hậu kiểm7 hash source/config/client không đổi so snapshot.

## 2. File/thư mục đã thay đổi

### Không thay đổi

- Không sửa game/web/client/config/DB; không reset giỏ cá, không reroll, không phát quà, không trừ mồi hoặc tiền.
- Không đăng nhập, câu, bán, thay hoặc nhận cá của người chơi. Không tạo nhân vật QA production trong audit này.
- Không restart S1/S2, PM2, dist/admin, bot hoặc DB.

### Artifact hỗ trợ

- `_ai_workbench/tools/snapshot_fishing_audit_20260906.py`: lấy source/config và inventory câu cá chỉ đọc.
- `_ai_workbench/tools/audit_fishing_contracts_20260906.js`: probe từng handler, giả lập lỗi save và chạy hàm client/combat thật được trích bằng AST.
- `_ai_workbench/tools/verify_fishing_audit_readonly_20260906.py`: kiểm hash cuối phiên.
- Evidence `_ai_workbench/temp/fishing_audit_20260905T231026Z/`: `manifest.json`, `runtime.json`, `findings.json`, `postcheck.json`, source/config/client snapshot. Timestamp tên thư mục là UTC, tương ứng sáng06/09 UTC+7.
- Báo cáo MD/HTML này và session_report.md/.html. Backup report trước cập nhật: `_ai_workbench/backups/fishing_audit_reports_20260906/`.
- Không nên chia sẻ toàn runtime.json ngoài phạm vi quản trị: đã băm định danh nhưng vẫn chứa state game để đối chiếu.

Source live `fish.js` SHA-256 `3b3e0b327d904f8e57291587c36aef237eacfe9a11698684fee3c93c78355da3`, khác source local `d93771bbb85de1e70f2807b723115b62d948304d98c6d9e93e2bfed3018a26d3`. Audit dùng source live snapshot, không suy từ cây local cũ.

## 3. Lỗi đã gặp & giải pháp đề xuất

### 3.1 Nguyên nhân chính: cá mới nhưng lưu chỉ số cá cũ

Trong `fish.js`, `handleFishDealMulti` nhánh PUT_IN/tag4008 lấy slot cũ rồi chỉ gán lại `id`, `uid`, `quality`, `dead`. Các field `multi`, `attrs`, `skills`, `tempSkills` không được thay bằng cá mới.

Client `sendDealFishMutl` lại deep-copy toàn bộ cá mới vào slot khi nhận phản hồi. Vì vậy hai phía lệch nhau ngay sau thao tác:

| Mốc | ID/UID | Chỉ số trong fixture |
|---|---|---:|
| Cá mới trước giữ |5018 /2001|9000, multi19000|
| Client ngay sau PUT_IN |5018 /2001|9000, multi19000|
| Snapshot server đã save |5018 /2001|1000, multi10000 — giữ từ cá5011 cũ|
| Payload đăng nhập lại |5018 /2001|1000, multi10000|

Giá trị fixture được chọn khác biệt rõ để nhận diện field bị bỏ sót, không phải kết quả reroll trên người thật. Probe cuối gọi **hàm client thực** và **buildPlayer500Data thực**, không chỉ mô phỏng lời giải thích.

Đây là **lỗi lưu nội dung cá sai ngay khi giữ/thay**, không nhất thiết là MongoDB mất cả document. Cá vẫn có ID mới nhưng stat của cá mới không được lưu; relog chỉ làm lộ dữ liệu sai đó.

Hướng sửa khi được yêu cầu: lưu toàn bộ entity đã câu, trả đúng entity bị thay ra nếu contract quy định, không lấy field cá cũ trộn với cá mới. Test lần đầu, thay slot có cá, multi-put, relog và lỗi save.

### 3.2 Bằng chứng dữ liệu hiện tại của nicky

- Giỏ có10 slot, pending còn3 cá, level câu cá3; pics và fishTypeQualityPic đều rỗng dù đã có nhiều cá.
- Năm slot có chỉ số đầu tiên không khớp công thức `floor(FishConfig.minAttrs[0][1] × multi /10000)` đang dùng trong generator/client hiện tại:

| Fish ID | Multi đang lưu | Stat đầu đang lưu | Theo minAttrs×multi hiện tại |
|---:|---:|---:|---:|
|5018|11157|4462|11157|
|5028|11236|898|1123|
|5045|11081|332|443|
|5056|10147|1948|2435|
|5098|11482|2204|2755|

Đây là dấu hiệu phù hợp với lỗi trộn field cá cũ/cá mới. **Không đủ để suy ngược chính xác multi/attrs của mọi con cá từng mất**, vì multi hiện tại cũng có thể là giá trị cũ. Không tự thay bằng giá trị tính lại rồi gọi là hoàn đúng cá gốc.

### 3.3 Các nhóm lỗi và thiếu sót còn lại

| Ưu tiên | Nhóm | Bằng chứng / tác động | Phạm vi chắc chắn |
|---|---|---|---|
|P1|Giữ/thay cá|Không lưu multi/attrs/skills mới; relog trả stat cũ|Đã tái hiện handler+native callback+login payload|
|P1|Cá bị thay ra|PUT_IN không trả lại entity cũ mà tạo cá ngẫu nhiên cùngtype/UID mới; slot trống cũng sinh cá thêm|Hành vi đã tái hiện; cần giữ đúng contract đổi cá, không random thay thế|
|P1|Cá chờ xử lý|Gọi catch tiếp ghi đè toànfishResult, mất cá pending trước|Backend thiếu guard; UI có thể chặn nhưng RPC không bảo vệ|
|P1|Sổ cá/kỷ lục|Client unlockPic khi xử lý, server không cập nhật pics/fishTypeQualityPic|Relog mất nhận diện cá/kỷ lục;51 người có giỏ nhưng picsrỗng|
|P1|Save failure|save trảnull vẫnACKsuccess; save throw để session đã trừmồi/thêmcá tồn tại|Có nguy cơ mất/ghi bền mutation không xác nhận ở lần save sau; đã fault-inject|
|P1|Sưu tầm/fetter4004|Không kiểm các cá cần có, ID hợp lệ hay đãclaim; gọi lại tiếp tục cộng5Nguyên bảo+50Bạc|Configfetter1 yêu cầu4cá, rewardscònrỗng nhưnghandler tự phátquà; không test trênngười thật|
|P1|Nhật ký4005/4006|Nângexp không trừcost, không cap đúngmốc; reward sai item128 và nhậnlặp|Confignhật ký101 cost6013, rewards65/5514/5535/29133; handler không dùngbảng đó|
|P1|Thưởng phụ4022|extraPrice rỗng vẫn cộng1xu cá mỗi lần|Đã tái hiện2lần, delta2; chưa suy ai đã khai thác|
|P1|Kỹ năng cá4030/4031|Không kiểmfishUID, slot/cá có thật, skillhợp lệ hoặcitem338; tạo cá khi slotrỗng, chấp nhận skill từrequest|Backendserver-authoritative còn thiếu, clientkhông phải nguồnủy quyền|
|P1|Mở hộp cá linh hồn4063|Bỏqua itemId/inventory, chỉ tínhcount và phátBạc|Requestboxkhông tồn tại vẫnsuccess; không gọi lênproduction|
|P2|Tẩy cần4012|Không trừFishBaseConfig.washCost135×10; trả{id,value} thay{type,value,level}|Client đọctype/level nên tên/phẩmchất/chỉsố có thể hiển thị sai; fieldmismatch chắcchắn|
|P2|Ngư cụ/mồi/bãi câu|Rod/raftswitch nhậnIDchưa mua; mồi chưa có vẫnđược chọn; đổi scene khôngkiểmlevel/openDay|Fixturelevel1 vào bãi yêu cầulevel2; không kết luận UI cho bấm tất cả|
|P2|Pool cá|Generator chọnngẫu nhiên toànFishConfigtype1–10, không theo FishSceneConfig.fishes|Bãi1 ra cátype10 ngoài pool đã định; chưa xác minh phânphối gốc/bait/tide/rod đầyđủ|
|P2|Giới hạn ngư cụ|Rankmax10 vẫn nângthành11 bằng fallbackcost|Không cóconfig11; consumecrystal vàstatevượt bảng đã tái hiện|
|P2|Đơn hàng ngày|Không có xửlýdayboundary; received/progress cũ vẫn tồn tại sauensure/login|Đường refresh thủ công chỉreset3IDcốđịnh; cần lịch/mốc reset chính thức|
|P2|Kỹ năng tạm relog|playerPayload.normalizeFishEntity bỏtempSkills|DBcòn lựa chọn tẩy nhưng login không gửi lại; không đồng nghĩa DBđã xóa|
|P2|Cá linh hồn xử lý|Deal thay tất cả theo thứ tự, cá yếughiđè cá mạnh/lock; catchlầnmới cũngghiđèpending|Overwrite đã tái hiện; cần đốichiếuchínhsách giữ/bán khi auto/manual trước fix|
|P2|Chỉ số combat|BattleService cộngattrs thô nhưng client nhân thêmfishSoulAdd/đặcquyền/bonus khác|Probe fishSoul7011:server1000,client1040 cho cùngslot; chưa audittoànPVP/PVE|

Không cộng sốprobe thành sốnhân vật bị lỗi. Các probe gọi trực tiếp handler âm tính nhằm kiểm bảo vệ server, không chứng minh người chơi có nút UI để thực hiện hoặc đã lợi dụng lỗi thưởng.

### 3.4 Những điểm chưa đủ kết luận

- Chưa xác minh toàn bộ tỷ lệ cá hiếm, dị chủng, đồ rơi, thủy triều, event-bãi đặc biệt hay đặc quyền câu cá theo bản gốc. Source hiện có dấu hiệu chọn pool chung và nhiều nhánh simplified; cần contract/gốc trước sửa.
- Chưa xác định con cá cụ thể nào trong screenshot là con mới vừa bị mất hoặc thời điểm giữ chính xác. Ảnh không cung cấp UID/multi trước đó; không thể khôi phục RNG lịch sử bằng suy đoán.
- Chưa test native UI live, relog nhân vật thật, restart server hoặc DBwrite. Đã dùng hàm client trích và payload login trong bộ nhớ để chứng minh luồng dữ liệu.
- Lock ordinary basket: source không dùnglock làmguardPUT_IN, nhưng chưa kết luậnchínhsách “khóa” phải chặnmọi thay thủcông; cần kiểmcontractUI trước sửa.

## 4. Kỹ năng / kinh nghiệm mới

- Khi “mất sau relog”, so cá mới client, slot saved và login payload theoUID/multi/attrs/skills. Chỉ kiểm fishID hoặc awaitsave tồn tại là không đủ.
- Normalizer không nên tự random hoặc bỏ field quan trọng; hiện nhiều nhánh ensure có thể tái tạo entity thiếufield, chelỗi dữ liệu gốc.
- Client tự cậpnhật local ownership/kỷlục không thaycho server persistence. Giỏ cócá nhưngpicsrỗng là dấu hiệu cần đốichiếu luồngdeal.
- Với quà/consume phải reject trướcmutation, saveđãxácnhận trướcsuccess, có replayguard. UIgate không thay backendvalidation.
- Giữ separate lanes: statstorage, catalogprogress, gearcost, economyreward, nativepayload và combatformula; tránh sửa tấtcả bằng mộtwrapper hoặc đặt lại DB.

## 5. Trạng thái hiện tại

-21 probe chạy không lỗi harness, đều ghi evidence hành vi bất thường; chức năng **chưa được sửa**.
- Lỗi chính đã đốichiếu trực tiếp sourceproduction và actual client callback, payload login. Snapshot nicky phù hợp dấuhiệu stat cũ.
-51 profile có giỏcá (43S1,8S2) đều cópicsrỗng tại snapshot; không phải tấtcả742profile câu cá đềuđãchơi.
-7hash hậukiểm khôngđổi. Local/livefish.js khác hash nên candidatefix sau phải bắtđầu từproductionbaseline, khôngcopytoànlocal.
- Khôngphátbù,khôngtiêuquà,khôngDBmutation/restart. Lịch sửWebGM/ngoạiquan và input-freeze đangtạmdừng giữ nguyên.
- Mongoose warningisNewreserved phát sinh lúc importfixture, khônglàmprobe fail; khôngsửaschema vì auditnày.
- BáocáoUTF-8 gồmMDvàHTML; log/source snapshot khôngđược đónggói để public.

## 6. Bước tiếp theo đề xuất

1. Khi được yêu cầu sửa: P0/P1 đầu tiên là PUT_IN giữ đủentity, trảlại đúngcá cũ, bảo vệpendingfish và savenull/throw. Test UID/multi/fullattrs trước-sau qua handler→client→DB/relog/restart.
2. Đồng thời chặn các nhánh thưởng nhậnlặp/freegrant đã chứngminh; không đổilại pool/giá trị bằng mặcđịnh tùyđoán.
3. Sửa sổcá và kỹnăngtemporary persistence; thống nhất côngthức combat/client và gatecost/gear/rank/scene.
4. Cá linhhồn/đơnngày/tỷlệcá và event cần contractconfig/gốc, regression riêng; không gộp nhẹ như lỗiUI.
5. Repair chỉ sau fixnguồn, cópreview/preimage: chỉ có thể bảo toàncá cònstateđủ. Muốn bùcá đã mất cầnreceipt/backup cụthể; không tựreroll hoặc nânghàngloạt để “chođúng”.

**Kết luận bàn giao: lỗi “cá mạnh vào lại mất chỉ số” là lỗi server đã xác nhận; cần sửa tính năng câu cá theo các nhóm trên, không chỉ xóa cache client.**
