# Chẩn đoán số lượng vật phẩm lớn — 07/09/2026

## 1. Tóm tắt công việc

Phạm vi: người dùng yêu cầu tìm phương án sửa số lượng chỉ hiện đầu số trong ảnh bảng thưởng Đại hội câu cá. Phiên này chỉ chẩn đoán; không sửa source game, không triển khai, không thay đổi quà hoặc dữ liệu người chơi.

Đã đọc báo cáo phiên trước: bản kinh tế câu cá đã phát hành. Đã xem ảnh người dùng, truy vết formatter, skin, atlas font và phép đo chữ của Egret. Đọc VPS qua SFTP: 8/8 file liên quan khớp SHA-256 với local. Không restart hoặc đăng nhập tài khoản người chơi.

## 2. File/thư mục đã thay đổi

- Tool mới: `_ai_workbench/tools/audit_item_count_font_20260907.py` giải mã font theo loader thật.
- Tool mới: `_ai_workbench/tools/test_item_count_display_20260907.js` chạy formatter và phép đo Egret trích từ bundle.
- Tool mới: `_ai_workbench/tools/check_item_count_live_20260907.py` đọc/hash 8 file client trên VPS, không ghi remote.
- Log fixture: `_ai_workbench/logs/item_count_display_diagnosis_20260907.json`.
- Báo cáo này và bản HTML tương ứng; cập nhật `session_report.md/.html`.
- Backup báo cáo cũ: `_ai_workbench/backups/item_count_diagnosis_20260907/`.
- Không thay đổi source chính, config hoặc asset game.

Các file đã kiểm tra nằm dưới `linhhoasu/webgame/game/`: `js/main.min_a6195824.js`, `js/egret.min_7d668222.js`, config và language config, `gameEui_18e11b8e.bin`, hai font pack và PNG `font_num_prop_d1529ac2.png`.

## 3. Lỗi đã gặp & giải pháp

| Lỗi | Nguyên nhân/bằng chứng | Cách xử lý đề xuất | Cách tránh lặp lại |
|---|---|---|---|
| Mất đơn vị trên icon | ItemIcon.labelShow gọi overLength; countLab là eui.BitmapLabel dùng font_num_prop_fnt. Font có số và đơn vị Trung nhưng không có V/ạ/n, T/ỷ, T/r/i/ệ/u | Formatter số lượng riêng kết hợp font hỗ trợ đủ ký tự; ưu tiên nhãn native eui.Label cho số lượng | Test chuỗi formatter luôn được renderer thể hiện đủ |
| Chiều rộng bị đo hụt | letterSpacing=-2.5; Egret cộng khoảng cách âm cho cả glyph bị thiếu. 100Vạn đo 44.5, trong khi các chữ số cần 52 đơn vị local | Không đưa ký tự thiếu vào BitmapLabel; ràng buộc chiều rộng, căn phải, một dòng | Test đo/layout ở nhiều scale và khi tái sử dụng renderer |
| Dịch sai bậc lớn | Nhánh chia 10^8 nối LanguageConfig 30020171='Tỷ'; chia 10^12 nối 30020322='Triệu' | Chuẩn hóa số lượng theo nghìn/triệu/tỷ/nghìn tỷ, rà các nơi dùng chung trước sửa bản dịch | Test mốc chuyển đơn vị; không đổi toàn bộ formatter lực chiến thiếu kiểm tra |
| Đổi sang K/M đơn thuần vẫn mất chữ | Font hiện tại cũng không có K/M/B/T | Thay loại nhãn số lượng hoặc bổ sung atlas + metadata đúng quy trình | Test font trước khi đổi hậu tố |
| Giải mã font pack bằng decoder config lỗi version 5734 | Format khác nhau: font pack là zlib rồi danh sách font/glyph, không có header object version 2 | Dùng loader FntHelper làm nguồn chuẩn cho decoder đọc-only mới | Không dùng một decoder cho mọi file bin |
| Console Python lỗi UnicodeEncodeError | Encoding stdout mặc định GBK không chứa ký tự Việt | Chạy python -X utf8 | Không chuyển encoding asset để sửa lỗi console |

Đây là lỗi tương thích font ảnh và bản địa hóa, không phải bằng chứng file tiếng Việt bị mojibake. Không chạy chuyển mã đại trà.

### Bằng chứng định dạng số

