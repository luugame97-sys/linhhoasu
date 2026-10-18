# Kế hoạch sửa event lần lượt — 07/10/2026

**Trạng thái: kế hoạch, chưa triển khai.** Lượt này chỉ đọc bằng chứng và cập nhật báo cáo; không sửa code game, tắt event, restart hoặc ghi player.

## 1. Mục tiêu và căn cứ

Mỗi event phải chơi được theo cơ chế hiện có: thao tác hợp lệ → trừ đúng nguyên liệu → kết quả/thưởng đúng → lưu bền → đồng bộ client → đăng nhập lại còn tiến độ. Hết kỳ chuyển sang kỳ mới, không phát lại quà hoặc tự cấp lại đặc quyền đã mua ở kỳ trước.

- Không đổi tỷ lệ, giá, phần thưởng, điều kiện cấp/nhiệm vụ, múi giờ reset hoặc lối chơi bằng suy đoán. Tái sử dụng lock, save, receipt và scheduler hiện có; không refactor chung hoặc thêm dependency ngoài phạm vi.
- Catalog, HTTP200 và `/ready` không chứng minh gameplay đúng. Kết luận theo cả consumer client, handler live, config hiệu lực, kiểm thử và state/thưởng đã lưu.
- Source dùng chung S1–S7, local có drift. Mỗi release phải lấy exact live baseline/hash; không upload cả cây local hoặc dùng candidate cũ làm production mặc định.
- Tên đã xác minh client: **Đào bảo Tinh Cung** (21/21001), **Chọn 1 Trong Quà** (27/27001, nhổ củ cải), **Thiên Giáng Phúc Lộc** (52/52001). Type30 gọi **Bí bảo Thiên Cơ** kèm ID30001 để nhận diện; chốt title/icon live tại bước0.
- **Hoang Cổ Mê Hàng** là OldTrek; **Họa Trung Các** là Homeland. **Thiên Hạ Đệ Nhất Luận Đạo** là TopArena, khác Đỉnh Phong Diễn Võ/CrossArena.

## 2. Phân loại lại backlog

| Nhóm | Bằng chứng hiện có | Quyết định trong kế hoạch |
|---|---|---|
| Đào bảo Tinh Cung | Đọc source live07/10: tham số bước/chi phí chưa được xác thực đầy đủ | Sửa sau khi tái hiện bằng native request/config |
| Chọn 1 Trong Quà | Source live07/10 tin index để chọn nhánh thưởng/boss | Sửa xác thực ô và trạng thái; giữ thao tác chọn củ cải gốc |
| Thiên Giáng Phúc Lộc | Source live07/10 tiêu nguyên liệu trước kiểm arrangement, có nhánh persist lỗi | Ưu tiên sửa, chưa kết luận đã có người mất đồ |
| Bí bảo Thiên Cơ | Source live07/10 nhánh operate chỉ trả packet trạng thái | Hoàn thiện nhiệm vụ/kết toán/claim, không chỉ bật UI |
| Rotation | `requiresNativeQa` chỉ metadata; env native bật và có row các type21/27/30/37/49/52 trong DB | Thêm chính sách mở rõ ràng và gate server; row DB không tự chứng minh menu đã chơi được |
| Hoang Cổ Mê Hàng | Log S6 ngày07/10 có6 lỗi save7008/7002, cùng stale-save và gián đoạn session | Sửa lỗi runtime mới; không gán lại mọi lỗi engine cũ |
| Họa Trung Các | Report03/10: follow-up có candidate nhưng chưa deploy; dữ liệu đổi thưởng Cúng tượng thiếu | Đối chiếu deployed source; sửa các nhánh còn tái hiện; cô lập phần thiếu dữ liệu |
| Luyện đan rút thưởng (37), Rút hộp thưởng (49) | Có handler, chưa đủ native E2E | QA để xác định, không mặc định là lỗi gameplay |
| Câu cá/Đại hội câu cá/Ngư trường/Chai trôi | Có release06/09 sửa pending, kỹ năng, pool, shop, RNG và mini-game | Kiểm tra hồi quy và rollout đủ S1–S7; không đưa audit cũ vào lỗi hiện tại |
| Yêu Vương | Tụt stage đã sửa22/09; overlay07/10 mở catalog tới172 | Hồi quy mốc và nhiệm vụ; kết luận config chỉ45 đã lỗi thời |
| Thiên Hạ Đệ Nhất Luận Đạo | Rollback03/10 sau lỗi vào game, vẫn khóa | Làm cuối, phải kiểm login/client trước mở lại |
| Type35 và các type chưa có nghiệp vụ | Thiếu cơ chế thưởng/nguồn triển khai được xác minh | Giữ ngoài phạm vi mở mới; nhận diện rõ trước khi thiết kế |

