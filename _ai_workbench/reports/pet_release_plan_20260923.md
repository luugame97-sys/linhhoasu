# Kế hoạch release linh thú — 23/09/2026

Tài liệu này chỉ lập kế hoạch; **không deploy, không restart và không ghi player**.

## Baseline đã xác minh

| Thành phần | Đường dẫn live | SHA-256 baseline | Ghi chú |
|---|---|---|---|
| Pet core | `/linhhoasu/lhs/newServer/src/handlers/pet.js` | `2e9770029f617ea3c575a1d0c228b0d26f6460890f39d23c1552190becfcf636` | Đã gồm fix reset 3307 |
| PetSoul | `/linhhoasu/lhs/newServer/src/handlers/pet-soul.js` | `80ef65f570986f129af6ebf329e7a8505b46fce01c5a5fc6977fa28968083cc0` | Live khác local (`e671d1...`); patch phải dựa trên snapshot live |
| Client native | `/linhhoasu/webgame/game/js/main.min_drop100.js` | `0e662b2b3c405cfea3981032d90ba7751e13cb78de004ebfda5f479586aa0ed2` | Chưa có bằng chứng cần đổi bundle |

PM2 app gameplay: `lhs-s1001..lhs-s1005`; readiness lần lượt `8080/8083/8084/8085/8086`; cwd `/linhhoasu/lhs/newServer`. Baseline snapshot: `_ai_workbench/temp/pet_full_audit_20260923/baseline.json`.

## Gate trước khi swap

1. Chốt contract chưa rõ: giá trứng 25 (vé hay 100 diamond mỗi lần), cap ăn pet theo Coercion, recipe q7→q9, reward daily/dispatch PetSoul. Không deploy nếu còn dùng fallback đoán.
2. Candidate chỉ gồm handler/config cần thiết; không chép `pet-soul.js` local lên production nếu hash không bắt đầu từ snapshot live.
3. Tạo manifest SHA-256 candidate và ghi hash baseline từng node. `node --check` tất cả handler. Chạy RAM-only, `productionWrites=0`.
4. Chạy test reset cũ: `node linhhoasu/lhs/newServer/scripts/test-pet-reset-20260923.js`.
5. Chạy compose/eat/auto fixture sau patch. Tất cả P1 phải fail-closed và không mutate khi thiếu cost:
   - 3302 thiếu item36: result<0, hai pet + item giữ nguyên.
   - 3302 q7 + q7 thành công: pet quality9/tag1, không fallback EXP.
   - 3311 cả hai hướng kéo-thả; material EXP → normal và normal → EXP theo contract; max-level không xóa material.
   - 3314 normal + EXP, cost/receipt/sync đúng; retry không cấp đôi.
   - 3300 ID trứng không hợp lệ/slot đầy bị từ chối; 25 charge theo contract.
   - 3308 thiếu diamond và field>=fieldMax bị từ chối.
   - 3302 chặn pet battle slot, locked, hoặc PetSoul-bound.
6. Chạy PetSoul fixture trên **candidate live source**, không dùng file frozen baseline: 6900/6901/6902/6903/6904/6905/6907/6908/6909/6920/6921/6922. Tối thiểu: ownership, wash revision, currency diamond, privilege item286, min attr, bind ownership, dispatch atomic, expired/escape catch, 6901 array, 6921 loyalty number.
7. So sánh client contract: 3302/3311 `data.rewards.items`; reset/compose/eat 1202 inventory delta; catch success 6901 `data.data` là array; 6921 `loyalty` là number. Nếu chỉ server sửa shape, không đổi client bundle.

## Rollout đề xuất (sau khi gate pass)

1. Read-only preflight: SSH, kiểm đúng remote hash; nếu drift thì dừng. Tạo backup chọn lọc dưới `/linhhoasu/_ai_workbench/backups/pet_release_<stamp>/` và ghi manifest.
2. Stage candidate ngoài live path, `chmod 644`, `node --check`, hash stage; CAS swap từng file. Không ghi DB/player.
3. Rolling restart theo `lhs-s1002 → lhs-s1001 → lhs-s1003 → lhs-s1004 → lhs-s1005` (S2 canary trước), mỗi node chờ `/ready` HTTP 200; nếu canary lỗi thì dừng.
4. Sau 5 node: `pm2 jlist` tất cả online, readiness đủ 200, kiểm hash remote khớp candidate, `pm2 save` chỉ khi toàn bộ pass. Lưu release JSON gồm hash, backup, restart, readiness, productionWrites=0.
5. Post-deploy read-only: chạy core contract fixture, đọc log `tag=3300/3302/3311/3314/690x/692x` trong cửa sổ ngắn; không thao tác tài khoản thật. Browser acceptance chỉ sau khi người dùng xác nhận.

## Rollback

- Tự động rollback khi `node --check`, CAS, readiness hoặc hash post-swap fail: dừng rollout, copy đúng backup của release về từng file, restart các node đã chạm, đợi 200 và xác minh hash baseline.
- Nếu chưa swap file thì **không restart**. Nếu đã swap nhưng chưa restart đủ, vẫn phục hồi file trước rồi restart đúng node đã chạm.
- Không dùng `git reset`, không phục hồi từ local PetSoul vì local không cùng baseline. Không rollback dữ liệu player bằng source rollback.
- Báo cáo rollback phải ghi node/file/hash trước-sau, node nào đã restart, readiness và nguyên nhân.

## Bằng chứng cần bàn giao

- Candidate manifest + SHA-256; backup path; release/rollback JSON.
- Kết quả test reset, compose/eat/auto, fragments và PetSoul với `productionWrites=0`.
- Readiness/hash của 5 node sau rollout hoặc rollback.
- Nếu phát hiện giao dịch lịch sử lỗi: chỉ lập danh sách đối soát từ receipt mới; không bù hàng loạt khi thiếu before/after ledger.

