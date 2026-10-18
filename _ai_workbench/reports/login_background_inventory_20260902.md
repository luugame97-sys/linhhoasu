# Kiểm kê nền màn hình đăng nhập (02/09/2026)

## Nền tĩnh có thể được chọn

Client hiện có 3 nền tĩnh trong `assets/game_start`:

| Tên logic | File | Mô tả |
|---|---|---|
| `login_bg` | `login_bg_4f696aaa.jpg` | Nền trắng/mây, tháp sáng, nhân vật ngồi thiền; nền mặc định hiện tại |
| `login_bg_tw` | `login_bg_tw_8d2e3139.jpg` | Nền xanh đậm, mặt trăng và nhân vật; dùng khi nhánh `inChina=false` |
| `login_ld_bg` | `login_ld_bg_fa5c6746.jpg` | Nền sự kiện/liên động; được chọn trong khoảng linkage theo lịch |

## Bộ animation loading liên quan

Ngoài nền tĩnh, client còn có các bộ Spine dùng cho màn loading/intro: `loading`, `loading_dhxy`, `loading_dzz`, `loading_mxtdy`, `loading_new`, `loading_qnyh`, `loading_shsd`, `loading_xinbai`. Đây là animation/asset ghép, không phải thêm nền tĩnh độc lập trong login.

## Lịch đổi nền

`start.min_52ac8d58.js` chọn `login_ld_bg` trong khoảng 14/07/2026 23:00 đến 01/09/2026 23:00 (GMT+7), sau đó chuyển về `login_bg` hoặc `login_bg_tw`.

## Đối chiếu

- 3 file nền tĩnh VPS/local khớp SHA-256.
- Không upload, thay thế hoặc chỉnh sửa nền trong phiên này.
