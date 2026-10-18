# Audit toàn bộ nút và menu Ủy thác tự động — 04/09/2026

> Đã xử lý: phương án sạch v4 được triển khai production và toàn bộ control hiện PASS. Xem `_ai_workbench/reports/auto_delegate_clean_v4_20260904.md`.

## 1. Tóm tắt công việc

- Đã snapshot lại đúng bundle đang phục vụ trên production, hash main `119448ca7b4e7df1ac3aef7e513144eaaf38b7e90ba3fa63f53c5df636fe8495`.
- Đã trích và chạy runtime prototype `AutoOpenBoxPanel`, kiểm tra 20 control có thể tương tác, 7 dropdown, nút trợ giúp, nút Start và hai tab của cửa sổ.
- Tất cả 20 control đều có event binding đúng handler.
- 18/20 control có hành vi model/action đúng trong harness.
- Phát hiện hai control lỗi: `Đồng thời` (`bothCheckBox`) và `Hoặc` (`orCheckBox`).
- Lỗi không chỉ ở dấu chọn: hai mode hiện cho kết quả phân loại tương đương vì `enoughPower` luôn bị ép `false` sau khi checkbox lực chiến được tái sử dụng cho auto-equip.
- Theo phạm vi yêu cầu “kiểm tra”, phiên audit này không thay đổi production.

## 2. File/thư mục đã thay đổi

### Tool/evidence

- Tạo `_ai_workbench/tools/audit_auto_delegate_all_controls_20260904.js`.
- Evidence `_ai_workbench/temp/auto_delegate_all_controls_audit_20260904.json`.
- Snapshot manifest `_ai_workbench/temp/auto_equip_new_accounts_prod_20260904/manifest.json`.

### Source production

- Không thay đổi source/runtime production trong lượt audit này.
- Không restart process, không sửa DB, không ghi cấu hình người chơi.

## 3. Lỗi đã gặp & giải pháp

| Lỗi | Nguyên nhân | Kết luận / phương án | Cách tránh lặp lại |
|---|---|---|---|
| `Đồng thời` và `Hoặc` đều hiện vòng tròn đen | `updateViewUI()` dùng `e.enoughPower && e.isBoth` và `e.enoughPower && !e.isBoth`; `enoughPower` bị ép `false` | Xác nhận lỗi giao diện | Radio group không được phụ thuộc vào checkbox đã đổi mục đích |
| Bấm `Đồng thời/Hoặc` không tạo khác biệt phân loại | `CheckAutoStop()` thiết kế hai nhánh quanh điều kiện lực chiến cũ; khi `enoughPower=false`, hai biểu thức còn lại tương đương | Xác nhận lỗi logic | Khi tách auto-equip khỏi stop-on-power, phải khôi phục control power cũ hoặc viết lại boolean contract |
| Lần audit harness đầu báo mọi binding FAIL | Hàm minified là anonymous nên `fn.name` không giữ tên method | So sánh reference `event.fn === panel[handler]`; kết quả chỉ còn đúng hai lỗi thật | Runtime event audit phải so function identity, không dựa vào tên hàm minified |

## 4. Kỹ năng / kinh nghiệm mới

- Một control có event binding không đồng nghĩa hành vi đúng; cần test model mutation và visual state riêng.
- `isBoth` vẫn được ghi/đọc trong setting, nhưng UI và predicate không còn phản ánh đúng vì dependency `enoughPower` đã bị loại khỏi giao diện.
- Cách sửa sạch nhất là trả `powerCheckBox` về chức năng gốc `Dừng khi lực chiến cao hơn`, và dùng checkbox auto-equip riêng cho cả `stateA/stateB`. Khi đó `Đồng thời/Hoặc` có lại toán hạng lực chiến và semantic cũ.

## 5. Trạng thái hiện tại

### Ma trận control chính

| Control | Binding | Hành vi | Kết luận |
|---|---:|---:|---|
| Bắt đầu | PASS | PASS | Ghi setting, bật Ủy thác, chuyển state 4, đóng panel |
| Giữ lại phẩm chất | PASS | PASS | Dropdown cập nhật `quality` |
| Tự mặc đồ mạnh hơn — stateA | PASS | PASS | Toggle `autoEquipUpgrade` |
| Tự mặc đồ mạnh hơn — stateB | PASS | PASS | Toggle cùng flag; public `baseGroup` attach |
| Đồng thời | PASS | **FAIL** | Handler có chạy nhưng selected luôn tắt; logic không khác Hoặc |
| Hoặc | PASS | **FAIL** | Handler có chạy nhưng selected luôn tắt; logic không khác Đồng thời |
| Nhóm thuộc tính 1 | PASS | PASS | Checkbox và hai dropdown đều nối đúng |
| Nhóm thuộc tính 2 | PASS | PASS | Checkbox và hai dropdown đều nối đúng |
| Tăng tốc chiến đấu | PASS | PASS | Toggle theo thẻ tháng; nhánh khóa trả về false |
| Dừng khi vé đấu trường đầy | PASS | PASS | Toggle `arenaTicket` |
| Dừng khi quái tinh anh đầy | PASS | PASS | Toggle `isSummonBoss` |
| Dừng khi nhận phẩm chất chọn | PASS | PASS | Checkbox + dropdown max quality |
| Số lượng trang bị rơi | PASS | PASS | Dropdown `multipleSelect` |
| Tĩnh lặng nhận thưởng rơi | PASS | PASS | Toggle `isSilentMode` |
| Nút trợ giúp `?` | PASS | PASS | Gọi đúng help content `30020297` |

### Menu/tab

- Cửa sổ `AutoOpenBoxSettingWin.OnOpen()` và tab mặc định: PASS.
- Tab `Ủy thác tự động` (`AutoOpenBoxPanel`): PASS, trừ hai radio nêu trên.
- Tab `Chuyển đổi phong cách` (`MainThemeChangePanel`):
  - Mở/khởi tạo danh sách: PASS.
  - Chọn item: PASS.
  - Nút sử dụng gọi `sendMainPanelChange`: PASS.
  - Lock/use/limit-time policy: PASS.
  - Timer và red-point event list: PASS.

### Phạm vi xác minh

- Snapshot trực tiếp từ production và runtime harness: PASS ngoại trừ hai lỗi đã nêu.
- Không có tab nhân vật đăng nhập sẵn nên dropdown/tab chưa được click E2E trực quan trong trình duyệt; kết luận dựa trên served hash, exact handler contract và runtime model harness.
- Evidence SHA-256:
  - Control audit: `fefcff77232e67ac2aec651536901dcf212055b32454bf904d4f89260dedc0df` ở lần snapshot production xác nhận lỗi.
  - Snapshot manifest: `0610a5b90850a542812a349c8cbfeda1a41b7cb4b70040039db53831c679c5db`.

## 6. Bước tiếp theo

1. Sửa `Đồng thời/Hoặc` theo phương án tách hai chức năng:
   - Trả checkbox native `powerCheckBox` về `Dừng khi lực chiến cao hơn` và flag `enoughPower`.
   - Hiển thị checkbox riêng `Tự mặc đồ mạnh hơn` cho cả stateA/stateB.
2. Chạy truth-table cho phẩm chất × lực chiến × hai nhóm thuộc tính ở cả mode `Đồng thời/Hoặc`.
3. Chạy UI lifecycle, persistence/relog và live drop E2E trước khi deploy.
