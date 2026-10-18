# Chẩn đoán lực chiến nicky — 13/09/2026

## Kết quả read-only

- Ảnh người dùng hiển thị `Lực chiến 62.196.768`.
- Query Mongo S1 (`lhs_s1001`) lúc `2026-09-13 13:26 GMT+7`, nhân vật `nicky`, server calculator hiện tại:
  - `combatPowerValue = 61.924.083` theo `ceil(sum(effectiveAttrs × AttrConfig.power))`.
  - 54 attr hiệu lực; các đóng góp lớn nhất là ATK `24.593.700`, HP `22.663.158`, DEF `5.294.540`, SPD `2.585.200`.
  - Sai khác ảnh–server là `272.685` (~`0,44%`), nên số 62 triệu trong ảnh đang cùng bậc và gần snapshot server; đây không phải bằng chứng HUD tự nhân sai lên/xuống một bậc.
- Mongo không có `power` hoặc `powerScore` lưu sẵn cho `nicky`; giá trị được tính lại từ snapshot, không có cơ sở dữ liệu nào chứng minh nhân vật đang có 1 tỷ lực chiến.
- `AttrConfig` server/client có cùng weighted-attrs hash `500da7dd...cd31e19`; công thức native raw cho cùng attrs là 61,9 triệu, còn `BattleService.calcPowerScore` legacy trả khoảng 619 nghìn do chia `/100`. Hai đơn vị không được trộn.
- Nguồn dữ liệu nicky: 12 ô equip, formation `21105` grade 8/level 110, spirit rank 25/level 218, mount `100002`, 3 pet slot âm active, artifact map, 305 fashion active, Valhalla Formation 1; Curios và SpecSpirit hiện không sở hữu row (`0/0`). `itemUseRecords` chỉ `-802/-804 = 0`, không tạo bonus ẩn.

## Kết luận

1. HUD hiện tại đang hiển thị gần đúng power canonical server (~61,9M); ảnh 62,196,768 có thể là snapshot client tại thời điểm khác hoặc còn một chênh nhỏ do state cập nhật lệch thời điểm.
2. Mốc “cả tỷ” trước đó chưa có raw packet/attrs cùng nhân vật và timestamp để xác nhận. Không được tự bù dữ liệu hoặc đổi hệ số chỉ dựa vào con số cũ.
3. Chênh còn lại cần bắt cặp **raw client `RoleModel.getAllAttr()` + server attrs** cùng một login snapshot. Nếu client vẫn cao hơn, tiếp tục so từng category native (fashion/formation/mount/spirit/fate/fishing/old-trek/echo/task), đặc biệt các nhánh client có biến đổi riêng chứ không chỉ `attrs` thô.

## Nguyên nhân cụ thể của việc nâng cấp/mặc đồ không đổi HUD

- `WSServer.POWER_REFRESH_TAGS` hiện chỉ bao phủ một tập nhỏ. Nhiều tag thật sự làm thay đổi thuộc tính nhưng không được gắn canonical ACK, ví dụ: formation `3001/3002/3003`, pet `3304`, artifact/orb `3500/6401`, gem `3902+`, fishing `4010`, Valhalla Formation `6805`, Pet Soul `6901`, fashion `1804`, SpecSpirit `3610`.
- Các tag này vẫn cập nhật state server, nhưng `RoleModel.calAllPower()` phía client đang ưu tiên snapshot canonical cuối cùng. Vì ACK không có snapshot mới, HUD giữ nguyên số cũ; đây là lỗi đồng bộ/invalidation, không phải bằng chứng phép cộng power bằng 0.
- Do yêu cầu lượt này là **check-only**, chưa sửa whitelist hay restart. Cần phát hành một patch riêng bao phủ toàn bộ tag mutation đã đối chiếu với `handlers/index.js`, kèm test ACK → client model → HUD cho cả tăng và giảm.

## Đối chiếu recording người dùng

- Recording dài khoảng 11 giây: khung đầu ở màn chính hiển thị `61.897.414`, khung cuối ở hồ sơ vẫn hiển thị `61.897.414`.
- Video không cho thấy rõ một cặp trước/sau của cùng thao tác nâng cấp hoặc mặc đồ (không xác định được tag request/ACK từ hình ảnh), nên chứng minh HUD không đổi giữa hai màn nhưng chưa đủ để quy trách nhiệm cho một loại nâng cấp cụ thể.
- Con số trong video gần snapshot Mongo/server `61.924.083` (~`0,04%`), tiếp tục củng cố rằng đây là snapshot canonical bị giữ nguyên hoặc state cập nhật lệch thời điểm, không phải lỗi formatter đổi triệu thành tỷ.

## Phạm vi và kiểm chứng

- Chỉ đọc Mongo/config/source và ảnh người dùng; `productionWrites=0`, không sửa DB/config/restart.
- Bằng chứng chi tiết query được giữ trong log lượt kiểm tra; báo cáo này là bản tóm tắt đã loại bỏ dữ liệu nhạy cảm.
