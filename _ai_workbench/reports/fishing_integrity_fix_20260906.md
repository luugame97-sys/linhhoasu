# Session Report — sửa tính toàn vẹn câu cá

Ngày 06/09/2026, hoàn tất kiểm tra lúc 06:38 UTC+7. **Đã triển khai bản sửa dữ liệu và các chốt an toàn lên S1/S2. Không phát bù, không chạy repair/reroll cá người chơi. Chưa tuyên bố toàn bộ tính năng câu cá hoàn chỉnh.**

## 1. Tóm tắt công việc

- Tiếp tục audit trước từ snapshot production `_ai_workbench/temp/fishing_audit_20260905T232035Z/`, không dùng source local cũ làm baseline deploy.
- Sửa PUT_IN lưu toàn bộ cá mới: ID, UID, multi, attrs, skills, tempSkills, lock và dead. Khi thay, cá cũ thật quay về danh sách chờ; không sinh cá ngẫu nhiên thế chỗ.
- Bảo vệ cá chưa xử lý, giỏ khóa, UID trùng/không hợp lệ và multi-put. Client nhận cá bị thay theo replaceUid, sau callback đối chiếu lại state server. Client cũ chưa có integrityVersion không được multi-put nhiều cá trong một request.
- Sổ cá/pics và kỷ lục chất lượng được ghi cho giao dịch mới hoàn tất. Không backfill lịch sử hay tự tính lại stat của cá cũ.
- Tất cả save trong hai handler câu cá đều đợi xác nhận. Save null hoặc exception vô hiệu state phiên, không ACK thành công và không giữ state chưa xác nhận cho save lúc disconnect.
- Sửa điều kiện/thưởng fetter, nhật ký, extraPrice; chặn nhận lặp; nhật ký tiêu hao đúng cấu hình và mốc cuối cấp thời trang bằng native ownership + push1800.
- Kiểm sở hữu cần/bè, hạn thẻ đặc quyền, mồi đang chọn, cấp/ngày mở khu và giới hạn rank. Pool câu thường chỉ lấy cá thuộc khu đang câu.
- Kỹ năng kiểm cá thật/UID/chất lượng/chỉ số ô, tốn338 theo cấu hình, random phía server từ danh mục skill hợp lệ; giữ preview qua relog, replace chỉ lấy preview server. Native panel gửi skill hiện tại để kiểm stale-state, không gửi skill preview.
- Giữ vị trí skills có giá trị0; trả tempSkills ở login. Combat tính phần cộng từ linh hồn, cần/bè và thẻ theo đúng thứ tự phép tính native.
- Thêm chốt phản hồi thất bại cho24 callback câu cá native. Lỗi không còn bị client tự xử lý như thành công; auto-fish dừng và có thông báo.

## 2. File/thư mục đã thay đổi

### Source chính — production và local đã đồng bộ

| File | Vai trò |
|---|---|
| `linhhoasu/lhs/newServer/src/services/FishingIntegrityService.js` | Mới: persistence, validation, ngày, scene, collection, multiplier, native reward |
| `linhhoasu/lhs/newServer/src/handlers/fish.js` | Giữ/thay/câu cá, thưởng, gear, mồi, đơn và chốt an toàn |
| `linhhoasu/lhs/newServer/src/handlers/fish-soul.js` | Kỹ năng, bảo vệ pending linh hồn, chặn hộp chưa có pool |
| `linhhoasu/lhs/newServer/src/handlers/playerPayload.js` | Giữ skill theo ô/tempSkills, không tái sinh attrs rỗng, reset đơn theo ngày khi login |
| `linhhoasu/lhs/newServer/src/services/BattleService.js` | Áp multiplier cá tương ứng client |
| `linhhoasu/webgame/game/js/main.min_a6195824.js` | Callback native: reject lỗi, swap theo UID, đồng bộ state |
| `linhhoasu/webgame/game/index.html` | Cache key `20260906_fishing_integrity_v1` |

Local fish.js khác live chỉ một dòng trống; fish-soul.js khác tùy chọn returnSaved. Đã kiểm diff và backup trước khi áp patch, không chép đè toàn bộ cây source.

### Tool hỗ trợ và evidence

