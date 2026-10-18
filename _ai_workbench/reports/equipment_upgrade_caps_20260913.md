# Audit cap nâng cấp hệ thống — 13/09/2026

Phạm vi read-only. Config được đọc từ VPS runtime `/linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin`, SHA-256 `6e357dfc321709aa0fcd8cdcb36e624522d1aa65fb71abd0e711c3f209d03fd6`, gồm 714 bảng. Client config `/linhhoasu/webgame/game/update/resource/assets/excel/config_e5ac72c2.bin` cũng khớp hash `9a405adfbd064e74afaf25819b005d826590fdbbed31542f8653b013c6111c7b` giữa local/live. Không sửa source, DB, Redis hay player.

## Kết quả

| Hệ thống | Cap đang có trong config live | Route nâng cấp | Có thể update trong cap hiện tại? |
|---|---|---|---|
| Pháp tướng (`Formation`) | Grade 1→10. Cap từng grade (level/exp): `10/3, 20/10, 30/10, 60/20, 120/25, 280/30, 560/30, 840/35, 1120/40, 1400/45`; grade 10 không có grade 11. Phụ linh có 5 ô, config level 1→200. | `3001` tăng cấp/exp; `3002` tiến bậc; `3003` phụ linh | Có khi dưới cap và đủ item `7` (mảnh) / `8` (tinh linh). Guard ở `upgrade.js:765-804,851-885`. |
| Thú cưỡi (`Sword`) | Quality 2/3/4/6/7: level tối đa 150; star tối đa 40. | `3204` level; `3205` nuốt tăng star | Có. `mount.js:749-762` yêu cầu có row level kế tiếp và vật liệu; level 150 bị chặn. |
| Pháp bảo (`Artifact`) | `ArtifactConsumeConfig`: quality 4 tối đa 20, quality 6 tối đa 30, quality 7 tối đa 60. `forgeLevel=20`; quench mở mốc 30/40/50/60. | `3500` nâng level; `3501` forge; `3505` quench | Có. `artifact.js:640-649, 772-800` chặn khi đạt max và kiểm vật liệu. Q7 cần forge/quench để đi từ 20 lên 60; Q6 vẫn cap 30; Q4 cap 20. |
| Ngư cụ — cần câu/bè (`FishRod`/`FishRaft`) | Grade 1→10; level cap mỗi grade: **10, 20, 30, 60, 120, 280, 560, 840, 1120, 1400**. Grade 10 không có grade kế tiếp. | `4010` cần câu; `4015` bè | Có khi system đã unlock, `expectedState` khớp và đủ item `68` (level) / `69` (grade). `FishingGearService.js:19-56` chặn stale/max/thiếu vật liệu. |

## Phân biệt hệ dễ nhầm

- `Spirit` route `3600`, dùng item `60/61`, là hệ **pháp bảo**, không phải Pháp tướng.
- `SpecSpirit` dùng route `3612/3613`, config slot level 1→300 và star 0→10 theo stage 1→8; handler `spec-spirit.js:195-217` chưa chặn cứng `lv/star` vượt config và chưa kiểm vật liệu.

## Lỗi Pháp tướng đã xác định

