# Hoàng Cổ Mê Thành — chẩn đoán và bản sửa 02/10/2026

## Kết luận

Lỗi có **hai lớp**, trong đó lỗi làm kẹt phiên chính nằm ở server:

1. `old-trek.js` thêm `revision` vào object response sau khi CAS đã lưu. Một số handler trả object state theo reference, nên lần request kế tiếp thấy preimage khác Mongo và trả `OLD_TREK_SAVE_UNKNOWN`, sau đó phiên bị buộc đăng nhập lại.
2. Client production vẫn nhận addon OldTrek cũ do cache/CDN. Index đã trỏ tới bản guard mới nhưng URL cũ còn phục vụ addon v1, nên bản sửa client trước đó không chạy ở trình duyệt.

## Đã triển khai

- Server: clone response trước khi gắn metadata `revision`, giữ nguyên payload wire và không đổi công thức gameplay. CAS preflight khớp; hash `old-trek.js`:
  - trước: `e98ad0228f1eef6f836448c224003ba64d43ed3107975496bc0d078a0cb6a000`
  - sau: `11ec6b244149889d37e8fbd19db2769c4bdd6f8bb525637b6c57854aa09c7b21`
- Rolling restart S1–S6 đã hoàn tất, cả sáu `/ready` đều `status=ok`, Mongo/Redis `true`. Không ghi player/DB trong đợt triển khai. Backup server: `/linhhoasu/_ai_workbench/backups/oldtrek_server_fix_20261002_020109`.
- Client: index đã đổi cache key thành `20261002_oldtrek_guard_v3`; addon v2 được phục vụ tại `js/lhs-oldtrek-errors-v1.js?v=20261002_oldtrek_guard_v3`.
  - index public direct hash: `b2ddd66ef5610e6e0f6c69eaa2c85e5c43953d3bbece22cf2d3c22d71827b44e`
  - addon public hash: `6cd8a1e47b6fc6c656b0ea672ccef19921e9632d4388bf42ce2ad471eb49b8b2`
  - Backup index: `/linhhoasu/_ai_workbench/backups/oldtrek_index_v3_20261002_020336`.

## Kiểm chứng hậu triển khai

- Client addon: `node --check` PASS; test guard và retry event/relog PASS.
- Harness server candidate: terminal event và deferred currency change PASS; ca unsaved session bị CAS từ chối có chủ ý, không phải lỗi hồi phục dữ liệu.
- Audit Mongo chỉ đọc sau restart: `directPlayerWrites=0`; S1–S6 online; CAS của nhân vật mẫu khớp `oldTrekInfo`, `items`, `currencies`.
- Error log S1–S6 không còn `OLD_TREK_SAVE_UNKNOWN`/`OLD_TREK_SAVE_NOT_CONFIRMED` sau bản deploy.
- Browser chưa đăng nhập tới màn gameplay nên chưa thực hiện native E2E bằng tài khoản thật.

## Trạng thái dữ liệu cần lưu ý

Một số nhân vật vẫn có `currentEvent` đang chờ xử lý; đó là tiến độ gameplay hợp lệ để client mới tiếp tục, không tự xoá hoặc reset. Audit hiện tại còn một event mini-game đã quá hạn ở S6; chưa có tài khoản xác định để xử lý đúng người, nên không đụng dữ liệu.

Người chơi cần đóng tab/game và mở lại hoặc `Ctrl+F5` để nhận index v3. Nếu vẫn kẹt, cần tài khoản/tên nhân vật và S1–S6 để đối chiếu đúng state read-only.
