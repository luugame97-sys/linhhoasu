# Session Report — Donate no-reload

## 1. Tóm tắt công việc

- Đã triển khai cập nhật trạng thái Tích Donate mà không tải lại toàn trang WebGM.
- Khi mở tab `Tích Donate`, trang gọi API chỉ đọc ngay; khi tab còn hiển thị, trạng thái đồng bộ mỗi 15 giây; khi quay lại trình duyệt hoặc nhận quà thành công, trang đồng bộ lại ngay.
- Tổng Donate ngày/tuần/tháng, phần trăm tiến độ, trạng thái `Chưa đủ mốc` / `Nhận quà` / `Đã nhận` đều lấy từ server.
- Không thay đổi logic nhận quà, không phát quà test, không restart game hay dịch vụ WebGM.

## 2. File/thư mục đã thay đổi

### Production

- `/linhhoasu/webgame/gm/index.php`: thêm định danh DOM cho kỳ và từng mốc Donate.
- `/linhhoasu/webgame/gm/api/user_api.php`: thêm API chỉ đọc `get_recharge_status` và snapshot server-authoritative.
- `/linhhoasu/webgame/gm/assets/js/index.js`: cập nhật DOM nền, giới hạn polling theo tab đang mở.

### Tool/evidence

- `_ai_workbench/tools/smoke_recharge_status_endpoint.php`: smoke test API có session giả lập cục bộ trên VPS, chỉ đọc.
- `_ai_workbench/temp/donate_noreload_live_20260902/smoke_live_result.json`: response API thật cho tài khoản test.
- Candidate: `_ai_workbench/temp/donate_noreload_candidate_20260902/`.
- Backup: `/linhhoasu/_ai_workbench/backups/donate_noreload_pre_20260902_1948/`.

## 3. Lỗi đã gặp & giải pháp

| Lỗi | Nguyên nhân | Cách xử lý | Cách tránh lặp lại |
|---|---|---|---|
| Mốc chỉ đổi sau khi reload | Tổng nạp và claim map chỉ được tính khi PHP dựng trang | Thêm snapshot API và cập nhật DOM nền | Trạng thái động phải có endpoint read-only riêng |
| Bản đầu có thể truy vấn Donate mỗi 5 giây cho mọi trang | Ghép snapshot vào heartbeat VIP/Xu | Tách `get_recharge_status`, chỉ gọi khi tab Tích Donate đang mở, chu kỳ 15 giây | Poll theo visibility và phạm vi tính năng |
| Rủi ro client tự quyết định đủ mốc | Nếu chỉ cộng số tiền và so sánh ở JavaScript | Server trả sẵn `ready`, `claimed`, `percent`, `claim_period`; claim vẫn kiểm tra lại trên server | UI chỉ trình bày quyết định server |
| Lệnh backup đầu tiên lỗi biến shell | PowerShell nội suy `$dest` trước khi SSH | Dùng đường dẫn backup cố định, sau đó xác minh hash | Tránh biến shell từ xa trong chuỗi PowerShell |
| Cấu hình mốc lệch kỳ | Mốc ID 58 có tên `Tháng mốc 50,000đ` nhưng `period_type=day` | Chỉ ghi nhận, chưa tự sửa ngoài phạm vi | Rà soát mốc trùng kỳ trước khi chỉnh catalog Donate |

## 4. Kỹ năng / kinh nghiệm mới

- Không nên gộp snapshot Donate nhiều truy vấn vào heartbeat chung 5 giây.
- Polling chỉ chạy khi tab tính năng đang hiển thị và trang ở foreground giúp giảm tải.
- Thuộc tính `data-recharge-state` là dấu xác minh DOM đã được response nền cập nhật, không chỉ là HTML ban đầu.
- Claim vẫn dùng reservation + event key cũ; no-reload không làm yếu chống gửi trùng.

## 5. Trạng thái hiện tại

- PHP lint: PASS (`index.php`, `api/user_api.php`).
- JavaScript `node --check`: PASS.
- WebGM `/index.php`: HTTP 302 khi chưa đăng nhập (đúng).
- Game `/ready`: HTTP 200.
- API không session: bị chặn.
- API live có session: `status=success`, server `1001`, ngày `50.000`, tổng `50.000`, 50 mốc; không phát quà.
- QA UI: 50/50 thẻ có `data-recharge-state`; tổng ngày hiển thị `50.000 VNĐ`; thẻ đủ mốc có nút `Nhận quà`; URL không reload.
- Hash production:
  - `index.php`: `3a343ba065289c2d77432fc1e2b1e086a53820d292be4b75b92b2ebe3882e635`
  - `api/user_api.php`: `c00e3803e68e5e65b0798872557f59cefd06ac8ab25e193f9a9d1a556b7ce76a`
  - `assets/js/index.js`: `a041312b8be3e5bad24f069bf97902cc67d24488e6a693f613f19b590debc40a`

## 6. Các chức năng có thể làm no-reload tiếp theo

### Ưu tiên cao, triển khai nhanh

1. Lịch sử Donate: tự thêm giao dịch mới và cập nhật trạng thái mà không bấm làm mới.
2. Lịch sử tiêu Xu/Webshop: tự thêm đơn mới sau khi mua và khi quay lại tab.
3. Điểm danh ngày: tự đổi trạng thái khi sang ngày mới, không cần reload.
4. Giftcode công khai: đồng bộ hết lượt, đã nhận và trạng thái mã.
5. Hồ sơ/nhân vật: cập nhật danh sách nhân vật và nhân vật hiện tại khi server thay đổi.

### Đã có no-reload một phần

- Ví Xu và VIP đã có heartbeat.
- Lịch sử Donate và lịch sử tiêu Xu đã tải bằng AJAX khi người chơi mở tab.
- Webshop, điểm danh, giftcode, liên kết số điện thoại và các form thường đã submit bằng AJAX.

### Cần làm cẩn thận hơn

1. Donate VIP qua giao dịch ngoài: chỉ cập nhật khi entitlement server xác nhận.
2. Webshop gửi thư: hiển thị theo trạng thái order/mail thật, không báo thành công lạc quan.
3. Giftcode nhiều lô: giữ cơ chế resume/idempotency khi một lô lỗi.
4. Hòm thư và dữ liệu nhân vật trong game: cần API đọc trạng thái game riêng.
5. Thao tác GM: không auto-repeat; chỉ cập nhật log/trạng thái sau xác nhận server.

## 7. Bước tiếp theo

1. Người quản trị xác nhận có sửa mốc ID 58 từ `day` về `month` hay không.
2. Nếu tiếp tục no-reload, ưu tiên `Lịch sử Donate` và `Lịch sử tiêu Xu` vì API nền đã có sẵn.
3. Theo dõi log API và tải MySQL trong ngày đầu; chu kỳ hiện tại tối đa 4 lần/phút khi tab Tích Donate đang mở.
