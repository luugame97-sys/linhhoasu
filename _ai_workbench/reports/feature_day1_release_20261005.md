# Bỏ chờ ngày khai mở cho tính năng — 05/10/2026

## Đã triển khai S1–S7

- Policy chung server/client chuyển điều kiện tối thiểu ngày server về1, giữ nguyên mảng điều kiện để các consumer không gặp mảng rỗng. Chỉ xử lý type5/cond4; không thay toán tử khác hoặc tuổi nhân vật/type6.
- Live có36 mục SystemConfig được thay đổi:118,121,122,123,124,126,127,210,219,220,221,222,223,225,226,227,228,230,232,309,310,311,313,314,317,319,320,321,323,324,325,326,327,328,330,10501.
- 5ô ElfFieldConfig giữ stageLevel13–17;20mục Valhalla catalog showType3 về ngày1. 36ô ValhallaFieldConfig đã là ngày1, giữ cấp85–285 và quyền sở hữu.
- Bỏ492 trường ngày catalog ngoại quan: FashionConfig442, FashionColorConfig40, FashionChangeColorConfig10 (đây là số trường CN/TW, không phải492item). Chỉ xử lý showType/showTypeTw3, giữ vùng/showType0ẩn/showType2quyền sở hữu/cost/attrs.
- GuildBattleConfig chỉ đổi trường gốc serverDay3→1, lịch/trạng thái trận giữ nguyên. FishSceneConfig thường isActivity0 không dùng ngày để khóa, không đổi các ngày redpoint của những hàng này.
- Giữ nguyên315 có khóa9999 và322/TopArena đang bảo lưu chờ QA; không force-unlock hoặc bật lại chức năng bảo trì. Các gate cấp/nhiệm vụ/cảnh giới/câu cá/thần khí/phụ thuộc tính năng/quyền mua vẫn nguyên.
- Ngày khai mở GameServer trong DB, SERVER_OPEN_TIME và ARENA_SETTLEMENT_ACTIVATION_AT S1–S7 đã read-back khớp preflight; không đổi clock/tag6/serverRunDay/anchor/lịch sự kiện, ưu đãi đầu server, shop replaceDays hoặc AssetsConfig.canGetDay.

## Kiểm chứng

- Local + VPS candidate/installed:16nhóm server +6Valhalla +21client =43PASS. Dùng code native/handler thực trong VM; kiểm tra đổi đúng trường, parity/idempotency, cấp/nhiệm vụ/quyền mua/ownership/vùng/sentinel, CrossArena/CrossRival giữ gate cấp/chu kỳ/nhóm server. QA không ghi DB/player hoặc gửi game RPC.
- 7/7ready statusok, Mongo/Redistrue. Hash5file installed đúngcandidate. Bot/admin/dist giữ PID/trạng thái/uptime.
- Public game/addon/WebGM200; addon đúnghash, HTML đúng phần quản lý sau bỏ beacon Cloudflare. Thực tế chưa E2E từng màn vì giữ nguyên tab người dùng đang chơi; cần tải lại để nhận addon mới.

## File / rollback

- Server: `src/config/featureDayAccess.js` +`.json`, apply trong ConfigService sau các overlay đã có; candidate giữ gemLevel10Choice và các thay đổi production khác.
- Client: `js/lhs-feature-day1-v1.js`, nhúng cùng manifest và kiểm tra parity; index thêm đúng một addon.
- Backup/CAS: `/linhhoasu/_ai_workbench/backups/pet_grid48_20261005_162052`; stage `/linhhoasu/_ai_workbench/temp/pet_grid48_20261005_162052`.
- Receipts `_ai_workbench/temp/feature_day1_20261005/{preflight.json,deployment.json,candidate_files.json,postcheck.json}`; runner `_ai_workbench/tools/release_feature_day1_20261005.py`.
- Rollback preimage ConfigService/index theo CAS, restart7node/readiness. Module/addon mới có thể để lại khi không được apply/load; không sửa GameServer hoặc thu hồi tùy tiện các cờ unlock đã lưu qua login, vì có thể người chơi đã dùng tính năng. Cần audit dữ liệu cụ thể nếu phải thu hồi quyền.
- Client mới: `https://linhhoasu.lol/index.html?v=20261005_feature_day1_v1`.
