# Giảm quà và thu hồi đền bù Donate — 13/09/2026

- 50 mốc ngày/tuần/tháng đã đổi công thức:
  - item `7/20/60` = mốc / 10
  - item `8/61` = mốc / 100
- Cap Donate đã hạ theo công thức mới (`7/20/60` tối đa 10.000.000; `8/61` tối đa 100.000), có backup/CAS.
- Đối soát 18 delivery bù cũ: 10 thư chưa nhận đã thu hồi; 3 delivery đã nhận nhưng còn đủ số dư để rollback riêng phần item `7` đã thực giao; 3 delivery đã nhận đầy đủ nhưng số dư thiếu nên giữ manual review; 2 delivery không còn thư để chứng minh.
- Không trừ âm, không rollback mù; marker rollback ghi trên 3 player đã xử lý.
- Ba tài khoản manual review (`minhtoanmt`, `phongpg01051994`, `liglig94`) đã tiêu một phần quà bù vào tiến trình: số dư hiện tại không đủ cho toàn bộ attachment. Snapshot sẵn có của đợt 07/09 là trước nhiều gameplay hợp lệ, không dùng để restore mù.
- `/ready` S1/S2 `200/200`, không restart process.

Backup remote: `/linhhoasu/_ai_workbench/backups/donate_item_milestones_reduce_20260913/`.
Evidence: `_ai_workbench/temp/donate_reduce_preview_20260913.json`, `_ai_workbench/temp/donate_reduce_apply_20260913.json`, `_ai_workbench/temp/donate_comp_revoke_20260913.json`.
