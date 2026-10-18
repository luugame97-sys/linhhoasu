# Bật thanh máu người chơi trên toàn bộ map — 15/09/2026

> Cập nhật sau ảnh nghiệm thu: bản hiện hành là `20260915_player_healthbar_hud_v6`. Thanh máu/tên map đã trả về bố cục ban đầu (×1, nâng 18 px). HUD top tách tên thành hàng trên và thanh máu số thành hàng dưới; bar cao 23 px, rộng 160 px, lực chiến dịch phải 45 px. Chi tiết phát hành chung: `_ai_workbench/reports/auto_sale_hud_release_20260915.md`.

## Kết quả

- Đã phát hành addon client `js/lhs-player-healthbar-v1.js?v=20260915_player_healthbar_v3`.
- Hook tại `MapRaid.AddTeam`, bao phủ các map dùng hệ map native: map thường/Idle, Dungeon, DungeonSecond, HotSpring, Temple, Homeland và các lớp kế thừa tương ứng.
- Chỉ nhận entity có `dbid` và `type === raid.roleEnityType`; NPC/quái/pet/creep không qua điều kiện và giữ nguyên hành vi.
- `DungeonMapRaid.MapentityHpChange` được mở cho mọi raid type nhưng vẫn chỉ cập nhật entity người chơi. CrossRival vốn đã có vòng máu native trong `CrossRivalMapEntity.UpdateInfo`, không thay đổi.

## Kiểm chứng

- Local + VPS VM regression: 17 checks PASS; gồm player map thường, HP thực, fallback full HP, cập nhật Dungeon, chống cài hai lần và NPC/quái không đổi.
- Contract bundle live PASS: `EntityData.parserBase` giữ `showInfo.dbid`; các export `MapRaid`, `DungeonMapRaid`, `IdleMapRaid`, `HotSpringMapRaid`, `TempleMapRaid` tồn tại.
- Browser smoke tải bản live và ghi log `installed 20260915_player_healthbar_v3`; không có lỗi JS mới. Cảnh báo autoplay âm thanh của trình duyệt là cũ và không liên quan.
- Addon live/served SHA-256: `cc7aa3d81fe0c8610f650ea7017f54ad6c49a049884ee296bfca2546ec042658`; index live SHA-256: `8a298a357a9b6cf579a8e62c58feffee5b66d9b259e70c250a5f27bd642fd7d1`.
- Không restart server, không ghi DB/player. Backup trước v3: `/linhhoasu/_ai_workbench/backups/player_healthbar_v3_20260914_172752`.

## Rollback

- Khôi phục `index.v2.html` và `addon.v2.js` từ backup trên, hoặc bỏ đúng dòng `lhs-player-healthbar-v1.js` khỏi manifest game và xóa addon sau khi CAS xác nhận hash.
- Người chơi cần tải lại trang/Ctrl+F5 để nhận query version v3.
