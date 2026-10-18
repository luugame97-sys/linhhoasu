# Hoàn thiện câu cá và mở lịch sự kiện — 06/09/2026

**Đã phát hành trên S2 rồi S1. Bản gộp lên lúc 19:00–19:01; guard hồ sơ thiếu dữ liệu lên lúc 19:12 UTC+7. Hậu kiểm hash, runtime và log sau phát hành đạt.** Đây là bảng cân bằng riêng được chủ dự án đồng ý, không phải phục hồi tỷ lệ RNG chính thức bản Trung. Không đền bù, không reset/reroll vật phẩm hoặc tiến độ lịch sử của người chơi.

## 1. Tóm tắt công việc

### 1.1 Câu thường, linh hồn và hiệu ứng vật phẩm

- Thêm bộ sinh kết quả câu thường/linh hồn phía server: hụt, thoát, cá thường/biến dị, trọng lượng, di vật, kho báu và cá đặc biệt. Pool di vật bám ngư trường; mảnh type104 vào túi và bộ sưu tập.
- Áp dụng hiệu ứng mồi tập trung/sức mạnh/đúng loài/đúng cá/phẩm chất, mồi cao cấp, hiệu suất cần/bè và các passive đã mô tả trong cấu hình. Mồi 5542/5543 bảo đảm phẩm chất ít nhất 7/9, tỷ lệ biến dị 50%; giữ kỷ lục trọng lượng liên quan. 5542 còn không hạ phẩm chất so với cá đang trang bị cùng loại.
- Chu Tước 5905: 10% cá đôi, mỗi cá có UID riêng và cờ `isDouble` do server cấp. Bạch Hổ 5906: 10% nhân đôi quà đơn hàng. Thanh Long 5907: nhân đôi tỷ lệ biến dị nền. Hiệu lực theo sở hữu đối với các passive này.
- Cần vàng 5904: thêm 10% Ngư Tệ vào sổ `extraPrice`, giữ phần lẻ; nhận bằng luồng 4022 gốc. Auto đồng bộ số bonus. Không cộng thẳng lần thứ hai vào túi.
- Cá đặc biệt 542x–545x, thưởng bán từ cần/bè, cơ hội mồi thêm từ bè 6203 được xử lý server-side. Bè 6209 tăng 5% tốc độ và trần hồi thể lực: chu kỳ 300 giây / 1,05; trần 168 thay vì 160. Không cấp hồi tố khi mới có mốc hồi.
- Câu, xử lý cá và thao tác sự kiện dùng requestId/revision, lưu xác nhận trước khi trả thành công; chống gửi lại sinh cá hoặc trừ vật phẩm lần nữa. Câu hụt có kết quả rỗng hợp lệ và chi phí được lưu một lần. Cooldown nền câu thường 1.200 ms, linh hồn 1.500 ms; linh hồn tiêu 3 thể lực/lượt.

### 1.2 Bảng tỷ lệ riêng đã áp dụng

Nguồn chỉnh cân bằng: `linhhoasu/lhs/newServer/src/config/fishingGameplayBalance.json`, phiên bản `custom-fishing-20260906-v1`.

| Cơ chế | Giá trị nền | Điều kiện và cách hiểu |
|---|---|---|
| Câu thường hụt / thoát | 4% / 2% | Giảm theo hiệu ứng mồi tương ứng; mồi cao cấp đi nhánh bảo đảm cá |
| Di vật | 2% | Cùng khoảng chia kết quả với hụt/thoát; chỉ khi map có pool; thuộc tính di vật có thể tăng |
| Kho báu | 1% | Roll có điều kiện sau khi không rơi vào hụt/thoát/di vật, không phải 1% tuyệt đối mọi lượt |
| Biến dị thường | 5% | Trên pool có biến dị; áp dụng bonus Thanh Long/mồi; mồi 5542/5543 là 50% |
| Cá lớn | 10% | Cộng hiệu ứng mồi; multi thường 10.000–11.999, lớn 12.000–20.000 |
| Linh hồn hụt / thoát / biến dị | 7% / 3% / 3% | Cá được chọn ngẫu nhiên theo cấp mở và phẩm chất, không duyệt tuần tự danh mục |
| Hộp linh hồn | 3% | Roll sau lượt thành công; chỉ phát 94821/94822 tương ứng hai skin đã đủ tài nguyên |
| Vé mini-game / Ngư Vương | 5% / 2% | Chỉ tại map của sự kiện đang chạy; không phát vé sự kiện khi câu map thường |
| Chai 214 / lưới 215 | 5% / 2% | Hai khoảng rơi riêng khi sự kiện chai trôi đang chạy đúng map |

