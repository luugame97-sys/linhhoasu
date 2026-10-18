# Fix gói Đặc quyền đăng nhập giá 68 — 04/09/2026

## 1. Tóm tắt công việc

- Đã khôi phục Activity 9 vào bản `activity.js` production hiện tại mà vẫn giữ toàn bộ logic Kim Mã/Vận May và Niên Thú.
- Khôi phục ba phần bị mất:
  - Import `Activity9Service`.
  - `operateLoginPrivileges()` xử lý free/premium theo bitmask ngày.
  - Nhánh `activityType === 9` trong `handleActivityOperate()`.
- Khôi phục lifecycle khi đăng nhập:
  - `account.js` gọi `ensureActivity9State()` sau khi xác định recharge area.
  - Lưu Player nếu score/ngày/recordList Activity 9 thay đổi.
- Claim module 0 giờ sweep toàn bộ ngày đã mở nhưng chưa nhận, gồm free và premium nếu đã mua.
- Duplicate claim trả result 1 và không cấp lại vật phẩm.
- Chỉ restart `lhs-s1002` và `lhs-s1001`; không restart `lhs-dist`, `lhs-admin` hoặc hai worker bot.
- Không tự động cộng quà cho 6 tài khoản thật. Sau fix, người chơi bấm nhận sẽ lấy đúng các ngày thiếu dựa trên `records[day]`.

## 2. File/thư mục đã thay đổi

### Production

- `/linhhoasu/lhs/newServer/src/handlers/activity.js`.
- `/linhhoasu/lhs/newServer/src/handlers/account.js`.

### Source local được đồng bộ từ production

- `linhhoasu/lhs/newServer/src/handlers/activity.js`.
- `linhhoasu/lhs/newServer/src/handlers/account.js`.
- `linhhoasu/lhs/newServer/src/handlers/recharge.js`.
- `linhhoasu/lhs/newServer/src/handlers/compat.js`.
- `linhhoasu/lhs/newServer/src/handlers/playerPayload.js`.
- `linhhoasu/lhs/newServer/src/handlers/box.js`.
- `linhhoasu/lhs/newServer/src/handlers/raid.js`.
- `linhhoasu/lhs/newServer/src/services/Activity9Service.js`.
- `linhhoasu/lhs/newServer/src/services/RechargeBenefitService.js`.
- `linhhoasu/lhs/newServer/src/services/MainTaskProgressService.js`.
- `linhhoasu/lhs/newServer/src/services/PlayerService.js`.

### Tool, evidence và backup

- `_ai_workbench/tools/patch_login_privilege_merge_20260904.py`.
- `_ai_workbench/tools/redirect_login_privilege_candidate_20260904.js`.
- `_ai_workbench/tools/test_login_privilege_merge_static_20260904.js`.
- `_ai_workbench/tools/qa_login_privilege_live_20260904.js`.
- `_ai_workbench/tools/run_login_privilege_candidate_preflight_20260904.py`.
- `_ai_workbench/tools/deploy_login_privilege_fix_20260904.py`.
- `_ai_workbench/tools/audit_login_privilege_fix_postdeploy_20260904.py`.
- `_ai_workbench/tools/dry_run_login_privilege_recovery_remote_20260904.js`.
- `_ai_workbench/tools/run_login_privilege_recovery_dry_run_20260904.py`.
- Deploy evidence: `_ai_workbench/temp/login_privilege_fix_deploy_20260904_113001.json`, SHA-256 `3b2f47e5adf0e82283ac03813c62dd5775db89eac01e0dabc0979ba4a6f1b540`.
- Hậu kiểm độc lập: `_ai_workbench/temp/login_privilege_fix_postdeploy_20260904.json`, SHA-256 `7de43fffc2edf95f49a8fc0e36f23ea9d5c4f48fe682fd67e46c9ac5d92f2879`.
- Recovery dry-run 6 subject: `_ai_workbench/temp/login_privilege_recovery_dry_run_20260904_113826.json`, SHA-256 `34ccab501bb63900eb5cb8bd4a8f40c023bcabdbf1630ff0f960e43f3d44d48c`.
- Local regression log: `_ai_workbench/logs/login_privilege_fix_tests_20260904_214100.log`, SHA-256 `53e35b0fbcd81690f53e30291391f45206c49dc5b7d1ff7cbd70459de85372cf`.
- Production snapshot manifest: `_ai_workbench/temp/login_privilege_prod_snapshot_20260904/manifest.json`, SHA-256 `701a7aeea34f3a50f57e49e9c0336e95007f3249edd45e7b08102be7dbe83928`.
- Backup production: `/linhhoasu/_ai_workbench/backups/login_privilege_fix_20260904_113001/`.
- Backup local: `_ai_workbench/backups/login_privilege_fix_local_pre_20260904_184500/`.

## 3. Lỗi đã gặp & giải pháp

