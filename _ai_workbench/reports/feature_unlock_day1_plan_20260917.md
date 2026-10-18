# Kế hoạch sửa tính năng bị khóa và mở từ ngày 1

Trạng thái: **đã điều tra và lập kế hoạch; chưa sửa game, chưa migration DB, chưa deploy/restart**. Kiểm tra live S1–S4 ngày17/09/2026, 18:24–18:34 GMT+7. Phạm vi: Linh Họa Sư; không tác động game/dịch vụ khác.

## 1. Mục tiêu và quy tắc sau sửa

- Năm hệ thống đã có gameplay trong dải dưới phải mở và sử dụng đúng khi đạt điều kiện: Thần binh, Võ hồn, Huyết mạch, Bí bảo, Yêu linh. Hồng nhan là phần còn thiếu gameplay, xử lý riêng ở mục7; không đánh dấu hoàn thành toàn bộ sáu hệ khi phần này chưa có.
- Bỏ yêu cầu **chờ ngày mở server** đối với truy cập tính năng, tính năng con và catalog đã triển khai. Giữ cấp/cảnh giới, nhiệm vụ, sở hữu, nguyên liệu, tiền, tỷ lệ, số lần và điều kiện chiến đấu thật.
- Riêng System112 “Rơi đa bội” chờ tuổi nhân vật2 ngày: đề xuất bỏ đúng gate này trong gói day1, giữ cấp55. Không sửa thời gian tạo nhân vật hoặc bỏ mọi điều kiện type6 ở các nghiệp vụ khác.
- Ngày server, `GameServer.openTime`, `createTime` vẫn thật. Không giả ngày999, không thêm toàn bộ ID vào `unlockedSystem`, không đánh dấu mọi nhiệm vụ hoàn thành.
- **Không đổi** lịch thi đấu/sự kiện, kỳ kết toán, ngày nhận thưởng, shop luân phiên, cooldown/hồi vé/reset ngày, thời hạn thẻ; giữ gate server chưa khai trương, bảo trì/khóa vận hành.
- Không tự tăng EXP/cảnh giới Hứa Thanh. Thiếu2680 EXP là điều kiện gameplay riêng, không phải lý do bỏ điều kiện độ kiếp.

## 2. Bằng chứng và phạm vi ảnh hưởng

- S1–S4 cùng runtime source `/linhhoasu/lhs/newServer`; DB riêng `lhs_s1001..lhs_s1004`. Có drift local/live ở nhiều handler, nên baseline triển khai phải lấy từ live đã hash, không upload cả cây local.
- Aggregate đọc-only:1810 hồ sơ không mang tiền tố `lhs_real_bot_`,117 hồ sơ cấp>=75; không có task type9 trong trường đã kiểm trên cả4DB. Đây là số hồ sơ, **không phải1810 người đang online hoặc1810 người đều đủ điều kiện**. Hai hồ sơ S1 có unlock209/216 nhưng vẫn không có type9, cần phân loại riêng trước migration.
- Riêng S3:201 hồ sơ không mang tiền tố bot,22 từ cấp75;0 root90002/90020,0 unlock209/216. Hứa Thanh có311/313 nhưng không có nhánh nhiệm vụ phụ.
- Inventory có40 SystemConfig dùng tuổi server và1 dùng tuổi nhân vật. Các bảng catalog/subfeature còn có gate trực tiếp ngoài SystemConfig. Source/module liên quan trong inventory không mới hơn mốc start process; PID/restart không đổi trong audit.
- Tái sử dụng bằng chứng lượt trước:6 ca hàm live client/backend cho209/216;4 ca có task phụ mà backend vẫn từ chối. Đây là kiểm thử RAM, không phải thao tác tài khoản thật.

## 3. Lỗi gốc phải sửa trước

