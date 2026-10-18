# linhhoasu.lol song song IP:81 — 29/09/2026

## Đã triển khai

- Nginx `/www/server/panel/vhost/nginx/game.lhs.conf`: thêm `linhhoasu.lol www.linhhoasu.lol` vào host port81; thêm server port80 proxy HTTP/WebSocket vào 127.0.0.1:81. Giữ server default81 và các route game/web-panel/API/ws-s2…ws-s6; không sửa game source/PM2/DB/DNS.
- Sau đó thêm location `/.well-known/acme-challenge/` dưới vhost port80 để phục vụ cấp cert, vẫn proxy mọi route khác vào game. Candidate/reload hash sau bước này `1a3ca20eee54629b21a2632f5e4ceed3c2cbfc408c05251e646be38e0cb352c9`.
- Backup byte-identical VPS `/linhhoasu/_ai_workbench/backups/domain_linhhoasu_lol_20260929/game.lhs.conf.before`, SHA256 `c630b549e6e6065648a2aac1c28a07dd43ae3d4451173a52ff0b98eb630d245e`.
- CAS trước swap, candidate hash/upload/readback `3fdd6a1f3d41dd21fdad58a1848c46f9fe493fa91b39fefe7cc33e834cbcd2a6`. `nginx -t` thành công và reload lúc 01:03:17 ICT, không restart game. Nhánh rollback dùng bản backup nếu nginx test lỗi, chưa cần kích hoạt.
- Candidate local: `temp/domain_linhhoasu_lol_20260929/game.lhs.conf.candidate`. File local mang tên `.before` đã bị dùng nhầm làm working copy (hash candidate), **không dùng nó để rollback**; bản backup đáng tin ở VPS nêu trên.

## Kiểm chứng

- 01:03–01:04: HTTP apex trả200 qua Cloudflare; IP:81 trả200 qua nginx. DNS máy local từng trả origin IP trong khi request đã qua Cloudflare, do DNS/cache đang chuyển; www từ parking Porkbun chuyển sang IP Cloudflare. Không sửa DNS qua API.
- 01:06: HTTP apex tiếp tục200, WS `/ws-s6` qua domain trả101 với đúng Sec-WebSocket-Accept; không login, không gửi RPC. Curl sau đó timeout vì giữ socket mở, không phải handshake fail. Chưa probe toàn bộ S1–S5 hoặc UI đăng nhập.
- Domain `:81` timeout khi đi qua Cloudflare; sử dụng domain không port. IP:81 vẫn giữ nguyên cấu hình.
- Sau khi aaPanel cấp cert: cert `/www/server/panel/vhost/cert/127.0.0.2/fullchain.pem` có `CN=linhhoasu.lol`, issuer Let’s Encrypt YR2, hạn đến `2026-12-27`; không dùng cert `lhs.mg365.fun`.
- Sửa lỗi “Lỗi mạng” sau khi mở HTTPS: `serverList.js` từng phát `linhhoasu.lol:81/ws`; endpoint mới phát port443 cho HTTPS domain, port80 cho HTTP domain và giữ port81 cho IP. Backup final: `/linhhoasu/_ai_workbench/backups/ws_public_endpoint_fix_final_20260929`; hash `a99d066e71d136751ad608cf8c25c9b7a8699eb9b06b0e8e5b03ab6a8b18d011`.
- Đã hợp nhất route vào virtual host aaPanel: `/` game, `/update/` + `/js/` static alias, `/ws`…`/ws-s6`, `/gameMsg.do`, `/api/`, `/web-panel/` WebGM, `/admin/`, `/dist/`. Backup/CAS lần hợp nhất tại `/linhhoasu/_ai_workbench/backups/domain_unify_20260929`.
- HTTPS apex root 200/title `Linh Họa Sư`; `/web-panel/` trả WebGM login; WSS `/ws` handshake 101; HTTP apex 200; IP:81 root và `/web-panel/` lần lượt 200/GM login.
- Static JS HTTPS khớp hành vi game (`/js/main.min_a6195824.js` 200); thư mục `/update/resource/` trả 403 đúng policy directory, không phải asset-file failure.

## Còn thiếu / blocker

- `www.linhhoasu.lol` chưa có SAN trong cert aaPanel hiện tại; link chính thức dùng `https://linhhoasu.lol/`. Không tự dùng cert apex cho `www`, tránh 525/mismatch.
- Vẫn còn cảnh báo Nginx `conflicting server name` của các virtual host cũ (`127.0.0.1`/`lhs.mg365.fun`); `nginx -t` pass và không ảnh hưởng apex game. Dọn cấu hình cũ là việc riêng, không tự xoá.
- SSH và direct TCP22/81/443 mất lại sau01:04; probe giới hạn đều timeout, trong khi HTTP/HTTPS Cloudflare còn phục vụ. Cần khôi phục tuyến VPN để sửa origin, không kết luận VPS chết.
- Chưa có cert riêng hoặc renewal policy cho linhhoasu.lol. Dùng aaPanel ACME sẵn có sau khi đọc interface và backup; không cài dependency toàn máy, không dùng cert lhs.mg365.fun cho tên miền mới, không giảm xác minh TLS Cloudflare.
- Tiếp tục: recheck DNS A/AAAA/CAA và tuyến VPN; đọc interface ACME aaPanel chỉ đọc (không gọi `bt` tương tác để dò lệnh); dựng challenge cho apex, cấp cert riêng và renewal; thêm vhost443 game trên chính domain, nginx test/reload/CAS; kiểm cert chain/SAN + root game + ws/wss sáu route + API/web-panel + IP81; sau đó UI readonly.
- Rủi ro cũ: domain vẫn trỏ cùng VPS, không mặc định giải quyết được chặn tuyến ISP/VPS. Cloudflare có thể cải thiện đường người chơi nhưng origin/SSL/WS phải kiểm riêng.
