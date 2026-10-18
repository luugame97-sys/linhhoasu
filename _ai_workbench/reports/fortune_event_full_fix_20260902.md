# Báo cáo sửa toàn bộ sự kiện Kim Mã Chúc Phúc

Thời gian triển khai: 02/09/2026 16:28–19:28 (GMT+7)  
Production: `103.116.105.154`, S1  
Activity: `43001` (Kim Mã/Vận May), `44001` (Niên Thú)

## 1. Tóm tắt công việc

- Audit ảnh, bundle client, 714 bảng config, source và log production.
- Xác định nhiều lỗi độc lập ở gói vận may, nhiệm vụ ngày, quay thưởng, mốc thưởng, Niên Thú, bảng xếp hạng và cửa hàng đổi.
- Sửa server-authoritative trên snapshot production mới nhất; không sửa config phần thưởng và không mua gói trả phí khi QA.
- Backup source cùng toàn bộ document Player của tài khoản QA trước khi thử.
- Chỉ restart `lhs-s1001`; giữ nguyên `lhs-real-bots`, `lhs-dist`, `lhs-admin`.
- QA protocol thật bằng tài khoản `vanduc97`, sau đó khôi phục chính xác trạng thái Player trước QA.
- QA trực quan trong client: đăng nhập S1, mở Gói Vận May, Nhiệm vụ ngày, Vận May Mắn, Niên Thú và bảng xếp hạng.

## 2. Lỗi đã tìm thấy và cách sửa

| Khu vực | Lỗi trước sửa | Nguyên nhân gốc | Cách xử lý |
|---|---|---|---|
| Gói miễn phí | Hiện `getActiveDailyShopPolicy is not a function`, không nhận được | `item.js` gọi helper nhưng `activity.js` live bị lùi phiên bản và không export helper | Khôi phục helper policy/ledger, export đầy đủ, đồng bộ `buyRecords`, giữ giới hạn 1 lần/ngày GMT+8 và chống request đồng thời |
| Nhiệm vụ ngày | Làm nhiệm vụ nhưng luôn `0/x` | Task sự kiện có type `43001 | 1<<30`; progress service chỉ refresh type `1/2/9` | Cho phép task type activity, giữ baseline theo ngày và nối đúng counter của từng gameplay |
| Nhiệm vụ đăng nhập | Đăng nhập nhưng `0/1` | Không có resolver `activeId=101` cho Activity 43 | Hoàn thành đúng khi ngày mới/login normalize |
| Võ đạo hội | Tiến độ không tăng | Activity task không đọc `arenaChallengeCount` | Nối `61002` với counter Võ đạo hội hiện hữu |
| Quái tinh anh | Tiến độ không tăng | Không có counter `activeId=76` | Thêm `eliteMonsterKillCount`, tăng khi Niên thú/quái tinh anh triệu hồi được kết toán qua `2003 -> 2001` |
| Tiêu Bánh bao | Tiến độ không đúng | Không theo dõi riêng lượng item `4` đã giảm trong mọi handler | Theo dõi chênh lệch số dư trong pipeline save, chỉ cộng khi số dư giảm |
| Tiêu Đùi gà | Không tăng | Dễ map nhầm item `6`; Đùi gà thật là item `65` | Theo dõi item `65` qua mọi luồng tiêu/save |
| Tiêu Phá Vân Phù | Không tăng | Không có counter theo item `55` | Theo dõi item `55` qua mọi luồng tiêu/save |
| Bang hội | Không tăng | Không có counter `activeId=77` | Thêm `guildChallengeCount` tại luồng chiến đấu Bang hội type 6 |
| Yêu Vương/Ma Linh | Không tăng ổn định | Activity task bị bỏ qua dù counter gameplay đã có | Tái sử dụng `dungeonBossChallengeCount` và `crossRivalChallengeCount` với baseline riêng của sự kiện |
| Nhận nhiệm vụ | Trả EXP giả hoặc chỉ tăng `row.record` | Generic Activity 43 dùng `{id:3,count:10}`; `TaskConfig.reward=[]`, quà thật nằm ở `Activity43TaskConfig` | Module 1 nhận toàn bộ task đủ điều kiện, phát item `176` đúng config, cộng điểm ngày đúng `score`, chống nhận lại |
| Quà tích lũy lượt quay | Không rõ/không nhận đúng | Module 1 không xử lý `loopRewards` | Mỗi lượt quay cộng `record`; module 1 đổi đúng `loopRewards` và reset record nguyên tử |
| Mốc ngày 20–100 | Nhận EXP giả, quà không về | Module 2 không đọc `Activity43TaskRewardConfig` | Phát đúng 5 mốc, dùng bitmask `records[11]`, nhận một lần, reset GMT+8 |
| Mốc lượt quay | Nhận EXP giả | Module 3 cố định EXP `3×20` | Đọc `ActivityScoreConfig`: mốc 10/25/50/75/100 và vòng lặp, ghi `recordList`, chống nhận lại |
| Quà ngoại quan | Có thể rơi thành item túi nhưng không kích hoạt avatar/khung/chat bubble | Reward helper chỉ cộng bag item | Nhận diện `FashionConfig`, ghi ownership native và đẩy tag `1800`; không để item ngoại quan giả trong túi |
| Quay Vận May | Hiệu ứng quay có nhưng quà/điểm dễ lệch | Chọn đều từ `rewardPoolShow`, bỏ qua `weightShow/rewardShow`; special pool/limit không đúng | Roll theo nhóm trọng số config, lưu score/record, trừ item `178`, đẩy `1796`, `1202`, `1701` đồng bộ |
| Bảo hiểm lượt 40 | Phần thưởng đặc biệt sai pool hoặc sai bộ đếm | Fallback lấy phần tử cuối pool thường và random 8% tự đặt | Dùng `rewardPoolShow1`, đếm chính xác từng lượt kể cả quay 10, giới hạn số special theo config |
| Niên Thú | Trừ pháo nhưng sát thương/quà không theo config | Server cộng damage/merit tự đặt và chỉ phát item `177` | Dùng `blood=10000`, `rankScore=10`, HP theo `Activity44MonsterConfig`; hạ boss phát đầy đủ token/Nguyên bảo/Bánh bao/đùi gà |
| Xếp hạng Niên Thú | Chỉ hiện chính người gọi | Rank packet dựng một row giả | Query Player Activity 44001, xếp theo công huân, cache 5 giây, trộn phiên online mới nhất |
| Cửa hàng đổi | Có thể mua quá giới hạn | `ShopConfig.limit=0`, giới hạn thật nằm ở `ActivityShopConfig` | Dùng policy Activity 43 cho 18 mặt hàng đổi, ghi `activity.buyRecords`, chặn mua lại theo limit |

