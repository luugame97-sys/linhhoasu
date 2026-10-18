# Cấp rơi 46 — S1, phát hành 14/09/2026 UTC+7

## Đã mở

- Chỉ S1 (`SERVER_ID=1001`, `DROP_LEVEL_46_ENABLED=1`); S2/S3 max45, không restart hai node này. Cho phép người chơi S1 tự nâng, không allowlist và không tự nâng/cộng tiền cho tài khoản thật.
- Cờ S1 đã được lưu trong ecosystem và PM2 dump (có backup dump trước save) để giữ sau PM2 resurrect.
- Nâng45→46: 5 bước ×68.000.000 bạc (ID2), tổng340.000.000. Chi phí tiếp nối các bước60m→64m→68m.
- Thời gian26.136.000 giây =302,5 ngày; nối tiếp23544000→24840000→26136000. Giữ nguyên item6 Phù tăng tốc300 giây/lá, tối đa87.120 lá để bỏ qua ngay từ đầu. Đây là ngoại suy theo config hiện có, không phải dữ liệu cấp46 chính thức từ Trung. Không rút ngắn timer cũ hay đổi múi giờ.
- Chi phí/time nằm ở `BoxConfig[45]` cho bước đi tới46. Row46 terminal: không có chi phí/time để lên47. Rơi phẩm chất38–45; tỷ lệ53,39%/30,10%/9,22%/4,61%/2,00%/0,59%/0,08%/0,01%, tiếp tục chu kỳ3 profile của các cấp trước.
- Map10046 dùng scene10010/map010 và boss visual204 đã có. Boss giữ15 trang bị, floor45; thường dùng cấp nhân vật, boss dùng cấp nhân vật+5 theo luồng cũ. Q45 `[Vĩnh Hằng · Tuyệt]`, templates75101–75112 và75201 có sẵn.
- Không thay attrs/power/giá bán công thức cũ. Hệ số quality44=13,9, quality45=14,2 (~2,16% hơn cùng cấp trước variance/floor); vẫn có dao động95–105%, vì vậy không bảo đảm mọi món Q45 luôn hơn mọi món Q44.

## Lưu dữ liệu và phạm vi

- `DropLevel46Service` xử lý2100/2101/2102 khi S1 và player cấp>=45, chạy trong khóa player, drain hàng đợi lưu, draft snapshot online mới nhất, kiểm save confirmed trước ACK; save mơ hồ vô hiệu session.
- Receipt nhúng trong `boxInfo.drop46Receipt` lưu tổng bạc/phù, mốc bắt đầu/kết thúc và64 giao dịch gần nhất. Duplicate cùng session/tag/msgUid không tính tiền hai lần; không tuyên bố ledger bất biến toàn lịch sử.
- Mọi binary config không đổi. Server dùng overlay có cờ; bundle chung áp dụng overlay khi nhận PlayerInfo của S1 và khôi phục45 khi chuyển S2/S3. 16 hàm ủy thác/bán đồ giữ nguyên từng ký tự.
- Có các candidate v1 chưa đạt trong quá trình làm: sai vị trí cost, chưa nạp env vào PM2, fixture env/encoding lỗi. Chỉ v2 cuối trong `release_verified.json` là bản nghiệm thu. Không chạy lại script v1; đã xóa4 script phiên này không còn dùng. Không suy lỗi print/HTTP200 thành kết quả gameplay.

## Kiểm chứng

