# Hiện trạng game trên VPS mới — 30/09/2026

## Kết luận

Game đã được chuyển sang `103.116.104.165` và đang phục vụ S1–S6. Chưa đủ điều kiện gọi toàn hệ thống hoàn chỉnh: xác nhận lỗi `/admin/` 502, `www.linhhoasu.lol` 525 và còn cảnh báo hiệu năng S6. Không deploy, restart, thay config hoặc ghi dữ liệu người chơi trong lượt audit này.

Kiểm tra trực tiếp khoảng 10:03–10:54 ICT. Đây là các snapshot, không phải giám sát liên tục. Source/UI và báo cáo đang được công việc khác cập nhật trong lúc audit, nên hash chỉ có giá trị tại thời điểm đọc. Workspace không có Git tại root.

## Đã xác minh trực tiếp

| Hạng mục | Bằng chứng | Giới hạn |
|---|---|---|
| Tiến trình | 15/15 PM2 online: 6 game, 6 bot worker, admin, dist, supervisor | PID và restart counter giữ nguyên giữa hai snapshot; không thay cho thử reboot |
| Readiness | Cả 6 cổng 8080/8083/8084/8085/8086/8087 trả 200; body mongo=true, redis=true | Có snapshot S6 mất khoảng 4,17 giây; health OK không chứng minh độ trễ gameplay tốt |
| Game public | `https://linhhoasu.lol/` và `http://103.116.104.165:81/` trả 200 | Chưa đăng nhập/chơi thực tế |
| WebSocket | `/ws`, `/ws-s2`…`/ws-s6` qua HTTPS đều 101, đúng Sec-WebSocket-Accept | Chỉ handshake, không gửi RPC gameplay; curl timeout sau handshake là do giữ socket mở |
| WebGM / Dist | `/web-panel/` chuyển hướng login 302; `/dist/` trả 200 | Chưa xác minh giao dịch nạp, đổi quà, mail hoặc đăng nhập quản trị |
| MongoDB | Player S1–S6: 2721, 885, 788, 739, 762, 677; tổng 6572 | Đây là document Player, không phải số người đang online; chưa đối soát từng collection/index/balance với backup |
| Redis | PONG, dbsize=125 ở snapshot | Số key thay đổi theo hoạt động; không đối chiếu ngang với 50 key lúc restore |
| Tài nguyên | RAM 19 GiB, dùng 6,4 GiB, available khoảng 12 GiB; đĩa 44%, còn 31 GiB | Chưa thấy cạn RAM/đĩa; không loại trừ nghẽn CPU/event loop |
| Pet Hỗn Độn | 4 hash pet.js/ConfigService/BattleService/raid khớp báo cáo 00:20; nạp được 718 bảng, 46 pet, đủ 5 ID phẩm 10 và reward lựa chọn 90018 | Nạp config bằng tiến trình riêng không thay cho chứng minh toàn bộ combat/UI trong process game |
| Asset pet | 5 avatar và quality-10 PNG tồn tại; 12/12 URL qua IP/domain trả 200 image/png | Chưa kiểm render, Spine, replay sau đăng nhập |
| Đăng ký | Trang register 200; S1 runtime REQUIRE_INVITE_REGISTER=0; source liên quan khớp local tại snapshot; test account prefix `test_` trong accounts=0 | Không tạo tài khoản mới để thử; kết quả POST 201 là bằng chứng ghi trong báo cáo trước |

## Tính toàn vẹn gói migration

Cả hai gói trên VPS mới khớp hash kỳ vọng ghi trong script và báo cáo migration:

- `/backup/migration/db_final_20260930_004700.tar.gz`: 78.839.399 byte; SHA-256 `1f87ac61b3aa8d67a6b09c3c6ce083992fed4de128ad167c1151f2b2de6b7e71`.
- `/backup/migration/game_source_final_20260930_004700.tar.gz`: 2.634.586.824 byte; SHA-256 `9552d907e787a6b572ac96ba0145d3281d28d2dd535f4e9779ff1eb556a90535`.

Hash archive chứng minh bản chuyển không đổi byte, không chứng minh mọi collection đã restore đúng hoặc mọi giao dịch lịch sử được bảo toàn. Báo cáo 01:05 ghi 6569 Player; snapshot hiện tại 6572 không tự chứng minh tăng hợp lệ hay lỗi migration. Chưa đối chiếu từng bản ghi.

## Phần cần chỉnh / kiểm chứng tiếp

