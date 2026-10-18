# Đối soát phản ánh mất pet Hỗn Độn — 17/10/2026

## Kết luận

- Chưa có bằng chứng tài khoản bị mất pet. Đối soát chỉ đọc trên S8 lúc `2026-10-17 12:49:41 ICT` cho account `lemonchanh1` cho thấy thư sự kiện đã gửi đủ **5/5** pet và đã được nhận; Mongo hiện vẫn có đủ các ID `810101, 810201, 810301, 810401, 810501`.
- Có hai mốc dễ bị nhầm:
  - Mốc Donate thường **500.000đ** (ngày ID32, tuần ID44, tháng ID62) hiện chỉ có vật phẩm thường, không có 5 pet Hỗn Độn.
  - Sự kiện `Sự Kiện Giữa Tháng 10` (event ID7) có tier **500.000đ** là quà thường; tier **510.000đ** mới chứa đủ 5 pet Hỗn Độn. Người chơi này đạt `550.000đ` và claim tier 510.000đ.
- Ảnh ghi nhân vật `egame2014`, nhưng account `lemonchanh1` hiện chỉ có role S8 `giotto1FPS` (`userId=u_Wk_1008_76e012_1791746500357`). Vì vậy cần xem ảnh là tên cũ/đã đổi tên hoặc xác nhận lại nhân vật trước khi gán tuyệt đối cho một role.

## Bằng chứng live

- WebGM delivery `11028`, label `Sự kiện ... · 510,000đ`, role đúng S8, trạng thái `sent`, `delivered_batches=1`, snapshot có đúng 5 dòng pet, mỗi dòng số lượng 1.
- Mail tương ứng được tạo `2026-10-16 19:25:18 UTC`, `claimed=true`, attachment đúng đủ `810101/810201/810301/810401/810501`.
- Player hiện tại có 7 pet Hỗn Độn:
  - `810101`: UID `100049`, level 216 và UID `100624`, level 1;
  - `810201`: UID `100625`, level 1;
  - `810301`: UID `100626`, level 1;
  - `810401`: UID `100050`, level 53 và UID `100627`, level 1;
  - `810501`: UID `100628`, level 6.
  Hai bản level cao là pet đã có trước đó; năm UID `100624–100628` khớp lô 5 pet của thư 11028.
- Account có 9 giao dịch Donate, tổng `1.350.000đ`; các claim event ID7 được ghi nhận ở `300.000`, `500.000` và `510.000`/đạt `550.000đ`. Không có delivery pending hoặc lỗi bridge trong nhóm đối soát.
- Quét bounded log S8 theo user/ID pet chỉ thấy một cảnh báo `Recharge1230 LIMIT_REACHED` cũ, không thấy lỗi mail/pet liên quan.

## Kiểm chứng code

- `RewardGrantService` nhận ID tồn tại trong `PetConfig` là kind `pet`, gọi `grantPetToPlayer` cho từng attachment.
- Mail handler lặp toàn bộ attachment, lưu player và `mailClaimLedger` trước khi đánh dấu mail đã nhận; không có nhánh chỉ cấp 2/5 pet trong luồng này.
- `node --check` cho `RewardGrantService.js`, `handlers/mail.js`, `handlers/pet.js` và kiểm tra JSON evidence đều PASS.

## Nhận định báo người chơi

Hiện nên báo đây là **không tái hiện được lỗi mất 3 pet** trên role S8 đang khớp account: quà 5 pet đã gửi/nhận đủ và vẫn còn trong dữ liệu nhân vật. Khả năng cao là nhầm mốc 500k với tier 510k hoặc giao diện đang hiển thị nhóm pet đang dùng/đã lọc; cần người chơi xác nhận tên role hiện tại và chụp màn Pet list đầy đủ sau khi đăng nhập lại. Không tự bù hoặc sửa DB khi chưa có bằng chứng role khác.

Evidence: `_ai_workbench/temp/recharge_pet_incident_20261017/live.json`; công cụ chỉ đọc: `_ai_workbench/tools/audit_recharge_pet_incident_20261017.py`.