Trọng số phẩm chất thường 2/3/4/6/7/9: `4000/3000/1800/800/350/50`; linh hồn 2/3/4/6/7: `4200/3000/1700/900/200`. Đây là trọng số trong tập đủ điều kiện, không phải tỷ lệ tuyệt đối trên mọi lượt câu. Di vật bán 50 Ngư Tệ là giá cân bằng riêng. Các tỷ lệ đã quảng bá sẵn như Chu Tước/Bạch Hổ 10%, Thanh Long x2, mồi cao cấp 50% được giữ nguyên.

### 1.3 Sự kiện, quà và lịch nối tiếp

- Mỗi thời điểm chỉ một sự kiện type33; instance có khóa `F{id}_{startTimestamp}`. Không mở thêm các bản sao vùng hoặc 14 ID thiếu metadata thành sự kiện mới.
- Cửa sổ 90 ngày: **19:00 06/09/2026 đến trước 19:00 05/12/2026, UTC+7**. Mỗi kỳ 7 ngày; kỳ cuối có 6 ngày để khớp thời hạn. Hết cửa sổ thì ngừng mở kỳ mới, không tự gia hạn.
- Đại hội câu cá 6006 chạy cùng kỳ, yêu cầu cấp nhân vật 55. Nếu có Đại hội type6 khác đang hoạt động, giữ quyền hiển thị của sự kiện đó, không chiếm đầu vào của nó. Ngư trường sự kiện vẫn cần mở hệ thống câu cá 215.

| Kỳ | ID | Nội dung | Bắt đầu → kết thúc, đều 19:00 UTC+7 |
|---|---|---|---|
| 1 | 33001 | Ngư trường xoáy 1 | 06/09 → 13/09 |
| 2 | 33002 | Ngư trường xoáy 2 | 13/09 → 20/09 |
| 3 | 33201 | Ngư Vương — Bờ tuyết băng giá | 20/09 → 27/09 |
| 4 | 33202 | Ngư Vương — Anh Mộc Hoa Đảo | 27/09 → 04/10 |
| 5 | 33203 | Ngư Vương — Bích Hải Tinh Than | 04/10 → 11/10 |
| 6 | 33204 | Ngư Vương — Bên dòng sông Lưu Xuyên | 11/10 → 18/10 |
| 7 | 33301 | Chai trôi — Bích Hải Tinh Than | 18/10 → 25/10 |
| 8 | 33302 | Chai trôi — Bên dòng sông Lưu Xuyên | 25/10 → 01/11 |
| 9 | 33303 | Chai trôi — Bờ tuyết băng giá | 01/11 → 08/11 |
| 10 | 33304 | Chai trôi — Anh Mộc Hoa Đảo | 08/11 → 15/11 |
| 11 | 33001 | Lặp vòng: ngư trường xoáy 1 | 15/11 → 22/11 |
| 12 | 33002 | Lặp vòng: ngư trường xoáy 2 | 22/11 → 29/11 |
| 13 | 33201 | Lặp vòng: Ngư Vương băng giá | 29/11 → 05/12 |

Mở rương/tìm vật dùng vé và bảng quà `Activity33RewardConfig`. Đánh cá lớn dùng mức sát thương trong config nhưng kết quả do server roll theo bảng riêng, chờ ACK mới chạy kết quả client; không tin sát thương/con trỏ do client khai. Sát thương tích lũy, tiêu vé khi kết thúc một ván. Đại hội có 8 nhiệm vụ 60601–60608, 4 vòng, mỗi vòng 3.000 lượt; ghi sổ nhận riêng và chặn nhận lặp qua cả đường RPC tương thích.

BXH dùng điểm người chơi thật cùng server, loại bot; top100 và tính thứ hạng cá nhân ngoài top100, phá hòa bằng playerId. Chốt thưởng sau khi kỳ kết thúc ít nhất 60 giây, cấp vào lần đăng nhập/heartbeat kế tiếp và đánh dấu đã cấp cùng lần lưu. **Không có cam kết gửi thư ngay cho toàn bộ người offline.**