1. **Nhầm task chính/task phụ:** live `upgrade.js:611–612` luôn dùng ID main task. Sửa evaluator theo native: type1 dùng main ID; type9 tra đúng nhiệm vụ, phân biệt thiếu/đang làm/đã nhận thưởng. Giữ các phép so sánh theo cond, không hardcode hai ID.
2. **Nhầm ID hướng dẫn thành ID hệ thống:** `playerPayload.js:61–68` dùng `guideValue/guideValueATest` để kiểm `unlockedSystem`. Client thực tế đưa các giá trị này vào `GuideUtil.Start`. Task90003 guide123 bị khóa theo một system123 không liên quan, có thể bị xóa dù313/216 đã mở.
3. **Không tạo nhánh phụ khi đủ điều kiện:** normalizer không seed root; phải resolve root qua `TaskConfig.nextId`, rồi dùng `SpecialTaskConfig[root].conditions`. Có kiểm cycle/missing root, không fallback sang guide ID.
4. **Mất context và xóa tiến độ khi normalize:** `RealmTaskProgressService.js:110–114,132,167`, `farm.js:614–619,630,695`, fallback `raid.js:130–154` có đường gọi thiếu player. Các file này đã đối chiếu hash live. Không chỉ sửa tại login hoặc wrapper upgrade.
5. **Thiếu progression phụ:** bổ sung activeId54 từ kết toán trận DoubleTower hợp lệ,55 từ xuất trận Võ hồn hợp lệ; rà các activeId khác trong toàn bộ chuỗi14 root SpecialTaskConfig. Không nhận counter/kết quả tự khai từ client.

Thiết kế sửa nhỏ, theo cấu trúc hiện có: tách ba trách nhiệm **lưu tiến độ chuẩn / tạo nhiệm vụ khi đủ điều kiện / lọc hiển thị**. Canonical ledger không xóa task đang làm hoặc đã nhận thưởng vì thiếu context hay tạm khóa tính năng. Truyền đầy đủ player qua các callsite; payload-only có thể ẩn guide chưa sẵn sàng nhưng không xóa ledger.

## 4. Kế hoạch từng tính năng

| Hệ thống | Luồng mở đúng sau bỏ ngày | Phần phải hoàn thiện/kiểm chứng |
|---|---|---|
| Thần binh209 | Cấp75 mở311/Mine → seed90020 → dùng Phá Vân Phù theo luồng thật → claim/chuyển90021 → mở209 | Native Artifact3500–3507. Icon còn xét `getMainArtifactData`; phải nhận vật phẩm khởi đầu qua nguồn hợp lệ hoặc có màn rỗng/chỉ dẫn đúng, không tự cấp đồ mạnh. |
| Võ hồn216 | Cấp85 mở313/DoubleTower → seed90002 → trận hợp lệ → claim/chuyển90003 → mở216 → nhiệm vụ xuất trận | Native Valhalla4100–4111. Kiểm `defTowerShow` riêng, ownership/slot/cost và counter54/55. |
| Huyết mạch219 | Cấp95, không chờ ngày15 | Bloodline4700–4708; luyện/tổng hợp/mặc, recipe hợp lệ, trừ nguyên liệu và lưu đúng. |
| Bí bảo220 | Cấp110, không chờ ngày29 | Curios5200–5208; nhận/nâng/sao/tổng hợp/thưởng, catalog/echo/shop; kiểm thuộc tính chiến đấu authoritative. |
| Yêu linh222 | Cấp130, không chờ ngày36 | Elf6000–6009; triệu hồi/pity/nâng/đột phá/xuất trận, slot vẫn giữ yêu cầu cảnh giới. |
| Hồng nhan | Chưa có chuỗi native có thể bật | Xem mục7; không dùng unlock ID giả hoặc mở popup rỗng. |

Tên Việt của311/313 dễ gây nhầm: **311 dùng Mine2800–2804,313 dùng DoubleTower4500–4509**, không phải Temple/Island.

Login/relog phải đúng kênh native: Artifact ở `500.artifactInfo`; Valhalla push4100; Bloodline push4701; Curios push5200; Elf push6000. Không giả định thêm tất cả vào tag500 là đủ.

## 5. Chính sách day1 dùng chung server/client

Tạo một manifest policy có version, liệt kê đúng table/row/field/predicate được bỏ điều kiện ngày. Tận dụng ConfigService/overlay và addon client hiện có; không đổi kiến trúc hoặc thêm dependency. Backend và client phải dùng cùng manifest/version; field ngoài manifest giữ nguyên, thiếu điều kiện khác vẫn từ chối.

