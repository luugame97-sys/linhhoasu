# Kế hoạch xử lý tài khoản lợi dụng lỗi Bánh bao (01/09/2026)

## 1. Kết quả quét lại

- Shop: `11018000`, activity: `43001`, phần thưởng: Bánh bao ID `4 x10`.
- Snapshot read-only mới nhất: `fortune_package_totals_20260901_122019.json`.
- 38 tài khoản/nhân vật từng nhận gói; **36 tài khoản vượt mức tối thiểu**.
- Tổng mức bug tối thiểu cần xử lý: **4.081.000 Bánh bao**.
- Sau hotfix: `todayLedgerOverLimit=0`, UI/ledger mismatch `0`; log hậu kiểm có 2 lượt hợp lệ, không có replay vượt hạn. Không phát hiện người tiếp tục khai thác thành công sau hotfix.

## 2. Quy tắc đã tính

- Định giá xử lý: **1 Bánh bao = 1 Nguyên bảo**.
- Trừ Bánh bao hiện có trước; phần thiếu trừ Nguyên bảo; không cho số âm.
- 36 tài khoản dự kiến trừ:
  - Bánh bao: `3.944.512`.
  - Nguyên bảo: `93.701`.
  - Còn thiếu không thể thu đủ vì cả hai số dư không đủ: `42.787` Bánh bao của `phongpg01051994`.
- Khóa phạm vi: **game + WebGM**.
- Lý do: `Lợi dụng bug Bánh bao sự kiện.`
- Mã audit: `FORTUNE_BAOZI_EXPLOIT`.
- Mẫu tiêu đề thông báo dự kiến: `Thiên Đạo Ban Lệnh`.

## 3. Phân bổ thời hạn

| Mức Bánh bao bug | Thời hạn | Số tài khoản |
|---:|---:|---:|
| Dưới 1.000 | 30 phút | 21 |
| Dưới 5.000 | 1 giờ | 2 |
| Dưới 10.000 | 3 giờ | 3 |
| Dưới 20.000 | 5 giờ | 1 |
| Dưới 50.000 | 10 giờ | 2 |
| Dưới 100.000 | 24 giờ | 2 |
| Dưới 300.000 | 3 ngày | 4 |
| `zerovip28n` | 30 ngày | 1 |

## 4. Điểm cần xác nhận trước khi commit

- `vanduc97` nằm trong 36 tài khoản theo dữ liệu nhân vật, nhưng hiện có trạng thái game/WebGM khóa cũ và là tài khoản quản trị WebGM. Không được tự động ghi đè khóa này nếu chưa xác nhận vì có thể làm mất quyền quản trị.
- Nếu loại `vanduc97`, đợt xử lý sẽ còn 35 tài khoản; tổng số trừ giảm `340` Bánh bao.
- Nếu giữ, hệ thống sẽ áp dụng đúng tier dưới 1.000 (`30 phút`) nhưng sẽ thay metadata/khóa WebGM hiện có.

## 5. Trạng thái

- **Chưa commit trừ vật phẩm, chưa trừ Nguyên bảo, chưa khóa tài khoản.**
- Evidence mục tiêu/status: `_ai_workbench/temp/baozi_penalty_targets_status_20260901.json`.
- Kế hoạch máy: `_ai_workbench/temp/baozi_penalty_plan_20260901.json`.
- Khi được xác nhận, bước commit sẽ backup Player + Account + WebGM ban rows, kiểm tra hash/snapshot, trừ theo điều kiện số dư hiện tại, ghi audit, rồi khóa hai hệ thống; lỗi giữa chừng sẽ rollback phần đã ghi.
