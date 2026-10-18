# Audit WebShop — tài khoản hades66 / nhân vật Hades S6 — 30/09/2026

## Phạm vi

- Read-only trên VPS `103.116.104.165`; không gửi lại thư, không trừ/cộng Xu, không sửa DB.
- Người dùng ghi `hadess`; dữ liệu thực tế khớp tài khoản `hades66`, nhân vật `Hades`, server `1006`.

## Kết quả đơn hàng và thư

| Đơn | Thời gian ICT | Gói | Reward snapshot | Trạng thái đơn | Mail eventKey | Trạng thái mail |
|---:|---|---|---|---|---|---|
| 3222 | 28/09 20:19:25 | item 69 × 10 | item 69 × 500 | `paid` | `webshop:be91c9ce…` | Có, `read=true`, `claimed=true`, ledger khớp |
| 3223 | 28/09 20:21:41 | item 6 × 5 | item 6 × 50.000 | `paid` | `webshop:0fdb2243…` | Có, `read=true`, `claimed=true`, ledger khớp |
| 3303 | 30/09 18:25:54 | item 8 × 20 | item 8 × 1.000 | `paid` | `webshop:cdfa3f1f…` | Có, `read=true`, `claimed=true`, ledger khớp |

- Player S6 hiện có item 8 = 194 và item 69 = 484; các số này thấp hơn lượng mail vì người chơi đã tiêu/dùng một phần sau khi nhận. Item 6 hiện bằng 0, phù hợp với đã nhận rồi sử dụng hết; không phải bằng chứng thư không gửi.
- Toàn bộ **75/75 đơn S6** hiện là `paid`; không có đơn `pending_delivery`, `failed` hoặc trạng thái bất thường trong bảng `webshop_orders`.
- Log S6 không có dòng `webshop`, `MAIL_IDEMPOTENCY`, `INVALID_SIGNATURE` hoặc lỗi gửi mail trong lượt đọc.

## Kiểm tra thay đổi code

- `webshop_bundle.php` live hash `e397fc3b…`, khớp bản release WebShop đã triển khai.
- `webshop-buyer.js` live hash `0047efb7…`, khớp bản release.
- `api/user_api.php`, `index.php`, `config.php` có hash khác release cũ do các cập nhật WebGM khác; phần WebShop đã đối chiếu (`buy_shop_item`, `retry_webshop_order`, lịch sử tiêu Xu, include helper) không thay đổi so với candidate release. `config.php` live vẫn include `webshop_bundle.php`.
- Luồng hiện tại vẫn debit Xu + lưu `pending_delivery` + gửi bằng eventKey cố định + chuyển `paid` sau khi API game xác nhận; retry dùng đúng đơn cũ.

## Kết luận

Người dùng xác nhận đã **mua nhầm server**. Trường hợp `hades66/Hades/S6` **không phải lỗi WebShop không gửi thư**: cả ba đơn đã tạo mail đúng vật phẩm, người chơi đã đọc và claim; hai đơn cũ đã dùng hết/một phần vật phẩm. WebShop giữ nguyên `server_id + role_id`, không tự chuyển thư sang server khác.

Nếu người chơi vẫn thấy thiếu, cần lấy ảnh màn hình hoặc thời điểm/món cụ thể khác; với dữ liệu hiện tại không nên gửi bù vì sẽ tạo quà trùng.