Settlement sampled CrossArena/CrossRival/Fishing đang `done`, recipient/delivered khớp; 7server ready. Đây là phần cần bảo toàn, không phải lý do chỉnh toàn bộ settlement.

## 3. Thứ tự thực hiện và cổng nghiệm thu

### Bước0 — Chốt hiện trạng, tên và ca lỗi

1. Chụp hash các file liên quan, config hiệu lực, flags/lịch/PM2 của S1–S7; ghi thời điểm audit. Chỉ đọc log giới hạn đúng event/timeframe.
2. Với từng event, nối tên/icon → type/ID/area → native request/response → handler → state → receipt/settlement. Không coi các ID khu vực trùng nội dung là event độc lập.
3. Tạo ca tái hiện trong RAM từ source live: thao tác bình thường, thiếu phí, request sai, lặp, qua kỳ, save null/lỗi. Lưu expected/actual và diff tiền/đồ/tiến độ.
4. Backlog ghi một trong bốn trạng thái: còn lỗi tái hiện; đã sửa cần hồi quy; thiếu nghiệp vụ; chưa đủ bằng chứng.

**Đầu ra:** manifest exact baseline, bản đồ tên, fixture lỗi cho4event và lỗi save Hoang Cổ Mê Hàng. **Dừng** sửa nhánh nếu chưa hiểu native semantics hoặc bằng chứng chỉ thuộc bản cũ.

### Bước1 — Kiểm soát event đang lỗi

1. Thêm policy mở theo từng family/type và phiên bản đã QA. `requiresNativeQa` phải kết hợp allowlist đã nghiệm thu, không để cờ native mở hết.
2. Đề xuất tạm ngừng giao dịch mới của21/27/30/52 khi chưa sửa; chặn ở server cả operate, mua gói và claim liên quan, không chỉ ẩn icon hoặc ngừng sinh row.
3. Giữ lịch/cycleKey, tiến độ, đồ và quyền sở hữu cũ; không xóa `activityInfo`, không reset điểm. Thưởng hợp lệ đã commit đi qua receipt/settlement cũ; phần đang lỗi chưa được đối soát không tự grant.
4. Không tắt `EVENT_ROTATION_NATIVE_ENABLED` toàn bộ vì có thể ảnh hưởng Fortune/Kim Mã đang chạy đúng. Type37/49 chưa có lỗi xác nhận: không tự mở rộng, QA riêng trước thay đổi policy.
5. Client hiện trạng thái tạm bảo trì rõ; response lỗi vẫn đủ shape để native không văng/treo.

**Nghiệm thu:** gọi trực tiếp RPC event đóng cũng bị từ chối trước consume; không thể lách qua shop/đường claim khác; Fortune/Kim Mã/Fishing/quyền trả phí vẫn hoạt động; không reset tiến độ khi sync/relog. Đây là thay đổi production riêng chỉ thực hiện khi triển khai được yêu cầu.

### Bước2 — Thiên Giáng Phúc Lộc (52/52001)

**Mục tiêu:** không mất nguyên liệu ở nhánh từ chối và thưởng đúng cấu hình.

