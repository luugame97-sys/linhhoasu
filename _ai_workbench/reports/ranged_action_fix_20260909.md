# Đã phát hành sửa khựng đòn đánh xa — 09/09/2026

## Kết quả

Đã phát hành client-only `20260908_ranged_action_v1` lúc 00:10 GMT+7 ngày09/09. Áp dụng luồng map `RemoteAtkAction` dùng chung; không hard-code theo tên skin. Có28 bộ/78 cấu hình appearance đánh xa trong dữ liệu hiện có.

File game: `linhhoasu/webgame/game/js/lhs-ranged-action-v1.js` và thêm một dòng nạp ở `linhhoasu/webgame/game/index.html`. Giữ nguyên main bundle, overlay ngoại quanv5, backend, config, tầm đánh, modeSpeed, RNG, damage đã sinh và giao thức2000→2001. Không restart, sửa hồ sơ, cấp bù hoặc tiêu tài nguyên người chơi.

## Lỗi đã xử lý

- Callback và công việc hẹn giờ thuộc từng action, giữ reference actor/target/raid và danh sách đòn. Callback sau cancel/đổi map/target/Init mới bị vô hiệu; thay cả action-list cũng dọn đúng child đang chạy. Không còn hit timer gắn vào actor hoặc constructor dùng chung.
- Hit/animation/projectile hoàn tất riêng, hit presentation chỉ một lần. Lỗi tạo/chạy FX không làm ngừng timeline hoặc kích hoạt lại hit. Dọn effect của đòn hủy; hiệu ứng trúng đích của đòn hoàn tất vẫn được phát hết.
- MapEffMgr dùng lease/generation của holder và instance mc; Promise cũ không xóa effect mới sau tái sử dụng pool. Lỗi của một effect được cô lập khỏi vòng cập nhật effect khác.
- Callback animation khỏe vẫn quyết định hoàn tất. Khi callback mất, dựa duration/tiến độ track thực tế và tốc độ đang chạy; không cắt animation còn tiến triển chỉ vì clock estimate. Chờ tải có ngân sách riêng, tạm dừng khi tab ẩn. Không đổi tốc độ tấn công để che khựng.

## Kiểm chứng và giới hạn

- **VM:** 78appearance ×3đòn thường/crit ×2tốc độ =468ca so native trước/sau; một hit với cùng delta, chênh thời điểm hit≤25ms và hoàn tất≤40ms trong fixture. 27 nhóm test gồm lỗiFX, callback mất/trùng, hủy giữa flight, target/actor/raid mất, thay action-list, model đổi, track còn tiến triển, track đứng, background, pool reuse và idempotence. Test chặn network/DB.
- **Browser native:** tải skeleton/atlas/texture thật từ gói game, đo đủ78 model có3clip cần thiết. Bản cuối hash `f866eaef6b3acd4129516baf55be6ea5e3af461a60002aecbf7858efdf146d52` render234đòn ở ×2 trên28bộ/78biến thể, gồm Phượng và5màu Mặc Nhiễm:234hit, không lỗi/cảnh báo/fallback. Candidate trước đã chạy234đòn×1 và36ca tập trung Phượng/Mặc Nhiễm; không gộp chúng thành nghiệm thu final-hash×1.
- QA dùng kỹ năng computer-use và cảnh Egret local biệt lập, không login/RPC game. Fixture ban đầu30FPS khác game60FPS khiến callback chậm so clock; đã sửa **fixture** về60FPS và giữ guard tôn trọng track đang tiến triển. Chỉ số `mapTickP95` là tick CPU/fixture, **không phải FPS hoặc benchmark GPU**.
- Hồi quy local: ngoại quan15, native cần/bè8/216ca, audit tab192ca, nguyên liệu quái17, show-info và core714bảng đạt. Năm test ranged/fashion/native/tab/material cũng chạy trên Linux staging và mã đã cài live; tất cả PASS, productionWrites/networkAttempts=0 trong test.
- Hậu kiểm: hash disk/HTTP nội bộ/public khớp, main/backend/overlayv5 nguyên; S1/S2 ready200, sáu PM2 process giữ PID/restart. Đuôi log mới có dữ liệu gameplay nhưng không marker exception trong phần đọc giới hạn256KiB/file. Không tuyên bố mọi log sạch toàn bộ hoặc mọi điện thoại/mạng đã mượt tuyệt đối.
- Chưa có trace trước/sau trên phiên thật của người báo lỗi, chưa gameplay end-to-end bằng tài khoản thật qua2000→2001/relog. Bản này sửa các lỗi lifecycle tái hiện được; không bảo đảm loại trừ giật do GPU/mạng hoặc mọi lỗi ngoài luồng map.

## Danh sách bộ đánh xa

Số biến thể là số effect/appearance phân biệt, không phải số màu đã mở trên tài khoản.

| ID | Tên trong client | Biến thể |
|---|---|---:|
|28040|Phượng Cầu Hoàng|1|
|28050|Hoàng Luyến Chi|1|
|28060|Bạch Tố Trinh|4|
|28070|Hứa Tiên|4|
|28080|Tiểu Thanh|4|
|28090|Pháp Hải|4|
|28140|Anh ca phượng vũ|1|
|28150|Thu Phong Lạc Diệp|1|
|28160|Lãng đãng bất kham|1|
|28170|Thu Phong Ô Mộc|1|
|28180|Tiếu ngạo trần hoàn|1|
|28190|Trần Ngự Thiên Sơn|1|
|28200|Lăng Tuyết Trần|4|
|28210|Ngưng Sương Nguyệt|4|
|28220|Dương Sương Thần|4|
|28230|Âm Tuyết Ly|4|
|28240|Sư cổ kinh hồng|5|
|28250|Ninh Thái Thần|4|
|28260|Nhiếp Tiểu Thiến|4|
|28270|Yến Xích Hà|4|
|28280|Bà ngoại|4|
|28290|Cái thế 1 đao|1|
|28300|Trùng chấn Hà Sơn|1|
|28320|Kaká - Con trai của cỏ|1|
|28330|Kaka Milan Quý Ông|1|
|28340|Mực nhuộm ngân hà — Mặc Nhiễm Tinh Hà|5|
|28350|Mục Trần|4|
|28360|Lạc Ly|4|

## Bàn giao/khôi phục

- Người chơi cần Ctrl+F5 hoặc đóng/mở lại trang để nhận script mới. Không yêu cầu nhận lại skin.
- Manifest: `_ai_workbench/temp/ranged_action_fix_20260908/release.json`; QA cuối `tests.json`, `visual.json`. Tool: `_ai_workbench/tools/release_ranged_action_20260908.py` có `verify`/`rollback` hash-guarded.
- Backup live `/linhhoasu/_ai_workbench/backups/ranged_action_20260908_170814`; rollback phục hồi index và chuyển fileJS mới vào backup, không rollback dữ liệu game. Backup local index: `_ai_workbench/backups/ranged_action_20260908/index.html`.
- Dừng server/cảnh QA sau kiểm tra, giữ tool/test/evidence phục vụ regression. Không cài dependency mới hoặc tạo HTML mới; tái sử dụng shell QA Egret sẵn có.
