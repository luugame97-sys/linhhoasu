# Kế hoạch sửa kẹt nhiệm vụ Võ hồn / Thần binh — 19/09/2026

## Kết luận kiểm tra

- Audit live chỉ đọc trên `lhs_s1001..lhs_s1004`: 4 node online, readiness `200`, không ghi DB/restart. Cờ `FEATURE_SIDE_TASKS_ENABLED` và `FEATURE_SIDE_TASK_ROOTS` chưa đặt.
- `SystemConfig` hiện là `209 <- task 90021` và `216 <- task 90003`. Tiền đề là `311 -> root 90020` (Thần binh) và `313 -> root 90002` (Võ hồn). Chuỗi canonical: `90020(active13 dùng item55) -> 90021(active40 nhận Thần binh) -> 90022(active3 bán 10 trang bị)`; `90002(active54 DoubleTower) -> 90003(active55 xuất trận Võ hồn) -> 90004..90006`.
- Không có state root `90020/90002` trong cả bốn DB. Nhóm có tiền đề đã lưu nhưng thiếu unlock là `106` cho 209 và `72` cho 216 (đã loại prefix bot theo `userId`; cần migration phân loại, không coi mọi dòng là đã hoàn thành hành động). Hứa Thanh S3 là ví dụ: level264, main task10302 đã hoàn tất, 311/313 đã mở nhưng 209/216 và type9 đều thiếu.
- `upgrade.js`/`task.js` live đã có evaluator type9 nhưng vẫn gọi `SideTaskProgressService`; file service chưa có trên live. Candidate chứa service/counter nhưng chưa deploy. Đây là drift partial-release phải xử lý trước khi bật cờ.

## Việc phải sửa trước migration

1. Đóng gói cùng một release các file `SideTaskProgressService`, `upgrade`, `task`, `account`, `playerPayload`, `arena`, `mine`, `artifact`, `valhalla` và dependency manifest; startup phải fail-fast nếu handler tham chiếu service thiếu. Flags mặc định tắt.
2. Chuẩn hóa ledger type9: hợp nhất `taskInfo.tasks` và `tasksMap['9']`, ưu tiên trạng thái tiến xa (`30 > legacy2 > 20 > 10`), progress lớn hơn nhưng clamp theo target, loại duplicate/cycle. Canonicalize `unlockedSystem` về số trước khi kiểm root. Không để normalizer xóa task type9.
3. Sửa thứ tự claim: commit successor/reconcile trước, sau đó refresh unlock và save atomic; cùng response phải phản ánh `90021/209` hoặc `90003/216`. Chặn status legacy `2` chỉ khi có marker/receipt hợp lệ; thiếu bằng chứng đưa vào review queue.
4. Nối receipt authoritative: active13 chỉ sau Mine consume item55 hợp lệ và chống replay; active40 sau artifact grant/equip commit; active54 chỉ sau kết quả DoubleTower do server xác minh, không tin `params.type`; active55 sau Valhalla equip/ xuất trận commit. Không dùng inventory/counter chung để suy ngược active13/54/55.
5. Trả task update packet/push sau mỗi mutation active13/40/54/55; hiện một số handler chỉ trả packet gameplay nên client có thể hiển thị task cũ cho đến relog.

## Sửa tài khoản cũ

- Dry-run cả bốn DB, tách người chơi/bot/QA, xuất diff theo `userId`, version và lý do. Nhóm chưa đủ 311/313 giữ nguyên. Nhóm đủ tiền đề nhưng thiếu root được seed root status10 bằng CAS/idempotency; không cấp thưởng và không tự đánh dấu hành động.
- Nếu có state/receipt hợp lệ thì khôi phục successor/status và unlock đúng một lần. Trường hợp đã có 209/216 nhưng ledger thiếu chỉ canonicalize ledger, không replay reward. Snapshot, journal và backup trước ghi; conflict hoặc status mơ hồ chuyển review queue.
- Sau migration, invalidate/refresh session cũ, login lại và read-back Mongo. Chạy lần hai phải `0 diff`; disconnect/save-failure không được làm tụt status hoặc ghi đè task đã claim.

## Kiểm thử và phát hành

- Unit/contract: graph không cycle/missing parent; map-only và map-conflict; ID string; status10/20/30/legacy2; claim/replay/duplicate msgUid; save conflict; refresh ngay sau claim.
- Native E2E cho tài khoản mới, Hứa Thanh, tài khoản cũ có artifact/receipt và tài khoản chưa đủ điều kiện: Mine 2800–2804, DoubleTower 4500–4509, Valhalla equip, relog/reconnect. Kiểm item/tiền/điểm/thưởng đúng một lần.
- Stage trên DB cô lập, rồi canary một tài khoản mỗi server. Rolling release cả bốn node với hash đồng nhất; bật flags sau khi receipt và migration QA đạt. Theo dõi metric root-missing, claim-conflict, duplicate-receipt, `MODULE_NOT_FOUND`, unlock latency. Rollback code tách khỏi migration và không restore nguyên player document.

## Tiêu chí hoàn tất

- Đủ tiền đề thì root xuất hiện bền qua login/realm/farm/task/reconnect; hoàn thành root và claim làm sáng 209/216 ngay trong cùng flow; thiếu tiền đề vẫn bị khóa.
- Không mất/nhân item, tiền, vé, task hoặc reward; migration idempotent; cả bốn node dùng cùng release và không còn tham chiếu module thiếu.

Evidence: `_ai_workbench/temp/vo_hon_than_binh_audit_20260919.json`; tool read-only `_ai_workbench/tools/audit_vo_hon_than_binh_remote_20260919.py`.