1. Đối chiếu `Activity52Config`, hierarchy `Activity52ArrangeConfig`, module/index mà native gửi; xác định arrangement lookup thiếu thực sự hay đọc sai tầng.
2. Validate event/cycle, input, bảng/pool/thưởng và đủ nguyên liệu trước khi trừ. Input lỗi/config thiếu trả lỗi rõ, state không đổi.
3. Roll từ trọng số đúng config; cập nhật lượt/mốc bảo đảm/đổi quà và consume trên draft; không thay rate/guaranteedTimes/maxMultiple.
4. Lưu lượt + cost + reward + receipt trong cùng phạm vi giao dịch hiện có; save không xác nhận không ACK thành công. Timeout sau commit cần đọc receipt, không cấp hoặc hoàn phí mù.
5. Callback client áp kết quả server, mở khóa nút và kết thúc animation ở cả nhánh lỗi.

**Nghiệm thu:** arrangement thiếu, index/module sai, thiếu phí đều không mất đồ; các biên bảo đảm và multiplier đúng; retry/double-click chỉ một lần trừ/cấp; relog giữ kết quả.

### Bước3 — Hoang Cổ Mê Hàng (OldTrek, ưu tiên S6)

**Mục tiêu:** loại xung đột lưu gây ngắt phiên, giữ hành trình và tài nguyên.

1. Bám6 lỗi09:18–09:22 ngày07/10; đọc đúng `old-trek.js`, PlayerService/MutationService/CAS live. Phân biệt guard từ chối snapshot stale với Mongo lỗi hoặc request timeout.
2. Tái hiện checkpoint7008 và encounter7002 đồng thời với tăng cấp/save khác; thử hai phiên, deferred-save, phiên cũ disconnect và retry.
3. Load/drain bản mới trong lock trước mutation theo contract hiện có; không ghi đè cấp/EXP/items từ snapshot cũ, không bỏ kiểm stale-save để ép thành công.
4. CAS thất bại phải trả snapshot/lý do có thể phục hồi; client dùng revision mới và retry hữu hạn theo receipt, không tự gọi lại vô hạn. Lỗi lưu không được ACK thành công.
5. Rà event quá hạn/arrival bằng read-only mới: snapshot4017 ngày02/10 là lịch sử, không tự coi còn tồn tại sau recoveryv5. Nếu còn, dùng ledger/receipt và policy timeout của event, không tự đổi thành thắng hoặc xóa cargo/chuyến.

**Nghiệm thu:** đồng thời tăng cấp và encounter không hạ cấp/mất đồ; cùng eventUid/trekUid chỉ nhận một lần; client không kẹt mask; hành trình/save/relog tiếp tục. Log có scope request/revision và save outcome, không chỉ che lỗi. S6 là điểm QA đầu; không dùng người chơi thật để ép lỗi.

### Bước4 — Đào bảo Tinh Cung (21/21001)

1. Chốt contract xúc xắc thường/xúc xắc đặc biệt, giá nguyên liệu, ô/nhà/thẻ/vòng và thưởng từ native + Activity21*. Phải phân biệt tham số chọn xúc xắc hợp lệ với kết quả bước người chơi tự khai.
2. Xúc xắc thường và kết quả ngẫu nhiên do server quyết định; xúc xắc đặc biệt chỉ nhận lựa chọn trong dải và quyền được config cho phép. Không xóa cơ chế chọn bước vốn có của xúc xắc đặc biệt.
3. Validate vị trí hiện tại/cycle/ô kế tiếp; resolve reward/fate/building theo đúng config, consume đúng item một lần trên draft.
4. Receipt khóa hành động; lưu vị trí, phí, score và thưởng trước phản hồi. Client chỉ phát animation theo kết quả đã commit.

**Nghiệm thu:** không thể gửi bước tùy ý để nhận thưởng; không đủ xúc xắc không đi; qua ô xuất phát/đổi vòng/thẻ đặc biệt đúng; mất ACK/retry không di chuyển hoặc cấp lại; thiếu bảng thưởng không consume.

### Bước5 — Chọn 1 Trong Quà (27/27001, nhổ củ cải)