Chai trôi dùng Mongo chung theo instance, giữ chỗ nguyên tử và outbox bền vững; không tự vớt chai của mình. Mỗi chai một lượt trả lời/khen từ người giữ; giới hạn 3 khen/ngày và 10 thả/ngày. Dùng lưới 215 vẫn có thể vớt rỗng; đây là kết quả được xử lý riêng. Quà trả chai theo config 216, chống nhận lại. Các giới hạn ngày giữ chuẩn GMT+8 đang dùng của game, không tự đổi múi giờ reset toàn hệ.

Danh mục gói cần/bè được nối vào native trong cửa sổ sự kiện, giữ giá, thời hạn thẻ và purchase limit. Huyền Vũ là thẻ đặc quyền, không phải một sự kiện type33 độc lập; bản sửa quà ngày trước đây được giữ. Điều kiện ngày 43/57 của một số cần/gói vẫn giữ; không đồng nghĩa đã bỏ mọi điều kiện ngày của mọi vật phẩm.

### 1.4 Thiên Công và bố cục 4 người

- Hỗ trợ skin 190051/190052: đổi 100 mảnh 190001/190002 qua shop 13190051/13190052, kiểm sở hữu khi đổi skin 6751. Không tiêu lại khi đã sở hữu. Mỗi skin đủ điều kiện thêm 10% thuộc tính kiến trúc, hai skin là 20%; không phải cộng thẳng 20% toàn bộ lực chiến.
- **190053–190055 chưa mở** vì thiếu mapping/config/asset native. Không tự dựng ba skin này và không tiêu mảnh để đổi thành item không dùng được.
- Thu gọn actor trong cảnh câu cá còn 0,76; thời trang lớn fit tối đa 300×300 sau tải. Không thay kích thước nhân vật ở toàn bộ game, quyền sở hữu hoặc chỉ số. Tái sử dụng slot hiệu ứng dây câu khi một lượt Chu Tước tạo nhiều cá.
- Render bằng chính Egret/Spine, FishEntity, bè và skin game: bốn bè 6207–6210, cần 5905–5908, bộ 28010/28020/28030/28040. Ba viewport 360×640, 390×844, 768×1024 đều ready và không báo lỗi runtime. Bộ lớn thứ tư được fit còn 0,6 trong actor 0,76; bốn chỗ tách biệt ở các khung đã chụp.
- Đây là kiểm thử màn hình mô phỏng có runtime/asset native thật, **không phải nghiệm thu trên thiết bị vật lý**, không phủ mọi bộ đồ, mọi frame chuyển động, đầy đủ UI sản phẩm hay tất cả GPU.

Ảnh kiểm chứng: [điện thoại nhỏ](../temp/fishing_full_candidate_20260906/four-players-android-small.png), [điện thoại dài](../temp/fishing_full_candidate_20260906/four-players-iphone-tall.png), [tablet](../temp/fishing_full_candidate_20260906/four-players-tablet.png).

## 2. File/thư mục đã thay đổi

### Source chính: 20 file server và 2 file client

Gốc server local: `linhhoasu/lhs/newServer/`; production: `/linhhoasu/lhs/newServer/`.

| Nhóm | File |
|---|---|
| Thêm config/model | `src/config/fishingGameplayBalance.json`, `src/db/models/FishingBottle.js` |
| Thêm service | `FishingGameplayService.js`, `FishingEventSchedule.js`, `FishingEventService.js`, `FishingEventGateService.js`, `FishingKnownEffectsService.js`, `HomelandSkinUnlockService.js` trong `src/services/` |
| Sửa handler | `account.js`, `activity.js`, `basic.js`, `fish-soul.js`, `fish.js`, `homeland.js`, `item.js`, `playerPayload.js`, `task.js` trong `src/handlers/` |
| Sửa service cũ | `src/services/BattleService.js`, `FishingAutoService.js`, `FishingIntegrityService.js` |
| Client native/cache | `linhhoasu/webgame/game/js/main.min_a6195824.js`, `linhhoasu/webgame/game/index.html`; token `20260906_fishing_full_v1` |

Guard bổ sung chỉ sửa cách đọc state trong `FishingEventSchedule.taskRows`, không thay config hoặc bundle client. Manifest đầy đủ đường dẫn và hash nằm ở [changed-files.json](../temp/fishing_full_candidate_20260906/changed-files.json).

### Tool, artifact và backup

