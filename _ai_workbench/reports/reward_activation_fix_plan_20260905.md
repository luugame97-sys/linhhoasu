# Kế hoạch sửa toàn diện nhận thưởng và kích hoạt — 05/09/2026

## 1. Mục tiêu và trạng thái

Mục tiêu: khép kín chuỗi nạp gói / đổi code / nhận mail / mua shop / nhận sự kiện / mở rương → phát đúng thưởng → ghi đúng quyền sở hữu hoặc đặc quyền → đồng bộ client → sử dụng được → giữ đúng sau đăng nhập lại. Đồng thời xử lý dữ liệu đã nhận sai mà không phát trùng, không làm mất tiến trình.

**Trạng thái phiên này: đã kiểm tra bổ sung production read-only và lập kế hoạch triển khai có tiêu chí nghiệm thu. Chưa sửa source game, chưa deploy, chưa repair DB, chưa mua gói hay đổi code thật.** Các bước triển khai bên dưới chưa được coi là hoàn thành.

Không đánh đồng “nhận vào túi”, “kích hoạt sở hữu”, “mặc/xuất chiến” và “mua quyền lợi”. Mảnh cần ghép và rương tự chọn không được tự biến thành nguyên thân; gói đặc quyền phải có entitlement riêng. Không tự mặc đè trang bị/ngoại quan đang dùng chỉ để làm hình sáng.

## 2. Bằng chứng hiện có

### 2.1 Item/rương

- Audit trước trên source/config production: 7.951 asset, 940 use config, 2.439 case.
- 311 ID lỗi trực tiếp: 47 rương route sai collection native, 1 rương trả placeholder chưa resolve, 111 rương thiếu pool, 150 đan chưa hoàn thiện, 2 rương thiếu option.
- Thêm 2 rương cha ảnh hưởng dây chuyền; 5 ID pending; 622 ID còn lại chỉ qua fixture cơ bản, chưa bảo đảm E2E.
- Danh sách đầy đủ: [Báo cáo audit item](items_deep_audit_20260905.html) và [311 ID](items_need_fix_deep_20260905.txt).

### 2.2 Kiểm tra bổ sung nạp/code

- Source production hiện tại có 694 PayConfig, 1.519 ShopConfig, 614 shop row liên kết payId.
- 28 shop/payId có nhánh thưởng chạm nhóm native thiếu route, placeholder Linh trục hoặc rương bị chặn. Đây là **phơi nhiễm theo catalog**, chưa chứng minh cả 28 gói đang active hay đã có người mua.
- Trong 4 bảng Elf/Curios/Orb/Connect có **470 asset native đang bị getRewardKind phân loại thành item thường**. Đây là phạm vi router cần kiểm tra; không cộng 470 vào số rương lỗi vì khác loại đơn vị.
- Chạy 10 probe thuần bộ nhớ trên production: 5 đầu ra × 2 đường `item.addRewardRowsToPlayer` (được nạp dùng) và `activity.grantRewardRows` (được giftcode dùng). Tất cả cộng vào túi, không cập nhật collection native. Đầu ra: 154101, 131301, 9101, 200101, 100721.
- Probe chứng minh lỗi tại bộ cấp thưởng dùng chung, **không phải E2E thanh toán/giftcode**.
- Runtime S1: 621 người thật; 4 người có item nằm trong phạm vi kiểm tra. Túi thường đang chứa `9166 ×1`, `130601 ×2`, `156502 ×1`, `200414 ×1`; còn rương `90027 ×1`, `90202 ×1`, `90214 ×1`, `100139 ×823`.
- Đây là **ứng viên đối chiếu repair**. Chưa đọc đủ ownership/lịch sử của từng người để xác định cách bù hoặc chuyển từng bản sao.
- S2: 1 người thật, không thấy item thuộc phạm vi này.
- 5 code hiện còn trong Mongo S1 không chứa nhánh lỗi thuộc phép dò trên; không có code ở S2. Không thể suy ra code đã xóa/đã dùng, ngoại quan khác hoặc đặc quyền đều đúng.
- `transactions` success hiện đếm 0 trong hai DB và custom recharge product 0. **Không kết luận người dùng chưa nạp**: cần truy nguồn token/Xu, log gói, WebGM hoặc cổng order đang thực dùng. Không tạo callback thanh toán giả để lấp bằng chứng.
- Evidence: `_ai_workbench/temp/reward_fix_scope_20260905.json`; chỉ chứa tổng hợp, ID sản phẩm/item và hash; không xuất mã code có thể đổi hoặc thông tin đăng nhập.