1. Chốt board/ô đã mở, boss tầng, resource và xác suất quà từ Activity27*/native. Tên `KnifeReward` là code lịch sử, không đổi thành lối chơi phi đao.
2. Người chơi vẫn chọn ô củ cải; server kiểm ô thuộc board hiện tại, chưa nhận và đúng phiên bản, không nhận index làm bằng chứng đánh thắng/chuyển tầng.
3. Pool/quà đặc biệt và trạng thái board do server sinh/lưu theo contract gốc; kiểm tài nguyên, lượt và điều kiện boss trước consume.
4. Receipt trả cùng kết quả khi gửi lặp; client tự động nhổ dừng khi hết vật phẩm/hủy/lỗi, không mở hai lượt song song.

**Nghiệm thu:** ô ngoài board/đã đào hoặc boss chưa đủ điều kiện bị chặn; chọn ô vẫn hoạt động bình thường; cùng index ở board mới không nhầm receipt board cũ; restart/relog giữ board và phí.

### Bước6 — Bí bảo Thiên Cơ (30/30001)

Đây là phần hoàn thiện nghiệp vụ, không phải sửa một cờ. Cần thời gian nhiều hơn ba event trên.

1. Truy đủ packet1760–1763 và operate/claim thật từ native, `Activity30Config`, task690xx, timer ngày/tầng, mã khóa và quy tắc xếp hạng/tie. Không giả định đây là quay thưởng ngẫu nhiên đơn giản.
2. Nhiệm vụ tăng từ hành động thật trên server; task nạp chỉ tăng từ đơn mua đã xác nhận. Giữ maxDay, rewards/floorRewards và điều kiện tham gia gốc.
3. Mã/lựa chọn hợp lệ được khóa sau thời hạn; snapshot kết quả/giải và phân hạng theo cùng kỳ/cohort. Đồng hồ và kết toán thuộc server; không tin client tự khai thứ hạng/thắng.
4. Xây claim/bảo đảm/task ledger đúng shape native; nhận quà và marker cùng commit. Mỗi ngày/tầng/kỳ không phát lại.
5. Chuyển kỳ bảo toàn quà đã commit/chưa nhận hợp lệ và quyền trả phí; không chuyển entitlement lịch sử thành quà miễn phí của kỳ mới.

**Nghiệm thu:** hoàn thành task thật, vào đúng cửa sổ, submit/kết toán/claim/đổi ngày/relog đều chạy; các ca trùng mã, qua hạn, claim lặp, thiếu phí, lưu lỗi không trùng/mất quà. Nếu thiếu quy tắc backend có nguồn, giữ phần đó đóng và chốt dữ liệu trước; không tự chế kinh tế.

### Bước7 — Luyện đan rút thưởng (37) và Rút hộp thưởng (49)

1. Xác định đúng tên/icon/gói và bảng native (37 dùng Activity37Base/Reward/Show, không kết luận thiếu nghiệp vụ chỉ vì không có file tên Activity37Config).
2. Kiểm từng draw, chi phí, RNG/pool, score, bảo đảm, giới hạn gói, đổi quà, qua kỳ và callback auto.
3. Đối chiếu read-back DB/receipt với các test native. Chỉ sửa ca tái hiện thất bại; không viết lại handler vì thiếu E2E trước đó.

**Nghiệm thu:** bảng cost/reward hiện hữu giữ nguyên; normal/batch/retry/fail đều đúng; mở policy cho event/version đã kiểm, không áp chung hai event.

### Bước8 — Họa Trung Các (Homeland)

1. So exact deployed handler/model/client với candidate03/10; lấy fixture còn fail thay vì áp8 lỗi audit cũ lên bản hiện tại.
2. Chia release nhỏ: A bảo vệ save/lượt/phí/replay; B Vẽ/Cầu phúc/công trình/thu tài nguyên/manh mối; C thăm nhà/rank/thích/chia sẻ; D Cúng tượng/quy đổi.
3. `HomelandStatueConversionConfig` thiếu giá trị cơ sở: tìm nguồn chính thức/config server; nếu chưa có, chặn riêng Cúng tượng trước consume. Không dùng `quality × 100` hoặc bịa12 mức quy đổi rồi gọi gốc.
4. Chốt Họa Linh Tệ224, free/pay count, miễn phí Vẽ, bảo đảm và quà khách theo nguồn xác minh; giữ sở hữu/layout và buff có thời hạn.
5. Khách/rank/share phải trả đúng chủ/server; layout chỉ dùng công trình đã sở hữu; callback lỗi không treo animation.

