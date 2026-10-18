# Audit sâu xem trước trang phục và bộ nâng cấp — 27/09/2026

## Phạm vi và trạng thái triển khai

- Audit read-only source/config/runtime của tính năng Ngoại quan, tập trung vào xem trước trang phục chưa kích hoạt, bộ trang phục nhiều cấp và bộ **Tinh La Trùng Ảnh (28410)**.
- Đã triển khai bản sửa local/client và bộ regression RAM-only; không ghi player/DB, không restart/deploy VPS.
- Phân biệt kiểm tra tĩnh/RAM-only với E2E native: phiên trình duyệt hiện chỉ ở màn đăng nhập nên chưa thao tác được panel Ngoại quan bằng tài khoản test.

## Kết luận ngắn

1. **P1 — Đã sửa:** trang phục dạng nâng cấp không còn bị addon preview ẩn/chặn nhầm. Nút mua/nâng cấp được giữ cho đúng đường native; chỉ mở khi cấp trước và tài nguyên hợp lệ.
2. **P1 — Đã sửa phần client:** rương `28410` nay nhận đủ 4 mảnh + hiệu ứng vào trận `28416`, đồng bộ với server. Panel hiệu ứng kết liễu chỉ cho toggle khi effect đã sở hữu; `28410` không còn bị gọi nhầm vào end-effect handler.
3. **P1 — Đã gia cố:** animation preview không còn làm văng `.on()` khi Spine trả `null`/animation lỗi; wrapper giữ renderer native và không nuốt ownership/RPC.
4. **P2 — Đã sửa:** 7 nhãn thành phần không còn `Bộ NaN`, dùng tên tiếng Việt đã có trong catalog.
4. **Dữ liệu cần xác minh trước khi sửa:** các ID `28000`, `29810`, `29820`, `29999` có `FashionDressConfig` nhưng không có `AssetsConfig` cùng ID; chưa đủ căn cứ để tự thêm asset vì có thể là bộ nội bộ/mặc định.
5. Một số fixture audit cũ đang lệch catalog runtime (164/63/61 thực tế so với 150/59/56 fixture); đây là drift dữ liệu kiểm thử, không tự suy ra lỗi gameplay.

## Bằng chứng và cách sửa P1 — bộ nâng cấp bị kẹt ở xem trước

File: `linhhoasu/webgame/game/js/lhs-appearance-preview-v1.js`

- `decorateSuit()` tại dòng 434–444 gọi `FashionModel.IsSuitActive(...)`. Nếu chưa active, addon ẩn `btnBuy`, `groupBuy`, `btnCpSkillUp`, nhóm hiệu ứng và danh sách cost; đồng thời đặt nhãn `Xem trước — chưa kích hoạt`.
- Wrapper action tại dòng 597–602 chặn cả `onClickSelect`, `onClickBuy`, `onClickCpSkillUp`, `onClickESCheckBox` khi bộ chưa active.
- Native Egret vẫn đăng ký `btnBuy -> onClickBuy` và `btnCpSkillUp -> onClickCpSkillUp`; native `updateSuitShow()`/logic cấp dùng `FashionDressLevelConfig` để hiển thị và xử lý tiến cấp.

Đã sửa wrapper theo hướng tách acquisition/upgrade khỏi equip: `onClickBuy`/`onClickCpSkillUp` được chuyển cho native khi đúng điều kiện; `onClickSelect` vẫn chặn cấp chưa sở hữu. Không mở khóa giả và không thay đổi server authority.

Các linkage nhiều cấp đã thấy trong runtime có các bộ cấp 0–3; `28370` và `28380` có cấp 0–4. Không được mở khóa bằng cách bỏ toàn bộ ownership gate; cần chỉ cho phép action mà native xác nhận đủ điều kiện cấp trước.

## Tinh La Trùng Ảnh (28410) — đã đồng bộ client/server

Runtime config xác nhận:

- `FashionDressConfig[28410].isSuit = 4` (bộ có hiệu ứng vào trận).
- Thành phần: `28411` vũ khí, `28412` mũ, `28413` áo, `28419` quần, `28416` hiệu ứng vào trận.
- `AssetsUseConfig[28410]` có đủ 5 reward, bao gồm `28416`.
- `FashionEndDressConfig[28410]` tồn tại và hợp lệ.