### 2.3 Bốn gói P0 ưu tiên

| PayId / shopId | Thưởng liên quan | Lỗi cần tái hiện và sửa |
|---:|---|---|
| 11000015 | Bí bảo 130601 | Thân Bí bảo bị ghi vào items, thiếu quyền sở hữu native |
| 11000016 | Rương Yêu linh 90027 | Nhận rương được nhưng mở chưa cấp Yêu linh native |
| 11000017 | Rương Thần văn 90202 | Nhận rương được nhưng mở chưa cấp Thần văn native |
| 11000020 | Rương Linh trục 90214 | Nhận rương được nhưng mở chưa cộng Connect native |

### 2.4 28 gói cần đi hết chuỗi thưởng

| PayId | Đầu ra có rủi ro | Nhóm |
|---:|---|---|
| 11000015 | 130601 | Native thành item túi |
| 11000016 | 90027 | Rương dẫn tới native sai |
| 11000017 | 90202 | Rương dẫn tới native sai |
| 11000020 | 90214 | Rương dẫn tới native sai |
| 11000552 | 100020 | Rương đang chặn |
| 11000553 | 100020 | Rương đang chặn |
| 11000561 | 94802 | Rương đang chặn |
| 11000562 | 94802 | Rương đang chặn |
| 11000563 | 94802 | Rương đang chặn |
| 11000564 | 94802 | Rương đang chặn |
| 11000565 | 94802 | Rương đang chặn |
| 11000571 | 100641 | Rương đang chặn |
| 11000572 | 100641 | Rương đang chặn |
| 11000573 | 100641 | Rương đang chặn |
| 11000574 | 100642 | Rương đang chặn |
| 11000575 | 100642 | Rương đang chặn |
| 11000581 | 100721 | Placeholder Linh trục |
| 11000582 | 100722 | Placeholder Linh trục |
| 11000583 | 100722 | Placeholder Linh trục |
| 11000584 | 100723 | Placeholder Linh trục |
| 11000585 | 100723 | Placeholder Linh trục |
| 11023009 | 100723 | Placeholder Linh trục |
| 11023010 | 94709 | Rương đang chặn |
| 11030001 | 94725 | Rương đang chặn |
| 11030002 | 94725 | Rương đang chặn |
| 11030003 | 94725 | Rương đang chặn |
| 11030004 | 94725 | Rương đang chặn |
| 11030005 | 94725 | Rương đang chặn |

## 3. Kiến trúc sửa trong phạm vi hiện có

Giữ các handler/giao thức hiện tại; thống nhất contract thưởng qua RewardGrantService và các adapter nhỏ của từng hệ. Không rewrite toàn bộ server.

| Nguồn | Luồng cần kiểm tra | Điểm dùng chung |
|---|---|---|
| Nạp tiền/callback | recharge → RechargeRewardResolver → item.addRewardRowsToPlayer + RechargeBenefitService | RewardGrantService; entitlement; order ledger |
| Mua Xu/token | compat purchase → resolver → grant + benefit | Cùng reward plan và entitlement như route hợp lệ tương ứng |
| Giftcode | activity.handleActivityGiftCode → grantRewardRows → persist + sync | Cùng router; code ledger gắn cùng reward state |
| Mail | mail claim → native/fashion/default grant → player save → finalize mail | Cùng router và duplicate policy; giữ mail claim ledger |
| Mở rương/shop/sự kiện | item/activity và các handler cấp quà | Cùng phân loại ID; resolve có kiểm chứng; cùng native sync |

Contract tối thiểu cho mỗi reward: sourceId, itemId, count, rewardKind, target collection, ánh xạ ID, first-owned/duplicate policy, thời hạn nếu có, client sync contract, persistence và khóa chống trùng. RewardInfo phải phản ánh đúng state đã cấp; không chỉ thêm trường trả về để test xanh.

Lưu player/ledger tuần tự có xác nhận. Không chuyển cấp thưởng, tiêu item, kích hoạt gói thành background save. Không tự giả định Mongo hỗ trợ multi-document transaction: đọc topology trước; dùng phương án single-writer/per-player ledger + recovery phù hợp deployment.

## 4. Checkpoint triển khai và tiêu chí chuyển bước

### CP0 — Chốt baseline và tái hiện (ưu tiên ngay)