| Lỗi | Nguyên nhân | Cách xử lý | Cách tránh lặp lại |
|---|---|---|---|
| Activity 9 bị mất sau fix Activity 43/44 | `activity.js` dùng chung bị thay bằng candidate không chứa branch type 9 | Merge hẹp type 9 vào bản 43/44 live | Suite event phải chạy type 9+43+44 cùng lúc |
| Live QA lần 1 kỳ vọng số dư tuyệt đối 90 nhưng thấy 1.090 | Login seed cấp sẵn 1.000 Bánh bao cho fixture | Deploy tự rollback; sửa QA kiểm tra delta +90 | Reward E2E phải đo before/after, không đo balance tuyệt đối |
| Live QA lần 2 S2 login result -1 | S2 đang khóa đúng lịch tới 05/09 17:00 | Deploy tự rollback; S1 chạy full E2E, S2 kiểm tra shared source/module/health | QA phải tôn trọng access gate từng server |
| Hậu kiểm marker ban đầu FAIL giả | Tool kỳ vọng exact count type 43/44, trong file có nhiều điều kiện hợp lệ | Kiểm exact cho marker type 9, chỉ yêu cầu type 43/44 còn hiện diện và contract PASS | Marker count chỉ dùng cho anchor cần unique |
| Recovery dry-run tool lỗi `finally` | Script một dòng thiếu dấu đóng block | Viết lại nhiều dòng, `node --check` trước upload | Tool phức tạp phải syntax-check local |
| Regression local Activity 43/44 FAIL | Local còn 4 module event cũ hơn production | Backup và đồng bộ `box`, `raid`, `MainTaskProgressService`, `PlayerService` từ live | Sau deploy phải đồng bộ cả dependency set, không chỉ file trực tiếp |

## 4. Kỹ năng / kinh nghiệm mới

- Activity 9 entitlement và claim là hai ledger khác nhau; fix claim không được sửa entitlement đã đúng.
- Module event dùng chung phải có combined regression suite; test core 714 bảng không đủ phát hiện nhánh event bị lùi.
- Live reward E2E phải đo delta inventory, claim bitmask, duplicate và relog.
- Access gate S2 là hành vi đúng; không được nới lịch chỉ để QA một feature dùng shared source.
- Phục hồi ngày thiếu an toàn bằng sweep theo `records[day]`, không cộng vật phẩm trực tiếp.

## 5. Trạng thái hiện tại

- Production fix: PASS.
- Hash production/local:
  - `activity.js`: `92f5442cb02dd958b3876a29c9b1cf0388be9e943ff407f7973cd9c109dbd54c`.
  - `account.js`: `ecf01d4e92731652c28fe5a7c0722b55cf2d514c6e4bd335d6b310a3520996c5`.
- Live S1 `18/18 PASS` với fixture đúng trường hợp ảnh:
  - Level 35, pay ID 10501, ngày 1–3 mở.
  - Login cập nhật `score=3`.
  - Claim cấp đúng tổng ngày 1–3: Nguyên bảo 100, Bánh bao 90, Đùi gà 25, item 80×2, item 81×7, item 82×1.
  - Delta inventory khớp reward packet.
  - `records[1]=records[2]=records[3]=3`.
  - Duplicate bị chặn.
  - Relog giữ nguyên.
  - Cleanup QA `remaining=0`.
- S2 shared source/module Activity 9 PASS; login thật chưa chạy vì access gate trước 05/09 17:00 vẫn được giữ.
- Combined contract:
  - Activity 9 price/claim/sweep/purchase/retry/cash activation PASS.
  - Activity 43/44 `51/51 PASS`.
  - Config/reward `27/27 PASS`, 714 bảng.
  - Consumption tracking `8/8 PASS`.
  - Core gameplay 714 bảng PASS.
- Dry-run 6 tài khoản thật:
  - `6/6 result=0`, có reward, source document không đổi.
  - Mỗi người có thể bấm nhận để sweep đúng các ngày thiếu.
  - Năm row đang mở tới 07–08/09; row khớp ảnh mở tới 09/09/2026 11:50 +07.
- Không tự claim/bù vào Player thật; audit sau fix vẫn thấy 6 người chờ nhận, đúng dự kiến.
- PM2 sáu process online; S1/S2 bot `580/580`, quái `2.466`, `invalid=0`, `/ready=200`.
- `lhs-dist`, `lhs-admin` và hai worker bot giữ nguyên PID/restart counter.
- QA residue S1/S2 bằng 0; recent error scan rỗng.
- Đại Chúa Tể 365 ngày và các fix client trước được giữ nguyên.

## 6. Bước tiếp theo

1. Người chơi đóng/mở lại game hoặc đăng nhập lại.
2. Mở `Đăng nhập → Gói đặc quyền` và bấm nhận một lần; server sẽ sweep toàn bộ ngày đã mở nhưng còn thiếu.
3. Nên nhận trước khi cửa sổ Activity 9 của tài khoản hết hạn (các row hiện tại sớm nhất 07/09/2026).
4. Không cần mua lại gói 68; entitlement `10501` của 6 tài khoản đã được ghi đúng.
