# Session Report — kế hoạch sửa cường hóa cần câu và bè

Ngày 06/09/2026. **Phiên này lập kế hoạch theo audit đã xác nhận, chưa sửa source, triển khai hoặc thay dữ liệu người chơi.** Bằng chứng nguồn: [audit cường hóa](fishing_gear_audit_20260906.html), snapshot07:24:34 UTC+7.

## 1. Tóm tắt công việc

Thứ tự đề xuất: sửa hợp đồng thao tác/chi phí → chuyển bậc/chỉ số/tối đa → hiệu ứng bè → kiểm thử đầy đủ → triển khai S2 rồi S1. Chỉ sửa logic cho thao tác mới; không tự hạ cấp, thu hồi chỉ số, hoàn tiền hoặc phát bù cho lịch sử.

### Giai đoạn 1 — thống nhất thao tác và chi phí

Tạo một bộ xử lý dùng chung cho cần/bè, lấy giới hạn và giá từ FishRodGradeConfig/FishRaftGradeConfig hiện có. Không đổi giá hoặc tỉ lệ cân bằng trong công việc này.

| Trạng thái | Thao tác được phép | Chi phí và kết quả dự kiến |
|---|---|---|
| Chưa tới cấp trần của bậc | Cường hóa thường/nhanh | Dùng Ngư Tệ68; tăng exp, đủ thanh thì tăng cấp và bắt đầu thanh tiếp theo |
| Đã tới cấp trần nhưng exp chưa đầy | Cường hóa thường/nhanh để hoàn thành thanh cuối | Vẫn dùng68; giữ nguyên cấp, tăng exp tới giới hạn; tuyệt đối không tự đổi sang trừ69 |
| Đã tới cấp trần và exp đầy, còn bậc tiếp theo | Chỉ thao tác nâng bậc | Dùng tinh thể69 đúng gradeUpCost; tăng bậc, bắt đầu cấp1/exp0 theo native |
| Bậc cuối đã hoàn thành cấp và thanh exp cuối | Tối đa | Không trừ gì, không có nút nâng; server từ chối mọi yêu cầu nâng thêm |

Client sẽ gửi rõ ý định nâng thường, nâng nhanh hay nâng bậc, kèm trạng thái đã nhìn thấy. Server kiểm lại trước khi trừ; request cũ/chậm không được tự chuyển thành một giao dịch khác loại tiền. Validate upgradeAll đúng kiểu, không coi chuỗi “false” là nâng nhanh.

Nâng nhanh chỉ hoàn thành thanh/cấp kế tiếp như UI hiện tại, hoặc dùng phần Ngư Tệ hiện có để tăng exp tương ứng; không tự chạy xuyên sang nâng bậc. Khi đạt thanh cuối, dừng và chờ người chơi chủ động chọn nâng bậc.

Ví dụ dựa trên state nicky trong audit, không phải thao tác đã thực hiện:

| Đồ | Đang có | Sau bản sửa, bước kế tiếp đúng với UI |
|---|---|---|
| Cần | Bậc2/cấp20/exp0 | Nạp đủ200 exp bằng200 Ngư Tệ; sau đó mới có thể chủ động dùng30 tinh thể lên bậc3/cấp1 |
| Bè | Bậc1/cấp10/exp0 | Nạp đủ100 exp bằng100 Ngư Tệ; sau đó mới có thể chủ động dùng15 tinh thể lên bậc2/cấp1 |

Ví dụ giữ nguyên cấu hình hiện hành và không khuyên mua thêm tinh thể khi lỗi chưa sửa. Nếu hết tinh thể, trạng thái sẵn sàng nâng bậc phải được giữ sau relog, không làm mất thanh exp đã nạp.

### Giai đoạn 2 — cấp, thuộc tính và trạng thái tối đa

