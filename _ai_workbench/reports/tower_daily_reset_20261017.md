# Hư Thiên Bảo Điện không reset ngày — 17/10/2026

## Nguyên nhân xác minh

- Hư Thiên Bảo Điện là `TowerConfig`/`ClimbingTowerModel`, luồng chiến đấu native `2300 type9`, không phải hệ Valhalla hoặc Temple545x.
- LanguageConfig30033016 ghi reset mỗi ngày00:00, tiến độ về tầng1. Backend `tower.ensureTowerInfo` chỉ chuẩn hóa số, không lưu ngày và không reset. Mẫu cả9DB không có marker ngày; S2 có một hồ sơ curlayer800. Talo/S1 lúc audit curlayer5/maxlayer5, vì vậy không gán nhầm ảnh800 cho Talo.
- Native UI tự hiển thị đếm ngược đến hết ngày, nhưng đếm ngược không có nghĩa backend đã đặt lại state.

## Cách sửa

- `TowerDailyResetService` dùng GameDayService theoGMT+7: reset lúc00:00, theo ngày server độc lập timezoneOS; offline nhiều ngày chỉ reset một lần khi tải lại.
- Đặt `curlayer/dailyCount/skillCount` về0, xóa lựa chọn `skills` và cộng dồn `slotlist`; client hiểu curlayer0 là tầng tiếp theo1. Giữ `maxlayer` lịch sử, scorehiệncó, thiết lậpauto, toàn bộ thú cưỡi và vật phẩm/tiền. Không phát lại quàlầnđầu.
- Dữ liệu cũ chưa có`towerDay` khởi tạo/reset một lần vào ngày rollout, giữảnhtrước reset trong`towerResetV1`; không giả định ngày cũ từ`player.updatedAt` vì ngày này thay đổi bởi các tính năng khác.
- PlayerService.loadPlayer thực hiện read-repair CAS nguyên`swordInfo`, không ghi đè tiến độ mới khi có tranh chấp. Chạy sau bước phục hồi kỹnăngthúcưỡi đã triển khai, không bỏ bản sửa đó.
- Tower handlers và raidtype9 đồng bộ ngày trước thao tác cho cả phiên đang online. Thêm snapshot3704 và addonclient đồng bộ sau login/mở cửa sổ/đổi ngày để cập nhật UI. Chặn request tầng cũ hoặc vượt configcap trước battle/reward; guardclient không chạy callback thànhcông cho response lỗi.
- Source chung áp dụng S1–S9 và servermới cùngsource, không allowlist/cờbật riêng. Không mở rộng nội dung/cap800 hoặc thay cơ chế quà hiện có.

## Kiểm chứng

-22nhómfixture PASS: mốc23:59:59.999→00:00GMT+7, nhiều ngàyoffline, clockbackward, legacy/newrole, resetlặp, trườngmounted/rootđượcbảotoàn, CASconflict, phiênonline, snapshot và clientapply.
- Mongo thật trong DBQA riêng: hai resetcùngpreimage chỉ1writer, rerun khôngresettiếp; maxlayer800/mounts/inventory giữnguyên. DBQA cóowner vàđãdọn. Khôngfixtureaccountproduction.
- Dùng đúng hàmraidcandidate trongRAM: qua tầng1 saureset chỉ nhận quàthường, không quàlầnđầu khi maxhistory800; gửi lại tầng1 bịTOWER_LAYER_STALE, không nhận lại quà.
- SyntaxcandidatePASS; chuẩn bịrollout với backup/CAS/atomicswap/restarttuầntự/readiness. Chưa chờ qua00:00thực tế và chưa tự chơibằngtài khoảnngườithật; kếtquảruntimecuối ghi riêng bên dưới.

## File và khôi phục

- Service mới `src/services/TowerDailyResetService.js`; sửa hẹp `PlayerService.js`, `handlers/tower.js`, `handlers/raid.js`, `handlers/index.js`; client`lhs-tower-daily-v1.js` vàindex.
- Toolstest `_ai_workbench/tools/test_tower_daily_reset_20261017.js`, `test_tower_daily_mongo_20261017.js`; deploy`deploy_tower_daily_reset_20261017.py` tái sử dụng transportrollout cókiểmchứng.
- Evidence `_ai_workbench/temp/baodian_reset_20261017/{preflight,state,tests,mongo-tests,reward-contract-test,deployment,verification}.json` cùngbaseline/candidate.
- Backuprollout `/linhhoasu/_ai_workbench/backups/tower_daily_reset_20261017_054912`. Rollbackcode: kiểmhashpostimage, phục hồi preimage theoCAS, rút service/addonmới, restart/readiness. Không rollbacknguyên`swordInfo` sau khi đã phát sinh leoải/tăngsao mới; dùng`towerResetV1.before` vớiCAS nếu cần phục hồi tiến độ đúngscope.