### Phần đưa vào day1

- SystemConfig type5:40 ID `118,121,122,123,124,126,127,210,219,220,221,222,223,225,226,227,228,229,230,231,232,309,310,311,313,314,315,317,319,320,321,322,323,324,325,326,327,328,330,10501`; đối chiếu các `openDay` trực tiếp tương ứng.315 còn level9999, phải phân loại disabled legacy, không gọi là đã mở chỉ vì bỏ ngày.
- System112 type6 được allowlist riêng như mục1.
- Gate truy cập trong ActivityConfig82 dòng: bỏ tuổi server ở cửa vào, **vẫn cần instance và cửa sổ hoạt động thật**.
- Catalog/subfeature: CuriosConfig63, CuriosEchoConfig11, CuriosShopConfig3, FishRodConfig3, ShopConfig42 điều kiện ngày. Giữ số lượng giới hạn, phí và sở hữu.
- Các predicate trực tiếp: ElfFieldConfig, ValhallaConfig/ValhallaFieldConfig, FashionConfig/Color/ChangeColor (kể cả `openDayTw`), FishSceneConfig, GuildBattleConfig.serverDay, ConstConfig.silenceDealOpenDay.
- Tiện ích gameplay: ConstConfig.skipBattleCondition/2, DoubleTowerBaseConfig.multipleConditions, TeamFightBaseConfig.multipleConditions/quickConditions/skipConditions. Không bỏ điều kiện trận hợp lệ/chi phí nhân số lần.
- CrossArenaService có gate tuổi server riêng: nối policy chung; giữ level,pool,server running/lịch kỳ và actual launch gate.
- Valhalla backend hiện dùng ENV day mặc định1; loại lệch nguồn ngày trong predicate tính năng bằng policy, không sửa clock.36 slot cấu hình hiện đều day1 nhưng20 dòng catalog vẫn bị ngày36/57.
- Fashion day1 addon hiện hook nhầm `manager.FashionModel.prototype`; sửa theo instance thật. Phải kiểm hành vi method và catalog, không dùng `installed=true` hoặc HTTP200 làm nghiệm thu.

### Phần cần phân loại trước khi chốt manifest đầy đủ

- AssetsConfig193 dòng `canGetDay`: kiểm cả chọn rương và validation nhận vật phẩm phía server; đây là điều kiện nhận/chọn content, không cấp miễn phí. Những giá trị9999 phải xác minh item/resource/handler đã hỗ trợ, không chuyển1 hàng loạt.
- `PetSoulSkillRefiningPrivilegeConfig` có nhánh client `showType3 && serverOpenDay < showParam`; đưa các dòng thực sự dùng gate ngày vào policy sau đối chiếu content. Giữ quality/ownership/useQuality.
- FishSoul: thấy parse/tooltip `openDay`, cần xác nhận predicate thật rồi mới thay.
- TempleGameRoomConfig5 gate đều ngày1, không cần đổi chỉ để tăng số file sửa.
- Không thay SlapPicConfig có khoảng ngày quảng bá, SubscribeConfig.pushCondition, `replaceDays` luân phiên shop, quà21ngày/3ngày, share ngày, Activity9 ngày nhận thưởng. Những phần này không phải thời gian chờ mở gameplay.

Counts trên là số dòng/điều kiện, không phải số hệ thống hay số ngoại quan. Cổng nghiệm thu day1 yêu cầu không còn predicate chờ ngày gameplay chưa phân loại; không hứa đã bao phủ mọi đường chạy chỉ từ tìm kiếm chuỗi.

## 6. An toàn gameplay trước khi mở rộng

Đã xác nhận ở **source live**, chưa chạy thử khai thác trên production:

