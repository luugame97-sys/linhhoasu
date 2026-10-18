# So sánh sơ bộ độ mượt LHS và VUSA (01/09/2026)

## 1. Tóm tắt công việc

- Kiểm tra read-only `http://103.116.105.154:81/`, WebGM `:88` và `https://tutien.vusagaming.net/`.
- Không sửa source, cấu hình, database hoặc restart process.
- Hai game cùng chạy Egret canvas và cùng quan sát được 102 tài nguyên runtime; lỗi console chung chỉ là autoplay audio bị trình duyệt chặn trước tương tác.

## 2. Phát hiện sơ bộ

- Bản LHS tải `utm.ttf` 18.571.520 byte và `gothich.ttf` 38.660 byte; VUSA dùng một WOFF2 khoảng 4.051.092 byte. Font của LHS nặng hơn khoảng 14,56 MB.
- LHS có thêm `icon-web.png` 2.448.916 byte và DOM popup Web riêng; VUSA không có popup này.
- Bundle chính tương đương quy mô: LHS `main.min_a6195824.js` 8.867.309 byte; VUSA `main.min_vi_1c09dcf2.js` khoảng 8,87 MB nhưng là build khác.
- VUSA phân phối JS qua Cloudflare với `cf-cache-status: HIT`, cache immutable và HTTPS; LHS phục vụ trực tiếp từ Nginx/IP HTTP.
- WebGM `:88` dùng nhiều tài nguyên chặn render từ các CDN khác nhau (Google Fonts, Font Awesome, Bootstrap, jQuery) và hai ảnh PNG khoảng 2,45 MB + 2,59 MB.
- `index.html` LHS chứa thêm popup Web và nhiều runtime wrapper/guard. Chưa có bằng chứng định lượng rằng các guard là nguyên nhân FPS thấp; không rollback/sửa khi chưa profile được frame/main-thread.

## 3. Trạng thái

- Chưa kết luận nguyên nhân duy nhất.
- Bằng chứng mạnh cho tải/cảm giác mở trang: font/ảnh quá nặng, nhiều origin CDN, thiếu lớp CDN/HTTP2/HTTP3 so với VUSA.
- Phần độ mượt khi chơi cần profile frame time, long task, GPU/canvas và A/B build; không được suy từ dung lượng tải đơn thuần.

## 4. Bước tiếp theo

1. Tối ưu không đổi logic: subset/WOFF2 font, resize/compress logo/background, self-host dependency WebGM, CDN/HTTPS/HTTP2 và cache fingerprint.
2. QA A/B trên clone hoặc VPS test trước khi đưa production.
3. Profile runtime riêng cho bản main/start khác nhau và các wrapper/guard; chỉ đề xuất sửa khi xác minh được nguyên nhân.
