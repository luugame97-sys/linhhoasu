# Trạng thái triển khai dải tính năng khóa — 18/09/2026

## Phạm vi

User yêu cầu mở đúng logic các nút Thần binh, Võ hồn, Huyết mạch, Bí bảo, Yêu linh, Hồng nhan và bỏ thời gian chờ ngày mở. Candidate được xây trên baseline live S1–S4; chưa ghi production, chưa migration player, chưa restart.

## Baseline live mới nhất

- Audit lúc `2026-09-18T03:10:18+07:00`: `lhs-s1001/2/3/4` online; `/ready` `8080/8083/8084/8085 = 200`.
- PID/restart ổn định trong lượt audit; các flag `FEATURE_UNLOCK_DAY1_ENABLED`, `FEATURE_SIDE_TASKS_ENABLED`, `FEATURE_SIDE_TASK_ROOTS` đều chưa đặt.
- Live không có candidate `SideTaskProgressService`, `featureUnlockDay1`, hoặc addon `lhs-feature-day1-v1`; index live có addon lịch song song đã phát hành trước. Drift live đang tồn tại ở `arena.js` và `CrossArenaService.js`, nên runner dừng nếu cố stage trên baseline cũ.
- Hứa Thanh S3 đã thay đổi tự nhiên so với ảnh cũ: snapshot read-only mới cấp235, EXP6250. Không dùng dữ liệu ảnh cũ để migration.

## Candidate đã làm và kiểm thử

Candidate: `_ai_workbench/temp/feature_unlock_release_20260917/candidate/`; staging server-only: `/linhhoasu/_ai_workbench/temp/feature_unlock_20260917_145424`.

- Sửa lưu/đánh giá task phụ: không dùng `guideValue` làm `SystemConfig` ID; evaluator type1/type9 theo semantics native; normalizer Realm/Farm/Raid truyền đủ player context và không xóa task type9 đã lưu; task claim type9 cần trạng thái20, idempotent save/draft.
- Thêm `SideTaskProgressService` với graph `TaskConfig.nextId` + `SpecialTaskConfig`, nhưng root seed chỉ qua flag và root allowlist. Chưa bật vì còn thiếu counter authoritative.
- P0 gameplay: duplicate UID/replay Mine và finish marker; recipe Huyết mạch invalid fail-closed; Curios policy lạ fail-closed/compose replay không cấp thẻ miễn phí; FeatureMutation draft+save-confirm+invalidate session; hooks active13 (item55 Mine) và active55 (equip Võ hồn) chỉ sau ownership/slot/save hợp lệ.
- Day1 policy UMD server/client version `20260917_feature_day1_v1`: cờ mặc định tắt, bỏ đúng age/openDay đã allowlist, giữ level/ownership/cost/clock/event schedule; sentinel9999 giữ nguyên; System112 chỉ bỏ role-age2 ngày theo allowlist. Account tag6 quảng bá metadata policy; client hook `GameServer.doServerDay`; index candidate thêm addon.
- Hồng nhan chưa sửa: client chỉ có `MainLockIconRule`/icon placeholder, chưa có gameplay/model/RPC/config.

## Bằng chứng automated/staging

- `test_feature_gameplay_p0_20260917.js`: **30 PASS**, productionWrites0; gồm draft/save failure, replay, Mine/Curios/Bloodline, WSServer canonical/invalidate.
- `test_feature_tasks_20260917.js`: **61 PASS**, productionWrites0; normalize qua realm/farm/relog, native task condition, root90020 seed dưới flag, duplicate claim, save uncertain.
- `test_feature_day1_20260918.js`: **10 PASS**, reversible config transform; giữ level/sentinel và restore.
- `test_mine_exit_native_20260917.js`: **39 PASS** với function MineModel/MineAStar native; chỉ validator độc lập, `handlerEnforcement=false`.
- Candidate syntax/JSON và remote staging read-back PASS; stage không đụng process/live source/player.

## Blocker không được che bằng bypass

1. DoubleTower (`4501/4502/4504/4505`) vẫn tin `params.type`; native tower-defense result chưa được server-authoritative. Không phát hành seed/active54 hay day1 tiền đề313 trước khi có receipt/pending battle + simulator parity.
2. Mine `2801` vẫn nhận coordinates/path client và tạo block; validator exit không đủ để chặn finish sớm. Không nối validator vào handler production khi chưa kiểm hết dig/bomb/rocket/move.
3. Counter side-task còn thiếu authoritative: active54 DoubleTower, active61 Bloodline xuất trận, active71 Curios mua, active79 Elf xuất trận. Chỉ active13/55 đã nối candidate. Không bật `FEATURE_SIDE_TASK_ROOTS` cho năm root.
4. BattleService chưa có Curios authoritative aggregation tương ứng native (base/passive/cá/echo/suit/star). Không gọi năm hệ “đã hoàn tất combat” chỉ vì handler RPC tồn tại.
5. Chưa native account E2E cho đủ năm hệ; Hồng nhan cần module upstream hoặc thiết kế mới.

## Quyết định phát hành hiện tại

- **Chưa deploy/restart/migration.** Không bật flag day1 hoặc side-task trên production.
- Có thể coi các patch economy/task là candidate đã có kiểm thử RAM/staging, nhưng chưa gọi là production pass.
- Trước khi phát hành cần rebaseline live lần nữa, backup/CAS theo từng file, test Mongo/Redis marker-owned, native account UI mới, rồi rolling release cả4 node. Không stage local index cũ lên live vì drift đã được phát hiện.

## Next steps bắt buộc

1. Hoàn thiện server-authoritative DoubleTower và counters54/61/71/79, sau đó native UI/relog cho Hứa Thanh + account mới/cũ.
2. Đối chiếu công thức Curios native → server numeric parity trước/sau.
3. Re-audit tất cả direct day gates (`AssetsConfig.canGetDay`, FishSoul/PetSoul, GuildBattle, Valhalla/Fashion/FishScene) với semantics feature vs calendar; không fake server day999.
4. Khi tất cả PASS, deploy cờ tắt trước, read-back hash/ready/process, rồi bật day1 policy có version; migration chỉ reconcile task/unlock có bằng chứng, không cấp thưởng hồi tố.

Evidence: `_ai_workbench/temp/feature_unlock_release_20260917/{baseline.json,stage.json,status_20260918.json,hua_thanh_snapshot.json}`; candidate report `_ai_workbench/reports/feature_gameplay_p0_candidate_20260917.md`; kế hoạch gốc `_ai_workbench/reports/feature_unlock_day1_plan_20260917.md`.