**Nghiệm thu:** lượt/phí/reward đúng sau relog/đổi ngày; replay không nhân quà; nhà người khác đúng identity; fail trước/sau commit không mất tiền. Nhánh thiếu dữ liệu không chặn rollout phần khác đã đủ chứng cứ, nhưng không nghiệm thu toàn bộ khi còn nhánh đóng.

### Bước9 — Hồi quy Câu cá và Yêu Vương

- **Câu cá/Đại hội/Ngư trường/Chai trôi:** xác minh các bản06/09 vẫn được7node/client dùng; pending cá, UID/skill338, pool theo map, passive cần/bè, shop và mini-game/chai/rank/settlement, lane type6/type33 không chồng. Không tự đổi RNG/tỷ lệ custom đã được user phê duyệt.
- **Yêu Vương:** không hạ stage khi login; mốc48→49…172, roleStageId48, càn quét/nhiệm vụ/claim thắng-thua-replay đúng; Rơi tăng cấp/Rơi thăng bậc1–200 còn giữ lối chơi cũ. Không rollback về bảng45 hoặc xóa namespace920049–920172.
- Chỉ đưa vào danh sách cần code fix nếu regression bằng source/config live thất bại. Release thay đổi activity.js không được làm hỏng các router/task đã sửa.

### Bước10 — Thiên Hạ Đệ Nhất Luận Đạo (TopArena)

1. Giữ event đóng; tái hiện nguyên nhân client không vào game khi deployv3 ngày03/10 trước khi tái sử dụng candidate local. Đọc dependency/load order/router flags và startup/login packet của cả client cũ/mới.
2. Nghiệm thu lần lượt: roster/vòng512→64→8 và phase; snapshot khóa thuộc tính; target identity; combat/thưởng/vé đúng config; dự đoán/pass/worship; battle/hot/bet settlement qua thư đúng một lần.
3. Dữ liệu cũ `topArenaInfo` chỉ migrate sau manifest dry-run theo kỳ, CAS và snapshot. Không biến log giả/score lịch sử thành thưởng thật.
4. Tất cả kiểm thử ở runtime/staging cô lập trước. Login→chọn server→vào game bắt buộc đạt trước khi mở menu TopArena; RAM PASS đơn lẻ không đủ sau tiền sử outage.

**Nghiệm thu:** phase/roster/attrs/rank/round dùng state chung; vé và quà đúng; forecast/pass không claim lặp; scheduler restart không giao lặp; client cũ/mới vào được; kỳ mới chỉ mở theo lịch và settlement phù hợp.

## 4. Bộ kiểm thử chung cho mỗi release

| Tình huống | Kết quả bắt buộc |
|---|---|
| Thao tác thường, batch, quyền đặc biệt | Đúng cost/pool/reward/state native |
| Thiếu vật phẩm, sai input, thiếu config, event đóng/hết hạn | Từ chối trước consume/grant, response đủ shape |
| Double-click, gửi cùng requestId, callback/push lặp | Chỉ commit một lần; requestId đổi payload bị từ chối |
| Hai request đồng thời hoặc hai phiên | Không overspend/grant lặp/ghi snapshot cũ |
| Lỗi trước commit, save null, timeout sau commit | Không ACK thành công giả; retry đọc receipt và state đã lưu |
| Reconnect, relog, restart tiến trình | Không mất tiến độ/đồ/quà; client resync |
| Trước/sau cutoff/reset/ngày/kỳ, bỏ qua nhiều kỳ | Chuyển đúng lịch; lịch sử nhận và đặc quyền không tự cấp lại |
| Người mới, người có state cũ, có purchase/quà pending | Tương thích; không reset hoặc backpay tùy ý |
| Desktop/mobile thực tế | Loading kết thúc; số dư/vé/tiến độ cập nhật, không phải chỉ icon sáng |

