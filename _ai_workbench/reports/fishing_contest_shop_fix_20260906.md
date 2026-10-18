# Khóa nhận lặp gói miễn phí và tăng lượt gói Đại hội câu cá — 06/09/2026

**Đã triển khai trên S2 rồi S1, hoàn tất 21:23:59 UTC+7. Hậu kiểm hash/HTTP lúc 21:24:33 và kiểm mẫu log/QA lúc 21:33:03 đạt.** Reload game một lần để nhận client `20260906_fishing_shop_v1`.

## 1. Tóm tắt công việc

### Phạm vi user yêu cầu

Sửa gấp lỗi gói miễn phí trong Đại hội câu cá nhận được liên tục. Các gói còn lại trong cùng tab gói tiếp tế tăng giới hạn mua lên x10, không tăng giá hoặc quà mỗi lần mua. Không mở rộng x10 sang toàn bộ shop/game, gói cần thần thú hoặc các sự kiện khác.

| Gói | Shop/Pay ID | Giới hạn cũ trên UI | Giới hạn sau sửa |
|---|---|---|---|
| Miễn phí | 11001400 | 1/ngày nhưng server không chặn | 1/ngày, giữ thưởng 10 Bánh Bao item4 |
| Tiếp tế câu cá I | 11001401 | 5/kỳ | 50/kỳ |
| Tiếp tế câu cá II | 11001402 | 5/kỳ | 50/kỳ |
| Tiếp tế câu cá III | 11001403 | 10/kỳ | 100/kỳ |
| Tiếp tế câu cá IV | 11001404 | 10/kỳ | 100/kỳ |
| Tiếp tế câu cá V | 11001405 | 10/kỳ | 100/kỳ |

Kỳ mua trả phí bám instance Đại hội đang chạy, thông thường 7 ngày; kỳ cuối của lịch 90 ngày có thể ngắn hơn. Miễn phí dùng ngày GMT+8 hiện hữu của game (đổi ngày lúc 23:00 giờ Việt Nam), không đổi lịch reset toàn hệ.

### Nguyên nhân đã xác minh

Đây là **lỗi server, không chỉ lỗi hiển thị**. `ShopConfig[11001400]` có limit=0/limitType=0; giới hạn thực 1/ngày nằm ở `ActivityShopConfig[6006]`. Hàm `getActiveActivityShopPolicy` cũ chỉ đọc event type43, nên đường item1202 không áp policy Đại hội type6. Bên client đọc ActivityShopConfig nên vẫn ghi 1/ngày. Bộ đếm `activityInfo` cũng không được đồng bộ bền vững với sự kiện câu cá khi scheduler dựng lại rows. Các ca kiểm trước của bản mở event chưa phủ việc mua gói này; 35 ca shop mới được thêm trong phiên này.

### Cách đã sửa

- Tạo `FishingEventShopService`: xác thực sự kiện đang active, cấp/disabled/xung đột type6, một gói miễn phí mỗi request và một lần mỗi ngày. Chặn cả 1202 trực tiếp, 1210 tương thích, request trộn miễn phí/trả phí, số lượng âm/lẻ/chuỗi hoặc bấm đồng thời.
- Ghi sổ nhận vào `rechargeInfo.fishingEventShopClaims`, cùng lần lưu với quà. Lưu trả null/lỗi/timeout sau commit không trả thành công và không để session cũ ghi đè. Dùng khóa mutation theo nhân vật, không mở khóa trước khi save kết thúc.
- Gói trả phí qua token1230 và cash callback cùng dùng resolver/policy/bộ đếm kỳ; mua bằng hai đường không tạo hai hạn mức. Kiểm trước khi trừ token/phát quà. Không cho gói trả phí đi đường nhận vật phẩm miễn phí.
- Đẩy counter qua packet1701 ngay khi mua/nhận, giữ khi heartbeat, relog và restart. Native cập nhật cả số lượt lẫn điều kiện `canBought`, không chỉ đổi nhãn hiển thị.
- Bảo toàn lịch sử: ai đã nhận miễn phí trong ngày mở bản sửa được tính đã nhận, không cấp thêm khi cài fix. Tổng lượt mua cũ trong kỳ đầu được tính vào hạn mức mới: đã mua 5 lần thì còn 45/50, không reset. Không thu hồi quà đã nhận, không bù, không sửa túi/điểm người chơi thật bằng script.
- Chỉ x10 năm ID trả phí nêu trên. Giữ toàn bộ PayConfig, reward rows, token price, lịch event và giới hạn của những gói ngoài phạm vi.

## 2. File/thư mục đã thay đổi

### Source chính

Gốc local `linhhoasu/lhs/newServer/`, production `/linhhoasu/lhs/newServer/`:

