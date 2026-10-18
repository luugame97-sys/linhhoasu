# Sửa cấp kỹ năng khi tăng sao thú cưỡi — 17/10/2026

## Phạm vi

Sửa source VPS dùng chung `/linhhoasu/lhs/newServer` cho S1–S9 và mọi server mới dùng source này; không có allowlist hoặc cờ cần bật theo từng server. Source staged ở `_ai_workbench/temp/mount_star_fix_20261017/candidate/`, không ghi đè cây source local cũ ngoài phạm vi.

## Hành vi mới

- Handler3205 dùng `MountStarProgressService`: tăng sao theo nguyên liệu, phân bổ lượt tăng cấp passive tương ứng, mỗi kỹ năng tối đa10, tổng cấp tối đa40. Chỉ chọn kỹ năng còn tăng được; cập nhật cả `skills` và `passiveSkills`. BattleService hiện có đã đọc level/passive config, nên không cần sửa công thức combat.
- Chặn target/material không sở hữu, trùngUID, khác loại, nguyên liệu khóa/đang cưỡi, sao tối đa hoặc số lượng sao không hợp lệ. Không fallback sang thú khác khi UID sai và không phát Tinh túy từ yêu cầu thiếu nguyên liệu. Giữ công thức hoàn Tinh túy của luồng hiện hành trong giao dịch thành công.
- Transaction khóa theo nhân vật, nạp lại DB, clone draft, scoped CAS bảo vệ `swordInfo/items/currencies/other_attr_info`, chỉ công bố draft sau save được xác nhận. Dùng FeatureReceipt hiện có chống retry/cùng requestID; commit-unknown giữ receipt để đối soát, không tiêu/phát lại.
- Addon mount giữ single-flight nâng cấp3204; bổ sung guard3205, requestID và single-flight tăng sao. Timeout retry dùng cùngID; response lỗi/replay không chạy callback native vốn xóa nguyên liệu và mở màn thành công. Index cache `20261017_mount_star_progress_v1`.

## Phục hồi thú cũ

- `PlayerService.loadPlayer` tự chạy read repair cho thú cũ có thiếu tổng cấp passive, áp dụng trên cả server hiện có và server tạo sau này, kể cả dữ liệu cũ được nạp lại từ backup.
- Mức tối thiểu chắc chắn: `min(40, số kỹ năng khởi đầu theo phẩm + sao hiện tại - 1, tổng cap của các slot hiện có)`. Lấy mốc khởi đầu1sao vì bản ghi cũ có cả0/1; không tự cộng mức cao hơn dựa trên giả định khởi đầu0.
- Giữ nguyên ID/phẩm và mọi cấp kỹ năng đã cao hơn mức tối thiểu; không tạo lại lượt RNG lịch sử. Phần thiếu phân bổ ổn định theo nhân vật/UID/version; không đổi khi relog hoặc restart. Chỉ cập nhật DB nếu CAS toàn `swordInfo` vẫn khớp. Nếu tranh chấp, không ghi đè dữ liệu mới.
- Lưu `passiveRecoveryV1` trong đúng thú được sửa: phiên bản, ID/phẩm/cấp trước sửa, số cấp được thêm, timestamp. Chạy lại không cộng tiếp; không sửa tài nguyên, sao, cấp thú, thư, nhận quà hoặc lịch sử khác.
- Talo thú5sao/phẩm7/tổng4level → tối thiểu tổng8level. Thú23sao/phẩm7/tổng4level → tối thiểu tổng26level. Đây là phục hồi mức tối thiểu, không khẳng định khôi phục đúng từng kết quả ngẫu nhiên đã mất.
- Tooling không chạy migration ghi hàng loạt player. Hồ sơ offline được sửa khi tải lại; những nhân vật tự đăng nhập sau rollout có thể phát sinh write hợp lệ từ ứng dụng.

## Kiểm chứng