- DoubleTower `arena.js:3082–3122` tin `params.type` để quyết định thắng/cộng điểm. Phải có pending battle/server result/receipt một lần; finish không có start hoặc replay không được cấp điểm/thưởng. Rà cả nhánh rank4504/4505.
- Mine `mine.js:474–511` nhận UID lặp và dùng snapshot useTime cũ; `:539–558` finish thiếu guard đã hoàn thành/đã nhận. Deduplicate/reject UID, counter trong transaction, claim theo run/cycle. Tác động thưởng finish còn tùy row config, không khẳng định đã có người nhân thưởng.
- Bloodline `bloodline.js:614–618` recipe không tồn tại vẫn rơi vào rate0 và tiêu nguyên liệu: reject invalid config trước mọi mutation.
- Curios env trên4node hiện không đặt policy, nên dùng mặc định strict. Vẫn sửa fail-closed: giá trị cấu hình lạ không được tự biến thành always_pass; không bật bypass để mở tính năng.
- BattleService chưa thấy nhánh cộng Curios trong source live: bắt buộc đối chiếu công thức native và test thuộc tính trước/sau. Đây là khoảng trống cần kiểm chứng số liệu, không suy rằng mọi trận live đã sai chỉ từ search.
- Tất cả mutation chịu lock/giao dịch hiện có, draft-state, save được xác nhận rồi mới ACK/push; chống double-submit/retry và save-failure. Không sửa phần gameplay ngoài các phụ thuộc cần thiết cho gói này.

## 7. Hồng nhan — phạm vi còn thiếu, không thể chỉ bỏ khóa

Trong bản đã kiểm tra chỉ thấy icon `main_icon_hyan`, label30020230, `lockBtn1` và `MainLockIconRule` luôn khóa. Chưa tìm thấy màn gameplay/model/RPC/handler hoặc bảng cấu hình riêng. `HomelandBeauty` là mỹ quan gia viên; skill “Hồng nhan họa thủy” không phải module này.

Để đạt đúng mục tiêu sáu tính năng: ưu tiên lấy **module native upstream tương thích** rồi xác minh protocol/assets/config/persistence. Nếu không có, cần chốt thiết kế tính năng mới với chủ game: cách nhận, sở hữu, nâng cấp, chi phí, xuất trận/bonus, UI và cân bằng. Đây là phần bổ sung gameplay, không thể tự chọn thông số trong một hotfix mở khóa.

Có thể phát hành năm hệ đã có trước để giải kẹt, nhưng trạng thái Hồng nhan phải ghi rõ chưa hoàn tất; không thay nó bằng tính năng khác, không bật cửa sổ rỗng rồi báo mở toàn bộ.

## 8. Sửa nhân vật cũ mà không làm mất/nhân dữ liệu

1. Dry-run mọi server, tách bot/QA/người chơi và online/offline; xuất diff dự kiến theo từng nhân vật. Phân loại đã unlock, thiếu root, chain đứt, đã claim, chưa đủ cấp/prerequisite và state không nhất quán.
2. Giữ task chính, EXP/cảnh giới, vật phẩm, số dư, trang bị và reward markers. Chỉ seed/reconcile các nhánh hợp lệ; không set tất cả status30 hoặc replay thưởng cũ.
3. Progress lịch sử chỉ phục hồi từ counter/ownership/receipt đáng tin và đúng semantics. Không suy đã nhận thưởng từ số dư hiện tại. Khi thiếu bằng chứng, không tự auto-complete/cấp lại thưởng; ghi danh sách cần rà, cho tiếp tục bằng hành động mới theo policy được chốt.
4. Online dùng lock/cache/persistence của runtime để tránh ghi Mongo rồi bị session cũ đè. Offline dùng exact CAS theo snapshot/version; conflict thì đọc lại, không overwrite toàn document. Marker migration/idempotency theo convention dự án; chạy lại phải no-op.
5. Snapshot chọn lọc trước write, read-back sau commit; test relog và tiếp tục nhiệm vụ. Không mở bằng một lần update danh sách unlock rồi bỏ qua canonical gameplay state.

## 9. Thứ tự thực hiện và cổng nghiệm thu

**A — Sửa gốc task/state:** evaluator task phụ, root map, normalize không xóa tiến độ, truyền context, claim/counter. Test seed90003 → refresh cảnh giới → farm → raid → save → relog, cả active vàclaimed; task không mất, reward không cấp lại.