- Khi thao tác nâng bậc mới thành công: dùng cấp nội bậc1/exp0 như native preview, không mang cấp của bậc cũ sang cộng lần nữa.
- Kiểm fullLevelAttrs đã chứa tích lũy trước đó; so mọi mốc để việc chuyển bậc đúng không làm giảm tổng chỉ số. Không sửa theo cảm tính chỉ một rank.
- Chỉ số xem trước, phản hồi server, BattleService và payload đăng nhập phải cho cùng kết quả.
- Mốc rank10/cấp1400 và thanh cuối dùng một điều kiện MAX thống nhất; nút, thanh exp, thông báo và server cùng hiểu một trạng thái.
- Kiểm riêng dữ liệu legacy đã chạm trần nhưng exp0: trước khi phát hành phải thống kê có ai từng được coi là hoàn tất hay không. Không tự buộc một trạng thái đã hoàn tất lịch sử trả thêm phí; trường hợp cần chuyển đổi phải có preview và quyết định riêng.

### Giai đoạn 3 — hiệu ứng bè và phạm vi giới hạn

- Bổ sung attrs104 của bậc bè vào xác suất tiết kiệm mồi phụ khi bè/tính năng thực sự đã mở.
- Cộng cùng dòng tẩy104, giữ cap25% của bảng riêng hiện tại; không cho hưởng bonus bè khi chưa mở.
- Test xác suất theo điểm biên xác định: bè bậc10 có15%, kết hợp dòng tẩy6% là21%, không nhầm thành được miễn chắc chắn mỗi lượt.
- Bonus101 Hải thần tiếp tục theo công thức đã dùng. Tập trung, sức mạnh, cá lớn, hiệu suất mồi/di vật/sự kiện ngoài các lỗi đã xác nhận cần audit riêng, không hứa sửa toàn bộ RNG trong gói này.

### Giai đoạn 4 — bảo vệ giao dịch và dữ liệu đã có

- Có mã giao dịch và kiểm phiên bản/trạng thái; gửi lại không bị trừ hoặc nâng lần hai. Tái sử dụng mô hình biên nhận đã có cho tẩy/hộp, không thay global queue.
- Tính trước cost/state trên bản sao, lưu inventory + state + biên nhận cùng lần save xác nhận. Chỉ trả thành công sau save; khi null/timeout/throw không tái sử dụng state chưa rõ đã commit.
- Giữ nguyên rank/level/exp và chỉ số của đồ hiện có khi tải nhân vật; không chạy normalizer hạ cấp hàng loạt.
- Ví dụ cần2/20 hiện tại vẫn là2/20 sau triển khai. Chỉ khi người chơi thực hiện nâng bậc mới, bộ xử lý mới áp quy tắc chuyển bậc.
- Lịch sử từng bị trừ sai loại tiền hoặc giữ sai cấp được ghi nhận riêng. Không tự hoàn tiền, thu hồi hoặc điều chỉnh vì user hiện không yêu cầu đền bù.

### Giai đoạn 5 — kiểm thử và triển khai

1. Làm candidate từ source production đã kiểm hash; backup đúng file trước khi sửa.
2. Chạy matrix2 loại ×10 bậc: trước trần, chạm trần, exp thiếu1, đầy exp, chuyển bậc, cuối cùng MAX.
3. Mỗi trường hợp kiểm tiền0/thiếu1/vừa đủ/dư, nâng thường/nhanh/nâng bậc, boolean sai, click đôi, request chậm, retry sau relog và save null/throw.
4. Chạy native functions thật trong VM để so nút hiển thị, cost preview, chỉ số và ACK; giữ phân biệt push4010 và ACK4010.
5. Hồi quy mồi FIFO, tẩy/hộp, đơn có vé, linh hồn reserve, giữ cá/stat và ngoại quan để không phá các bản sửa trước.
6. Staging trên VPS trước; đạt kiểm tra mới phát hành S2 rồi S1. Chỉ restart hai tiến trình game, không dist/admin/bot worker/DB.
7. Dùng nhân vật QA riêng qua WebSocket, DB/relog; nghiệm thu UI native. Chỉ thử giữ QA xuyên restart trong cửa sổ triển khai phù hợp, không restart thêm hệ thống người chơi chỉ để có một dấu PASS.
8. Hậu kiểm hash, listener/HTTP/WSready, log, PID của dịch vụ ngoài phạm vi; dọn đúng QA và cập nhật MD/HTML. Có rollback source, không rollback document người chơi đang hoạt động từ snapshot cũ.

## 2. File/thư mục đã thay đổi

### Đã thay đổi trong phiên lập kế hoạch

