# Audit Thần binh / Tôi luyện — 09/10/2026

## Bản sửa và triển khai bổ sung — 10/10/2026

- Đã sửa production đúng runtime `/linhhoasu/lhs/newServer` (S1–S8 dùng cùng thư mục này). Hash sau deploy: `artifact.js 99fd53b0…`, `BattleService.js ca9dfd42…`, `PlayerService.js 08e666c0…`, `WSServer.js 9a9f0c79…`.
- Handler 3505/3506/3507 nay kiểm tra server-side phẩm chất/cấp/skill, element 1..5, đá chọn nguyên tố, trạng thái đã tôi luyện và cache refresh tối đa 10 phút; cache lưu cả `eSkillGroup`. Giao dịch dùng draft + CAS theo `artifactInfo/items/currencies/other_attr_info`, receipt request ID, lock theo role và read-back khi save không chắc chắn.
- `BattleService` cộng `attrs1/attrs2`, phần tăng theo cấp và passive elemental effect type 1; bonus `quenchMatchAttrs` chỉ cộng khi element khớp skill.
- Client adapter `lhs-artifact-quench-v1.js` phát hành cùng index marker `20261010_quench_v1`, có request ID, single-flight, replay/reconnect và đồng bộ item count từ server. Backup client: `/linhhoasu/_ai_workbench/backups/artifact_quench_client_20261010_20261010_041957`.
- Contract candidate và installed source: **15/15 PASS**; production player writes **0**. S1–S8 PM2 online, ports `8080,8083–8089` `/ready=200` sau restart. Backup server: `/linhhoasu/_ai_workbench/backups/artifact_quench_fix_20261010_20261010_035924`.
- Client contract **7/7 PASS**, JS syntax PASS. Origin index hash `d83b22ce…`, public HTTPS trả 200; public index có marker `20261010_quench_v1`, public adapter hash `619339f2…`. Evidence: `_ai_workbench/temp/artifact_quench_release_20261010/release_correct_path.json`, `runtime.json`, `client_release.json`, `public_final.json`, `candidate_contract.txt`, `installed_contract.txt`, `test_artifact_quench_client_20261010.js`.
- Chưa chạy giao dịch bằng tài khoản/người chơi thật; cần người chơi tải lại game và thử một lượt Tôi luyện rồi đọc lại số dư, artifact, lực chiến và relog.

## Phạm vi

Read-only audit trên runtime live, tập trung Thần binh hệ `ArtifactModel` và RPC:

- `3505`: tôi luyện/淬炼
- `3506`: làm mới nguyên tố
- `3507`: xác nhận kết quả làm mới

Không ghi player, Mongo, Redis hoặc restart.

## Bằng chứng live

- Live `artifact.js`: SHA-256 `0eb1d3d15f64f06285e5763194b0cbad732e189f19b4f314ee7ad5d1ea41cfa7`.
- Live `BattleService.js`: SHA-256 `323622609b25c40808d2835473118e20df72cd19e1e52582884c5e59f0ad340b`.
- Live client `main.min_drop200.js`: SHA-256 `af75e33c0bc3607ca82b01f432a74fc5c7fd94c2072826d3422ad6bad4e5e578`.
- Local `artifact.js` khác hash live, nên snapshot live được lưu tại `_ai_workbench/temp/artifact_quench_audit_20261009/artifact.js.live`; không lấy source local làm bằng chứng deploy.

Config hiện tại:

- Chỉ phẩm chất `>=7` mới được phép tôi luyện theo `ArtifactBaseConfig.quenchQuality=7`.
- Điều kiện cấp của các bậc: 30 -> quench 1, 40 -> quench 2, 50 -> quench 3, 60 -> giới hạn tiếp theo.
- Chi phí: 191/193; thiếu 191 có thể thay bằng 192 theo `quenchPieceCount`.
- Đổi nguyên tố dùng 193 x5; nguyên tố hợp lệ theo client là 1..5.

## Nguyên nhân đã xác nhận

### 1. Server không enforce điều kiện mở tôi luyện

Live handler chỉ kiểm tra artifact tồn tại, còn quench config và nguyên liệu. Nó không kiểm tra:

- phẩm chất >=7;
- artifact đã đạt cấp30;
- artifact có `skillGroup` hợp lệ;
- `element` nằm trong 1..5.