1. Chụp manifest production source/config/client đúng release; local từng khác 49 file và base config nên không deploy trực tiếp cả cây local.
2. Tạo candidate riêng dưới `_ai_workbench/temp/`, backup source và snapshot phục hồi đúng phạm vi; giữ cây CN tham chiếu bất biến.
3. Xác định nguồn nạp thực tế (token/Xu/cash/WebGM), payId, itemId, nhân vật, thời điểm và order/code ledger được phép đọc. Thêm ví dụ người dùng gửi vào regression.
4. Reproducer cho bốn gói P0, giftcode/mail cấp trực tiếp bốn họ native, mở 48 rương và placeholder 100721–100723.
5. Phân biệt lỗi quyền sở hữu, thiếu sync, thiếu resource, điều kiện level/feature, chưa mặc và thiếu entitlement.

**Gate:** từng lỗi có input → reward → state trước/sau → packet/exception; fixture không ghi người thật. Lưu danh sách route/sản phẩm đang active để không nhầm catalog ẩn với gói bán thực tế.

### CP1 — Sửa chung native grant và sync (P0)

1. Bổ sung phân loại, adapter grant cho Elf, Curios, Orb và Connect; quét cả 470 asset của bốn họ, không hard-code chỉ các ID đã gặp.
2. Dùng schema/default/UID và duplicate conversion đã xác nhận từ config/handler chuẩn. Không tự nâng phẩm chất hoặc đổi mảnh thành thân.
3. Mọi nguồn nhận quà phải dùng đúng adapter; các wrapper item/activity/mail/recharge cần merge đủ kết quả native. Kiểm cả caller khác còn tự cộng items.
4. Tách grant khỏi auto-equip. Trường hợp chồng Fashion/native cần sở hữu cả hai lớp nhưng không tạo hai phần thưởng giá trị.
5. Đọc receiver client trước khi thêm packet: gửi đúng payload, state push trước callback kết thúc; không dùng request tag làm push tùy ý.
6. Resolve placeholder qua plan được xác minh. Thiếu pool thì lỗi rõ trước consume/commit, không giả phần thưởng thay thế.

**Gate:** 47 rương/474 case cũ không còn body-ID rơi vào items; đúng ID/count/quality/native state; lần đầu và sở hữu sẵn đúng; 90151 và 100721–100723 chỉ được mở nếu có pool chuẩn. Nạp/code/mail dùng cùng các case và cho cùng ownership.

### CP2 — Quyền lợi gói và giao dịch nhận thưởng (P0/P1)

1. Kiểm độc lập reward item với quyền lợi: month card, lifetime card, Activity7 10301, Activity9, gói chuỗi, gói trigger và các family chưa có resolver.
2. Đối chiếu payId/shopId, route được phép, số tiền/token, kỳ mua, first/subsequent/double/extra rewards và trạng thái active. Không coi tăng recharge record là đã kích hoạt gói.
3. Tạo ma trận đủ 694 payId/614 pay-linked shop; mọi mục có trạng thái supported+tested, disabled/not-active, hoặc pending-source rõ ràng. Từng gói đang bán phải có contract đầy đủ.
4. Với code: kiểm admin/config-backed code, số lượt tổng/per-player, hết hạn, ownership, server/role, claim đồng thời và lỗi cập nhật thống kê. Không log code raw.
5. Xử lý cửa sổ lỗi sau player.save trước Mail.create/Transaction success: thêm/hoàn thiện ledger idempotent và recovery, không grant lại khi trạng thái commit chưa rõ. Unique orderId đơn lẻ không chứng minh không phát trùng.
6. Xác nhận online session và DB không ghi đè nhau khi cash callback chạy ngoài queue gameplay. Khóa theo người chơi/order phải bao phủ các route liên quan.
7. Những gói đang bán nhưng phần thưởng còn bị giữ cần quyết định hiển thị/khả dụng rõ ràng. Nếu hạn chế mua mới, chỉ chặn đúng sản phẩm và giữ quyền lợi đơn đã thanh toán; không tự trả callback thất bại sau khi nhà cung cấp đã thu tiền.

**Gate:** mua hợp lệ → đúng quà + entitlement + record; chưa mua không claim được; retry/concurrent không phát hai lần; ngày/kỳ mới reset đúng; lỗi save/mail/order không làm mất quà hay nhân đôi. Chưa có credential/cổng thanh toán thật thì đánh dấu cash upstream E2E pending, không dùng mock để tuyên bố pass.

### CP3 — Phục hồi toàn bộ rương/đan còn thiếu (P1/P2)