- Tạo báo cáo kế hoạch này và bản HTML.
- Cập nhật `_ai_workbench/reports/session_report.md` và `.html`.
- Backup báo cáo cũ: `_ai_workbench/backups/fishing_gear_plan_reports_20260906/`.
- Không sửa code/config, không remote mutation, gameplay, deploy, restart hoặc bù.

### Dự kiến khi triển khai

- `src/handlers/fish.js`: validate input, chuyển tiếp sang bộ xử lý, ACK và sync.
- Một helper hẹp cho nâng cần/bè, ưu tiên trong `src/services/`; không refactor các module khác.
- `src/services/FishingBalanceService.js` / `FishingIntegrityService.js`: bonus bè/cap và giao dịch chỉ khi cần.
- `src/handlers/playerPayload.js` và `BattleService.js`: chỉ chỉnh những điểm cần đồng nhất state/chỉ số, không thay công thức ngoài phạm vi.
- Client `main.min_a6195824.js` và cachekey ở `index.html`: tách thao tác, request id/state, MAX và thông báo.
- Tests/tools/evidence mới đều trong `_ai_workbench/`; candidate dùng cây snapshot, không upload toàn bộ source local.

## 3. Lỗi đã gặp & giải pháp

| Lỗi đã xác nhận | Sửa dự kiến | Điều kiện chấp nhận |
|---|---|---|
| Nút68 nhưng server đòi/trừ69 | Tách ý định thao tác, cùng điều kiện cấp+exp | Không giao dịch nào trừ khác loại đang xác nhận |
| Exp tại cap không nạp được | Cho hoàn thành thanh cuối bằng68 | Cần/bè đang kẹt có thể tăng exp mà không cần69 |
| GradeUp giữ cấp cũ, chỉ số vượt preview | Cấp nội bậc mới1, tính base đúng | Preview=ACK=combat=payload relog |
| MAX server/UI khác nhau | Dùng terminal state thống nhất | HiệnMAX đúng, mọi request sauMAX không trừ gì |
| Bè104 chưa miễn mồi | Cộng bonus khi mở đúng, chung cap hiện hành | Fixed-RNG chứng minh hiệu lực, không hưởng khi chưa mở |
| upgradeAll truthy | Validate kiểu | “false” dạngchuỗi không gây bulk consume |
| Nguy cơ sửa lịch sử làm giảm stat | Không migration tự động | Nạp/relog sau deploy không đổi đồ cũ |

Không gặp hoặc fix lỗi source mới trong lượt lập kế hoạch. Bằng chứng bug vẫn là audit trước, không có kết quả triển khai mới.

## 4. Kỹ năng / kinh nghiệm mới

- Chỉ so final save là chưa đủ: đúng tiền đang hiển thị, loại thao tác và state trước khi người chơi bấm cũng là điều kiện an toàn.
- Sửa logic cho thao tác tương lai và sửa document lịch sử là hai phạm vi khác nhau. Một yêu cầu sửa bug không tự cho phép hạ rank/level hoặc thu hồi tài sản lịch sử.
- Terminal state cần thống nhất client/server và chú ý legacy, không chỉ chặn rank lớn hơn10.

## 5. Trạng thái hiện tại

- Kế hoạch đã lập, dựa trên27 probe audit và native/config đã đọc. Chưa chạy test sửa mới hoặc live QA.
- Không refresh số liệu người chơi trong lượt này. Ví dụ nicky và số profile ảnh hưởng là snapshot07:24, không trình bày như trạng thái live mới.
- Chưa thay source, DB, client, giá hoặc cân bằng. Bản lỗi được audit vẫn chưa được fix bởi phiên kế hoạch này.
- Khuyến nghị triển khai gói sửa logic an toàn trước, giữ nguyên dữ liệu lịch sử và không đền bù.

## 6. Bước tiếp theo

Khi user yêu cầu bắt đầu: lấy baseline production mới, tạo candidate và testRED từ các probe trước; sửa giai đoạn1–3 rồi hoàn thành các chốt giao dịch/QA ở giai đoạn4–5. Nếu xuất hiện yêu cầu chuyển đổi dữ liệu legacy ngoài nguyên tắc giữ nguyên, dừng riêng nhánh đó để xin quyết định; không trì hoãn các phần sửa an toàn độc lập.