Đã sửa `lhs-fashion-box-v1.js` để lấy `beginEffectId` từ `FashionEndDressConfig`, cho phép 5 reward đúng server. Đã thêm guard hiệu ứng an toàn và animation fallback. Không phát hiện exception trong native fixture sau sửa; vẫn cần một lần click thật sau đăng nhập để xác nhận UI/asset/âm thanh trên trình duyệt.

## Lỗi hiển thị P2 — `Bộ NaN`

File: `linhhoasu/webgame/game/js/lhs-fashion-content-v1.js:6`

Các mapping bị lỗi:

- `11291`, `11837`, `11838`, `12078`: `Phần bộ Bộ NaN`.
- `23046`, `23047`, `23048`: `Vũ khí Bộ NaN`.

Đây là lỗi tên/label, không phải lỗi ownership hoặc combat. Cách sửa an toàn là lấy tên parent từ config hiện hành trước khi render, có fallback rõ ràng; không hard-code thêm ID mới nếu chưa đối chiếu config.

## Kiểm tra hồi quy sau sửa

PASS:

- `linhhoasu/lhs/newServer/scripts/test-fashion-preview-native.js` — 320 panel cases, 62 upgrade paths, 35 dye purchases, 0 network.
- `linhhoasu/lhs/newServer/scripts/test-fashion-suit-tabs-audit.js` — 164 variants, 436 whole-set parts, 192 native tab cases.
- `linhhoasu/lhs/newServer/scripts/test-fashion-box-open.js` — 61 fixed boxes, choice boxes remain selection-required, 89 cases.

- `_ai_workbench/tools/test_appearance_preview_20260926.js`
- `_ai_workbench/tools/test_appearance_artifact_native.js`
- `_ai_workbench/tools/test_appearance_mount_valhalla_native.js`
- `_ai_workbench/tools/test_mount_preview_ownership_20260926.js`
- `linhhoasu/lhs/newServer/scripts/test-fashion-gear-fix.js`
- `linhhoasu/lhs/newServer/scripts/test-fashion-end-effect.js` — 18/18

Các fixture count cũ đã được cập nhật theo catalog runtime, không hạ logic để làm test xanh:

- `test-fashion-suit-tabs-audit.js`: 164 variant, 436 part.
- `test-fashion-box-open.js`: 63 candidate / 61 fixed box.
- `test-fashion-gear-native.js`: 61 fashion boxes.

## Live/runtime preflight

- Addon preview local/remote khớp hash; index remote chỉ có một manifest entry `lhs-appearance-preview-v1.js?v=20260926_appearance_preview_v1`.
- PM2 các server đang online; không thấy exception/log rõ ràng gắn với `28410`, freeze hoặc Fashion trong mẫu log đã đọc.
- `productionWrites=0`, không có ghi player/DB trong audit.
- Browser live chưa đăng nhập, nên chưa xác minh click native trên tài khoản test.

## Các file đã sửa

- `linhhoasu/webgame/game/js/lhs-appearance-preview-v1.js` → v2: phân quyền preview/acquisition, guard suit action, animation fallback.
- `linhhoasu/webgame/game/js/lhs-fashion-box-v1.js` → v4: hỗ trợ begin-effect reward của 28410.
- `linhhoasu/webgame/game/js/lhs-fashion-content-v1.js` → v3: sửa 7 tên catalog.
- `linhhoasu/webgame/game/index.html` → cache-bust cả ba addon.
- Ba fixture catalog count được cập nhật theo runtime; thêm `test-fashion-preview-native.js`.

## Trạng thái bàn giao

- Fix source/client và regression đã hoàn tất ở mức local/RAM-only.
- Chưa deploy VPS và chưa có E2E trình duyệt sau đăng nhập; đây là phần còn thiếu để khẳng định tuyệt đối asset/animation live không đơ.
- Backup trước sửa: `_ai_workbench/backups/fashion_preview_fix_20260927/`.