Tái dùng fixture hiện có khi còn phù hợp. RAM tests và DB staging không chứa dữ liệu player thật; gameplay E2E trên tài khoản QA được người dùng ủy quyền. User đang chơi yêu cầu giữ tab: không tự đổi server/refresh/bấm nhận thưởng của họ. Không tự tạo account production hoặc gửi mail bù để thử.

## 5. Quy trình phát hành từng đợt

1. **Candidate:** exact live source/config/client; backup chọn lọc cả thay đổi chưa commit của local; manifest hashes/flags, syntax + fixture + native + staging gates.
2. **QA có kiểm soát:** nếu dùng chung source, restart một server không phải canary code cô lập. Cần stage runtime riêng hoặc feature flag theo server để node khác không đọc code mới qua load lazy. Chọn server thí điểm bằng eligibility và scope; lỗi OldTrek ưu tiên S6.
3. **Publish:** CAS so preimage ngay trước atomic replace; chỉ files của release. Contract server phải hỗ trợ client cũ rồi mới publish client/cache key. Static-only không restart game.
4. **Rolling:** chỉ game node cần nạp config/source; chờ từng `/ready` Mongo/Redis + listener/log trước node kế tiếp. Không restart admin/dist/bot ngoài scope.
5. **Read-back:**7/7node, effective config/flags, installed hash và HTTPS served/cache reference; kiểm gameplay persistence/receipt riêng, không suy từ ready.
6. **Quan sát sau mở:** theo dõi bounded errors/latency/counters qua ít nhất ca relog và một cutoff/reset mô phỏng đủ sâu; xác minh cutoff thật đầu tiên bằng read-back trước nghiệm thu settlement. Không lập automation hoặc chạy monitor nền khi chưa yêu cầu.

**Dừng rollout** nếu hash source drift, sai số dư/phần thưởng, double-grant, login hỏng, readiness không đạt, lỗi handler mới hoặc client không tương thích. Không tiếp tục mở các server còn lại để thử may rủi.

## 6. Khôi phục, dữ liệu cũ và cấp bù

- Lỗi sau rollout: dừng giao dịch mới riêng event, giữ dữ liệu và settlement hợp lệ; rollback file chỉ khi current hash khớp candidate và bản trước còn tương thích state mới. Nếu format đã đổi, ưu tiên adapter/forward fix hoặc đóng feature, không hạ schema mù.
- Không restore toàn bộ player DB sau khi người chơi đã tiếp tục, không trả lại snapshot tiền/đồ cũ làm nhân hoặc mất tài sản.
- Repair/cấp bù là đợt riêng: read-only đối soát transaction/receipt/mail/đơn mua; chỉ lập danh sách trường hợp có bằng chứng mất cost/mất quà. Không suy thiệt hại từ log lỗi/HTTP200 hay số dư hiện tại.
- Trước ghi player: manifest identity account/server/role, preimage backup, CAS, marker một lần, dry-run/no-op lần2 và xử lý conflict phiên online. Cấp bù/mail phải có recipient/delivered read-back. Lượt này không có ủy quyền repair/cấp bù riêng.

## 7. Chia đợt và phạm vi tiến hành

| Đợt | Nội dung | Điều kiện để chuyển đợt |
|---|---|---|
| A | Bước0–1: chốt baseline + kiểm soát event lỗi | Đóng server RPC đúng scope, state/lịch không mất |
| B | Bước2: Thiên Giáng Phúc Lộc | Validation trước cost, replay/save/native PASS |
| C | Bước3: Hoang Cổ Mê Hàng/S6 | Tái hiện stale-save rồi sửa + relog/save/cargo PASS |
| D | Bước4–5: Đào bảo Tinh Cung rồi Chọn 1 Trong Quà | Mỗi event một release/mở lại riêng; không gộp kinh tế |
| E | Bước6: Bí bảo Thiên Cơ | Contract/task/result/claim/cycle hoàn chỉnh |
| F | Bước7–8: QA37/49 và Họa Trung Các | Chỉ sửa lỗi tái hiện; phần quy đổi có nguồn rõ |
| G | Bước9–10: hồi quy + TopArena | Login/staging/settlement đạt trước mở TopArena |