- 15 nhóm fixture local/VPS staging PASS: đồng bộ client/server, S1→S2→S1, xác suất chính xác10.000 ô, đủ12slot, công thức Q45, chi phí/timer, bấm trùng, thiếu bạc/phù, save null/throw/commit-timeout, đọc lại và cap46.
- Mongo thật trong DB thử riêng trên host S1:6 nhóm PASS. Dùng handlers/source đang deploy; năm lần thanh toán340m, skip87120, load lại46 và receipt; map10046 slot claim, thường+boss nhận đủ; auto-sell xác nhận16UID và26.200 bạc. Không mở app scheduler trong DB test. DB thử đã xóa, xác nhận0 database `lhs_drop46_qa_*` còn sót.
- 18 ca auto-sell +8ca UI/settings cũ PASS; 16hàm auto-sell trong bundle mới identical baseline.
- Sau deploy, `/ready`8080/8083/8084=200; S1 PID20425, S2 PID13714, S3 PID13965. PID bot/dist/admin giữ nguyên.
- Nginx thực tế root game ở `/`, không phải `/game/`. Served `/index.html` sha428af3eea69634f9b2f65acc52fb59fba25976b168846ada38da988e9cc70e89; `/js/main.min_drop46_s1.js?v=20260914_drop46_s1_v2` sha7cded68b03d1270925b9a0bfb1069c58b3427fdd821c8fadb8522fab89c4fbb1. Bounded log không có marker lỗi mới.
- Read-only player sau deploy:6row vẫn cấp45/exp0, không receipt thanh toán. Chưa thực hiện native UI E2E trên tài khoản thật; người dùng là bước nghiệm thu cuối.

## Cách người dùng test

1. Tắt ủy thác, tải lại hoàn toàn client/Ctrl+F5 và đăng nhập S1. Dùng nhân vật cấp rơi45, không nhầm với cảnh giới45.
2. Chuẩn bị340m bạc; nếu muốn test ngay không chờ, chuẩn bị tối đa87.120 Phù tăng tốc. Đây là tiền/vật phẩm thật sẽ bị tiêu theo gameplay; không có gói cấp miễn phí hay bồi hoàn tự động.
3. Mở nâng cấp rơi: phải thấy mục46, năm bước mỗi bước68m. Sau mỗi bước bạc giảm đúng68m. Hoàn thành5bước thì timer bắt đầu; dùng tăng tốc hiện có.
4. Đạt46 thì thoát/đăng nhập lại: vẫn46, không có bước47, vào map mới dùng hình nền cũ.
5. Tắt bán tự động khi kiểm đồ; thử quái thường (Q38–45, Q45 hiếm0,01%) và boss (15món Q45). Kiểm tên/icon/slot/chỉ số/so sánh lực chiến/mặc-bán; không đòi mọi Q45 đều mạnh hơn Q44 vì variance.
6. Bật ủy thác và bỏ tích Giữ lại phẩm chất: chỉ đồ rơi mới bị bán, đồ cũ/preset không bị bán. Tích lại và chọn phẩm chất thì giữ đúng lựa chọn. Đăng nhập lại kiểm thiết lập.
7. S2/S3 phải còn45. Nếu sai số liệu: ngừng thao tác, gửi account/server, thời điểm UTC+7, ảnh trước/sau; không spam retry hay sửa level bằng GM.

## Backup/khôi phục

- Gốc trước toàn bộ thay đổi: `/linhhoasu/_ai_workbench/backups/drop46_s1_20260914_102038` giữ ConfigService/compat/ecosystem/index baseline. Bản v2: `/linhhoasu/_ai_workbench/backups/drop46_verified_20260914_104221`; các backup này KHÔNG có cùng ý nghĩa (v2 trước đó là candidate v1).
- Nếu chưa ai nâng: có thể khôi phục index, bỏ cờ S1 và reload hẹp theo CAS. Nếu đã có người nâng/chi tiền hoặc đang chờ: không tắt hỗ trợ46, không downgrade/overwrite player; đóng mua mới nhưng giữ đọc46/timer đang chạy, dùng receipt đối soát và cần chỉ đạo trước bồi hoàn.
- Các stage remote/test do phiên này tạo đã dọn một stage v2 sau lưu bằng chứng; giữ backup gốc và evidence local. Không xóa file cũ/người dùng.

Evidence: `_ai_workbench/temp/drop46_release_20260914/release_verified.json`, `mongo_test.log`, `served_verified.json`, `player_readonly_after.json`. Tool tái sử dụng: `build_drop46_server_candidate_20260914.py`, `build_drop46_client_20260914.js`, `test_drop46_release_20260914.js`, `test_drop46_mongo_isolated_20260914.js`. Release script có CAS theo preimage cũ, không chạy lại nguyên trạng trên release hiện tại.