**B — Hoàn thiện năm hệ và tiền đề:** native route/payload, P0 Mine/DoubleTower/Bloodline, tài nguyên và Curios combat. Chỉ coi mỗi hệ xong khi nhận hợp lệ → dùng/xuất trận → nâng cấp → trừ đúng → combat → save/relog hoạt động.

**C — Day1:** manifest hai phía, adapter field trực tiếp, text khóa, behavior hook instance thật. Matrix ngày1/cũ với dưới cấp/đủ cấp, thiếu/đủ task và vật phẩm; bỏ ngày không được mở sai cấp, cấp đồ hoặc bỏ cooldown.

**D — Migration và QA:** bản sao dữ liệu/DB cô lập, no-op lần2, CAS conflict, online dirty state, disconnect/save-failure, duplicate/reordered msgUid, claim/finish replay. Native UI E2E riêng cho cả5 hệ và2 tiền đề. Tài khoản mới, Hứa Thanh-snapshot, nhân vật cũ có đồ/đãclaim và bot là các nhóm bắt buộc.

**E — Phát hành khi được cho phép:** stage/hash/backup đúng live; do4node dùng chung source, không gọi việc sửa file chung rồi restart riêngS3 là code-canary cô lập. QA candidate ở runtime/DB cô lập; phát hành code tương thích với flag tắt, rolling restart đúng game node. Bật policy/migration S3 có kiểm soát trước, read-back/QA rồi mở S1/S2/S4; giữ bot worker/admin/dist và game khác.

**F — Hồng nhan:** triển khai sau khi có module nguồn hoặc thiết kế được chốt; có cùng chuẩn giao dịch/thuộc tính/native/relog. Chỉ khiF đạt mới nghiệm thu toàn bộ sáu hệ trong ảnh.

Rollback phải tách release sửa ledger khỏi release day1: tắt policy mới không được đưa lại normalizer xóa task. Giữ journal và snapshot; không restore nguyên player/currency sau khi người chơi đã tiếp tục. Rollback dữ liệu chỉ theo CAS trường bị ảnh hưởng, conflict phải rà; ưu tiên bảo toàn tiến độ đã commit.

## 10. Tiêu chí báo hoàn tất

- Mỗi hệ được mở vì đúng điều kiện, không chỉ vì icon sáng/HTTP200.
- Nhiệm vụ không mất qua login, realm, farm, raid, reconnect; phần thưởng đúng một lần.
- Đủ cấp/prerequisite có thể vào từ ngày1; chưa đủ vẫn khóa với thông báo đúng. Đồng hồ/lịch/thưởng/ngày mở server không thay đổi.
- Không mất/nhân item, tiền, vé hoặc trạng thái claimed; thay đổi chiến đấu có số liệu native/server đối chứng.
- Có bằng chứng automated, Mongo/WS, native UI/account E2E tách biệt; chỉ phần đã chạy mới ghi PASS.
- Hồng nhan/disabled legacy/content chưa có nguồn được ghi là chưa hoàn tất, không che bằng unlock giả.

## 11. File và bằng chứng cho lượt triển khai

- Baseline: `_ai_workbench/temp/feature_unlock_plan_20260917/inventory.json`, `scope.json`, `source-manifest.json`, `source/src/...`.
- Probe trước: `_ai_workbench/temp/hua_thanh_s3_20260917/probe.json`; báo cáo `hua_thanh_s3_diagnosis_20260917.md`.
- Client snapshot đã hash bằng live: `_ai_workbench/temp/fashion_current_audit_20260917/client/js/main.min_drop100.js` (`9b030e70...08cb`).
- Tools read-only: `audit_feature_unlock_plan_20260917.py` modes inventory/scope/sources và fileJS cùng tên. Mode sources tái dùng snapshot đã tải; trước triển khai vẫn cần đối chiếu live hash mới.
- Dự kiến sửa theo phạm vi: `upgrade.js`, `playerPayload.js`, `task.js`, Main/RealmTaskProgress, `farm.js`, fallback `raid.js`, các handler5hệ +Mine/DoubleTower, BattleService nếu xác nhận gap, ConfigService/manifestpolicy, account/login pushes, CrossArena gate và addonclient. Không refactor cả dự án, không thêm dependency.