Có thể chạy song song đọc native/config và viết fixture độc lập để tiết kiệm thời gian; các thao tác production/repair/mở event phải tuần tự theo gate. Không cam kết giờ hoàn tất cố định: event30, Homeland conversion và TopArena có phụ thuộc dữ liệu/native; ước lượng lại sau baseline và ca tái hiện, không giảm kiểm chứng để chạy theo lịch.

## 8. Evidence và báo cáo cập nhật

- Hiện trạng07/10: `event_live_health_20261007.md`; source live activity SHA256 `097a2b1c8dc222460d01cffb69035251eb7abb0f94914622512924a09a0f2ba6`.
- Catalog/rotation: `events_extra_audit_20261004.md`, `event_bug_backlog_20261007.md`, `event_bug_names_20261007.md` (đã đính chính).
- Đã sửa để hồi quy: `fishing_integrity_fix_20260906.md`, `fishing_full_release_20260906.md`, `fishing_contest_shop_fix_20260906.md`, `demon_boss_drop_task_fix_release_20260922.md`, session_report phần drop200_original07/10.
- Chưa đủ dữ liệu: `homeland_fix_plan_test_20261003.md`; OldTrek recovery `oldtrek_stuck_plan_20261002.md`; TopArena `toparena_audit_20260927.md` và rollback03/10 trong session_report.
- Mỗi release ghi gọn kết quả/ca lỗi/source chính/test static-vs-live/còn thiếu/backup/rollback trong `_ai_workbench/reports/session_report.md`; dùng manifest/receipt cho log chi tiết.

## Cập nhật thực thi 08/10/2026

### Đã hoàn tất trong đợt này

1. **Ổn định OldTrek toàn fleet:** bật scoped-CAS v3 tuần tự S4 → S7 → S1 → S2 → S3 → S5, giữ S6 canary; backup/CAS/hash/readiness đều PASS, không có lỗi save mới trong cửa sổ restart/soak.
2. **Fulu persistence gate:** RAM/integrated 41/41 + 40 PASS; Mongo QA thật trên DB tổng hợp S1–S7 PASS cho claim/draw đồng thời, CAS, ACK-loss replay và reset ngày; dọn sạch synthetic docs.
3. **Exposure gate:** type21/27/30/52 vẫn bị chặn cho identity thường trên cả 7 node; Fortune/Kim Mã giữ nguyên; không mở event theo config/player rows.

### Thứ tự còn lại, không được bỏ cổng

1. Quan sát OldTrek bounded sau rolling và native QA được ủy quyền; nếu xuất hiện save error mới thì dừng, giữ rollback theo backup từng đợt.
2. Hoàn tất một ca native Talo/S1 sau relog cho Fulu (draw/claim/replay/callback + raw task/ledger/economy read-back), rồi mới tạo `nativeQaVersion` allowlist và canary 1 node.
3. Giữ 21/27/30 đóng đến khi có contract authoritative. Type30 đã có Mongo QA cô lập ngày07/10 (`mongo-repository-result.json`); còn scheduler/cohort/cutoff, task hook/handler/runtime mail và native QA. Harness lỗi đường dẫn ngày08/10 không phủ nhận kết quả Mongo trước.
4. Type37/49 chỉ giữ phạm vi release hiện tại (type49 exchange-only); Homeland và TopArena không mở khi còn thiếu native settlement/nguồn quy đổi.
5. Chỉ rolling public allowlist từng event sau backup/CAS, 7-node readiness, public hash, persistence/relog và bounded error/latency read-back.

`/ready` 7/7 không phải tiêu chí hoàn tất gameplay; mọi gate trên phải đạt độc lập.

Danh sách ưu tiên và checklist hiện hành được hợp nhất trong `event_progress_20261008.md`: Phúc Lộc → lỗi lưu OldTrek → Lô hỏa đan tâm; Hộp báu mới đủ phần đổi quà. Fulu Mongo dùng7 fixture serverId trên một DB QA, chưa phải gameplay7 node. Dùng bằng chứng này để tránh yêu cầu chạy lại storage đã kiểm hoặc suy ra toàn event đã hoàn tất.
