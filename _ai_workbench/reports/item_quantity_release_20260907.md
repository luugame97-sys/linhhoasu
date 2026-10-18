# Sửa hiển thị số lượng vật phẩm — đã triển khai 07/09/2026

## 1. Tóm tắt công việc

Đã phát hành bản `20260907_item_quantity_v2` lúc 09:54 GMT+7 lên client game tại `103.116.105.154:81`. V1 lúc09:49 đã sửa icon/BXH; v2 bổ sung luôn nguyên số cho tooltip túi có cờ hideExtraCount. Phạm vi chỉ là hiển thị; không sửa số thưởng, vật phẩm, số dư, cơ sở dữ liệu hoặc logic cấp thưởng.

- Icon số lớn dùng K/M/B/T: 300.000 → 300K; 680.000 → 680K; 1.000.000 → 1M. K=nghìn, M=triệu, B=tỷ, T=nghìn tỷ.
- Số dưới 100.000 giữ dạng thường. Phần thập phân tối đa hai chữ số và cắt xuống, không làm tròn tăng quà.
- Bấm xem chi tiết hiển thị số gốc có dấu phân nhóm: `Số lượng: 1.000.000`; `Đang có` lấy riêng số đang sở hữu, không nhầm với số quà đang xem.
- Đổi 22 nhãn số lượng dùng font bitmap lỗi sang nhãn native `LhsQuantityLabel`, giữ vị trí, scale, tint, callback và hành vi bấm icon.
- Không thay font cấp độ/lực chiến, không thay bản dịch toàn cục hoặc các bảng thưởng.
- Sáu tiến trình PM2 giữ nguyên PID/restart; S1/S2 ready HTTP 200. Không restart game server, WebGM, Nginx hoặc DB.

## 2. File/thư mục đã thay đổi

### Source chính

- `linhhoasu/webgame/game/js/lhs-item-quantity-v1.js`: module native mới, formatter compact/full, tương thích các nhãn số lượng và cửa sổ chi tiết.
- `linhhoasu/webgame/game/index.html`: chỉ thêm module vào manifest, ngay sau main client; cache token `20260907_item_quantity_v2`. Tên file module giữ v1, phiên bản/cache hiện tại là v2.
- Không sửa bundle main/start/engine, skin binary, font atlas, language/config binary hoặc source server.

### Tool và bằng chứng

- `tools/test_item_quantity_patch_20260907.js`: test formatter, biên, callback, renderer, tooltip và phạm vi patch.
- `tools/prepare_item_quantity_native_20260907.py`, `tools/serve_item_quantity_native_20260907.js`, `tools/item_quantity_native_20260907.html`: fixture native Egret, dùng skin/font/config thật, không có tài khoản hoặc giao dịch.
- `tools/inspect_item_count_targets_20260907.js`: đọc có giới hạn các đoạn minified liên quan, tránh dump toàn bundle.
- `tools/release_item_quantity_20260907.py`: preflight/deploy/verify/rollback, kiểm hash trước ghi, backup và thay entrypoint atomic, không restart.
- `logs/item_quantity_unit_20260907.json`: 55 assertions.
- `temp/item_quantity_20260907/native-result.json`: 12 mốc số và 6 kiểm tra native, gồm túi hideExtraCount.
- `temp/item_quantity_20260907/rank-before.json`, `rank-after.json`, `rank-live-asset.json`: 30 ô thưởng trên skin BXH thật, trước/sau và sau khi tải patch trực tiếp từ VPS.
- `temp/item_quantity_20260907/preflight.json`, `release.json`, `release-v2.json`: manifest hash, health và PID/restart; release-v2 là trạng thái hiện tại.
- Báo cáo này, bản HTML tương ứng và `session_report.md/.html`.

Tất cả đường dẫn tool/log/temp/report ở trên nằm trong `_ai_workbench/`.

### Backup

- Local: `_ai_workbench/backups/item_quantity_local_20260907/` chứa index và báo cáo trước sửa.
- VPS v1: `/linhhoasu/_ai_workbench/backups/item_quantity_20260907_024944/` chứa index trước phát hành.
- VPS v2: `/linhhoasu/_ai_workbench/backups/item_quantity_v2_20260907_025454/` chứa index và module trước v2.
- Rollback v2 dùng chế độ `rollback-v2`, chỉ khôi phục hai file khi hash hiện tại/backup vẫn đúng manifest. Nếu cần tắt hoàn toàn patch, sau rollback-v2 mới dùng `rollback` để về index ban đầu. Không xóa dữ liệu hoặc restart.

## 3. Lỗi đã gặp & giải pháp