-61ca fixture PASS: star0/1/5/23/39/40, mọi phẩm khởi đầu, cap10/40, nguyên liệu0/1/5/39/40sao, slot còn thiếu, recovery ổn định/idempotent, giữ ID/phẩm, dữ liệu vượt cap, sameID retry/concurrency, invalidUID/self/protected/material khác loại, savefail/CASconflict/commitunknown, clienterror/replay/timeout. Productionwrites/networkcalls0.
- Mongo thật trong DB QA tạm riêng: hai recovery cùng dữ liệu chỉ một writer; hai `PlayerService.savePlayer` dùng đúng hàm candidate/scopedCAS chỉ một writer. DB QA có owner và đã drop sau kiểm chứng. Không tạo account production hoặc dùng player thật làm fixture.
- Regression single-flight3204 hiện có PASS. Syntax các candidate PASS local; deploy kiểm lại trên Node của VPS.
- Preflight chỉ đọc9DB:579thú trên415profile có sao>1 trong mẫu và tất cả passive1; filter ban đầu loại `isBot=true` nhưng không khẳng định mọi profile đều người thật vì còn marker bot khác. Không dùng số này làm số đã bù sau rollout.
- Rollout hoàn tất: backup/CAS/atomic5file, restart tuần tự S1–S9, PM2save; readiness Mongo/Redis9/9 và hash source/static khớp candidate, HTTPS2/2. Tiến trình ngoài phạm vi không đổi.
- Read-back12:40:26ICT: cả9node dùng đúng entry/cwdsource chung; version `20261017_mount_star_progress_v1`, có route3205/readrepair/scopedCAS. Mẫu taillog sau12:36 không có marker MOUNT_RECOVERY/SWALLOW/CAS hoặc startup exception phù hợp. Future1010 fixture không cần flag/allowlist, phục hồi đúng4cấp. DB QA đã dọn.
- Ứng dụng đã tự phục hồi84thú trên58profile được tải lại, thêm1.696cấp tại snapshot12:40; có thể gồm bot, không gọi là58người chơi. Hồ sơ offline còn lại tiếp tục phục hồi khi được tải.
- DB Talo/S1: thú trang bị22506/uid100002 sao5 có passive `[2,2,2,2]`, tổng8; thú22501/uid100001 sao23 có `[8,5,6,7]`, tổng26; có metadata trước sửa và số cấp được thêm.
- Hai giao dịch tăng sao do người chơi thực hiện sau deploy được đọc từ receiptDB:12:39:37 uid100037 sao1→3, passive `[1,1,1,3]`;12:39:48 uid100040 sao1→3, passive `[1,2,2,1]`. Cả hairesult0, quàhoànTinh túy2400/lần. Tooling không thao tác tiêu nguyên liệu. Native screenshot12:41 cho thấy đúng bốn kỹ năng cấp2 trên thú5sao đang cưỡi.

## File, evidence, rollback

- File chính: service mới `src/services/MountStarProgressService.js`, sửa hẹp `src/handlers/mount.js` và `src/services/PlayerService.js`; `web/js/lhs-mount-fix-v1.js`, `web/index.html`.
- Tools: `_ai_workbench/tools/test_mount_star_progress_20261017.js`, `test_mount_star_mongo_20261017.js`, `deploy_mount_star_progress_20261017.py`.
- Evidence `_ai_workbench/temp/mount_star_fix_20261017/{preflight,tests,mongo-tests,deployment,verification,native-user-readback}.json`, `battle-contract.json`, `mount-skills-after.png`, baseline/candidate.
- Backup source/static: `/linhhoasu/_ai_workbench/backups/mount_star_progress_20261017_053629`. Rollback code cần kiểm hashpostimage, phục hồi file preimage, rút service mới khỏi đường import, restart tuần tự/readiness/hash. Không rollback toàn bộ player/inventory vì đã có thể phát sinh giao dịch hợp lệ.
- Nếu cần hoàn nguyên phục hồi passive, dùng `passiveRecoveryV1.before` và CAS theo đúng trạng thái chưa phát sinh nâng tiếp; không tự đặt level1 hàng loạt hoặc xóa receipt.
