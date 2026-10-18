# Triển khai xử lý bug Bánh bao (01/09/2026)

## 1. Phạm vi đã thực hiện

- Đã loại `vanduc97` theo xác nhận vì đây là tài khoản quản trị WebGM và có khóa cũ.
- Đã xử lý **35 tài khoản/nhân vật** còn lại.
- Phạm vi khóa: **game + WebGM**.
- Mã xử lý: `FORTUNE_BAOZI_EXPLOIT`; lý do: `Lợi dụng bug Bánh bao sự kiện.`
- Shop/activity: `11018000` / `43001`; Bánh bao ID `4`.

## 2. Thu hồi thực tế tại thời điểm commit

Do người chơi vẫn có thể phát sinh thay đổi số dư giữa lúc quét và lúc commit, hệ thống dùng số dư hiện tại với điều kiện chống ghi đè:

| Hạng mục | Số lượng |
|---|---:|
| Mức bug tối thiểu theo audit | 4.080.660 Bánh bao (35 tài khoản) |
| Bánh bao đã trừ thực tế | 3.939.428 |
| Nguyên bảo đã trừ thực tế | 98.300 |
| Bánh bao còn thiếu không thể thu đủ | 42.932 |

`phongpg01051994` đã bị trừ toàn bộ Bánh bao và Nguyên bảo hiện có về `0`; còn thiếu `42.932` Bánh bao theo số dư tại thời điểm commit.

## 3. Thời hạn khóa

- Dưới 1.000 Bánh bao: 30 phút (21 tài khoản).
- Dưới 5.000: 1 giờ (2 tài khoản).
- Dưới 10.000: 3 giờ (3 tài khoản).
- Dưới 20.000: 5 giờ (1 tài khoản).
- Dưới 50.000: 10 giờ (2 tài khoản).
- Dưới 100.000: 24 giờ (2 tài khoản).
- Dưới 300.000: 3 ngày (4 tài khoản).
- `zerovip28n`: 30 ngày.

## 4. Xác minh sau commit

- Game: 35/35 Account có `status=0`, mã `FORTUNE_BAOZI_EXPLOIT`, đúng thời hạn; 35/35 Player có marker remediation.
- WebGM: 35/35 bản ghi khóa active, metadata cùng remediation ID; `vanduc97` giữ nguyên khóa cũ, không bị ghi đè.
- Phiên game đang online bị kick qua `WSServer.kickAccount` và token bị revoke.
- Runtime hậu kiểm: `lhs-s1001`, `lhs-dist`, `lhs-admin`, `lhs-real-bots` đều online; HTTP `8080/ready=200`, WS `9200/health=200`, WebGM `:88=302`.
- Không restart process trong đợt xử lý.

## 5. Backup / rollback

- Remediation ID: `baozi_penalty_20260901_125532`.
- Backup: `/linhhoasu/_ai_workbench/backups/baozi_penalty_20260901_125532/`.
- Kết quả: `_ai_workbench/temp/baozi_penalty_20260901_125532_result.json`.
- Hậu kiểm: `_ai_workbench/temp/baozi_penalty_post_verify_20260901.json`.
- Script có rollback riêng cho Player và Game/WebGM nếu cần, nhưng chưa chạy rollback.

## 6. Lưu ý thông báo

- Khóa đã lưu reason và metadata `title=Thiên Đạo Ban Lệnh`. Luồng thông báo game hiện vẫn dùng formatter khóa hiện có; chưa thay code formatter/restart để đổi câu hiển thị thành mẫu văn phong mới.
- Nếu muốn áp dụng chính xác mẫu “Thiên Đạo Ban Lệnh / Phạt người… / Lui về hậu sơn sám hối”, cần một bước patch formatter riêng, không tự sửa trong đợt thu hồi này.