| Lỗi | Nguyên nhân/bằng chứng | Cách xử lý | Cách tránh lặp lại |
|---|---|---|---|
| BXH hiện 10/8/6 thay vì số quà lớn | Tái hiện nguyên trạng bằng RankRewardItemSkin, font thật và config6006: formatter tạo 100Vạn/80Vạn/60Vạn; font không có V/ạ/n và letterSpacing âm làm đo hụt, dẫn đến mất thêm chữ số khi vẽ | Nhãn số lượng native, bỏ font bitmap/letterSpacing của riêng các part số lượng; formatter từ số gốc | Kiểm A/B trên skin thật và kiểm width, không chỉ test chuỗi |
| Đơn vị Tỷ/Triệu sai bậc | Formatter cũ chia10^8/10^12 nhưng nối bản dịch Tỷ/Triệu | Số lượng đi qua formatter K/M/B/T; các token legacy ở nhãn đích đổi theo bậc cũ | Không sửa global lực chiến hoặc bản dịch thiếu kiểm phạm vi |
| Bản thử lỗi khởi tạo textColor | Override tint trên prototype được gọi trước khi superclass Label khởi tạo storage | Bỏ override tint; dùng tint native của DisplayObject, đã kiểm màu callback thực tế | Test constructor bằng engine thật trước triển khai |
| Fixture tooltip thiếu Main/MessageCenter | Fixture không chạy phiên tài khoản và chưa tạo dịch vụ lifecycle UI | Cấp root và MessageCenter native cho fixture; không sửa runtime production để né lỗi | Phân biệt lỗi harness và lỗi patch |
| Dễ giữ màu/cỡ chữ từ item trước | Renderer được tái sử dụng | Reset màu mặc định trước callback ItemIcon, reset cỡ chữ khi đổi text; callback được quyền ghi màu mới | Test số lớn → nhỏ, callback, số0, tooltip tái sử dụng |
| Tooltip túi không có dòng nguyên số trong v1 | Cờ hideExtraCount của túi chỉ có ý ẩn tổng đang có, nhưng v1 dùng để chặn cả stack count mới | V2 luôn ghi số lượng stack/reward; tổng đang có vẫn giữ cờ cũ | Unit và native test với isOwner/hideExtraCount |
| Có thể ghi đè thay đổi khác khi deploy | Cây production dùng chung | So hash local/live, compare-and-swap lần cuối, whitelist chỉ2file | Dừng nếu có drift; backup/rollback theo hash |

Không phát hiện mojibake mới. Đây là lỗi font bitmap thiếu glyph, không phải lý do chuyển mã toàn bộ tiếng Việt.

## 4. Kỹ năng / kinh nghiệm mới

- Quy trình computer-use đã kiểm trực quan native A/B và bấm mở tooltip; không dùng HTML giả icon để kết luận đã sửa gameplay.
- Font native hỗ trợ K/M/B/T trực tiếp; không cần tạo atlas ảnh hoặc thay engine toàn cục.
- Chỉ patch part có tên count/cnt, loại BitmapLabel và đúng font_num_prop_fnt. Nhãn level/power không thuộc phạm vi.
- Tách số lượng đang xem với số đang sở hữu. Tooltip dùng số gốc, không suy ngược từ chuỗi đã rút gọn.
- Release chỉ có presentation nên không cần đụng quy trình lưu nhận thưởng, restart hoặc thực hiện giao dịch kiểm thử trên người chơi.
- Thứ tự nạp bắt buộc: engine/start/main → module số lượng → khởi động Egret. Giữ kiểm tra load-order và marker chống cài hai lần.

## 5. Trạng thái hiện tại

### Đã đạt

- JavaScript syntax check PASS; 55 unit assertions PASS, hash gắn với file phát hành.
- Native ItemIcon: 12 mốc số, giới hạn rộng, các nhãn hỗ trợ đủ ký tự; 6 kiểm tra recycle/callback/zero/tooltip/túi PASS.
- Native RankRewardItem: 8 nhóm hạng / 30 ô thưởng PASS. Bản gốc tái hiện đúng10/8/6 như ảnh; bản sửa hiện1M/800K/600K. Không thiếu asset, không có lỗi JavaScript trong fixture.
- File patch tải trực tiếp từ VPS vào fixture native:30ô PASS. Đây là kiểm asset production trong UI fixture, không phải đăng nhập/nhận thưởng bằng tài khoản người thật.
- Hash đĩa VPS, HTTP nội bộ và HTTP công khai khớp; 6 file bảo vệ main/start/engine/skin/config/language không đổi.
- S1 PID3021/restart1385; S2 PID32727/restart57; cả6process giữ nguyên. Ready8080/8083 đều200.
- Hậu kiểm v2 lúc 09:54:59 GMT+7; evidence mới hơn giữ trong release-v2.json.

### Hash bản phát hành

| Artifact | SHA-256 |
|---|---|
| js/lhs-item-quantity-v1.js, bản v2 | a08361ca55518fede3e9c1c62303181881d4f6ee0e4e79869b8096b28ffdfa4d |
| index.html, bản v2 | ef773ce6453ce675f3007b225e9d327b6ef2c31fa5a43e209b558e717a07abcd |
| index trước phát hành | dc812a565d95b14f091037ff4a1b43d432e11faa618dea52c6b2c588bdc8c85b |

### Giới hạn kiểm chứng

- Không đăng nhập, không reload cưỡng bức phiên game của người dùng và không thực hiện nhận quà.
- 22 part đã chuyển bằng rule xác định; chưa mở từng màn hình đặc thù của cả22skin với tài khoản thật. Đã kiểm trực tiếp ItemIcon/BXH/tooltip dùng chung.
- Đã kiểm ở scale icon thực tế0.6 trong BXH và0.9 trong fixture; chưa test thiết bị Android/iOS vật lý.
- Không sửa các formatter không liên quan item quantity, ví dụ nhãn lực chiến ngoài phạm vi.

## 6. Bước tiếp theo

1. Người dùng tải lại game bằng Ctrl+F5 trên PC hoặc đóng/mở lại cửa sổ game trên điện thoại để nhận manifest mới. Không cần xóa dữ liệu tài khoản.
2. Kiểm bảng hạng Đại hội câu cá: hạng1 là1M, hạng2 là800K, hạng3 là600K; bấm Nguyên bảo hoặc Phù tăng tốc để xem số đầy đủ.
3. Nếu một màn hình dùng renderer/font riêng còn mất số, ghi tên màn hình và ảnh; mở rộng đúng part với native test tương ứng, không sửa giá trị vật phẩm.
4. Nếu cần rollback, dùng tool theo manifest bản này; không lấy index backup cũ ghi đè khi đã có release mới.