1. **Bulk tăng cấp có thể trừ dư mảnh.** Server nhận `count`, trừ `count × item7` trước, sau đó mới chạy vòng lặp và dừng ở cap (`upgrade.js:779-806,809-828`). Ví dụ grade 1 đang `level=9, exp=2`, gửi `count=10` chỉ cần 1 mảnh để đạt `10/3` nhưng vẫn trừ 10 mảnh. `gainExp` chỉ báo phần thực dùng, còn `cost` và tag `1202` báo toàn bộ.
2. **Đếm nhiệm vụ bị phóng đại theo request.** `addSpiritUpgradeCount(player, requestCount)` (`upgrade.js:830`) cộng toàn bộ `count`, không phải số mảnh thực sự đã chuyển thành exp; có thể làm tiến độ nhiệm vụ Pháp tướng tăng sai khi request dư.
3. **Phụ linh trừ vật liệu nhưng không gửi packet đồng bộ túi.** `handleFormationEnchant` tiêu hao item `89`/bạc rồi save (`upgrade.js:928-942`) nhưng trả riêng tag `3003`, không có tag `1202`; native chỉ refresh formation (`FormationModel.sendFormationEnchant`). UI có thể còn hiển thị vật liệu cũ cho tới lần đồng bộ khác.
4. **Native callback không kiểm tra `result` cho 3001/3002.** Callback vẫn phát âm thanh/refresh/`ATTR_CHANGE` khi server trả lỗi (`main.min_a6195824.js`, các hàm `sendFormationUpgrade`/`sendFormationUpgradeGrade`). State thường không bị tăng vì server trả lại level/exp hiện tại, nhưng UX báo thành công giả.
5. **Thiếu server gate mở khóa hệ thống.** Client chỉ mở màn Pháp tướng khi system `201`, phụ linh khi `218`, nhưng handler `3001/3002/3003` không kiểm `unlockedSystem`; gọi RPC trực tiếp vẫn có thể nâng nếu có vật liệu. Đây là lỗ hổng progression/security, chưa xác minh có người chơi thực tế khai thác.
6. **Không giới hạn cứng `count` đầu vào.** `requestCount` chỉ `max(1, floor(...))`; request rất lớn có thể tạo chi phí/nhân số không cần thiết. Đây là hardening server, chưa phải bằng chứng người chơi thường gặp.

Các lỗi trên là lỗi logic/đồng bộ của Pháp tướng; chưa có bằng chứng mất dữ liệu player nếu request native bình thường không gửi `count` dư.

## Fix đã triển khai

- `upgrade.js`: tính `effectiveCount` theo số exp thực còn thiếu trước khi trừ item7; task counter dùng số thực; gate system 201/218 cho ba route; phụ linh phát tag `1202` cho từng loại vật liệu.
- `lhs-formation-fix-v1.js`: client chỉ chạy callback/animation/`ATTR_CHANGE` khi `result=0`; failure giữ nguyên state. Đã thêm vào `index.html` sau bundle chính.
- Regression in-memory: `test_formation_regressions_20260913.js` **4/4 PASS**; client callback probe `test_formation_client_fix_20260913.js` PASS; `node --check` và `npm run test:core-contract` **714 bảng PASS**.
- VPS deploy PASS: S1/S2/S3 restart scoped, `/ready` 8080/8083/8084 = 200, PM2 online, served patch hash khớp candidate, error markers rỗng. Evidence: `_ai_workbench/temp/formation_fix_deploy_20260913/deploy.json`.
- Còn thiếu native player E2E tăng cấp/phụ linh sau deploy vì chưa có phiên QA được ủy quyền.

Probe in-memory `_ai_workbench/tools/test_formation_regressions_20260913.js` chạy **4/4 PASS** trên candidate: `count=10` tại sát cap chỉ trừ 1 mảnh/task=1; phụ linh trả tag `1202` cho vật liệu; RPC với `unlockedSystem=[]` bị chặn; grade 10 trả `formation_grade_max`. Các lỗi trước sửa được giữ lại trong lịch sử audit.

## Khả năng mở cap cao hơn

Về kỹ thuật có thể mở, vì các handler đọc cấp kế tiếp từ config. Nhưng phải có bảng binary/config mới, mapping vật liệu và kiểm tra client UI/protocol tương ứng; chưa có dữ liệu nguồn cho mốc cao hơn nên chưa đề xuất ghi hay deploy.

## Nguồn code chính

- `linhhoasu/lhs/newServer/src/services/FormationService.js:131-210`
- `linhhoasu/lhs/newServer/src/handlers/upgrade.js:765-952`
- `linhhoasu/lhs/newServer/src/services/BattleService.js:128-171`
- `linhhoasu/lhs/newServer/src/handlers/mount.js:125-138,741-767`
- `linhhoasu/lhs/newServer/src/handlers/artifact.js:640-649,762-805,987-1023`
- `linhhoasu/lhs/newServer/src/services/FishingGearService.js:5-70`
- `linhhoasu/lhs/newServer/src/handlers/fish.js:1164-1194,1265-1266`
