# Session Report — Banner câu cá lặp và Tiền đồng

## 1. Tóm tắt công việc

Đã sửa và phát hành lỗi banner “Tiến hành 100 lần câu cá” lặp. Native TaskModel nhận tag1000 trạng thái20 (hoàn thành) và luôn gọi banner, ngay cả khi trạng thái trước đó đã20. FishingEventService gửi đồng bộ sau mỗi lượt câu/heartbeat, vì vậy banner cứ được kích hoạt lại. Không phải mỗi banner là một lần nhận thưởng.

Bản sửa chỉ áp dụng nhiệm vụ Đại hội câu cá60601–60608/type6006: lấy trạng thái cũ trước khi thay row và chỉ gọi completion tip khi trạng thái trước không phải20. Đồng bộ tiến độ/listener vẫn giữ; vòng mới trở về10 rồi lên20 được báo lại. Không tắt toàn bộ thông báo hoặc tự nhận quà.

Tiền đồng trong ảnh là item119, không phải tiền câu cá68. Đã xác minh thiếu luồng cấp item119, chưa tự đặt tỷ lệ rơi hoặc thêm tiền.

## 2. File/thư mục đã thay đổi

- Source chính local và production: `linhhoasu/webgame/game/js/main.min_a6195824.js` và `linhhoasu/webgame/game/index.html`. Client token `20260907_fishing_notice_v1`.
- Snapshot hiện hành: `_ai_workbench/temp/fishing_audit_20260906T211352Z/` (167 file, server/client config và state câu cá read-only).
- Bản sửa, test và manifest: `_ai_workbench/temp/fishing_notice_20260907/`.
- Tools inspect/build/test/audit/release/sync trong `_ai_workbench/tools/`.
- Backup VPS `/linhhoasu/_ai_workbench/backups/fishing_notice_20260906_211706/`; backup local `_ai_workbench/backups/fishing_notice_local_20260907/`, báo cáo cũ trong `backups/fishing_notice_reports_20260907/`.
- Không sửa gameplay server, config RNG, scheduler, wallet/reward/DB hoặc input-freeze đang pause.

## 3. Lỗi đã gặp & giải pháp

| Lỗi | Nguyên nhân | Cách xử lý | Cách tránh lặp lại |
|---|---|---|---|
| Banner nhiệm vụ hoàn thành cứ hiện | Client coi mọi sync status20 là completion mới | Kiểm trạng thái trước khi thay row; chỉ báo khi chuyển trạng thái | Test packet lặp, login snapshot, claim30, vòng mới, mốc kế tiếp |
| Tiền đồng119 bằng0, không tìm thấy nguồn | Chỉ có quảng bá và cửa hàng, không có reward/drop implementation | Lưu audit item119; giữ pending quyết định tỷ lệ | Không coi showRewards là bảng rơi thực tế |
| Tìm file rơi vào bundle/vendor quá lớn | Minified/many config rất nhiều match | Trích native function bằng Acorn, lọc đúng cấu trúc id/count | Không dump bundle hoặc coi ID trùng của bảng khác là item |
| Local index khác hash | Khác newline, nội dung đã so tương đương | So normalized content trước sync, giữ backup cả hai | Không chép đè local chưa kiểm drift |

## 4. Kiểm thử / kinh nghiệm

9 kiểm tra native function thực tế PASS:

- Baseline:20 packet giống nhau hiện20 banner.
- Bản sửa:100 packet giống nhau chỉ một banner.
- Snapshot login đã hoàn thành không bật banner mới.
- Claimed30 im lặng và giữ trạng thái.
- Vòng mới30→10→20 được thông báo trở lại.
- Mốc60602 độc lập với60601.
- Nhiệm vụ ngoài Đại hội không đổi hành vi.
- Tiến độ chưa hoàn thành vẫn cập nhật và dispatch đủ listener.
- Chưa khởi tạo task state vẫn no-op như cũ.

Acorn parse toàn bundle và Node syntax local/Linux PASS. HTTP main/index hash khớp disk; ready8080/8083 đều200, PM2 giữ nguyên. Không chạy gameplay RPC/nhận thưởng bằng tài khoản người chơi. Chưa tự đo banner native đang mở trên thiết bị thật sau reload; xác minh hành vi bằng function native trích nguyên bundle và lưu đầu ra.

## 5. Trạng thái hiện tại

Phát hành04:17:44 GMT+7, hậu kiểm04:17:46. Main SHA256 `2cc9a3811fd61cc421c3ce240982aae84582593e38d5d8c679a7a2af8c9d6c42`; index `532c463a4c4dd0643cc682919a86e7119c508066050c6443b808cde42605dfe3`. Bản local khớp cả hai. Game không restart, không thu/bù/reset vật phẩm.

### Item119 còn thiếu

- AssetsConfig119 có icon119/name Tiền đồng; tooltip nói có tỷ lệ nhận **khi bán cá trong sự kiện** và chuyển đổi khi kết thúc.
- 25 Activity33 showRewards có119; 32 cost rows của shop dùng119. Ví dụ11012001 tốn1250 để đổi29040.
- Không có actual reward row `{id:119,count:...}` ngoài showRewards/cost trong714 bảng đã quét.
- FishingGameplayService.sale, FishingEventService, fish và fish-soul đều không tham chiếu119. Mini-game33001 chỉ cấp69/68/94501 theo bảng hiện hữu.
- Thiếu tỷ lệ/số lượng rơi, logic thưởng+25% của thẻ Huyền Vũ và quy tắc quy đổi tồn cuối kỳ; không thể gọi hoạt động hiện tại là nguồn kiếm119 hợp lệ.

Kết quả này xác nhận phần triển khai còn thiếu, không phải lỗi người chơi chưa biết bấm nhận. Chưa tự thêm drop, bù lịch sử hoặc bán hàng mới. Evidence `currency-audit.json` trong thư mục candidate.

## 6. Bước tiếp theo

Người chơi tải lại game một lần để nhận client token mới; chỉ đóng/mở panel không thay bundle đã tải trong bộ nhớ.

Muốn hoàn thiện119 cần cung cấp bảng gốc hoặc duyệt bảng riêng: phạm vi scene/event, xác suất và số lượng khi bán cá, bonus Huyền Vũ25%, cửa sổ đổi đồ và tài nguyên/tỷ lệ chuyển đổi cuối kỳ. Sau đó test normal/auto, bán batch, replay/save failure/relog và cuối kỳ. Không tự điền các con số chưa có bằng chứng.