| File | Thay đổi |
|---|---|
| `src/services/FishingEventShopService.js` | Service mới, policy/counter ngày/kỳ, migration lịch sử theo mốc mở, grant/save gói miễn phí |
| `src/services/FishingEventSchedule.js` | Row Đại hội lấy buyRecords từ ledger bền vững, không mất trạng thái khi sync |
| `src/handlers/item.js` | Route đúng nhóm gói vào service, chặn bypass qua đường item |
| `src/services/RechargeRewardResolver.js` | Áp policy x10 và commit bộ đếm dùng chung cho token/cash |
| `src/handlers/compat.js` | Token route có khóa, clone/save xác nhận, push trạng thái Đại hội |
| `src/handlers/recharge.js` | Push trạng thái Đại hội sau cash fulfillment; dùng sổ purchase resolver đã ghi cùng lần save |
| `linhhoasu/webgame/game/js/main.min_a6195824.js` | Sửa một hàm native của tab gói type6: limit và canBought x10 chỉ 11001401–05 của 6006/6056 |
| `linhhoasu/webgame/game/index.html` | Token cache `20260906_fishing_shop_v1` |

Không sửa config bin, thời trang, chỉ số cá, RNG, quà Huyền Vũ, input-freeze đang pause, WebGM hay bảng giá nạp.

### Tool và evidence

- `_ai_workbench/tools/snapshot_fishing_contest_shop_20260906.py`: snapshot/hash read-only, không dữ liệu cá nhân.
- `test_fishing_contest_free_20260906.js`, `test_fishing_contest_paid_20260906.js`: 19 + 16 ca mới; dùng lại 30 ca `test_fishing_gameplay_events_20260906.js`.
- `build_fishing_contest_shop_client_20260906.js`: đúng một hàm native, validate AST; kiểm cả số lượt và khả năng mua.
- `qa_fishing_contest_shop_live_20260906.js`: nhân vật QA riêng, xác thực identity/state, claim/replay/50/100/relog; cleanup trong finally. Không gọi cash callback hoặc thanh toán thật trên production.
- `release_fishing_contest_shop_20260906.py`: staging/deploy/verify, hash/process guard, rollback. `accept-verified-canary-rollback` chỉ chấp nhận đúng lỗi QA đầu đã biết và S2 tăng đúng 2 restart, không bỏ kiểm drift chung.
- `sync_fishing_contest_shop_local_20260906.py`, `sync_fishing_contest_shop_client_20260906.js`: sync bằng hunks và transform chính xác, giữ thay đổi không liên quan.
- `finalize_fishing_contest_shop_20260906.js`, `verify_fishing_contest_shop_residue_20260906.py`: kiểm local và residue/log read-only.
- Evidence/checkpoint/manifest ở `_ai_workbench/temp/fishing_contest_shop_20260906/`.
- Backup local/report: `_ai_workbench/backups/fishing_contest_shop_20260906/`, gồm `local/` và `canary1-*`.
- Backup VPS bản cuối: `/linhhoasu/_ai_workbench/backups/fishing_shop_20260906_142147`. Canary đầu đã hoàn nguyên: backup `/linhhoasu/_ai_workbench/backups/fishing_shop_20260906_141455`.
- Báo cáo MD/HTML này và session MD/HTML; mọi tool hỗ trợ trong workbench, không ghi file rác ở root hoặc global memory.

## 3. Lỗi đã gặp & giải pháp

| Lỗi | Nguyên nhân | Cách xử lý | Cách tránh lặp lại |
|---|---|---|---|
| Miễn phí nhận vô hạn dù UI 1/ngày | Policy chỉ hỗ trợ type43; ShopConfig gói không có limit | Policy Đại hội riêng trên server + ledger ngày + khóa + save xác nhận | Test bấm dồn, alternate RPC, relog và đổi ngày |
| Counter mất khi refresh event | Scheduler dựng buyRecords từ state khác | Dùng ledger rechargeInfo ổn định để dựng row1701 | Heartbeat/relog không reset |
| Hai đường mua có thể lệch hạn mức | Token/cash chưa cùng đọc limit sự kiện | Cùng resolver và ledger theo instance | Token49 + cash1 phải đầy50; callback lặp không cấp lại |
| Chỉ đổi nhãn x10 nhưng canBought vẫn giới hạn cũ | Hai biểu thức riêng trong native list | Đổi đồng thời limit và canBought có scope ID | Thực thi hàm native: mua6 vẫn mua được gói có trần50 |
| Test canary báo 1010 khác10 | QA bắt đầu item4=0; account.ensureLoginBaozi tự đưa lên tối thiểu1000 | Rollback S2, sửa QA baseline5000 và assert trước test, sau claim5010 | Luôn kiểm baseline sau login, không nới kỳ vọng quà để che lỗi |
| Đường dẫn glob PowerShell không mở rộng cho rg | Wildcard được truyền nguyên trong argument path | Dùng thư mục thật và `-g` | Không suy lỗi gameplay từ lỗi tìm file |

Canary đầu chưa thay client hoặc restart S1. Đã xác minh source quay về baseline và ready trước staging lại. Không sửa logic gameplay để làm xanh test QA. Source/report UTF-8, không thấy mojibake mới; warning model `isNew` cũ không bị sửa ngoài phạm vi.

## 4. Kỹ năng / kinh nghiệm mới

