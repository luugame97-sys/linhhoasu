# Fix kẹt bán đồ và chỉnh thanh máu/HUD — 15/09/2026

> **Phát hiện P0 sau v5/v6:** `index.html` live đang tải nhầm `main.min_a6195824.js?v=20260914_minigame_open_v1` thay vì `main.min_drop100.js?v=20260914_drop100_v1`. Bundle cũ không có client extension cấp rơi 46–100; player có trang bị mới làm `EquipListItem.dataChanged` nhận `AssetsConfig[equip.id] === undefined` rồi lỗi khi đọc `.quality`, khiến màn chính/login dừng. Backup v4 hash `587338...` còn đúng `main.min_drop100`; v5 đã ghi đè bằng local index stale và v6 kế thừa. Lượt xác minh này read-only, chưa sửa production.

> Đã sửa P0: live index hiện bắt buộc `main.min_drop100.js?v=20260915_drop100_restore_v2`; static manifest guard PASS và browser smoke không còn lỗi `quality`. Chi tiết `_ai_workbench/temp/index_main_bundle_guard_20260915/release.json`.

> Cập nhật bố cục v6 theo ảnh nghiệm thu: phần map trả về khoảng cách ban đầu (`nameRaise=18`, `mapBarScaleY=1`). Chỉ HUD top được sửa: group top tại `top=16`, cao 55; tên ở hàng trên (`verticalCenter=-13`), thanh máu ở `y=27`, cao 23. Backup `/linhhoasu/_ai_workbench/backups/player_healthbar_v6_20260914_183433`, evidence `release-healthbar-v6.json`. Browser log xác nhận v6 cài, JS error mới=0.

## Kết quả phát hành

- `WSServer` giới hạn single-flight theo socket cho Pháp tướng `3001` và thú cưỡi `3204`. Các request trùng khi một request cùng tag đang chờ được trả `REQUEST_ALREADY_PENDING`, không vào queue mutation.
- `EquipService`/`item` trả `missingUids` cho UID không còn trong inventory authoritative. Addon `lhs-auto-sale-reconcile-v1.js` tự dọn UID stale cho cả auto-sale và bán thủ công; khi RPC timeout, thử reconcile đúng một lần. Không cộng bạc cho UID missing và vẫn giữ guard đồ preset.
- Client Pháp tướng/thú cưỡi cũng có single-flight để ngăn flood từ nguồn. Test 500 request/tag: 499 request trùng được coalesce, queue tối đa 1.
- Thanh máu map player giữ tỷ lệ gốc `×1`; tên + cấp bậc tu luyện giữ mức nâng `18 px`. NPC/quái/pet/creep không đổi.
- HUD cạnh avatar có thanh máu cao `23 px`, rộng `160 px`, hiển thị `HP hiện tại/HP tối đa`; lực chiến dịch phải `45 px` so với baseline để tách bố cục.

## Kiểm chứng

- VPS staging PASS: queue flood 10 checks, sale server 18 case/200 batch, sale client 17 checks, HUD v4 30 checks, Formation/Mount client single-flight, core contract 714 bảng.
- Bản tinh chỉnh v6 PASS 38 checks; served SHA-256 `c1ac1ff8655dc96342e7e27cc66092fa88b829a837462eb9cc2872736fd5c0a2`.
- Browser runtime ghi `installed 20260915_player_healthbar_hud_v6`; không có JS error mới.
- S1/S2/S3 `/ready=200`, PM2 online. Sau release, cửa sổ hậu kiểm 02:21–02:28 không có queue wait/backlog/error mới; hai `2201` quan sát được hoàn tất `610 ms` và `811 ms`.
- Không chỉnh inventory/DB thủ công. Restart scoped S2 → S1 → S3; PID dist/admin/bot giữ nguyên.

## Backup và bằng chứng

- Release backup: `/linhhoasu/_ai_workbench/backups/auto_sale_hud_20260914_181821`.
- Tinh chỉnh v5 backup: `/linhhoasu/_ai_workbench/backups/player_healthbar_v5_20260914_182646`.
- Manifest: `_ai_workbench/temp/auto_sale_hud_20260915/release.json` và `release-healthbar-v5.json`.
- Chưa đăng nhập tài khoản người chơi qua phiên kiểm thử browser, nên bố cục native v5 cần người chơi Ctrl+F5 xác nhận trực quan. Nếu còn sát nhau, chỉ chỉnh hai hằng `NAME_RAISE_Y`/scale-height trong addon, không đụng gameplay.
