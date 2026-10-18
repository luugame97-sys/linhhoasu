# Mở 48 ô miễn phí và ghép nhanh Tinh Linh — 05/10/2026 18:21 ICT

## Kết quả

Đã triển khai bàn ghép **6×8 = 48 ô miễn phí** trên S1–S7, giữ 3 vị trí xuất chiến. Nhân vật cũ và mới nhận đủ capacity khi hydrate/đăng nhập, không đổi UID, vị trí hoặc phẩm chất pet để mở ô.

- Runtime `PetBaseConfig`: initialField48, fieldMax48, fieldConsume[], freeFieldCount48. Dùng overlay source nhỏ; không thay nguyên binary config hoặc client Cozy.
- Thêm addon native `lhs-pet-grid48-v1.js`: tạo48 component theo skin162×150, cố định board extent sau đo, lưới6×8 và hit-test/kéo thả theo chuyển đổi tọa độ native.
- Menu có **Ghép nhanh Tinh Linh đang có**. Nút nhanh chờ5giây rồi gửi một batch3314; auto thường giữ luồng mở trứng/ghép native. Ghép vẫn dùng tỷ lệ và nguyên liệu hiện có.
- Batch dùng draft riêng, khóa theo role, drain pending saves, receipt bền vững trong cùng save; lỗi/null/unknown commit không ACK thành công hoặc phát draft vào session. Retry nhận trạng thái hiện tại/absolute item counts, không trừ thêm.
- Client chặn gửi lặp, giữ intent/quality khi transport timeout, watchdog15giây; bỏ callback muộn/khác actor và chỉ thay pets khi result/field/list hợp lệ. Giữ các guard ghép thủ công trước đó.

## Kiểm chứng

- Server RAM:9 nhóm kiểm tra PASS (hydrate8/16→48, login changed flag, slot47/48, invalid quality, thiếu nguyên liệu, bảo vệ pet, forced roll success/failure đúng cost, concurrent/retry/conflict, save null/throw/unknown commit+read-back). Network attempts/production writes trong QA=0.
- Client:19 checks PASS,3 geometry×48 cells, skin thật162×150, native onTouchEnd từ live main; drag0→47, stable relayout, lỗi/retry/watchdog/actor/callback/menu.
- Candidate và installed QA trên runtime VPS đều PASS; các source mới syntax PASS. ConfigService candidate lấy từ exact live và giữ `gemLevel10Choice` cùng các overlay trước đó.
- Browser native sau deploy: login adminS1; đủ48ô không khóa, menu ghép nhanh hiển thị; kiểm thực tế viewport mobile390×844 và desktop1280×800 rồi reset viewport. Không bấm Bắt đầu ghép hay mở trứng để test.
- Read-back admin: field48,50pet =47trên bàn+3xuất chiến, UID unique, maxSlot47, invalidSlot0. Đây là đọc trạng thái, không tạo pet thử.
- S1–S7 readiness HTTP200/statusok/Mongo+Redistrue; public index/addon/game/WebGM HTTP200; addon public hash khớp candidate. Bot/admin/dist PID/status/uptime giữ nguyên.

## File và backup

- `linhhoasu/lhs/newServer/src/handlers/pet.js`: free-field hydration/login flag và giao dịch batch3314.
- `linhhoasu/lhs/newServer/src/config/petGrid48.js`: policy48ô miễn phí.
- `linhhoasu/lhs/newServer/src/services/ConfigService.js`: load policy nhỏ sau các overlay hiện có.
- `linhhoasu/webgame/game/js/lhs-pet-grid48-v1.js` và `index.html`: native addon/cache marker20261005_pet_grid48_v1.
- Backup trước deploy: `/linhhoasu/_ai_workbench/backups/pet_grid48_20261005_110407/`; manifest có hash/preimage/path từng file và receipt rolling.
- Hash public addon: `bb9be3bb0e5489116d0b28dfda0b0fae60d29d3286b6c87b8922c2c74b6590a7`.

## Bằng chứng / giới hạn

`_ai_workbench/temp/pet_grid48_20261005/{deployment.json,candidate_files.json,preflight.json,final_check.json,skins.json}`; server/client tests và release runner trong `_ai_workbench/tools/` / `client/` của workbench. Không bulk update player hoặc ghép thử trên tài khoản thật; mở capacity lưu theo luồng login bình thường đã được ủy quyền. Native UI đã nghiệm thu; batch success/failure/reconnect được kiểm trong RAM.

Người đang mở client cũ cần Ctrl+F5/đăng nhập lại hoặc dùng `/index.html?v=20261005_pet_grid48_v1`. Nếu cần rollback ghép nhanh, phải giữ tương thích lưới/capacity48 với các slot đã sử dụng; không hạ field hay tự di chuyển/xóa pet về trần16.