- Tools trong `_ai_workbench/tools/`: `inspect_fishing_fix_contracts_20260906.js`, `build_fishing_client_integrity_20260906.js`, `test_fishing_integrity_20260906.js`, `release_fishing_integrity_20260906.py`, `qa_fishing_integrity_live_20260906.js`, `run_fishing_integrity_live_20260906.py`, `sync_fishing_integrity_local_20260906.py`, `final_fishing_integrity_check_20260906.py`.
- Candidate/evidence: `_ai_workbench/temp/fishing_fix_20260906/`. `tests.json`, `stage.json`, `client-build.json`, `deploy.json`, `live-qa.json`, `final-check.json`, `local-sync.json`.
- Backup production: `/linhhoasu/_ai_workbench/backups/fishing_integrity_20260905_233511/`. Có6 preimage và1 file helper mới; rollback source không rollback DB gameplay đang diễn ra.
- Backup local: `_ai_workbench/backups/fishing_integrity_local_20260906/`. Backup report: `_ai_workbench/backups/fishing_integrity_reports_20260906/`.
- Gói source-only: `_ai_workbench/temp/fishing_fix_20260906/fishing_integrity_release_20260906.zip`,8 entry, khoảng2,2MB. SHA trong `final-check.json`; không có credential, snapshot người chơi, config hoặc DB. Không upload đè mù gói này lên bản production mới hơn.
- Báo cáo này và `session_report.md` đều có bản HTML đầy đủ. Evidence runtime chỉ dùng nội bộ quản trị, không public.

## 3. Lỗi đã gặp & giải pháp

| Lỗi | Nguyên nhân | Cách xử lý | Cách tránh lặp lại |
|---|---|---|---|
| Cá mới nhưng stat cũ sau relog | PUT_IN chỉ chép ID/UID/quality | Lưu full entity, trả cá cũ thật | So native callback, snapshot save và login payload theo UID |
| Mất cá pending | Lượt câu mới ghi đè result | Reject trước consume, giữ nguyên pending | Test gọi catch lần hai và disconnect |
| Multi-put trả nhầm cá | Client dùng fishInfos[0] cho mọi UID | replaceUid + state authoritative | Test mixed empty/full và version guard client cũ |
| Thưởng free/lặp | Fetter/nhật ký/extraPrice bỏ điều kiện | Prerequisite, cost, cap, record, không fallback quà | Test replay và native fashion ownership |
| Save không xác nhận vẫn success | Bỏ return null/throw-state | Shared awaited save, invalidate state khi uncertain | Test null/throw; không fake rollback sau timeout |
| Tẩy skill tạo cá/nhận skill client tùy ý | ensure tự tạo slot, tin tham số | Kiểm ownership/UID/pool/cost, lưu preview | Actual native panel gửi old skill; test stale/invalid/replay |
| Stat combat không khớp hiển thị | Thiếu bonus linh hồn/gear/card | Công thức và thứ tự làm tròn tương ứng native | AST native function + BattleService thật |
| Làm mới đơn mở lại quà | Không có cost/gate xác minh | Tạm chặn; thêm ngày và cap index0..2 | Không dùng client gate làm xác thực |
| Tẩy cần/hộp/swap linh hồn chưa có contract | Source đơn giản hóa, config thiếu bảng chuẩn | Tạm chặn nhánh nguy hiểm, giữ cá/item | Không phát bạc hay random giá trị tự đoán |
| Staging thiếu acorn | VPS chỉ có production dependencies | Đưa parser vào tools của staging | Không npm install/đổi dependencies production |
| Fixture compare false-positive | UID sequence chưa normalize trước before-snapshot | Normalize fixture trước đo | Phân biệt bookkeeping với biến đổi cá/item |
| Probe HTTP404 | Game ở cổng81, không phải80/88 | Đọc lại deploy client cũ, verify served hash ở81 | Dùng URL đã kiểm chứng |

## 4. Kỹ năng / kinh nghiệm mới

- Client optimistic callback có thể bỏ qua result; sửa server mà không sửa callback vẫn khiến UI lệch. Một số tag soul dùng cùng số với push bản đồ, chỉ sửa callback RPC liên quan.
- Tên bảng skill không phải FishSkillConfig. Hai ô dùng FishAttrsConfig/FishSoulAttrsConfig rồi lookup SkillConfig. Panel replace gửi skill cũ, không phải preview.
- Hai binary config server/client khác hash tổng thể nhưng22 bảng Fish* giống nhau; không thay config.
- Mốc ngày theo timezone runtime thực tế +0700. Logger hiển thị +0800; tên thư mục staging là UTC. Không dùng giờ logger để suy giờ deploy.
- Không lấy state screenshot hiện tại làm oracle bất biến: trong lúc xử lý, state tài khoản đó thay đổi qua hoạt động game; final-check ghi rõ false cho full-state comparison. Tool chỉ đọc tài khoản này; mọi write trực tiếp của QA chỉ vào hai UID qa_fish_integrity riêng.