## 3. File/thư mục đã thay đổi

### Production

- `/linhhoasu/lhs/newServer/src/handlers/activity.js`
- `/linhhoasu/lhs/newServer/src/handlers/item.js`
- `/linhhoasu/lhs/newServer/src/handlers/playerPayload.js`
- `/linhhoasu/lhs/newServer/src/handlers/box.js`
- `/linhhoasu/lhs/newServer/src/handlers/raid.js`
- `/linhhoasu/lhs/newServer/src/services/MainTaskProgressService.js`
- `/linhhoasu/lhs/newServer/src/services/PlayerService.js`

### Candidate, tool và evidence

- Candidate: `_ai_workbench/temp/fortune_event_full_candidate_20260902/`
- Snapshot live: `_ai_workbench/temp/fortune_event_sources_20260902_082208/`
- Config matrix: `_ai_workbench/temp/fortune_event_audit_20260902_153000/type43_44_matrix.json`
- Contract: `_ai_workbench/tools/test_fortune_event_full.js`
- Contract config thật: `_ai_workbench/tools/test_fortune_event_real_config.js`
- Contract theo dõi tiêu vật phẩm: `_ai_workbench/tools/test_fortune_player_consumption_tracking.js`
- QA live: `_ai_workbench/tools/qa_fortune_event_live_account_20260902.js`
- Deploy/rollback: `_ai_workbench/tools/deploy_fortune_event_full_fix_20260902.py`
- Evidence deploy: `_ai_workbench/temp/fortune_event_full_deploy_20260902_092801.json`
- Evidence QA: `_ai_workbench/temp/fortune_event_live_qa_20260902_112800.json`

Backup production:

- `/linhhoasu/_ai_workbench/backups/fortune_event_full_fix_pre_20260902_092801/`

## 4. Kiểm thử và kết quả

### Contract local và production

- Giới hạn gói miễn phí: **38 PASS**.
- Toàn bộ Activity 43/44: **51 PASS**.
- Theo dõi tiêu item `4/65/55`: **8 PASS**.
- Đối chiếu config thật: **27 PASS**, đủ **714 bảng**.
- Core gameplay contract: **PASS**, đủ **714 bảng**.
- `node --check`: PASS cho toàn bộ 7 file triển khai.

