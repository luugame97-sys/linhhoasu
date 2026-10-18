# Bậc rơi 11–100 và phong cách giao diện — 22/09/2026

## Bậc rơi

- Đã mở rộng `BoxTierConfig` từ 10 lên **100**, giữ tuần tự; bậc 100 là terminal (`tierUpCost=[]`, không có bậc 101).
- `count` của bậc n = n, nên bậc 100 mở tối đa **100 món/lần**.
- Server hard-cap số món theo `DropTierExtensionConfig.maxOpenCount=100`, kể cả đặc quyền thẻ tháng; không thể thành 101.
- Bậc 11–99 có 5 nấc vật phẩm và thời gian tăng dần; bậc 100 không nâng tiếp. Điều kiện bậc cao dùng ba task thực tế: cấp rơi, cấp nhân vật, diệt đại yêu; target tăng dần đến 100/1000/100.
- Tổng progression từ bậc 10 lên 100 theo candidate: khoảng **1.203.750** đơn vị item1 và **90,94 ngày** thời gian nếu không dùng skip. Đây là cấu hình khó theo yêu cầu, cần cân đối kinh tế sau khi người chơi thử.
- Backup remote trước deploy: `/linhoasu/_ai_workbench/backups/box_tier100_20260922`. Evidence read-back: `_ai_workbench/temp/box_tier100_20260922/{baseline,config_audit,verification}.json`.
- File client mới `lhs-box-tier100-v1.js` sinh cùng công thức task/cost/count, cập nhật danh sách chọn số lượng và chặn cap giao diện 100.
- Sau cache-bust v2, Codex browser ghi nhận `[LHS BoxTier100] 20260922_box_tier100_v2 ready tiers=100 maxCount=100`; ảnh bậc 10 trước đó là client cache cũ. E2E mở panel sau đăng nhập chưa thực hiện vì phiên đăng nhập không phản hồi nút, không tiêu tài nguyên.
- Test `test-box-tier100.js`: PASS; core gameplay contract PASS; alchemy/material suite PASS với 108 map khi extension bật. Readiness S1–S5: Mongo/Redis OK, process online, không ghi player/reward trong QA.

## Item chuyển đổi phong cách trong ảnh

Đây là item **phong cách giao diện chính**, không phải trang bị tăng lực chiến:

| ID | Tên | Trạng thái/nguồn live |
|---:|---|---|
| 15500 | Mặc định | Có sẵn mặc định, không cần item |
| 15501 | Thang Tuyền Ánh Giới | Item type10/subType107; ShopConfig `11028101` đổi **item455 ×440** lấy `15501 ×1`; không giới hạn/điều kiện trong live row; mô tả nguồn “sự kiện vận hành” |
| 15502 | Chưa có tên Việt riêng trong LanguageConfig | Item type10/subType107; không có shop/reward/itemWay live; mô tả nguồn “sự kiện vận hành” |
| — | Sắp ra mắt | Ô placeholder, không có ID item tương ứng trong config live |

Sau khi sở hữu, client dùng `FashionModel.sendMainPanelChange` RPC 1812; server kiểm tra `FashionConfig.type=107` và `hasFashionOwnership` trước khi đổi. Gửi ID không có quyền sở hữu sẽ nhận `FASHION_MAIN_PANEL_NOT_OWNED`.

Đã kiểm tra read-only live: tham chiếu shop chỉ có `15501`; `15502` chưa có đường nhận hiện hành. Không thêm item, không cấp quyền sở hữu, không sửa shop/economy.