1. 111 rương: lập registry theo ID/nhóm, nguồn pool, tỷ lệ, số lượng, giới hạn chất lượng/cấp, duplicate policy. Ưu tiên 100139, sau đó các rương nằm trong 28 gói và rương event đang phát.
2. Tìm nguồn có thẩm quyền trong dữ liệu gốc/server drop tables đã có; giữ cây tham chiếu chỉ đọc. Mô tả/icon chỉ dùng để tìm kiếm, không đủ để quyết định pool hay tỷ lệ chia đều.
3. 150 đan: phát reward đúng đồng thời hạn mức chung -802/-804, đặc quyền, ngày server, login/day push; giữ logic 308 đan thuộc tính vĩnh viễn.
4. 90021/90022: yêu cầu option/catalog gốc đúng quality; thiếu nguồn thì ghi blocker cụ thể, không tự fallback quality cao hơn.
5. 93065/100803: test toàn chuỗi đến thưởng cuối; 94821–94825 cần đúng flow câu cá, không tự bật useType.
6. 227 dùng flow riêng; 94355–94358 cần xác định orphan hay item phát thực tế; catalog ngôn ngữ/asset tách lane hiển thị.

**Gate:** từng ID có source-of-truth + test đúng giá trị thưởng và đường sử dụng. “Đã chặn an toàn” được ghi riêng, không đánh dấu fixed. Thiếu dữ liệu chuẩn là blocker của ID đó, không chặn sửa các nhóm đã đủ bằng chứng.

### CP4 — Sửa dữ liệu người đã nhận sai (chạy sau CP1/CP2)

1. Read-only inventory đầy đủ cả bag, native ownership, expiry/entitlement, player claim ledger, mail đã nhận/chưa nhận, order/record. Tạo dry-run theo nhân vật và nguồn giao dịch; báo số lượng/value trước và sau.
2. Với body-ID còn trong túi như 9166/130601/156502/200414: xác minh receipt hợp lệ, quan hệ với native đã có và duplicate conversion trước khi chuyển. Không mặc định mọi copy trong túi đều được cộng mới.
3. Với rương đã tiêu: chỉ recover nếu có ledger/backup đủ chứng minh nguồn và thưởng. RNG không có kết quả gốc thì không tự reroll/bù theo phỏng đoán; tách danh sách cần chủ game quyết định.
4. Mỗi repair có repairId bất biến, preimage, postcondition, item delta, code version và dấu hoàn tất chống chạy lặp.
5. Khóa/maintenance ngắn đúng server/role cần repair để online session không ghi đè. Không restore toàn DB hoặc sửa hàng loạt dựa trên log performance.
6. Sau commit: đọc lại DB, login/relog, sử dụng native, chạy dry-run lần hai không còn dòng có thể sửa; rollback chỉ preimage/field đúng scope và không ghi đè tiến trình mới.

**Gate:** preview được duyệt trước mutation dữ liệu thật; mọi delta giải thích được; chạy lại không phát thêm; người đã có native không mất level/star/UID/expiry. Bù/thu hồi giá trị khi thiếu chứng cứ cần quyết định riêng của chủ game.

### CP5 — Triển khai theo đợt và nghiệm thu

1. Trước deploy đối chiếu hash từng file và dependency, backup config/source, xác nhận schema tương thích rollback; không chép toàn cây local lên VPS.
2. Canary S1 theo release nhỏ: native/router trước, entitlement/recovery sau, từng họ random/pill khi đủ nguồn. Chỉ restart process game liên quan; không restart dist/admin/DB.
3. Test E2E trên tài khoản QA riêng, quantity nhỏ, không dùng tiền thật/người thật khi chưa có lựa chọn tài khoản và phạm vi phù hợp. Không bypass lịch mở S2 để test.
4. Check `/ready`, Mongo/Redis, WebSocket, error log, reward ledger, session sync; kiểm bot/quái/Ủy thác/ngoại quan để tránh regression.
5. Sang S2 sau khi S1 đạt gate và đúng cửa sổ được phép; snapshot/log/hash cho từng checkpoint.
6. Nếu lỗi correctness/persistence/duplicate: dừng promotion, rollback source đúng manifest; dữ liệu đã grant cần reconcile riêng, không rollback DB mù.

## 5. Ma trận kiểm thử bắt buộc