### QA thật bằng `vanduc97`

- Đăng nhập HTTP + WebSocket S1: PASS.
- Gói miễn phí đã nhận trong ngày: request lặp bị chặn, không đổi Bánh bao.
- 9 nhiệm vụ: nhận đúng tổng `20` pháo hoa và `120` điểm hoạt động.
- 5 mốc ngày: bitmask `31`, quà đúng config.
- Quay 1 và quay 10: trừ đúng item `178`, trả đúng số reward, tăng/lưu score.
- Mốc quay: avatar `113114` kích hoạt native; nhận lại bị chặn.
- Niên Thú: trừ 1 pháo; nhận `10` công huân và đủ quà boss level 1; tiến level boss từ 1 lên 2.
- Xếp hạng: trả 100 row, có hạng của tài khoản test.
- Cửa hàng đổi: trừ 200 item `179`, kích hoạt chat bubble `11548`, mua lại bị chặn.
- Sau QA: **khôi phục Player thành công**, evidence ghi `restored=true`; password không được ghi vào artifact/log.

### QA giao diện client

- Gói Vận May mở bình thường; không còn text exception `getActiveDailyShopPolicy is not a function`.
- Nhiệm vụ ngày hiển thị điểm, progress và nút nhận/đi đến đúng trạng thái.
- Vận May Mắn hiển thị số lượt bảo hiểm, score và các mốc đã nhận/chưa nhận.
- Niên Thú hiển thị đúng pháo, công huân, HP, phần thưởng và bảng xếp hạng.
- Không bấm mua gói trả phí và không phát sinh giao dịch tài chính.

## 5. Trạng thái hiện tại

- Deploy production: **PASS**, rollback không được dùng.
- `lhs-s1001` online, PID sau deploy `32544`.
- `lhs-dist=30824`, `lhs-admin=30856`, `lhs-real-bots=19097` giữ nguyên PID/restart count trong deploy và QA.
- `/ready` HTTP `200`; MongoDB và Redis healthy. Port health WS `9200` chỉ bind localhost nên probe ngoài VPS trả `000`, probe nội bộ trong deploy/QA trả `200`.
- Không có `SyntaxError`, `ReferenceError`, `TypeError`, unhandled hoặc lỗi handler mới trong phần log sau deploy.
- SHA-256 production:
  - `activity.js`: `1e7af70a7c5c75efcb411d6a322af98f1d81bc3a3acf479837cfeb86943a9cb8`
  - `item.js`: `06330978c628bf6869781d373594c182309547c8c4194dd94784043f04ab89eb`
  - `playerPayload.js`: `1f42c2c4ec5d9c69d5d394315d3453d5f45eed8cf11110f51da63c3e6c934f3f`
  - `box.js`: `9047989603ec0797f81439cd6e7df343c53a47e51beacc20b196fda56f99a39f`
  - `raid.js`: `13c74c059472462995eb8da2031e4a0fdcf16152ea5d305d88f0e3eead93f318`
  - `MainTaskProgressService.js`: `dcecebe0e3c4532ac1c837f6bfed7f93e82cf84e69c893e38d6f0e01981664b6`
  - `PlayerService.js`: `0a78c5bf2ff90a5592d23d8d36c949553d2cc1db6d6bd4723dc1676139b5b1bc`

## 6. Kỹ năng / kinh nghiệm mới

- Task sự kiện dùng type ghép bit `activityId | 1<<30`, không thể chỉ whitelist type task thường.
- `TaskConfig.reward=[]` là hợp lệ với Activity 43; quà nằm ở `Activity43TaskConfig`.
- Đùi gà là item `65`; item `6` là phù tăng tốc/vàng trong mapping server.
- Ngoại quan phải ghi ownership qua `FashionConfig` và đẩy packet native; thêm vào bag không đủ.
- Giới hạn shop sự kiện lấy từ `ActivityShopConfig`, không lấy `ShopConfig.limit`.
- QA gameplay cần xác nhận đồng thời response packet, Mongo readback, inventory/ownership và UI client; popup reward đơn lẻ không đủ chứng minh quà đã về.

## 7. Bước tiếp theo

1. Theo dõi log Activity `1700/1200` và save queue trong 24 giờ đầu.
2. Không chỉnh tay `record`, `records[10]`, `records[11]`, `recordList` hoặc `buyRecords`; đây là các ledger chống nhận lặp.
3. Nếu muốn kiểm thử gói trả phí, dùng một giao dịch test được phê duyệt riêng; phiên này chủ động không mua.
