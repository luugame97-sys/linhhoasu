# Fix hiển thị thời trang sau nhuộm màu — 05/09/2026

## 1. Tóm tắt công việc

- Sửa `handleSuitColorUnlock` để sau khi nhuộm thành công gửi full Fashion state qua tag `1800` trước response `1803`.
- Áp dụng cả nhánh mở màu mới và nhánh bấm lại màu đã sở hữu.
- Giữ nguyên logic ownership, cost và persistence; màu đã sở hữu không bị trừ nguyên liệu lần hai.
- Triển khai production S2 rồi S1 và chạy E2E suit `29030`, màu `2 – Thương Minh Thám Nhược`.

## 2. File/thư mục đã thay đổi

- Source chính: `linhhoasu/lhs/newServer/src/handlers/fashion.js`.
- Tool test/deploy/E2E đặt trong `_ai_workbench/tools/`.
- Evidence deploy: `_ai_workbench/temp/suit_dye_ui_sync_fix_deploy_20260905_012109.json`.
- Health cuối: `_ai_workbench/temp/appearance_postdeploy_health_20260905_012835.json`.
- Audit state sau deploy: `_ai_workbench/temp/suit_dye_audit_20260905_012913.json`.
- Backup production: `/linhhoasu/_ai_workbench/backups/suit_dye_ui_sync_fix_20260905_012109/`.

## 3. Lỗi đã gặp & giải pháp

| Lỗi | Nguyên nhân | Cách xử lý | Cách tránh lặp lại |
|---|---|---|---|
| Nhuộm xong vẫn thấy khóa | Response chỉ có `1202 + 1803`; client chưa nhận component mới trong `activateFashion` | Thêm `1800` với `fashionData` và full `activateFashion` | Contract bắt buộc `1800` sau mọi unlock màu |
| Bấm lại màu đã có vẫn cần tự đồng bộ | Nhánh early-return chỉ trả `1803` | Trả `1800 + 1803`, không trừ cost | Test idempotency và packet order |
| Dễ chỉ kiểm DB mà bỏ sót UI model | Server state đúng nhưng cache client cũ | Fixture mô phỏng client trước/sau packet | Test cả persistence và state client |

## 4. Kỹ năng / kinh nghiệm mới

- Packet `1800` phải đến trước callback `1803` để callback dispatch refresh trên state mới.
- Với thao tác idempotent, server vẫn nên tự heal state client mà không tái trừ nguyên liệu.

## 5. Trạng thái hiện tại

- Hash `fashion.js`: trước `c7665133…`, sau `4573ce53…`; hash production khớp local.
- Fixture màu 2: response tags `[1202,1800,1803]`, client ownership `false → true` ngay trong phiên.
- Bấm lại màu đã có: `[1800,1803]`, chi phí lần hai bằng 0.
- E2E S1: 16/16 PASS; trừ đúng `118×40`, khóa biến mất ngay, persist/relog đúng, cleanup 0.
- Full ngoại quan: 2.192 ID/234 assertion PASS; 56 suit, 37 màu, 54 bước sao PASS.
- Activity 7: 58 assertion PASS; core contract: 714 bảng PASS.
- S1/S2 ready 200, PM2 online, bot 580/580, quái 2.466 ×2, invalid 0, error log rỗng.
- Audit state S1/S2: affected 0; suit 29030 sở hữu đủ màu 0/1/2, không partial.

## 6. Bước tiếp theo

1. Người chơi Ctrl+F5 hoặc đóng/mở game một lần để nạp code server mới.
2. Lần nhuộm tiếp theo, khóa màu phải biến mất ngay mà không cần relog.
3. Bấm lại màu đã sở hữu để xác nhận không mất thêm Ngọc Hoa Nhiễm.
