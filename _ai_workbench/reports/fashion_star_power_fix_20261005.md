# Sửa lực chiến tăng sao thời trang — 05/10/2026 13:42 ICT

## Kết quả

Đã sửa và triển khai S1–S7. Bộ thời trang tăng sao (`isSuit=1`) cộng thuộc tính của cấp hiện tại một lần theo `FashionDressLevelConfig`, thay vì bị bỏ qua trong công thức server.

- Đọc `fashionInfo.dress[].star` theo mức cao nhất đúng ID, hỗ trợ `starUp` khi chỉ còn dữ liệu cũ và đủ bộ sao 0.
- Sao 0 chỉ kích hoạt khi sở hữu đủ mảnh; một mảnh hoặc `starUp` mồ côi không tự cấp thuộc tính. Các biến thể sao cũ không cộng dồn nhiều cấp.
- Bộ liên kết tăng sao không được cộng vào điểm sao màu bộ sưu tập. Bản sửa giữ phạm vi ở loại bộ tăng sao; các nhánh màu/áo tắm hiện có không đổi.
- Sao đã nâng trước đây tự được tính khi đăng nhập hoặc server tính lực chiến lại, không cần nâng lại hay sửa DB.

## Kiểm chứng

- Candidate và code đã cài trên VPS: **20 bộ / 62 bước tăng sao; 62/62 thành công và tăng lực chiến**, thuộc tính chênh lệch đúng config, power packet 6198 phát giá trị mới. Nguyên liệu trừ đúng một lần; gửi lại mức sao cũ bị từ chối và giữ tiền/vật phẩm/sao.
- Fixture bộ 28060 sao 0→1: lực chiến `918600→926048` (+7448), attrs sao `{51:+120,52:+90,53:+90}`. Đây là giá trị fixture; mức tăng của nhân vật thật tùy chỉ số và các bonus hiện có.
- 12 edge cases PASS: đủ/thiếu bộ, record trùng, `dress` ưu tiên hơn `starUp`, tương thích legacy, level không có config, không nhân chỉ số biến thể, không tăng điểm sao màu và giữ bộ thường. PowerDisplaySync 13 checks PASS; syntax PASS.
- Đọc một nhân vật đã có sao ở mỗi S1–S7, so sánh baseline/fix trên bản sao RAM: **7/7 tăng lực chiến**, chỉ dùng `dress` vẫn có cùng kết quả. Không ghi/thử nâng sao trên nhân vật thật.
- Hậu kiểm deploy: 7/7 node HTTP200/status ok/Mongo+Redis true; bot/admin/dist process PID/status/uptime không đổi. Hash live khớp candidate.

## Thay đổi và khôi phục

- File: `linhhoasu/lhs/newServer/src/services/BattleService.js` (chỉ phần `addFashionAttrs`). Handler tăng sao và chi phí không đổi.
- Baseline hash `7e6d8b58c3ea6825362696694b30073bb269afe2a5f1d16b84e9fa008848ac91`.
- Candidate/live hash `323622609b25c40808d2835473118e20df72cd19e1e52582884c5e59f0ad340b`.
- Backup production: `/linhhoasu/_ai_workbench/backups/fashion_star_power_20261005_063605/BattleService.js`.
- Release runner có CAS/backup, test candidate trước deploy, canary S1 + installed QA, rolling S2–S7 và rollback có điều kiện nếu gate lỗi.

## Bằng chứng và giới hạn

- `_ai_workbench/temp/fashion_star_power_fix_20261005/{deployment.json,candidate_qa.json,installed_qa.json,saved_stars_readback.json}`.
- `_ai_workbench/tools/{release_fashion_star_power_20261005.py,audit_fashion_star_power_20261005.js,test_fashion_star_selection_20261005.js,verify_saved_fashion_star_power_20261005.js}`.
- Các phép thử ghi chỉ vào RAM, `productionWrites=0`; triển khai chỉ đổi source và restart game node. Chưa bấm nâng sao trên client của người chơi hoặc tiêu nguyên liệu thật. Người đang mở phiên cũ đăng nhập lại để đồng bộ lực chiến.
