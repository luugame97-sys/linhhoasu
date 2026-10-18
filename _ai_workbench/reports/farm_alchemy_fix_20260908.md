# Linh điền và Luyện đan — phát hành giới hạn 08/09/2026

## Trạng thái

**Đã phát hành S2 rồi S1 lúc 07:48 GMT+7 ngày08/09/2026**, sau khi người dùng đồng ý phát hành phần đã kiểm chứng và tạm chặn các nhánh chưa hoàn chỉnh. Không bù/thu hồi hoặc chạy sửa DB người chơi. Cần tải lại game để nhận client patch.

- Cài17file đúng hash/CAS; restart mỗi game process đúng1lần,4process khác không đổi. S2PID15880, S1PID15982; ready8083/8080=200.
- 48 nhóm fixture và core contract714 bảng chạy lại trên mã đã cài sau mỗi restart đều đạt. Đây là fixture memory DB, không phải phiên gameplay tài khoản thật.
- Hash đĩa/HTTP nội bộ/HTTP public của index và client patch khớp. Log mới kiểm tra có cảnh báo Mongoose isNew cũ, không có marker fatal/exception/lock error trong phần log được đọc.
- Backup: /linhhoasu/_ai_workbench/backups/farm_alchemy_release_20260908_004812. Manifest/kết quả: _ai_workbench/temp/farm_alchemy_fix_20260908/release.json. Rollback source có guard trong tools/deploy_farm_alchemy_20260908.py; không rollback dữ liệu gameplay đã phát sinh.

## Đã sửa trong bản ứng viên

- Hạt thường29/30/31 dùng cây38/39/40, tách namespace cây thường và cây kỳ dị; chặn gieo bằng vật phẩm tùy ý/ô khóa/ô còn cây. Không sửa ngược cây lịch sử, không tự chọn tỷ lệ hạt100.
- Thu hoạch từng ô/thu hoạch tất cả xóa đúng object đang được lưu; chặn nhận lặp, ô khóa và ô đang bị trộm. Đồng bộ item33 khi lên cấp, cache thưởng, block và nhật ký.
- Khóa các role liên quan trước thao tác trộm; dùng object online làm nguồn đúng, xem ruộng không ghi snapshot. Chặn tự trộm, tự tạo chuột, hủy trộm của người khác, phá bảo vệ30%, cùng chủ nhiều ô. Thu trộm cây38/39/40 trả Linh thực34 thay vì cropID ẩn.
- Có outbox bên chủ ruộng trước cấp thưởng trộm; khi claimant save thất bại vẫn còn biên nhận để tiếp tục, dọn outbox sau claimant commit. Thất bại lưu không được giữ phiên đang tin rằng đã hoàn tất. Chưa cam kết giao dịch Mongo đa-document/cross-process.
- Receipt tối đa64 kết quả/24h, hash request và chặn requestId đã nghỉ; replay không cấp thêm. RequestId mới là ý định mới; old client chỉ còn WS replay theo msgUid. Client patch tạo requestId cho luồng mục tiêu, không tự cấp số lượng.
- Shop Linh điền/đan phương: đúng giá lần đầu/costAgain, draft+save xác nhận, xóa cache, biên nhận phát lại; chặn gói mua trộn với shop ngoài phạm vi để không bypass nhánh chuyên biệt.
- Luyện thường và auto đều phát level/EXP; giữ đan phương, trả đan dược theo config; cap auto/dùng đan thống nhất privilege; từ chối dùng thảo dược như consumable và dùng đan sai cảnh giới; giới hạn level về bảng và lưu legacyLevel để không mất thông tin cũ.
- Build dùng thời gian cấp hiện tại,300giây/vé; xử lý nâng cấp đã hết hạn trước lượt tiếp; combat dùng BattleService thay kết quả win cố định. Phân27 phục hồi theo AssetsRefreshConfig.
- Alias2426–2428 kiểm tra thẻ và trả đúng tag; quảng cáo1/2/5 chỉ xử lý quyền bỏ qua quảng cáo đã xác minh từ thẻ+quota. Telemetry200 không được coi là bằng chứng xem quảng cáo.
- Client guard chặn callback thành công khi server từ chối, trả reservation gieo/tăng tốc khi lỗi, không xóa slot bánh khi claim sớm lỗi. Các RPC ngoài phạm vi giữ nguyên.

## Các phần còn giới hạn đã được người dùng chấp thuận