- Tạo/cập nhật tool dưới `_ai_workbench/tools/`: `test_fishing_gameplay_events_20260906.js`, `test_fishing_mongo_integration_20260906.js`, `build_fishing_gameplay_client_20260906.js`, nhóm `prepare/probe_fishing_visual_runtime/assets_20260906`, fixture `fishing_visual_runtime_20260906.html`, `fishing_legacy_regression_adapter_20260906.js`, `stage_fishing_full_20260906.py`, `deploy_fishing_full_20260906.py`, `qa_fishing_full_live_20260906.js`, `sync_fishing_full_local_20260906.py`, `sync_fishing_full_client_20260906.js`.
- Tool cuối phiên: `finalize_fishing_full_20260906.js`, `verify_fishing_full_residue_20260906.py`, `test_fishing_event_payload_guard_20260906.js`, `release_fishing_payload_guard_20260906.py`. Dùng lại `render_session_report.py` để sinh đầy đủ bản HTML.
- Candidate/evidence: `_ai_workbench/temp/fishing_full_candidate_20260906/`. Baseline bất biến: `temp/fishing_events_audit_20260906T093353Z/`.
- Staging VPS: `/linhhoasu/_ai_workbench/temp/fishing_full_20260906_115713`, guard trong `payload-guard/`.
- Backup VPS: `/linhhoasu/_ai_workbench/backups/fishing_full_20260906_115713`, guard trong `payload-guard/`. Bản trước khi phát hành và trước khi sửa guard đều còn.
- Backup local: `_ai_workbench/backups/fishing_full_release_local_20260906/`, `fishing_full_release_reports_20260906/`, `fishing_payload_guard_20260906/`.
- Báo cáo chuyên đề MD/HTML này, `session_report.md/.html`, `checkpoint.json`, manifest và evidence kiểm thử. Không tạo file hỗ trợ ngoài root, không sửa global memory hoặc các bản tham chiếu.

## 3. Lỗi đã gặp & giải pháp

| Lỗi / dấu hiệu | Nguyên nhân | Cách xử lý | Cách tránh lặp lại |
|---|---|---|---|
| Câu không có hụt, linh hồn duyệt tuần tự, hiệu ứng chỉ ở mô tả | Thiếu bộ sinh xác suất nền và đọc hiệu ứng | Tách bảng riêng có provenance, RNG server, pool/gate đúng map/cấp | Boundary, mô phỏng lớn, đối chiếu tỷ lệ quảng bá |
| Bonus vàng thiếu hoặc nguy cơ cộng hai lần | Luồng bán chưa dùng sổ thưởng 4022 | extraPrice + phần lẻ, đồng bộ auto, claim một lần | Bán tách/gộp/relog/replay |
| Mini-game thành công nhưng quà rỗng, event tự mở từ RPC | Stub handler và tự seed thời hạn | Lịch instance cố định, gate, vé/quà/lưu xác nhận | Inactive RPC phải từ chối; thay kỳ không trùng |
| BXH chỉ có bản thân, chai riêng từng người | Không có truy vấn điểm/kho chai chung | Mongo rank và bottle atomic/outbox | Hai người thực, save lỗi/commit-timeout/retry |
| Nhiệm vụ nhận lặp, mất quà khi đổi vòng | Counter/claim chung chưa theo kỳ | Ledger 8 nhiệm vụ, 4 vòng, chốt thưởng một lần | Test đủ 4 vòng và đường RPC tương thích |
| Thiên Công đổi ID không sở hữu/không có renderer | Tin client; không kiểm config/map | Chỉ hai skin đủ điều kiện, guard sở hữu và buff kiến trúc | Không suy có item là có native skin |
| Thời trang lớn đè vùng câu người khác | Actor/Spine vượt vùng ghế | Scale tại cảnh câu, fit role sau load | Render native 4 người trên ba viewport, còn kiểm máy thật |
| Core lỗi `reading eventStats` sau 19:00 | `taskRows` giả định fishInfo đã khởi tạo; trước giờ mở đi nhánh return nên chưa lộ | Optional access cho fishInfo/eventStats, trả danh sách rỗng không sửa hồ sơ | 6 test thiếu/null/state rỗng và trước/sau mốc lịch; chạy core lúc event active |
| Hash local khác candidate nhưng logic giống | CRLF/LF trộn ở homeland.js và index.html | So byte và bản chuẩn hóa newline; giữ file local, không copy đè | Lưu cả hai hash, không báo khác hash là khác logic |
| Fixture cũ lỗi revision/alias sau clone-save | Đổi contract request và thay đối tượng session.player | Adapter riêng chỉ cho suite cost/storage, đọc state sau commit | Không dùng adapter để chứng minh RNG mới |
| Visual fixture lỗi atlas/lang ở lần đầu | Asset nén và schema ngôn ngữ không như giả định | Giải theo định dạng thực, nạp runtime/assets native | Không thay bằng UI HTML giả hoặc đo screenshot trống |
| Lệnh công cụ tìm path/tính lịch sai cú pháp | Đoán đường dẫn hoặc lỗi one-liner | Dò đường dẫn thực, chạy lại lệnh đọc với output giới hạn | Không dùng lỗi tool làm kết luận gameplay |

