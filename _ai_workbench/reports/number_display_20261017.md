# Đồng bộ số rút gọn K/M/B/T — 17/10/2026 11:29 ICT

## Kết quả cuối

Theo lựa chọn của người dùng, tất cả hàm rút gọn đã kiểm tra dùng K/M/B/T với thang 10^3/10^6/10^9/10^12. Dấu chấm dùng cho phần thập phân ở số rút gọn; tối đa hai chữ số, cắt phần dư để không biểu thị quá số tiền có. Ví dụ: 105.035.900 →105.03M; 262.589.750 →262.58M; 2.499.500.000 →2.49B; 10^12 →1T. Số đầy đủ trong tooltip và HUD lực chiến giữ nguyên.

## Audit và phạm vi sửa

- Nguồn VPS hiện hành là baseline. Phát hiện `overLength` chia10^8 rồi dùng nhãnTỷ,10^12 dùng nhãnTriệu; nhánh tiếng Anh lực chiến trả chuỗi `null`; resource128 dùng thangVạn riêng. Các chỗ khác dùng lẫn K/M/B/T vàTr/Tỷ.
- Sửa sáu anchor hiển thị trong `main.min_drop200.js`: bốn hàm overLength/overLengthEn/overLengthPower/overLenghPowerEn; resource128; nhánh thuộc tính số của `CSe.formatAttrValue1` (giữ nhánh phần trăm).
- Hàm dùng chung bao phủ74lời gọi overLength,11lời gọi overLengthPower trong main; tiền/HUD, chi phí, túi đồ/quà/thư, EXP/HP, điểmBXH, thuộc tính và sát thương liên quan. Không khẳng định đã mở trực tiếp mọi màn hình.
- `lhs-item-quantity-v1.js` dùng chung formatter;22vùng quantity giữ glyph tiếng Việt/callback/màu,4skin CurrencyItem có đo chữ vừa92px; giữ nguyên skin cấp/rank và các phông không liên quan. K/M/B/T giúp nhãn ngắn hơn bản nghìn/tr/tỷ.
- Formatter tự bootstrap ở cả main và item addon để client cache cũ/mới không thiếu dependency. Index cache cuối `20261017_number_kmbt_v1`, addon `20261017_item_quantity_kmbt_v5`. Giữ addonMax và mọi bản vá ngoài phạm vi.
- Đọc52script đang được index tham chiếu: ngoài main không phát hiện nhánh scale cũ theo các pattern audit; raw language binary vẫn giữ chuỗi lịch sử nhưng main không còn gọi ba unitID30020170/30020171/30020322. Không sửa text theo tênVạnCổ/VạnTượng hoặc hàm chữ số dùng cho thứ tự ngày.

## Kiểm chứng

-151assertion PASS: ranh giới đơn vị,0/âm/số thập phân/số chuỗi vượt safeInteger, NaN/Infinity, en/cn, percent, callback/tint, tooltip nguyên số,22quantityparts/4currencyparts, panel chữ dài và khôi phục cỡ chữ.
- Đảo sáu thay thế và bỏ bootstrap khôi phục main về byte baseline; không sửa business logic, balance, giá, reward, DB hay RPC.
- Syntax local/VPS PASS. Rollout static cuối backup/CAS/atomic ba file; HTTPShash3/3 khớp candidate. PM2 PID/restart/status giữ nguyên, không restart và playerWrites0.
- Browser thật đã quan sát bản Việt hóa trước chuyển K/M/B/T: thanh tiền19,56tr/1,07nghìn và túi đồ, giữ lực chiến nguyên số. Screenshot `ui-inventory.png` thực tế chụp HUD vì người dùng đã đóng túi trước capture. Sau rollout K/M/B/T tab đang giữ bản Việt hóa cũ, chưa reload/nghiệm thu screenshotKMBT; cần người dùng tải lại game. Không dùng thông tin đăng nhập lưu sẵn hoặc mua thử.

## Bằng chứng và rollback

- `_ai_workbench/temp/number_vi_20261017/`: `audit-source.json`, `call-sites.json`, `font-usage.json`, `active-script-audit.json`, `tests.json`, `release.json`, `deployment.json`, baseline/candidate.
- Tool build/test/deploy: `_ai_workbench/tools/{build_number_vi_20261017.py,test_number_vi_20261017.js,deploy_number_vi_20261017.py}`.
- Backup K/M/B/T preimage bản Việt hóa cuối: `/linhhoasu/_ai_workbench/backups/number_vi_20261017_042926`.
- Backup trước tất cả thay đổi format phiên này: `/linhhoasu/_ai_workbench/backups/number_vi_20261017_041943`; các bổ sung kiểu chữ/precision có backup042134/042249. Giữ preimage và receipt, không xóa backup.
- Rollback kiểm CASpostimage, khôi phục ba file từ `/before/` của backup tương ứng theo atomic swap, xác minh hashHTTPS và cache; không cần restartserver.
