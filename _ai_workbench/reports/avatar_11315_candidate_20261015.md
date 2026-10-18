# Candidate avatar động VIP từ GIF — 15/10/2026

- Đã đọc GIF nguồn `360x360`, 81 frame, delay 30ms; dựng sprite sheet RGBA 9x9, mỗi ô `256x256`.
- ID dự kiến: item/fashion `11315`, `FashionConfig.type=102`, resource base `sp_ui_touxiang_11315`.
- Candidate: `_ai_workbench/temp/avatar_11315_candidate_20261015/{sp_ui_touxiang_11315_candidate.png,preview.gif,manifest.json}`.
- Chưa sửa `gmitem.txt`, binary config, manifest production hoặc restart. Lý do: client native hiện yêu cầu asset Spine `.skel + .png`; candidate mới chỉ là raster sprite sheet và chưa có skeleton/animation timeline. Thêm item GM lúc này sẽ tạo item không thể trang bị.
- Cần một Spine exporter/compiler tương thích runtime hiện hành để hoàn tất `sp_ui_touxiang_11315.skel`, atlas/texture manifest và sau đó mới thêm `11315;Avatar VIP Khủng Long Động` vào `gmitem.txt` bằng backup/CAS/read-back.
- Kiểm tra bổ sung: workspace không có Spine Editor/CLI, binary encoder hoặc npm Spine runtime/compiler có thể xuất `.skel`; runtime bundle đang dùng resource `.skel` Spine hiện hữu. Không tạo `.skel` giả và không ghi production.
