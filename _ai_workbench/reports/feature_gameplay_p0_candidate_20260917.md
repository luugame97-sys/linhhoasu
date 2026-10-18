# Candidate gameplay P0 — chưa deploy

Candidate: `_ai_workbench/temp/feature_unlock_release_20260917/candidate/server`.

## Đã sửa có kiểm thử RAM

- `mine.js`: reject toàn bộ batch UID trùng trước cost/reward; marker finishRewardClaimed cùng save; từ chối finish chưa start, finish/claim đã ghi. Không tự cấp bù cho dữ liệu cũ.
- `bloodline.js`: recipe thiếu hoặc rate không hợp lệ bị từ chối trước tiêu vật phẩm.
- `curios.js`: env sai tên giá trị trở về strict; chỉ explicit `always_pass` giữ chế độ cũ. Compose chỉ thẻ chưa sở hữu; retry không trừ tiếp mảnh; recipe0/thiếu pieceID không cấp thẻ miễn phí.
- `FeatureMutationService.js`: dùng PlayerMutationService sẵn có; drain save; draft riêng; chỉ publish vào player sau save trả kết quả; lỗi/null save invalidate session để reload trạng thái commit chưa rõ. Áp dụng Mine, Curios và BloodlineCompose, không sửa toàn bộ handler game.
- `valhalla.js`: Equip dùng draft/save xác nhận; record55 chỉ khi map thay đổi, hero sở hữu và slot hợp lệ. Mine record13 đúng lượng item55 thực tiêu. Replay/unequip/reject/savefail không publish thêm tiến độ.

`node _ai_workbench/tools/test_feature_gameplay_p0_20260917.js`: 30 checks PASS, mocked persistence, productionWrites=0. Có concurrent Mine event, duplicate batch, replay sau snapshot relog, finish claim một lần, null/throw save không rò draft, invalid recipe không save, Curios strict sai env và compose hợp lệ/trừ đủ/save/reload/savefail/replay, hooks13/55. Test thực thi method WSServer thật để kiểm canonical lookup và invalidation cả live/closing session/cache. `FEATURE_CANDIDATE_ROOT` chọn staged candidate; `FEATURES_APP` fallback source đã cài cho file không có trong sparse candidate.

`MineExitValidationService.js` là validator độc lập **chưa nối handler2803**. `node _ai_workbench/tools/test_mine_exit_native_20260917.js`:39 checks PASS đối chiếu các function client native thực được extract (MineModel tạo map, MineAStar), gồm16đườngnative có/không obstacle và đườnggiả. Native 8cột/camera12, hìnhkhối, clearance đầu, cửa ra `40*deep+6`. `FEATURE_NATIVE_CLIENT` trỏ client source khi testremote.

## Chưa đủ điều kiện phát hành mở toàn bộ

- DoubleTower4501/4504 trả setup tower-defense native; 4502/4505 vẫn tin `params.type`, outbound/rank đang có synthetic fallback. Không thay bằng generic duel BattleService, không âm thầm khóa gameplay đang chạy. Chưa sửa arena.js.
- Mine2803 native gửi `path`; hết tầng không có nghĩa đào sạch mọi block. Replay guard đã tách khỏi điều kiện suy đoán; kiểm chứng exit/path authoritative còn thiếu. Vì vậy bản sửa này **không tuyên bố đã chặn finish sớm** hoặc hoàn thiện an toàn Mine. Luồng2800→2803 tạo nhiều tầng vẫn cần kiểm soát completion thật.
- Curios client `getCuriosAttrMap` gồm base, passive theo task, bonus cá theo AttrConfig.type1001, echo theo shop/suit/star. BattleService thiếu nhánh tương ứng; chưa sửa một phần rồi gọi parity. Cần extract/test native toàn công thức trước phát hành full unlock.
- Chưa kiểm native UI, Mongo thật, account mới/cũ, E2E năm hệ. Artifact/Elf không sửa. Hồng nhan vẫn thiếu module.
- Đã nối13/55 nhưng chưa emit54 từ kết quả client tự khai. Native Mine2801 vẫn tin path/coordinates do client gửi và tạo block tùy ý; chỉ chặn2803 không đủ để bảo đảm state authoritative. Chưa kích hoạt validator nhằm tránh chặn luồng đang chạy khi chưa kiểm hết dig/bomb/rocket/move.

Không restart, không migration, không production write trong subtask này.