Không có mojibake mới trong các phần thêm; source/report UTF-8. Cảnh báo Mongoose `isNew` của schema cũ được ghi nhận, không đổi model ngoài phạm vi để giấu warning. Việc đồng bộ newline không phải sửa mã hóa tiếng Việt.

## 4. Kỹ năng / kinh nghiệm mới

- Test trước giờ mở sự kiện không chứng minh nhánh sau giờ mở an toàn. Cần kiểm cả payload thiếu state, ranh giới lịch và relog.
- Tách tỷ lệ nền tự thiết kế với tỷ lệ quảng bá có nguồn; xác suất có điều kiện không được trình bày như tỷ lệ tuyệt đối.
- Cần/bè có thể là gói/entitlement, không phải mỗi món là một sự kiện riêng. Một selector native chỉ chọn một type thì phải lịch nối tiếp.
- Lưu vật phẩm và receipt trước phản hồi; tác động sang collection chai dùng outbox idempotent, không phát thưởng lại khi mất ACK.
- Bộ regression cost/storage có adapter không kiểm chứng phân phối RNG. Kiểm RNG bằng generator thực và mô phỏng riêng; kiểm Mongo bằng DB QA thật.
- Sprite/Spine native render trên viewport emulation hữu ích cho bounds, nhưng không thay nghiệm thu GPU/thiết bị thật hoặc mọi bộ thời trang.

## 5. Trạng thái hiện tại

### 5.1 Kiểm thử

| Bộ kiểm | Kết quả | Giới hạn |
|---|---|---|
| Staging bản gộp | 217 nhóm PASS = 30 gameplay/event + 34 known + 21 auto + 38 gear + 70 balance + 24 daily | Gear/balance dùng adapter cho contract cũ; không dùng chúng để xác nhận RNG |
| Guard payload bổ sung | 6 ca mới PASS; chạy lại 30 nhóm gameplay/event và core trên Linux | Tổng 223 nhóm phân biệt của đợt; không cộng lại 30 ca rerun thành ca mới |
| Core contract cuối phiên | PASS local và Linux, đọc 714 bảng | 714 là số bảng, không phải 714 ca test; hạ tầng của core được stub |
| Đồng bộ local | 22/22 tương đương nội dung chuẩn hóa, 20/22 khớp byte; 20 file JS qua `node --check` | Hai lệch newline: homeland.js/index.html; main khớp byte |
| Mongo integration thật | PASS trên DB riêng `lhs_qa_fishing_5f842f10e504` | Catch/relog, chai hai người/outbox, rank/settlement; cleanup player/bottle đều 0, không drop database |
| Live QA S2/S1 | PASS cả bản gộp và sau guard: premium, replay, auto, unlock/đổi skin/relog, linh hồn, vé mini-game/quà lặp | Chỉ nhân vật QA riêng; không test mua trả tiền mới hoặc mọi kỳ event bằng client native |
| Native render | Ba viewport, bốn bè/bộ đồ, ready=true, errors=[] | Không phải máy thật; chưa mọi frame/bộ đồ/UI |

Evidence chính: [stage-full.json](../temp/fishing_full_candidate_20260906/stage-full.json), [stage-payload-guard.json](../temp/fishing_full_candidate_20260906/stage-payload-guard.json), [deploy-full.json](../temp/fishing_full_candidate_20260906/deploy-full.json), [deploy-payload-guard.json](../temp/fishing_full_candidate_20260906/deploy-payload-guard.json), [local-final-checks.json](../temp/fishing_full_candidate_20260906/local-final-checks.json), [visual-runtime-probe.json](../temp/fishing_full_candidate_20260906/visual-runtime-probe.json).

### 5.2 Hậu kiểm production