## 5. Trạng thái hiện tại

### Đã xác minh

-27 test in-memory PASS trên Windows và staging Node20 của VPS; socket network bị chặn trong harness. Test callback từ native main.fixed.js, không chỉ mock mô tả.
- Core gameplay contract PASS trên staging và source local sau đồng bộ;714 bảng. Syntax5 file source và main client PASS.
- Live QA cả S1/S2 PASS: login → blocked pending catch → thay cá fixture9000stat/multi19000 → DBsave → disconnect/relog → bán cá cũ → câu thật → giữ → DB → disconnect/relog lần hai. Kiểm reward replay và các nhánh bị hold.
- QA không phải nhân vật người chơi;2 nhân vật QA đã xóa đúng UID/playerId, cuối check còn0. Không gửi thư bù, không trả tiền, không sửa/reroll/backfill cá lịch sử.
- Chỉ restart lhs-s1002 và lhs-s1001 một lần. PID S1=3727, S2=3088;4 tiến trình dist/admin/bot-worker giữ nguyên PID/restart count. Ready8080/8083 đều200.
-150 artifact tracked đã kiểm hash;7 file của release đúng,143 artifact còn lại không đổi. Main/index served HTTP cổng81 đúng hash;22 bảng Fish* server/client giống nhau.
- Error tail không có TypeError/ReferenceError/Unhandled/FATAL/SyntaxError; vẫn có warning Mongoose lịch sử isNew/new-option, không refactor ngoài scope.

### Chưa hoàn tất / đang tạm chặn

| Phần | Trạng thái thực tế |
|---|---|
| Tẩy thuộc tính cần câu | Tạm khóa: chưa có value-range/weight chuẩn; không trừ135 |
| Làm mới đơn | Tạm khóa: chưa xác minh cost/limit; đơn hiện có vẫn nộp/nhận theo điều kiện, ngày mới reset |
| Hộp cá linh hồn94821–94825 | Tạm khóa: AssetsUse type102 rewards rỗng; không trừ hộp, không phát bạc giả |
| Thay linh hồn vào ô đã có cá | Giữ nguyên cả hai và chặn; chưa có chính sách swap/recycle chuẩn, pending này sẽ chặn câu mới đến khi hoàn thiện |
| Random cá linh hồn | Chưa sửa: thuật toán first-N/deterministic cũ vẫn còn; không gọi đây là RNG chuẩn |
| Tỷ lệ rơi cá thường/skill/di vật/event | Chưa đạt parity gốc. Cá thường giữ random uniform trong pool khu và multi10000–11999 cũ; skill mới uniform theo pool hợp lệ; thiếu weight gốc. Event scene không có pool được chặn |
| UI native trực tiếp | Chưa mở giao diện người chơi để nghiệm thu hình ảnh/chuyển cảnh; đã test callback thật và WS, không thay thế được UI acceptance |
| Persistence qua restart mới sau QA | QA chạy sau deploy/restart và kiểm relog; không restart lần nữa chỉ để thử một cá mới. Chưa có bài test cá QA sống xuyên thêm một lần restart |

**Kết luận:** lỗi giữ cá mạnh rồi relog mất stat đã sửa và qua live QA. Các chốt chống mất dữ liệu/lạm dụng đã đưa lên; các phần thiếu contract đang hold hoặc ghi rõ chưa hoàn thiện, không tuyên bố “fix hết câu cá”.

## 6. Bước tiếp theo

1. Người dùng tải lại trang game/đăng nhập lại để nhận client mới; thử giữ/thay một cá mới và vào lại. Cá đã sai từ trước không tự được nâng hoặc phát lại.
2. Hoàn thiện contract recycle/swap cá linh hồn trước, vì pending đang bảo toàn có thể chặn câu tiếp; tuyệt đối không xóa pending để vượt chốt.
3. Lấy source/config chuẩn cho wash range, refresh cost/limit, soul-box pool, RNG và sự kiện. Test server-authoritative + native callback trước khi mở lại từng nhánh.
4. Nghiệm thu UI câu cá trực tiếp và kiểm qua restart trong cửa sổ riêng khi phù hợp. Không chạy lại deploy/QA cũ mù, không rollback DB từ snapshot cũ.
5. Theo yêu cầu hiện tại: không triển khai đền bù. Báo cáo chỉ lưu tình trạng lỗi lịch sử để tránh lặp lại.
