# Audit lỗi RoleShowSpine timeout — 30/09/2026

## Rollback manifest và tối ưu tải client — 30/09/2026 21:07–21:22 ICT

- Người dùng báo bản manifest thêm 12 Spine làm game lỗi và load lâu. Đã rollback `index.html` về manifest ổn định `default.res_main_c669f2c0_pet_vusa_20260929.bin`; manifest candidate 12 resource vẫn được giữ lại để điều tra, không còn được client tham chiếu.
- Hash sau rollback: index `752aa9de…`, manifest cũ `c377de92…`; public/loopback đều khớp. Backup rollback: `/linhhoasu/_ai_workbench/backups/role_lian_rollback_20260930_210729/`.
- Đã thêm preload tùy chọn cho 39 bundle startup vào `index.html`; preload chỉ tải trước, không thực thi script, giữ nguyên thứ tự 40 script Egret. Trình duyệt không hỗ trợ, native app hoặc preload lỗi sẽ tự quay về loader cũ.
- Sau rà soát cạnh tranh băng thông, preload được thu hẹp còn **10 bundle đầu** (6 initial + 4 game đầu), không tải trước các module tùy chọn. Hash live/public cuối `c3ebd26f…`; backup `/linhhoasu/_ai_workbench/backups/startup_preload_20260930_212649/` (bản rộng trước đó giữ tại `/linhhoasu/_ai_workbench/backups/startup_preload_20260930_212201/`). Không restart PM2, không đổi manifest, không đổi player data.
- Test startup 4 trường hợp PASS; browser live tải tới màn đăng nhập. Console còn `NotAllowedError` autoplay do trình duyệt chặn phát âm thanh trước tương tác; không phải lỗi tải resource.

## Đã triển khai — 20:12–20:14 ICT

- Người dùng xác nhận triển khai an toàn. Đã kiểm tra preimage, backup có hash và swap nguyên tử: publish manifest mới trước, thay `index.html` sau. Không restart PM2/Nginx, không sửa JS, config gameplay hoặc dữ liệu người chơi.
- Backup: `/linhhoasu/_ai_workbench/backups/role_lian_manifest_20260930_201244/`; giữ cả index và manifest cũ.
- Manifest mới `default.res_main_c669f2c0_pet_vusa_lian_20260930.bin`: SHA-256 `c770cba4a144f06e64fe751cdc30414e48ae62d5d3ba2ff76830f34b85b5921f`. Index SHA-256 `301542c5c6825fc734f1cd8b39969af5772e4692be477ca6db90257b4b3facc9`; token `20260930_spine_lian_v1`.
- Kiểm tra theo tên resource: 39.257 resource cũ không thay đổi, tên/thành viên mọi nhóm tải giữ nguyên; thêm đúng 12 resource lian, tổng 39.269. Giữ nguyên chế độ nén của bản gốc, parse tới đúng cuối file.
- Hash file live, HTTP loopback và HTTPS public `linhhoasu.lol` đều khớp; 12/12 asset HTTP 200, skeleton/KTX đúng kích thước, PNG đúng MIME.
- 6/6 `/ready` báo Mongo/Redis true; sáu PID và restart counter không đổi. Browser mới tải tới màn đăng nhập, không thấy lỗi parse `#1025`; console chỉ có `NotAllowedError` autoplay âm thanh do chưa tương tác.
- **Chưa gameplay E2E** cảnh RoleShowSpine trong game; không tuyên bố mọi lỗi console đã hết. Người chơi cần tải lại client để nhận manifest mới.
- Receipt: `_ai_workbench/temp/role_lian_manifest_20260930/deployment.json`. Rollback: chỉ khôi phục index từ backup qua file stage + rename sau khi kiểm tra index live còn hash candidate; manifest cũ vẫn còn nguyên.

## Bằng chứng audit trước triển khai

- Ảnh console báo `[LHS] RoleShowSpine load failed` và `RoleShowSpine load timeout`; sau đó client báo animation `hoam_stand_1` chờ Spine tải xong rồi phát lại.
- Code client hiện đặt watchdog **10 giây** quanh `Promise.all(n)` của các hàm tải model/Spine. Nếu một Promise không resolve/reject trong 10 giây, client log lỗi rồi khôi phục animation state; đây là lỗi/timeout ở lớp hiển thị client.
- `showData` trong ảnh chứa các phần `3010`, `80130101`, `80130102`, `80130103`, `80130109`, tương ứng nhóm model/trang bị nhân vật; không phải lỗi gửi mail hay DB pet.
- Manifest local có các resource Spine tương ứng. Kiểm tra public tại thời điểm audit: JS game HTTP 200; skeleton `sp_equip_80130102_b4991991.skel` HTTP 200/4476 bytes; PNG và KTX tương ứng HTTP 200. Điều này chứng minh URL mẫu tồn tại, chưa chứng minh mọi Promise/texture trong trình duyệt đã hoàn tất.
- Chưa có bằng chứng 404/500 từ ảnh. Khả năng còn lại: một resource phụ/atlas/texture bị chậm hoặc không resolve, cache/service-worker/resource pack lệch phiên bản, hoặc decoder/WebGL bị treo. Cần xem DevTools Network lọc `8013|spine|skel|atlas|png|ktx` để xác định request cụ thể.
- Không sửa source, không deploy/restart trong audit này.

## Candidate fix đã dựng trước triển khai

- Đã xác minh gói main đang được index dùng (`default.res_main_c669f2c0_pet_vusa_20260929.bin`) có 39.257 resource nhưng thiếu cả 12 resource `sp_lian_3010/3040/3041/3080` (skel/png/ktx); gói CN có đủ.
- Candidate mới thêm đúng 12 resource vào gói main: 39.257 → 39.269 resource, round-trip manifest PASS, không đổi resource cũ.
- Candidate index đổi manifest sang `default.res_main_c669f2c0_pet_vusa_lian_20260930.bin` và cache token `20260930_spine_lian_v1`.
- Candidate: `_ai_workbench/temp/role_lian_manifest_20260930/`; tại thời điểm dựng chưa có production write. Kết quả rollout ở mục đầu báo cáo.