| Chiều kiểm tra | Trường hợp tối thiểu | Điều kiện đạt |
|---|---|---|
| Nguồn thưởng | cash/token/code admin/code config/mail/shop/event/item | Cùng asset cho cùng loại ownership và giá trị hợp lệ |
| Chủng loại | item/currency/equip/Fashion/native/body/piece/placeholder/entitlement | Không trộn thân với mảnh, túi với native, hiển thị với quyền lợi |
| Trạng thái người chơi | mới, đã sở hữu, chưa mở feature, level đủ/thiếu, hết hạn, đang online/offline | Từ chối hoặc cấp đúng điều kiện server; không tự mở mọi feature |
| Rương | mọi option, thiếu/sai option, multi-count, nested box, pool rỗng, capacity nếu có | Không consume trước khi plan hợp lệ; đúng số và loại thưởng |
| Giá trị số | 0, âm, lẻ, string, quá lớn, overflow | Reject input không hợp lệ trước mutation |
| Chống trùng | cùng msgUid, cùng source/order/code, đổi msgUid, concurrent/two sessions | Một giao dịch hợp lệ đúng một lần; code quota đúng |
| Persistence | save fail/timeout, crash sau save trước ledger phụ, mail finalize fail, reconnect/restart | Không mất quà, không nhân đôi; trạng thái không chắc chắn được reconcile |
| RNG | mọi nhánh/drop row, đúng grade/level/count, sampled distribution | Kỳ vọng lấy từ bảng gốc; test sample không thay bằng chứng tỷ lệ |
| Native client | hiển thị sở hữu, kích hoạt, mặc/xuất chiến/dùng/ghép, duplicate, reopen/relog | Đúng state thực và packet, không chỉ popup hoặc response result=0 |
| Không hồi quy | 940 use config, 2.192 ngoại quan theo catalog hiện tại, Activity7/9, tháng/chuỗi, core 714 bảng | Gate cũ giữ nguyên và tăng assertion theo lỗi mới |

## 6. Định nghĩa “sửa triệt để”

- Mỗi item/gói/code trong phạm vi có trạng thái cuối rõ: đã sửa và đủ gate, chưa hoạt động theo thiết kế, hoặc còn chờ dữ liệu chuẩn. Không để mục chưa hỗ trợ bị coi là PASS.
- Mọi nguồn đang phát/bán phần thưởng phải bảo đảm toàn chuỗi dùng được; nếu còn rương bị chặn trong gói, gói đó chưa đạt hoàn tất.
- Đúng ownership/entitlement, đúng value và sync; giữ đúng sau relog/restart; retry/concurrent/save failure không mất hay nhân đôi.
- Dữ liệu lịch sử có chứng cứ được repair idempotent; trường hợp thiếu bằng chứng ghi danh sách riêng, không tự bù.
- Bàn giao source/package thật, manifest hash, test logs, evidence E2E, dry-run/repair ledger, rollback và session report MD/HTML. Một kế hoạch hoặc “chặn hết item lỗi” không được gọi là sửa xong.

## 7. Ưu tiên triển khai ngay sau kế hoạch

1. CP0 → CP1: bốn gói 11000015/16/17/20, grant native dùng chung, 47 rương và code/mail tương ứng; xử lý nguồn gây nhận đồ nhưng không kích hoạt.
2. CP2: audit quyền lợi các gói người dùng báo; ledger/recovery và sync. Bảo vệ source trả phí chưa đủ contract.
3. CP4 dry-run dữ liệu lịch sử; commit chỉ sau kiểm giá trị và phê duyệt preview.
4. CP3 theo từng họ, ưu tiên 100139 và 28 gói có nhánh lỗi; không đoán pool để mở cho nhanh.
5. CP5 chạy lặp sau từng checkpoint đạt gate. Thời gian hoàn thành phần thiếu dữ liệu gốc phụ thuộc việc lấy được bảng chuẩn; không hứa hoàn thành toàn bộ ngay bằng fallback.

## 8. File hỗ trợ và lỗi cần nhớ

- Tool mới: `_ai_workbench/tools/inspect_reward_fix_scope_20260905.js`, `_ai_workbench/tools/run_reward_fix_scope_20260905.py`.
- Tool tái sử dụng: execute SSH stdin của `recheck_items_readonly_20260905.py`; HTML renderer `render_session_report.py`.
- Probe đã chạy: node --check PASS; 10/10 probe tái hiện reward rơi vào bag; inventory/catalog DB chỉ đọc. Không gọi route mua/claim thật.
- Lỗi thiết kế cần tránh: các wrapper grant và phép merge reward có thể bỏ mất collection mới; test từng entry point, không chỉ test service.
- Lỗi kết luận cần tránh: `transactions=0` không phủ định báo lỗi nạp của người dùng; 5 code hiện tại không chứa nhóm lỗi không phủ định code lịch sử; catalog risk không đồng nghĩa đã có giao dịch mất thưởng.