- 19:12:52 UTC+7: **163 artifact khớp expected**, HTTP ready 8080/8083 đều 200; main/index đang được HTTP phục vụ đúng hash.
- S1: PID 13770, restart 1380. S2: PID 13681, restart 48. Mỗi server tăng hai restart trong đợt: bản gộp và guard; không giấu lần restart bổ sung.
- Bốn tiến trình khác giữ nguyên: dist PID 30824, admin 30856, bot S1 1600, bot S2 1576. Không restart Mongo/Nginx hay tác động dịch vụ khác.
- QA prefix `qafull_`: player/mail/bottle đều 0 ở hai DB. 19:12:55: Redis session QA 0 và process harness 0. Không xóa rank diện rộng; QA đặt arena/tower score bằng 0, playerId ngẫu nhiên nên kiểm prefix không chứng minh rank cleanup.
- Kiểm log bổ sung lúc 19:55:52 UTC+7: đọc tối đa 256 KiB cuối mỗi log PM2 của S1/S2; phần có timestamp sau guard có 1.917/1.820 dòng stdout, 0 dòng lỗi và 0 lỗi eventStats. Stderr không có dòng timestamp mới trong mẫu đọc; đây là kiểm mẫu đuôi log, không chứng minh toàn bộ lịch sử sạch lỗi. Redis QA/process harness vẫn 0.
- Tại thời điểm chụp có 8 profile S1, 3 profile S2 được gán event33001; không suy rằng tất cả người online đã thấy cửa vào native.
- Hậu kiểm xác nhận lại lúc 19:57:09 UTC+7: 163 hash/HTTP main/index vẫn đúng, PID/restart không đổi, ready 2/2 đạt, QA player/mail/bottle vẫn 0. Số profile có event33001 là 13/7 ở S1/S2; đây vẫn chỉ là thống kê dữ liệu, không thay nghiệm thu UI.
- Không có bù hoặc reset dữ liệu người thật. Chỉ QA do phiên tạo đã được dọn; backup source còn phục hồi được. Không chạy lại harness phòng cũ đã WITHDRAWN. Lỗi input-freeze đang pause không bị sửa.

| Artifact | SHA-256 |
|---|---|
| Main được phục vụ | `1bf3dee62af6eb3cf1059c3b9bb6d63475c8380d83d27c7a5ac8940e047d38b6` |
| Index được phục vụ | `a718167070f38479b6c70c70677da8188bea522293490765e1fa80eec9a337fd` |
| FishingEventSchedule sau guard | `56489f8c255aeb05959541655fa7f85b278c869c568adc999da4a2bedc02b467` |

### 5.3 Chưa nghiệm thu hoặc chủ động giữ lại

Ba skin 190053–190055 thiếu tài nguyên vẫn khóa; toàn bộ 10 kỳ chưa được chơi E2E trên production (ranh giới/gate đã test). Chưa có nghiệm thu thiết bị vật lý, mọi skin/animation, luồng trả tiền mới hoặc mail tức thời cho người offline. Giữ gate ngày của gói/cần riêng. Không tuyên bố toàn hệ câu cá hoặc toàn game hết lỗi 100%.

## 6. Bước tiếp theo

1. Reload game một lần để nhận bundle mới; kiểm ngư trường xoáy đang mở, Đại hội nếu đủ cấp và không xung đột type6, phần bonus vàng nhận riêng, bốn người cùng phòng và khung auto.
2. Nghiệm thu trên điện thoại/tablet thật với bộ đồ người chơi đang dùng; nếu còn che nhau cần ảnh và tên/ID bộ đồ để chỉnh đúng asset, không scale toàn game.
3. Ba skin Thiên Công còn lại chỉ triển khai khi có mapping/config/assets gốc phù hợp hoặc quyết định thiết kế riêng; giữ nguyên mảnh hiện có.
4. Khi muốn gia hạn sau 05/12/2026 hoặc thay cân bằng, sửa file bảng riêng và kiểm lại lịch/receipt; không reset instance hay cấp lại quà cũ. Không tạo automation nền theo dõi khi người dùng chưa yêu cầu.

Trạng thái tiếp tục nằm trong [checkpoint.json](../temp/fishing_full_candidate_20260906/checkpoint.json). Không chạy lại bước `deploy` của bản gộp trên baseline cũ; hậu kiểm dùng `deploy_fishing_full_20260906.py verify` với expected sau guard.