| Phần | Tình trạng bản ứng viên | Cần gì |
|---|---|---|
| Hạt100, ô kỳ dị tự mọc lại | Từ chối nếu thiếu trọng số; giữ seed, không đặt xác suất đều | Bảng tỷ lệ gốc hoặc quyết định gameplay rõ ràng cho từng nhóm |
| Quảng cáo thật, tài khoản không có skip-ad | Từ chối khi không có bằng chứng server | Tích hợp/chọn nguồn xác thực từ nhà quảng cáo; không dùng packet client tự khai |
| Bón ruộng người khác | Chưa triển khai kết toán chi phí hai người, hiện trả lỗi có mã | Hoàn thiện outbox/chi phí và đồng bộ trước khi bật |
| Trợ giúp build/fight | Trả unavailable thay thành công giả | Gắn pipeline trợ giúp hiện hành và kiểm UI/tiêu hao |
| Auto offline, cấp hạt mỗi ngày | Chưa mô phỏng/không tự cộng seed khi chưa biết lịch cấp | Xác minh lịch/quyền lợi/cơ chế offline; không coi số cap là lịch phát thưởng |
| UI người chơi thật | Chưa chạy; rollout S2/S1 đã qua health và fixture mã đã cài | Tài khoản QA riêng/UID để kiểm chứng tương tác hiển thị nếu cần |
| Dữ liệu cây/đồ sai đã có | Giữ nguyên; chưa repair | UID/server, receipt hoặc snapshot trước-sau và phê duyệt riêng |

Các phần “trả lỗi an toàn” không được tính là sửa đầy đủ tính năng. Người dùng đã chấp thuận phát hành giới hạn; chưa có ủy quyền tự đặt tỷ lệ hoặc sửa dữ liệu lịch sử.

## Kiểm chứng

- 48/48 nhóm test local và Linux staging đạt, gồm148 công thức; cấm mạng, productionWrites=0.
- 19/19 test luyện đan cũ được cập nhật dependency/expectation và đạt. Core contract714 bảng và show-info contract local đạt.
- Có test callback/native packet lấy từ bundle thật, nhưng không phải kiểm thử renderer/thiết bị/tài khoản thật.
- Lần staging đầu sai đường dẫn cấu hình và thiếu acorn test; đã sửa CONFIG_BIN_PATH và đặt acorn riêng trong thư mục tool. Test nay dừng sớm nếu thiếu bảng cấu hình, không thể báo PASS giả khi không có công thức.
- Stage dùng phát hành: /linhhoasu/_ai_workbench/temp/farm_alchemy_20260908_001513. Release manifest ghi đầy đủ baseline, candidate, backup, canary và hash sau cài; stage.json vẫn là ảnh chụp giai đoạn staging, release.json là trạng thái triển khai mới nhất.
- Chỉ bản staging giữ các tên mặc định và dòng log live; helper async-save local cũ không được đưa vào stage. Giữ returnSaved:false đã có ở commerce live.
- Warning Mongoose isNew có sẵn vẫn xuất hiện trong fixture; chưa sửa schema ngoài phạm vi.

## File/bằng chứng

- Test: linhhoasu/lhs/newServer/scripts/test-farm-alchemy-fix.js; test-alchemy-craft.js.
- Stage tool: _ai_workbench/tools/stage_farm_alchemy_20260908.py (không có action deploy).
- Deploy/rollback tool: _ai_workbench/tools/deploy_farm_alchemy_20260908.py.
- Manifest: _ai_workbench/temp/farm_alchemy_fix_20260908/stage.json; linux-test.json; linux-stderr.txt; pending.json.
- Backup local4file đầu: _ai_workbench/backups/farm_alchemy_fix_20260907. Snapshot live trước stage: temp/farm_alchemy_fix_20260908/before-N.
- Source sửa: handlers/farm,alchemy,item,account,commerce-compat,index; services/AlchemyCraft,ItemPill,PlayerMutation; net/WSServer; client index.html + lhs-farm-alchemy-v2.js.
- Service mới: FarmAccessService, FarmShopService, FarmAdService, FarmRecoveryService, FeatureReceiptService.

## Bước tiếp theo

1. Reload client, đối chiếu trên tài khoản nếu còn triệu chứng cụ thể. Không dùng ready200 thay cho QA nhận đồ.
2. Hoàn thiện những mục chưa triển khai còn trong phạm vi người dùng chọn, bổ sung test fault-injection và UI.
3. Chốt tỷ lệ hạt100/ô kỳ dị, provider ads và luồng chưa hoàn thiện trước khi mở lại; mọi release tiếp theo phải có baseline/hash/rollback mới.