- Giá/limit toàn cục của một item không nhất thiết là policy thật của gói sự kiện. Phải kiểm bảng ActivityShopConfig và những đường cấp quà thực tế.
- Counter nhận quà không thể chỉ nằm trong row trình bày vì scheduler có thể dựng lại row; ledger phải được lưu cùng vật phẩm/chi phí.
- Chỉnh giới hạn UI cần kiểm cả nhãn, trạng thái nút, sắp xếp và counter sau ACK; đổi nhãn đơn thuần không đủ.
- Kiểm thử nạp bằng callback trong bộ nhớ không tương đương thanh toán bên ngoài. Ca QA production chỉ dùng token của nhân vật do phiên tạo.
- Test nhân vật clone phải nắm normalization sau login. Mức Bánh Bao tối thiểu hiện hữu không phải quà miễn phí bị cấp lặp; không đụng normalization ngoài yêu cầu.

## 5. Trạng thái hiện tại

### Kiểm thử và runtime

| Kiểm chứng | Kết quả |
|---|---|
| Gói miễn phí | 19 ca PASS: 20 request đồng thời chỉ cấp1, relog/heartbeat, history, rollover GMT+8, invalid/mixed,1210,gate,save-null/throw/commit-timeout |
| Gói trả phí/native list | 16 ca PASS: đủ năm cap x10, token/cash cùng counter, giá/quà, boundary, concurrency, history,save,canBought,giữ gói khác |
| Regression gameplay/event | 30 ca PASS trên Linux staging |
| Core contract | PASS Linux và local, 714 bảng cấu hình; 714 không phải số test |
| Live QA S2/S1 bản cuối | PASS: miễn phí đúng1, spam8 bị từ chối,1210/bypass bị chặn, token cap50/cap100 đúng, relog/counter đúng |
| Source local | 8/8 tương đương nội dung,7/8 khớp byte; index chỉ khác CRLF/LF. 7 file JS syntax PASS |
| Hash/HTTP/ready | 164 artifact đúng expected; main/index HTTP đúng hash; ready8080/8083=200 |
| QA cleanup | Player/mail/bottle prefix qafshop_ đều0 trên hai DB; Redis QA session0; harness process0 |
| Mẫu log sau release | Tối đa256KiB/file; stdout mới có1813/1808 dòng trong mẫu S1/S2, không thấy dòng error/eventStats mới; không suy toàn bộ log sạch lỗi |

Tổng 65 nhóm staging gồm 35 ca shop mới và 30 regression. Chưa thanh toán tiền thật qua upstream; cash callback đã kiểm bằng fixture. Native list được thực thi hàm trích đúng bundle, chưa chụp màn hình sản phẩm mới trên thiết bị thật.

PM2 cuối: S1 PID22947/restart1381; S2 PID21079/restart51. So với đầu phiên, S1 tăng1 restart, S2 tăng3 (canary, rollback, phát hành cuối). Bốn tiến trình khác giữ nguyên: dist30824/admin30856/botS1 1600/botS2 1576. Không restart Mongo/Nginx hoặc tác động dịch vụ khác.

| Artifact | SHA-256 |
|---|---|
| Main đang phục vụ | `6e72a81a91a368b8dd9daee4f4f41772304683c96cac9532c94f71642792ccd4` |
| Index đang phục vụ | `50b6e982257ea45fc6fce20f77bbcb8dbddad850dc216a1f1526f9aaf03553b1` |

Evidence: [stage](../temp/fishing_contest_shop_20260906/stage.json), [deploy](../temp/fishing_contest_shop_20260906/deploy.json), [verify](../temp/fishing_contest_shop_20260906/verify.json), [QA residue/log](../temp/fishing_contest_shop_20260906/qa-residue-final.json), [manifest file](../temp/fishing_contest_shop_20260906/changed-files.json), [checkpoint](../temp/fishing_contest_shop_20260906/checkpoint.json).

Không đền bù/reset hay thu hồi quà người thật. Chỉ dữ liệu QA do phiên tạo đã được dọn. Không kiểm đủ chứng cứ để suy ai đã khai thác hoặc bao nhiêu quà đã nhận dư; không tự xử phạt hoặc sửa lịch sử.

## 6. Bước tiếp theo

1. Reload một lần, mở Đại hội câu cá → Gói quà. Gói miễn phí đã nhận hôm nay phải hết lượt; gói I/II hiển thị trần50, III–V trần100, trừ số lần đã mua.
2. Kiểm lại trên thiết bị người dùng đang chơi; nếu nút còn hiện cũ, xác nhận client cache `20260906_fishing_shop_v1`, không reset counter server để sửa UI.
3. Hậu kiểm các phiên tiếp dùng `release_fishing_contest_shop_20260906.py verify`. Expected của bản fishing_full trước đây là lịch sử, không dùng nó để kết luận production drift sau bản shop này.
4. Nếu user muốn mở x10 thêm nhóm gói khác hoặc audit số quà nhận dư, đó là phạm vi tiếp theo cần xác định riêng; không tự động làm trong hotfix này.
