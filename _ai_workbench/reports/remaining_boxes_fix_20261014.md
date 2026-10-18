# Fix các rương còn lỗi — 14/10/2026

## Phạm vi đã triển khai

- Sửa đúng 34 mã type99 trước đây bị trừ rương nhưng `rewardInfo` rỗng: `406, 408, 432, 434, 444, 446`; `100071–100073`; `100181–100184`; `100211–100213`; `100241–100243`; `100261–100263`; `100511–100513`; `100721–100729`.
- Sửa lựa chọn `90151` để nhận `100721×2` mỗi lần chọn hợp lệ; sau đó mở `100721` theo pool Linh Trục đã xác minh.
- Item `100802` giữ nguyên bản vá lượt trước.

## Logic phần thưởng

- Resolver production trên VPS đã có 68 định nghĩa pool và hiện được handler gọi cho các wrapper đã xác minh. Pool được kiểm tra lại bằng metadata nguồn, quality/cấp, bảng đích và danh sách ID không rỗng trước khi consume.
- Rương cố định `406/408/432/434/444/446` trả đúng các dòng vật phẩm cố định theo config hiện hành.
- Orb, Hồn Thần binh, Bí bảo và Linh Trục trả native ownership đúng loại; count `1/3/55` không nhân đôi.
- Phân phối random là đều trong pool đã xác minh. Đây là logic tương thích từ catalog/client/config hiện hành, không tuyên bố là trọng số backend Trung chính thức vì không có source backend Trung để đối chiếu tỷ lệ.

## Kiểm chứng sau deploy

- Fixture chạy bằng đúng source live sau restart: **172 ca PASS** — 34 mã mục tiêu × 3 count, 63 mã chưa có pool vẫn fail-closed, `90151`, `100802`, count lỗi và thiếu tồn kho.
- Các ca fail-closed giữ nguyên item và không save; `networkAttempts=0`, `writeAttempts=0`.
- `node --check` PASS. Dependency resolver live: 68 definitions, `100721` verified.
- Deploy 2 file bằng backup/CAS/atomic rename; backup production: `/linhhoasu/_ai_workbench/backups/remaining_boxes_20261014_163424`.
- Restart tuần tự `lhs-s1001`–`lhs-s1008`; cả 8 `/ready` đạt Mongo/Redis `true`, không đổi process ngoài phạm vi.

## Còn giữ chặn

63 mã event/elf/curios/homeland/boss chưa có loot contract hoặc trọng số đáng tin cậy vẫn trả `ITEM_REWARD_POOL_UNVERIFIED` và không trừ rương. Không port mù từ icon/tên hoặc tự đặt tỷ lệ Trung. Các rương câu cá `94821–94825` cần request receipt/revision đúng contract, không phải lỗi pool.

Chưa thực hiện native E2E bằng tài khoản người chơi và chưa bù lịch sử item đã có thể mất trước bản vá.
