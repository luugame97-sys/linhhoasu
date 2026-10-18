# Sửa “Cộng điểm nạp” và thu gọn hướng dẫn WebGM (01/09/2026)

## 1. Tóm tắt công việc

- Đã fetch lại đúng source WebGM production `103.116.105.154` trước khi sửa.
- Audit read-only cho thấy 4 giao dịch cộng điểm nạp thủ công cũ đều khớp với log admin, tổng `11.811.111` điểm; không có `tran_id` trùng và không phát hiện lệch dữ liệu lịch sử.
- Nguyên nhân gây lệch về mặt nghiệp vụ là action `update_xu` chỉ có một ô số lượng: khi số Xu cần cộng khác số tiền Donate cần ghi, hệ thống bắt buộc ghi hai giá trị bằng nhau.
- Đã tách riêng số Xu và điểm nạp, đồng thời hiển thị điểm nạp hiện tại theo đúng ledger/server đang chọn.
- Đã thay hướng dẫn dài bằng nút dấu `!`; bấm vào mở popup hướng dẫn chi tiết.

## 2. File production đã thay đổi

| File | Thay đổi |
|---|---|
| `/linhhoasu/webgame/gm/admin/admin_api.php` | Nhận `recharge_amount` riêng; kiểm tra số nguyên/giới hạn; rate-limit action; ghi Xu và ledger điểm nạp trong cùng transaction; trả `recharge_total` theo server hiện tại. |
| `/linhhoasu/webgame/gm/admin/index.php` | Thêm số điểm nạp đã ghi, ô điểm nạp riêng chỉ hiện khi bật, nút `!` và popup hướng dẫn. |
| `/linhhoasu/webgame/gm/assets/js/admin.js` | Truyền điểm nạp hiện tại từ danh sách người chơi, bật/tắt ô nhập riêng và submit đúng field. |

## 3. Lỗi và giải pháp

| Lỗi | Nguyên nhân | Cách xử lý | Cách tránh lặp lại |
|---|---|---|---|
| Điểm nạp bị “lệch” khi cần cộng Xu khác số tiền Donate | UI/backend chỉ có `amount`; checkbox ép điểm nạp bằng số Xu | Thêm `recharge_amount`; ledger dùng chính giá trị này | Luôn hiển thị Xu và điểm nạp thành hai dòng riêng |
| Không biết số điểm nạp trước khi thao tác | `get_users_list` chỉ trả số dư Xu | Trả thêm `recharge_total` từ `sepay_logs` với đúng `server_id` | Không dùng tổng Donate toàn hệ thống cho tài khoản đang chọn |
| Có thể gửi liên tiếp action cộng Xu | `update_xu` chưa có rate-limit riêng | Thêm `admin_require_rate('update_xu', 20, 60)` | Giữ rate-limit cho mọi action làm thay đổi số dư |
| Hướng dẫn chiếm nhiều diện tích modal | Nội dung hướng dẫn nằm trực tiếp dưới checkbox | Nút `!` mở popup chi tiết, màn chính chỉ còn nhãn ngắn | Giữ nội dung dài trong popup trợ giúp |

## 4. Kiểm tra và bằng chứng

- Hash trước sửa production:
  - `admin_api.php`: `99596f9a1898f788423d484a2d888066b00070c3ae2b65622f6fe3229f1295c5`
  - `index.php`: `6c709ee57e6bfa90b7235951795bd52cffcff6e8b21021fdaaa08212b6968bf2`
  - `admin.js`: `be7eadba594820f0eadad920a06c24fc5deaf079d1216d4cc24564de7e3f6d1e`
- PHP lint trên staging remote: PASS cho `admin_api.php` và `index.php`.
- `node --check` cho `admin.js`: PASS.
- HTTP hậu kiểm: trang admin `302` (đúng yêu cầu đăng nhập), JavaScript `200`, game `/ready` `200`.
- Hash sau sửa:
  - `admin_api.php`: `601227c6ec35ff4fc5c1ece536548454546a1887f17857d66581b4358b47b212`
  - `index.php`: `d5ea1a8a59e1692159fa0843902ae2799159a280f0303af71fb3aab75330cba2`
  - `admin.js`: `d8e6c4c972b4b372af23dfcaed9082ebd5eb3dbd1fc2491cce5faf2497c9c397`
- Không restart game/WebGM process và không thay đổi dữ liệu tài khoản trong phiên này.

## 5. Cách dùng sau khi cập nhật

1. Tải lại WebGM một lần.
2. Vào **Quản lý người chơi → Chọn chức năng → Quản lý Xu**.
3. Nhập số Xu thay đổi.
4. Nếu cần tính vào Donate, bật **Cộng điểm nạp**, sau đó nhập điểm nạp riêng nếu khác số Xu. Để trống sẽ dùng đúng số Xu.
5. Bấm dấu `!` khi cần xem hướng dẫn.

## 6. Backup và trạng thái

- Backup production: `/linhhoasu/_ai_workbench/backups/webgm_xu_recharge_alignment_pre_20260901_114559/`
- Bản staging/candidate local: `_ai_workbench/temp/xu_recharge_alignment_candidate_20260901/`
- Source fetch/evidence local: `_ai_workbench/temp/webgm_xu_sources_20260901_184610/`
- Chưa chạy visual QA bằng phiên admin đã xác thực; kiểm tra trực quan cuối cùng cần thực hiện sau khi admin đăng nhập và reload trang.

## 7. Bước tiếp theo

- Dùng một tài khoản QA để thử một lần `Xu=10000`, `điểm nạp=50000` rồi kiểm tra ledger/mốc Donate; không dùng tài khoản người chơi thật.
- Nếu muốn giữ quy ước 1 Xu = 1 đ điểm nạp, chỉ cần để trống ô điểm nạp riêng.
