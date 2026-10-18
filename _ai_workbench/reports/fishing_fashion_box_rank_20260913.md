# Thêm Rương thời trang 3 sao vào Đại hội câu cá — 13/09/2026

- Item xác nhận: **99002 — Rương thời trang 3 sao**. Item tồn tại trong `fashion_choice_overlay`/`fashion_choice_stars_overlay`, dùng native choice-box flow; không thay item ID khác.
- Đã thêm `99002` vào `Activity6RankConfig[6006]` ở cả 8 bracket:
  - hạng 1: 10
  - hạng 2: 7
  - hạng 3: 5
  - hạng 4–10: 3
  - hạng 11–50, 51–100, 101–500, 501+: 2
- Cập nhật đồng bộ 3 binary: server `lhs/.../config_e5ac72c2.bin`, client base `webgame/game/.../config_e5ac72c2.bin`, client fashion overlay `config_fashion_20260909.bin`. Chỉ table `Activity6RankConfig[6006]` thay đổi; 714 table record/parity giữ nguyên.
- Runtime S1/S2/S3 đã reload đúng phạm vi để server đọc config mới. Hậu kiểm: `/ready` `8080/8083/8084 = 200`; hash live:
  - server `1a449e2624b4654a91a7702dca2b8808e73cbb8cd53c5eefe06dd7a29dfeb59d`
  - client base `410ec5c165c1023dc45225eca06e62af755f80c6417f9beab1055a6eaece3d84`
  - client fashion `a0cb60e65d39e26e541873bae24e6cd7b64c31e10c439bd62bbe360c9c631225`
- Local binary rewrite PASS; cấu trúc 714 table, unrelated bytes giữ nguyên. Reward row `99002` kiểm tra đủ 8 bracket; server effective overlay có `AssetsConfig[99002]` và `AssetsUseConfig[99002]`.
- Không sửa player/inventory/mail cũ. Quà sẽ được ghi vào thư settlement sau khi kỳ câu cá kết thúc; kỳ hiện tại chốt theo scheduler đã deploy.
- Sau phản hồi ảnh UI chưa thấy quà, đã xác định client đang dùng cache-bust cũ `20260913_gem_names_v1`; binary đã có reward nhưng trình duyệt có thể giữ config cũ. Đã đổi `webgame/game/index.html` sang `20260913_fishing_fashion_box_rank_v1`; served index hiện trả đúng marker. Người chơi cần Ctrl+F5/đăng nhập lại để tải config mới.
- Sau khi người chơi xác nhận quà bị nằm cuối danh sách, đã sắp xếp `99002` lên **vị trí đầu tiên** của reward array ở cả 3 binary (server/client/fashion). Cache-bust index nâng lên `20260913_fishing_fashion_box_rank_v2`; served index đúng marker v2, served config hash khớp candidate, `/ready` S1/S2/S3 đều 200. Không thay đổi số lượng hay các quà khác.
- Evidence build: `_ai_workbench/temp/fishing_fashion_box_rank_20260913/build.json`; patch helper `tools/patch_fishing_fashion_box_rank_file_20260913.js`.