Vì vậy client bình thường sẽ khóa nút, nhưng RPC tự gửi vẫn có thể vượt gate.

Remote RAM-only probe trên đúng live source:

- artifact phẩm chất4, cấp1;
- gọi 3505 với `element=99`;
- kết quả `result=0`, `quenchLv=1`;
- tiêu 191 x5 và 193 x5;
- 3506 cũng trả `result=0`, lưu `element=99`;
- 3507 trả `result=0`.

Evidence probe: output read-only trong phiên audit; không có production write.

### 2. Quench thành công nhưng không gán `eSkillGroup`

Client sau khi nhận 3505 truy cập `ArtifactElementSkillConfig[eSkillGroup][quenchLv]` để dựng popup/kỹ năng nguyên tố. Live handler chỉ đổi `element`, `quenchLv`, xóa `refreshCache`; không gán `eSkillGroup`.

Do đó sau lần tôi luyện đầu:

- `eSkillGroup` thường vẫn là 0;
- popup kết quả hoặc màn chi tiết có thể không render/throw khi đọc bảng config;
- kỹ năng nguyên tố không có dữ liệu để hiển thị.

### 3. Chỉ số chiến đấu không cộng thuộc tính tôi luyện

Config có `attrs1/attrs2` (ví dụ quench 1 có attr 255 = 1650), nhưng live `BattleService.addArtifactAttrs` đọc `quenchRow.attrs`, field này không tồn tại.

Remote RAM-only probe:

- cùng một artifact, chỉ đổi `quenchLv:0 -> 1`;
- `changedAttrs=[]`;
- attr 255 trước/sau đều 0;
- config vẫn có attrs1 255 = 1650.

Kết luận: trạng thái quench có thể lưu thành công nhưng lực chiến/thuộc tính server không nhận phần tăng tương ứng.

### 4. Làm mới/xác nhận thiếu ràng buộc phiên

3506 và 3507 không kiểm tra đầy đủ:

- artifact đã quench hay chưa;
- phẩm chất/cấp đủ điều kiện;
- `refreshCache` có thuộc đúng request gần nhất hay đã hết hạn;
- element hợp lệ;
- xác nhận lặp hoặc xác nhận không có cache.

Điều này cho phép trừ vật liệu làm mới trên artifact chưa đủ điều kiện và lưu giá trị nguyên tố bất kỳ nếu gọi RPC trực tiếp.

### 5. Rủi ro race/save

3505–3507 dùng mutate session rồi `savePlayer` trực tiếp; không có receipt/nonce/CAS riêng cho chuỗi quench. Các tag này cũng không nằm trong danh sách single-flight hẹp của WSServer như 3204. Reconnect hoặc hai socket có thể làm cache/chi phí/trạng thái quench bị ghi đè nếu thao tác đồng thời.

## Trạng thái dữ liệu live

Quét artifact trên S1–S8:

- S1: 472 artifact
- S2: 104
- S3: 100
- S4: 69
- S5: 99
- S6: 67
- S7: 104
- S8: 0

Tổng quét không thấy:

- artifact đã quench;
- `eSkillGroup` quench;
- `refreshCache` tồn;
- quench dưới phẩm chất/cấp;
- element ngoài range.

Log S7 không có `[Artifact]` hoặc tag 3505–3507 trong cửa sổ log đã đọc. Vì vậy chưa có bằng chứng người chơi thật đã dùng thành công/thất bại tôi luyện; đây là lỗi code/config có thể tái hiện bằng RPC RAM-only.

## Kiểm thử

- `test_artifact_feature_contract.js`: 7/7 PASS cho các ca nâng cấp, thiếu nguyên liệu, quench có nguyên liệu và đồng bộ delta.
- `probe_artifact_quench_guards_20261009.js`: tái hiện các gate thiếu.
- `probe_artifact_combat_quench_20261009.js`: tái hiện quench không làm đổi attr combat.
- `node --check` trực tiếp trên live `artifact.js` và `BattleService.js`: PASS.

## Kết luận

Lỗi chính của phần Tôi luyện là **server nhận và lưu quench nhưng thiếu dữ liệu kỹ năng nguyên tố, không cộng attr quench vào combat, và không enforce gate/element/cache ở server**. Client có gate hiển thị nhưng không bảo vệ được RPC. Chưa sửa/deploy/bù trong lượt audit này.

