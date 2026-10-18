# Fix triệt để gói 68 Nhiệm Vụ → Tiên duyên — 04/09/2026

## 1. Tóm tắt công việc

- Đã triển khai fix production cho gói `Tiên duyên` pay ID `10301`, giá `68`.
- Giữ đúng contract: mua một lần trong chu kỳ 7 ngày; tab Nhiệm vụ làm mới hằng ngày; điểm nhiệm vụ cộng dồn trong chu kỳ.
- Sửa đồng bộ purchase resolver, entitlement, reward claim, daily reset, rollover 7 ngày, callback tiền thật, rollback khi lưu lỗi và chống mua đồng thời/lặp.
- Repair tối thiểu dữ liệu cũ: 1 nhân vật tự self-heal khi đăng nhập, 6 nhân vật được thêm entitlement bằng job có backup; không cộng quà, tiền hoặc sửa reward ledger.
- Chỉ restart hai game node `lhs-s1002` rồi `lhs-s1001`; không restart dist/admin/bot workers.
- Hậu kiểm xác nhận 7/7 người mua có entitlement, không còn trường hợp mua mà giao diện chưa kích hoạt.

## 2. Contract sau khi sửa

### Chu kỳ và nhiệm vụ

- Activity S1: `7001`.
- Activity S2: `7051`.
- Pay ID dùng chung: `10301`.
- Giá R: `68`; token S1 theo area là item `1001 ×68`.
- Chu kỳ: 7 ngày, lấy từ `Activity7TypeConfig.day=7`.
- Điều kiện mở: nhân vật cấp 15 trở lên.
- 16 mốc: `0, 40, 80, 120, 160, 200, 240, 280, 320, 360, 400, 440, 480, 520, 560, 600`.
- 12 nhiệm vụ type 2 có `updateCycle=1`, được tái tạo mỗi ngày.
- Trước khi reset item điểm hoạt động `19` ở ngày mới, server chốt delta cuối ngày vào score Tiên duyên; sau đó điểm ngày mới tiếp tục cộng dồn.
- Khi sang chu kỳ 7 ngày mới, server reset đúng `score`, `records`, `recordList` và purchase entitlement của chu kỳ cũ.

### Mua gói

- `RechargeRewardResolver` nhận dạng `10301` là family `activation-pass`.
- Gói là activation-only; không phát quà giả/fallback từ `ShopConfig` rỗng.
- Chỉ cho phép `multi=1`.
- Mua lại trong cùng chu kỳ trả `ALREADY_ACTIVE`, không trừ token và không ghi thêm purchase record.
- Token purchase chụp cả `activityInfo` trong rollback snapshot; save lỗi phục hồi token, recharge và activity state.
- Callback tiền thật kiểm đúng amount `68`, ghi resolver version `activation-pass-v1`.
- Callback được khóa theo order + user trong process; hai đơn khác nhau đến đồng thời cho cùng nhân vật chỉ một đơn được kích hoạt.

### Entitlement và nhận quà

- Source-of-truth client/server thống nhất là `activity.recordList` chứa `10301`.
- Khi mua thành công, server ghi entitlement và push packet `1701` để UI mở cột ưu đãi ngay.
- Player cũ có recharge record hợp lệ được self-heal entitlement đúng một lần khi migrate lifecycle metadata.
- Handler claim không còn tin riêng `rechargeInfo.records`.
- Với một mốc chưa nhận và đã mua premium, một request cấp gộp free + premium và ghi `records[param]=3`; không còn trả premium của mốc trước khi người chơi bấm mốc khác.
- Claim lặp trả result lỗi và không thay đổi inventory/reward ledger.

## 3. File/thư mục đã thay đổi

### Source production và local

- `linhhoasu/lhs/newServer/src/services/ActivationPassService.js` — service mới quản lý Activity 7, area, entitlement, điểm và rollover.
- `linhhoasu/lhs/newServer/src/services/RechargeRewardResolver.js` — resolver chuyên biệt `10301`.
- `linhhoasu/lhs/newServer/src/services/RechargeBenefitService.js` — kích hoạt Activity 7 khi purchase thành công.
- `linhhoasu/lhs/newServer/src/handlers/activity.js` — claim theo entitlement thống nhất và free+premium atomic.
- `linhhoasu/lhs/newServer/src/handlers/compat.js` — token purchase, duplicate guard, rollback `activityInfo`, push `1701`.
- `linhhoasu/lhs/newServer/src/handlers/recharge.js` — cash callback, amount/duplicate/concurrency guard và transaction metadata.
- `linhhoasu/lhs/newServer/src/handlers/account.js` — lifecycle/self-heal khi login.
- `linhhoasu/lhs/newServer/src/handlers/playerPayload.js` — reset nhiệm vụ/nguyên liệu điểm hằng ngày nhưng giữ score chu kỳ.
- `linhhoasu/lhs/newServer/src/handlers/task.js` — cập nhật và push Tiên duyên ngay khi nhận reward item 19.

