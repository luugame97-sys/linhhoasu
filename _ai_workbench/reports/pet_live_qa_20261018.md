# Pet: kiểm thử native và dữ liệu lưu thật — 18/10/2026

## Kết luận

**ISSUES_FOUND — chưa thể chốt cả 5 mục đã hoàn thiện.** Người dùng xác nhận tài khoản test và cho phép tiêu nguyên liệu; đã thao tác UI trên Talo/S1, đối chiếu Mongo chỉ đọc và đăng nhập lại. Không thay source production, không restart, không ghi DB trực tiếp.

### 1. Nhãn giá còn giữ nhịp tăng tốc cũ — đã tái hiện

- Giữ nút nâng Linh Quy từ cấp1 đến25, sau đó mở Chu Tước cấp20: UI hiện **7.520** Quả Linh.
- Bấm mới một lần: cấp20→21, số dư DB **11.015→7.345**, thực trừ **3.670** đúng bảng cấu hình. Không bị trừ thừa, nhưng giá xem trước không khớp hành động tiếp theo.
- Nguyên nhân: addon `safety.js` lấy `nowUpgradeTimes` cũ trong `showCost()`/`update()`; native `PetDetailView.OnOpen` chỉ đăng ký listener, đến TOUCH_BEGIN mới reset bộ đếm về0. Vì vậy nhãn trước chạm dùng nhịp5 cấp (số dư chỉ đủ2), còn request mới dùng1 cấp.
- Kiểm thử bổ sung dùng đúng thứ tự `update → TOUCH_BEGIN → sendUpgrade` tái hiện **FAIL: 7520 != 3670**. Bộ 12 test trước gọi thẳng `sendUpgrade` trong ca phí nên chưa bao phủ chỗ chuyển nhịp này.
- Cần đồng bộ trạng thái giữ/thả nút và mở/đóng cửa sổ; ngoài lượt giữ, giá xem trước phải ứng với lần chạm mới.
- Bằng chứng: `e2e-stale-price-before.jpg`, `e2e-stale-price-after.jpg`, `e2e-price-regression.json`, `live_before_burst.json`, `live_after_stale_price.json`.

### 2. Hướng dẫn auto EXP còn sai — đã xác nhận UI/source

- Cửa sổ Hợp thành tự động vẫn ghi khi đạt max rồi hợp tiếp sẽ chuyển 100% thành Quả Linh.
- Logic hiện tại: auto giữ lại nguyên liệu EXP nếu vượt cap; manual ăn EXP bỏ dư theo yêu cầu trước, không hoàn Quả Linh. Văn bản cũ gây hiểu nhầm quyền lợi.
- Bằng chứng: `e2e-help-text.jpg`; nhánh auto EXP trong candidate/live `pet.js` và `mergeNotice` trong `grid.js`. Chưa tạo cặp EXP vượt cap trên tài khoản thật ở lượt này.

### 3. Lỗi promise quanh lúc mở chi tiết pet — cần truy vết

- Console có 3 dòng `Uncaught (in promise)` lúc00:08:34.163Z, 00:18:08.895Z, 00:23:27.471Z, trùng các lượt mở chi tiết pet. Lần cuối chỉ mở xem sau đăng nhập, chưa bấm nâng.
- Giao diện vẫn mở và giao dịch kiểm tra vẫn lưu đúng. Công cụ chỉ trả thông báo, không có stack/reason; chưa đủ bằng chứng quy nguyên nhân cho bản vá ACK hay một tài nguyên cụ thể.
- Lỗi chặn tự phát âm thanh lúc reload được phân biệt riêng. Bằng chứng: `e2e-console.json`.

## Phần đã đạt trên UI và DB thật

| Ca kiểm thử | Kết quả đối chiếu |
|---|---|
| Nâng đơn Chu Tước18→19 | 7.843→4.533, đúng3.310 |
| Giữ nút nâng tiếp19→20 | 4.533→1.043, đúng3.490; thiếu3.670 thì dừng, lần chạm mới có thông báo thiếu Quả Linh |
| Nâng nhanh Linh Quy1→25 | Sau một lần nâng pet phẩm4 phí25, còn1.018; trừ948, còn70; cấp tiếp theo cần77. Phần lô không đủ tiền được giảm đúng |
| Ghép nhanh pet đang có | Receipt3314 ghi2 compose +1 EXP merge, tiêu50, còn20; `INSUFFICIENT_COST`, phẩm5 thiếu phí, `canContinue=false` |
| Bảo vệ pet | Ba pet trang bị và các pet đã nâng cấp được giữ nguyên qua lần ghép nhanh trên |
| Auto mở trứng | Có nhiều receipt batch8 và batch cuối4; hết trứng24/25, receipt cuối `NO_ACTION`, `canContinue=false`, UI thoát trạng thái auto |
| Giá sai nhưng giao dịch đúng | Nhãn7.520; thực nâng1 cấp và trừ3.670 |
| Đăng nhập lại | Vào lại S1 thành công; pet21/25, toàn bộ danh sách pet, nguyên liệu7.345 và receipt giữ nguyên so với snapshot trước reload |

`e2e-verification.json` xác nhận **8 đối chiếu dữ liệu đạt**, nhưng kết quả tổng vẫn `ISSUES_FOUND` do lỗi giá và các điểm còn lại.

Trong đoạn auto sau, số dư/stock được bổ sung hoặc thay đổi ngoài các bước test đã định lượng (ví dụ diamond912→2872, phát sinh thêm trứng25). Không gán nguồn thay đổi khi chưa kiểm chứng; không cộng toàn phiên thành một tổng chi phí. Các ca giá được đối chiếu theo cặp snapshot riêng.

## Giới hạn và bàn giao

- Lỗi mất phiên/lưu không rõ kết quả, timeout/ACK muộn, số request đồng thời khi mạng chậm và đầy bàn kèm EXP cap: vẫn chỉ có fixture trước đó; không chủ động gây lỗi dịch vụ chung trên production.
- Happy path, thiếu nguyên liệu, giữ nút, ghép/hatch và lưu qua đăng nhập đã chạy native. Chưa đo chính xác thời điểm animation so với gói ACK bằng network trace; không gọi toàn bộ5mục là live PASS.
- Client resource inventory sau reload xác nhận `grid48=20261018_pet_auto_notice_v5`, `safety=20261018_pet_safety_v2`.
- Snapshot/ảnh/receipt: `_ai_workbench/temp/pet_followup_20261018/live_*.json`, `e2e-*`. Công cụ chỉ đọc DB: `_ai_workbench/tools/read_pet_e2e_20261018.py`.
- Tài khoản đã đăng nhập lại, đang mở chi tiết pet cấp21. Không lưu mật khẩu vào báo cáo hoặc script. Chưa sửa thêm production trong lượt kiểm thử này.
