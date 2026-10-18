# Khôi phục chỉ dẫn nhiệm vụ trên H5 — 04/09/2026

## 1. Tóm tắt công việc

- Đã xác định nguyên nhân trực tiếp: guard9 ngày 31/08 chèn `if(!RuntimeUtil.isRuntime)return` vào đầu `GuideUtil.Start()`.
- Trên bản web/H5, mọi lời gọi `GuideUtil.Start()` đều thoát ngay. `TaskModel.checkGuide()` vẫn nhận click và gọi đúng guide nhưng phần hiển thị bàn tay/mũi tên không bao giờ chạy.
- Guard này từng được thêm để thử tránh `GuideMask` stale gây mất input; các phiên soak sau đó xác nhận lỗi đơ vẫn còn nên đây không phải root cause đã chứng minh.
- Đã khôi phục `GuideUtil.Start()` cho thao tác chủ động như click nhiệm vụ.
- Vẫn giữ gate `RuntimeUtil.isRuntime` trong `timeGuideCheck()`, nên hướng dẫn tự bật do đứng yên/thời gian không quay lại trên H5.
- Tool cũ `patch_disable_web_guide_start.py` đã được đánh dấu `DEPRECATED` và fail-closed để tránh vô tình tái tạo lỗi.

## 2. File/thư mục đã thay đổi

### Source chính

- `linhhoasu/webgame/game/js/main.min_a6195824.js`: bỏ blanket H5 gate khỏi `GuideUtil.Start()`.
- `linhhoasu/webgame/game/index.html`: đổi cache marker thành `20260904_task_guide_restore1`.

### Tool và regression contract

- `_ai_workbench/tools/patch_restore_h5_task_guide_20260904.py`.
- `_ai_workbench/tools/test_restore_h5_task_guide_20260904.js`.
- `_ai_workbench/tools/deploy_restore_h5_task_guide_20260904.py`.
- `_ai_workbench/tools/audit_restore_h5_task_guide_20260904.py`.
- Cập nhật `test_disable_web_guide_start.js` và `test_disable_web_time_guide.js` theo policy mới.
- Cập nhật cache-marker acceptance trong `test_double_monsters_contract.js` và `test_auto_equip_optin_v2.js`.
- Vô hiệu hóa tool cũ `_ai_workbench/tools/patch_disable_web_guide_start.py` để chống lặp bug.

### Evidence và backup

- Deploy evidence: `_ai_workbench/temp/task_guide_restore_deploy_20260904_060807.json`, SHA-256 `20328617755a1fafc2bf311077e0d414af6ddafb2aa3e440eb3400686bfe4395`.
- Hậu kiểm độc lập: `_ai_workbench/temp/task_guide_restore_postdeploy_20260904.json`, SHA-256 `b6d9201d258b87c49a3400ab0d7c1edd9d9bfac9265648409313a75a3ef9c902`.
- Test log: `_ai_workbench/logs/task_guide_restore_tests_20260904_1311.log`, SHA-256 `a632b4bcafbb366d1b2418b6559f991fce95103a415a80c2a5de9574a77ed457`.
- Backup production: `/linhhoasu/_ai_workbench/backups/task_guide_restore_20260904_060807/`.
- Backup local: `_ai_workbench/backups/task_guide_restore_local_pre_20260904_130900/`.

## 3. Lỗi đã gặp & giải pháp

| Lỗi | Nguyên nhân | Cách xử lý | Cách tránh lặp lại |
|---|---|---|---|
| Click nhiệm vụ nhưng không có bàn tay/mũi tên hướng dẫn | `GuideUtil.Start()` return ngay trên mọi H5 request | Bỏ blanket gate khỏi `Start()`; giữ nguyên route `TaskModel.checkGuide()` | Không chặn entrypoint dùng chung để xử lý một overlay cụ thể |
| Nguy cơ hướng dẫn tự bật lại và che màn hình | `timeGuideCheck()` có thể tự kích hoạt guide khi đứng yên | Giữ riêng runtime gate trong `timeGuideCheck()` | Tách hướng dẫn chủ động và hướng dẫn tự động thành hai policy độc lập |
| Tool guard9 cũ có thể tái tạo hồi quy | Patch cũ vẫn tìm được anchor ungated và chèn lại return | Đánh dấu tool `DEPRECATED` và cho fail-closed trước khi sửa file | Tool workaround đã bị hủy phải tự từ chối chạy |
| Regression test cũ kỳ vọng toàn bộ H5 guide bị tắt | Test phản ánh workaround cũ thay vì hành vi sản phẩm cần có | Đổi contract: explicit task guide bật, automatic idle guide tắt | Test theo yêu cầu người dùng cuối, không khóa chặt workaround tạm thời |

## 4. Kỹ năng / kinh nghiệm mới

- `TaskModel.checkGuide()` có hai loại điều hướng: guide type 1 gọi `GuideUtil.Start()`, type 2 gọi `JumpSystem.jumpToView()`. Blanket gate làm hỏng toàn bộ nhánh type 1 dù click nhiệm vụ vẫn được nhận.
- Khi xử lý overlay stale, phải đóng/timeout overlay cụ thể hoặc khóa nguồn tự động; không nên vô hiệu hóa entrypoint dùng chung của thao tác chủ động.
- Cache marker phải đổi sau mỗi sửa bundle tĩnh để trình duyệt người chơi không tiếp tục dùng bản cũ.

## 5. Trạng thái hiện tại

- Production deploy: PASS; hậu kiểm độc lập: PASS.
- Served bundle có đúng một `GuideUtil.Start()` không bị H5 gate, không còn blanket gate, có một idle runtime gate và route `TaskModel.checkGuide()` nguyên vẹn.
- Served contract ghi nhận 3 lời gọi `Y.GuideUtil.Start(e)` trong các nhánh nhiệm vụ/guide liên quan.
- Hash production và local khớp:
  - `main.min_a6195824.js`: `3465c04109b4e9f86bdde981cb26d5fa2c674e42250d8f9bb09657979a7150a6`.
  - `index.html`: `039efcbe9102f7006e3354f27241a5e41f3a227745218aa7c06b0d998086cb0e`.
- Tất cả PM2 PID/restart counter trước/sau giữ nguyên; không restart bất kỳ process nào.
- `/ready` S1/S2 đều `200`; S1/S2 giữ `580/580` bot, `2.466` slot quái, multiplier `2`, `invalid=0`.
- Tính năng tăng quái, tự mặc đồ và Tĩnh lặng nhận thưởng được hậu kiểm vẫn còn nguyên.
- Test PASS: guide contract 12 kiểm tra; backward compatibility guide; idle guide gate; double-monster 16 kiểm tra; auto-equip client/server; map combat; core gameplay 714 bảng.
- Không có tab game đã đăng nhập sẵn trong trình duyệt để chạy click E2E trực quan bằng nhân vật thật. Served bundle và route runtime đã được xác minh, nhưng người chơi cần thử lại sau khi tải bundle mới.

## 6. Bước tiếp theo

1. Người chơi `Ctrl+F5` hoặc đóng/mở lại game để nhận marker `20260904_task_guide_restore1`.
2. Bấm một nhiệm vụ chưa hoàn thành có hướng dẫn type 1; bàn tay/mũi tên phải xuất hiện và dẫn tới mục tiêu.
3. Nếu một nhiệm vụ cụ thể vẫn không chỉ dẫn, ghi lại tên hoặc ID nhiệm vụ; khi đó cần kiểm tra `TaskConfig.guide`, `guideValue` và target của riêng nhiệm vụ đó, không tắt lại toàn bộ guide.