| Số lượng gốc | Chuỗi hiện tại | Ký tự font có thể vẽ | Đề xuất trên icon | Chi tiết đầy đủ |
|---|---|---|---|---|
| 100000 | 10Vạn | 10 | 100K | 100.000 |
| 300000 | 30Vạn | 30 | 300K | 300.000 |
| 680000 | 68Vạn | 68 | 680K | 680.000 |
| 800000 | 80Vạn | 80 | 800K | 800.000 |
| 1000000 | 100Vạn | 100 | 1M | 1.000.000 |
| 100000000 | 1Tỷ, sai bậc | 1 | 100M | 100.000.000 |
| 1000000000 | 10Tỷ, sai bậc | 10 | 1B | 1.000.000.000 |
| 1000000000000 | 1Triệu, sai bậc | 1 | 1T | 1.000.000.000.000 |

K=nghìn, M=triệu, B=tỷ, T=nghìn tỷ. Đây là phương án đề xuất, chưa được triển khai. Chi tiết phải dùng số gốc, không khôi phục từ chuỗi rút gọn hoặc làm tròn lên.

## 4. Kỹ năng / kinh nghiệm mới

- Đổi chữ dịch không bổ sung được glyph cho font bitmap. Tăng chiều rộng đơn thuần cũng không sửa việc thiếu glyph.
- Có thể chạy trực tiếp hàm formatter và phép đo trong bundle bằng VM nhỏ để tách lỗi logic khỏi hình ảnh.
- Bảo toàn callback data.labelShow của từng item; reset text/style khi renderer tái sử dụng. Không thay mọi BitmapLabel toàn client.
- Ưu tiên helper cho số lượng item, sau đó áp dụng các renderer riêng đang dùng cùng font: túi, quà, bảng hạng, shop, thư. Nhãn lực chiến hoặc chiến đấu cần kiểm tra riêng.
- Không giảm số thưởng để vừa UI; không sửa logic cấp thưởng/save chỉ để sửa cách hiển thị.

## 5. Trạng thái hiện tại

- PASS: giải mã hai font pack; kiểm font thiếu ký tự; chạy 10 mốc số với hàm gốc; tái hiện đo chiều rộng hụt; 8/8 hash VPS khớp local.
- Config client hiện tại: BXH6006 hạng1 nhận item1 và item6 mỗi loại 1.000.000; hạng2 800.000; hạng3 600.000. Đây là cấu hình, chưa phải xác minh giao dịch nhận thưởng của tài khoản trong ảnh.
- Bundle chính SHA-256: `2cc9a3811fd61cc421c3ce240982aae84582593e38d5d8c679a7a2af8c9d6c42`.
- Config client SHA-256: `1432e7bac4f7e1c1f3c296e39d0fd61858a4104e0153f7b667a8335348e9e897`.
- Language SHA-256: `fdc925b6f8aaf568b05e08923f2dd10867164fb04dcda74ed8055b2f85c575fe`.
- Chưa tái hiện trực tiếp renderer của phiên người dùng: fixture cho 100Vạn/80Vạn/60Vạn chỉ chứng minh mất đơn vị và đo hụt, chưa giải thích đầy đủ vì sao ảnh còn 10/8/6 thay vì 100/80/60. Cần đọc text, width, bounds và cache runtime để kết luận phần chữ số cuối bị mất. Không suy ngược số quà từ ảnh.
- Chưa chạy build hoặc native UI acceptance vì chưa sửa game. Chưa sửa hoặc deploy lên máy chủ.

## 6. Bước tiếp theo

1. Khi được yêu cầu triển khai: làm candidate số lượng native riêng; icon dùng K/M/B/T, chi tiết dùng đầy đủ dấu phân nhóm hàng nghìn. Giữ số nhỏ theo dạng thường và không làm tròn tăng số quà.
2. Kiểm tra native text/count/bounds trên đúng BXH6006; xác minh cả cache/config đang nạp và các skin riêng. Không dùng tài khoản người thật để nhận thử quà.
3. Test biên đơn vị, số0, render tái sử dụng, custom labelShow, font load chậm, máy nhỏ; kiểm túi/quà/thư/shop/BXH và mở chi tiết đúng số lượng gốc.
4. Backup và phát hành đúng client asset kèm cache token; kiểm hash và UI sau reload. Không cần thay dữ liệu thưởng hoặc restart game server chỉ vì sửa presentation.