1. **Admin 502 — lỗi xác nhận, ưu tiên sửa:** Nginx `game.lhs.conf` location `/admin/` proxy tới `127.0.0.1:8082`; cổng này connection refused. `lhs-admin` thực tế listen 9097 và root trả 200. Cần thống nhất route/cổng theo cấu hình admin, giữ kiểm soát đăng nhập; backup/CAS, nginx test, reload và retest trước kết luận xong. Không nhầm `/admin/` với WebGM `/web-panel/` đang phục vụ.
2. **www 525 — lỗi xác nhận:** HTTPS root và WebGM trên `www.linhhoasu.lol` đều 525. Cert origin có CN/SAN chỉ `linhhoasu.lol`, hết hạn 27/12/2026; Nginx có khai báo cả www. Đây là bất nhất TLS xác nhận, nhưng chưa đủ chẩn đoán mọi nguyên nhân handshake Cloudflare. Cần kiểm tra SNI/origin rồi cấp cert bao phủ www hoặc chuyển hướng www ở edge phù hợp. Tên miền gốc đang dùng được.
3. **Hiệu năng S6 còn cần xử lý:** snapshot CPU PM2 có S1 100%, S6 75%; không dùng một mẫu CPU để kết luận nguyên nhân. Cửa sổ log 10:44:23–10:54:23 ICT ghi S6 2789 cảnh báo PlayerSave, max 2710 ms, 1 socket1006 và 1 dòng stuck. Chưa chứng minh các sự kiện cùng một nguyên nhân. Cần đo thời gian handler/queue/save dưới traffic thực và kiểm bản tối ưu auto-sale trước quyết định rollout.
4. **Tự khởi động / khôi phục:** `pm2-root.service` enabled nhưng inactive(dead), chưa từng có ExecStart theo systemd show; PM2 hiện đang chạy ngoài lượt khởi động service này. Dump có đủ 15 tên process. Không kết luận chắc chắn reboot sẽ lỗi, nhưng chưa nghiệm thu reboot và thứ tự sẵn sàng Mongo/Redis/PM2. Không thử reboot trong audit. Chưa kiểm renewal cert, lịch backup mới và restore rehearsal.
5. **Đối soát dữ liệu migration còn thiếu:** báo cáo 01:13 ghi đã chuyển MySQL `account_linhhoasu`; lượt này mới kiểm HTTP WebGM, chưa đối soát MySQL, số dư, đơn nạp, thư thưởng và index. Chưa kiểm trực tiếp VPS cũ vẫn ngừng writer để loại trừ hai nơi cùng nhận ghi. Snapshot PM2 cũ lưu local là stopped, không phải xác nhận hiện tại.
6. **Bảo mật công cụ vận hành:** một số script migration/deploy chứa credential SSH dạng plaintext. Cần chuyển sang cơ chế nạp secret phù hợp và xoay credential đã lộ trong quá trình đọc script; không ghi lại giá trị secret vào báo cáo. Không tự đổi credential trong lượt audit.
7. **Đồng bộ source bàn giao:** login.css local và live khác hash tại snapshot; login.js/lucky-wheel.js không có ở vị trí source local được kiểm, nhưng có script dùng bản trong temp. Cần xác định bản chuẩn và lưu source deploy đầy đủ trước rollout sau. Không chép local đè live khi còn công việc UI đang chạy.

## Log gần nhất — chỉ đếm cửa sổ 10 phút

Đọc tối đa 1,5 MB cuối mỗi out.log, lọc timestamp ICT; không công bố định danh người chơi. Đây là mẫu log cảnh báo, không phải toàn bộ request nên không thể dùng tính tỷ lệ lỗi hoặc p95 chung.

| Server | Số cảnh báo PlayerSave | Max trong cảnh báo (ms) | socket1006 | Dòng stuck |
|---|---:|---:|---:|---:|
| S1 | 976 | 885 | 0 | 0 |
| S2 | 920 | 1790 | 0 | 0 |
| S3 | 568 | 1128 | 0 | 0 |
| S4 | 32 | 409 | 0 | 0 |
| S5 | 5 | 276 | 0 | 0 |
| S6 | 2789 | 2710 | 1 | 1 |

Trong cửa sổ này không thấy PLAYER_LOCK_UPGRADE_DENIED, TypeError, ReferenceError, MongoServerError hoặc EPIPE ở các out.log đã đọc. Không đồng nghĩa toàn hệ thống không có lỗi khác.

## Đọc lại các báo cáo mới và việc tồn đọng

- `session_report.md` có mục mới nhất ở đầu file, bao gồm migration, MySQL/WebGM, HTTPS/WSS, đăng ký không bắt buộc mã mời, thông báo in-game, PWA/launcher PC và sửa UI mobile/popup. Một số mục dùng “100% PASS” nhưng bằng chứng chỉ là syntax/HTTP/DOM tĩnh; chưa đủ khẳng định thao tác UI và giao dịch đều đúng.
- `pet_chaos_system_report.md`: code/config/asset được đối chiếu live ở trên. Test economy/wash/combat/replay trong báo cáo là tự động; chưa nghiệm thu toàn bộ gameplay native, xác suất gốc hoặc parity backend VUSA. Pet animation ngoài map đã rollback theo session report 00:36, không liệt kê như tính năng còn bật.
- `arena_ledger_hardening_20260928.md`: cập nhật ngày 29/09 ghi đã deploy guard và CAS cleanup 5 player/14 entry, có BSON backup/readback; kết luận memory cũ “cleanup chưa xong” đã lỗi thời. Hash live mới xác nhận arena `d2ebb6cf…` và PlayerService `bdfe9e48…` khớp release hardening. Lượt này chưa quét lại DB để xác nhận không tái nhiễm. Báo cáo này cũng ghi rõ sai lệch fencing và test chạy sau swap.
- Bản tối ưu auto-sale được báo cáo 28/09 là local-only; chưa lấy bản local làm bằng chứng đã deploy trên VPS mới.
- Các tồn đọng cũ như pool/option item, điều kiện bậc rơi 23→24, nghiệm thu tính năng mở rộng cần tái kiểm riêng nếu muốn đóng toàn bộ backlog; không tuyên bố các lỗi cũ vẫn đang xảy ra chỉ từ báo cáo lịch sử.
- Chưa chạy browser E2E desktop/mobile, đăng nhập/đăng ký mới, nạp/claim thưởng, hợp thành/wash pet, hoặc reboot/restore rehearsal. Không tạo người chơi và không dùng tiền/vật phẩm của người thật.

Ưu tiên đề xuất: sửa route admin và www TLS; đo và xử lý nghẽn S6; nghiệm thu startup/backup/renewal; đối soát dữ liệu và gameplay quan trọng. Mọi sửa production cần scope rõ, backup/rollback và read-back, không triển khai trong lượt chỉ đọc này.
