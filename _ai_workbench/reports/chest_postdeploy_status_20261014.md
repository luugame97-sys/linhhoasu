# Trạng thái rương sau deploy 63 mã — 14/10/2026

Audit live sau deploy dùng source hiện tại trên VPS và player RAM-only:

- `692` item/candidate, `2254` ca; `emptyItems=0`, `networkAttempts=0`, `writeAttempts=0`.
- `63` mã custom mới đều mở được và có reward trong fixture; đây là compatibility logic, chưa phải bản Trung có trọng số được xác minh.
- Còn `2` rương tự chọn chưa chuẩn: `90021`, `90022` trả `selection required` vì chưa có lựa chọn hợp lệ.
- Còn `5` rương câu cá `94821–94825`: gọi generic thiếu `requestId/expectedRevision` sẽ bị `FISH_CLIENT_UPDATE_REQUIRED`; gọi đúng contract câu cá thì đã có luồng phát thưởng. Không nên mở bằng generic item RPC.
- Còn `134` mã fail-closed không có server reward contract. Trong đó `32` mã đang visible trong catalog và có thể xem là phạm vi cần làm tiếp:
  `474–479`, `90081–90085`, `100050`, `100070`, `100100`, `100161–100164`, `100180`, `100186–100188`, `100191–100193`, `100210`, `100240`, `100260`, `100651–100653`, `164502`.
- `102` mã còn lại là item ẩn/nội bộ hoặc phần thưởng event/auto-open; không có bằng chứng người chơi mở trực tiếp từ túi. Danh sách đầy đủ nằm trong audit raw `_ai_workbench/temp/chest_audit_20261014_postdeploy.txt`.

Kết luận: nếu chỉ tính rương đang hiển thị và bấm mở được, còn `34` mã cần xử lý tiếp (`32` random/selection + `90021/90022`), cùng `94821–94825` phải giữ contract câu cá riêng. Nếu yêu cầu “chuẩn bản Trung”, toàn bộ `63` mã custom cũng vẫn cần source loot/weight chính thức để thay compatibility logic.