Không sửa client JS, binary config, WebGM, database schema hoặc asset.

### Tool và evidence

- Tool audit/snapshot/preflight/test/QA/deploy/repair đặt trong `_ai_workbench/tools/`.
- Audit trước fix: `_ai_workbench/temp/activation_pass_68_audit_20260904_142124.json`.
- Dry-run repair: `_ai_workbench/temp/activation_pass_repair_dry_run_20260904_150943.json`.
- Preflight production dependencies: `_ai_workbench/temp/activation_pass_preflight_20260904_150513.json`.
- Deploy evidence: `_ai_workbench/temp/activation_pass_fix_deploy_20260904_151219.json`.
- Cash live QA: `_ai_workbench/temp/activation_pass_cash_live_20260904_152101.json`.
- Audit sau fix: `_ai_workbench/temp/activation_pass_68_audit_20260904_151952.json`.
- Hậu kiểm cuối: `_ai_workbench/temp/activation_pass_postdeploy_20260904.json`.

## 4. Backup và rollback

- Backup source production:
  - `/linhhoasu/_ai_workbench/backups/activation_pass_fix_20260904_151219/`
- Backup trước repair:
  - `/linhhoasu/_ai_workbench/backups/activation_pass_fix_20260904_151219/activity_info_before_repair.json`
  - Quyền file `600`.
  - Chứa đúng 6 player phải ghi trực tiếp.
- Một player thứ bảy tự self-heal khi đăng nhập giữa dry-run và commit nên không cần update trực tiếp.
- Repair chỉ thêm `10301` vào `recordList`; giữ nguyên `score`, `records[param]`, inventory, currency và recharge count.

## 5. Kiểm tra đã chạy

| Nhóm kiểm tra | Kết quả |
|---|---|
| Activity 7 candidate | PASS 58 assertions |
| Cash callback đồng thời | PASS 8 checks |
| Live token purchase S1 | PASS 28 checks |
| Live cash callback S1 | PASS 18 checks |
| Live cash callback S2 / Activity 7051 | PASS 18 checks |
| 16 mốc + claim replay | PASS |
| Daily task reset + giữ score chu kỳ | PASS |
| Rollover 7 ngày | PASS |
| S1/S2 area mapping 7001/7051 | PASS |
| Recharge resolver | PASS, 614 gói |
| Activity 9 / Đặc quyền đăng nhập | PASS |
| Event 43001/44001 | PASS 51 + 27 + 8 |
| Linkage 365 ngày | PASS 18 |
| Menu Ủy thác | PASS 27 |
| Tự mặc đồ tài khoản mới | PASS 24 |
| Quái ×2 | PASS 16 |
| Hướng dẫn nhiệm vụ H5 | PASS 12 |
| Core gameplay/config | PASS, 714 bảng |
| QA cleanup | PASS, player 0 và transaction 0 |
| Mojibake report | Không phát hiện mẫu mojibake mới |

ESLint chưa chạy được vì dự án dùng ESLint 10 nhưng không có `eslint.config.js/mjs/cjs`. Không tự tạo config ngoài phạm vi. Toàn bộ 9 source file và tool mới đều qua `node --check`.

## 6. Dữ liệu repair

Trước fix:

- S1 có 7 nhân vật mang recharge record `10301`.
- 0/7 có entitlement trong Activity 7.
- Tổng recharge count đã ghi là 24; không dùng count này để bù tiền/quà vì không có provider ledger.

Sau fix:

- 7/7 có purchase record và entitlement.
- `purchaseWithoutEntitlement=0`.
- `entitlementWithoutPurchase=0`.
- `purchaseWithoutRow=0`.
- `noOpenRow=0`.
- `malformedRewardRecord=0`.
- Không auto-claim: 5 premium mốc và 1 free mốc còn thiếu vẫn để người chơi tự nhận đúng UI sau khi đăng nhập lại.

