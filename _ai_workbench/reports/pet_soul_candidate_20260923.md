# Candidate PetSoul fix — 23/09/2026

## Kết quả

- Candidate source: `_ai_workbench/temp/pet_soul_candidate_20260923/pet-soul.js`.
- Snapshot đầu vào là production `pet-soul.js` SHA-256 `80ef65f5…`; candidate SHA-256 `d1e7972a3fd5b3128d9a43b7de935f8f3ba42ef2be4cefc034b19e8e88550650`.
- Đã deploy candidate + `src/config/petSoulRewards.js` bằng CAS/backup; 5/5 PM2 node readiness 200. Release evidence: `_ai_workbench/temp/pet_soul_rewards_20260923/release.json`; chưa ghi player thật.

## Phạm vi fix

- Cost id `1/2/6` đọc/ghi `player.currencies` và đồng bộ packet theo cùng helper.
- Chặn thao tác trên Soul/pet không sở hữu; bind kiểm UID pet hiện có.
- Wash cache có `revision`/`cacheBaseRevision`; confirm chỉ ghép phần wash và giữ `star`, `petUid`, `attrDrugUse`, không tạo Soul miễn phí hoặc nhận cache đã cũ.
- Wash privilege chỉ nhận ID có trong `PetSoulSkillRefiningPrivilegeConfig`; item286 giảm nửa cost theo client; attr min dùng `PetSoulRefiningConfig.minPercent`.
- Dispatch validate cả batch trước khi đổi map.
- Summon/catch dùng currency helper; catch hết hạn bị từ chối trước khi trừ item; escape rate/state được áp dụng; `6901.data` là array và `6921.loyalty` là số.

## Kiểm chứng

`node --check` PASS. Isolated candidate audit: **23/23 PASS, 0 error, `productionWrites=0`** tại `_ai_workbench/temp/pet_soul_candidate_20260923/test_evidence.json`.

Reward policy: daily click nhận item261 (Tẩy Linh Đan) ×10; dispatch tích tối đa 7 ngày theo tổng level kỹ năng sống, map reward wrapper ẩn sang vật liệu thật 459–462 trước khi claim. Đây là policy visible an toàn, không tự cấp wrapper type99.