## 7. Trạng thái production

- `lhs-s1001`: online, PID `22901`.
- `lhs-s1002`: online, PID `22849`.
- `lhs-dist`, `lhs-admin`, `lhs-real-bots`, `lhs-real-bots-s2`: PID/restart count giữ nguyên.
- S1 `/ready:8080 = 200`.
- S2 `/ready:8083 = 200`.
- Health `9200/9201 = ok`.
- Bot thực: `580/580` mỗi server.
- Bot virtual: `580/580` mỗi server.
- Quái: `2.466` slot, multiplier `2`, invalid `0`.
- Recent error scan: rỗng.
- Staging residue: `0`.
- QA player/transaction residue: `0/0`.
- S2 cash QA chạy trực tiếp trên player/order tạm trong `lhs_s1002` vì cổng đăng nhập S2 còn tuân theo lịch mở; callback chọn đúng Activity `7051` và cleanup `0/0`.
- Hash 9 source production khớp candidate.

## 8. Lỗi đã gặp & giải pháp

| Lỗi | Nguyên nhân | Cách xử lý | Cách tránh lặp lại |
|---|---|---|---|
| Nhận dạng nhầm family lúc audit đầu | Nhiều panel có giá 68 và hai cột reward | Khóa bằng Lang ID, class `ActivationMainWin`, type 7 và pay 10301 | Không map chỉ bằng giá/tên dịch |
| Resolver trả `SPECIALIZED_RECHARGE_REQUIRED` | Gói activation-only có ShopConfig reward rỗng nhưng chưa có owner | Tạo resolver chuyên biệt Activity 7 | Mọi paid row rỗng phải có owner contract |
| Client khóa nhưng server vẫn claim premium | Client đọc recordList, server đọc recharge record | Thống nhất entitlement vào recordList | Test UI state + server state + inventory |
| Mua lặp | UI không thấy entitlement và server thiếu duplicate guard | Khóa `ALREADY_ACTIVE`, multi=1, user/order lock | Test sequential + concurrent duplicate |
| Điểm nhiệm vụ ngày không phù hợp chu kỳ | Item 19 là counter ngày nhưng trước đây được dùng như score toàn kỳ | Lưu delta vào score trước daily reset | Test qua biên ngày |
| Rollover chỉ đổi timer | Không reset score/records/recordList | Metadata cycle v1 và reset atomic ở biên 7 ngày | Fixture trước/sau biên |
| Local task.js cũ hơn production | Production có ba tối ưu save chưa đồng bộ local | Drift gate dừng trước mutation; rebase patch lên source live | Snapshot/hash precondition trước deploy |
| Test cũ thiếu dependency/path env | Harness mặc định trỏ snapshot không có node_modules/thiếu argv | Chạy lại trên current app root và truyền đủ đường dẫn | Phân biệt harness fail với source fail |
| Preflight Fortune false-negative | Parser yêu cầu JSON không có khoảng trắng | Đổi gate sang marker PASS | Parse JSON hoặc marker ổn định |
| ESLint không khởi động | ESLint 10 thiếu flat config | Ghi rõ và dùng syntax/contract checks | Tạo config ở phiên riêng nếu cần |

## 9. Kỹ năng / kinh nghiệm mới

- Entitlement cần có vòng đời riêng theo cycle; recharge record lifetime không được dùng trực tiếp để mở mọi chu kỳ.
- Counter nhiệm vụ ngày và score pass nhiều ngày phải tách bằng delta/baseline.
- Activation-only purchase phải tạo transaction/entitlement nhưng không phát quà tức thời giả.
- Callback cần khóa cả order và user để chặn hai order khác nhau tranh chấp một entitlement.
- Repair production an toàn nên chỉ sửa state tối thiểu, có exact-target backup và không tự claim phần thưởng.

## 10. Bước tiếp theo

1. Người chơi đóng/mở lại game hoặc đăng nhập lại.
2. Mở `Nhiệm Vụ → Tiên duyên`; người đã mua sẽ thấy cột ưu đãi mở.
3. Người chơi tự bấm các mốc còn sáng để nhận phần chưa nhận; không cần mua lại trong chu kỳ hiện tại.
4. S2 sẽ dùng cùng fix qua Activity `7051` khi nhân vật đạt cấp 15.
