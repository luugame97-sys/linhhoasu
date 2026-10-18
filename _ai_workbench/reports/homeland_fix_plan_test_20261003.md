# Họa Trung Các — kế hoạch sửa và nghiệm thu

## Phạm vi và căn cứ

- Đây là **Homeland / Họa Trung Các**, gồm Cúng tượng, Cầu phúc, Vẽ, công trình, khách/manh mối, tương tác và bố trí nhà.
- Đối chiếu bundle live, config live đã chụp; Cozy Việt hóa (`cozy_rip`) và client/config trong `lyzwlkjvip.zip` chỉ làm tài liệu tham chiếu. Backend trong ZIP cũng chứa handler trả thưởng giả, không dùng làm chuẩn kinh tế.
- Bản triển khai 08:38 ngày 03/10 đã chặn một số lượt lặp nhưng chưa đạt nghiệm thu: Cúng tượng sai loại tiền; CAS, callback lỗi, manh mối và một số điều kiện chưa đúng. Không coi HTTP 200/readiness là kiểm chứng gameplay.

## Thứ tự triển khai

1. **Chặn thất thoát:** một thao tác trên bản sao trạng thái; kiểm điều kiện trước khi trừ; lưu thưởng + lượt + nguyên liệu trong một cập nhật có CAS; chỉ trả thành công sau xác nhận lưu; cùng mã yêu cầu không trả quà lần nữa.
2. **Luồng có căn cứ:** Cúng tượng 3 miễn phí + 2 trả phí/ngày; Vẽ 2 miễn phí, trừ bút theo số lần; cộng hưởng đúng bộ công trình; công trình trừ đúng nguyên liệu; thu tài nguyên theo chu kỳ 5 phút; mở đất theo cảnh giới; manh mối theo thứ tự 1–4 và cost/reward config; sửa Cầu phúc/giữ buff hợp lệ.
3. **Client:** addon nhỏ cho Homeland, giữ bundle/asset cũ; chặn bấm trùng đang chờ, không chạy callback thành công khi server từ chối; cập nhật bộ đếm và trạng thái server; gỡ màn vẽ chờ khi có lỗi.
4. **Xã hội và dữ liệu phụ:** thích chỉ thưởng lần đầu/ngày, cập nhật đúng người nhận; bảng hạng có scope/cache; bảng lời nhắn đúng chủ; layout kiểm sở hữu; mã chia sẻ không trả nhà mình khi mã không tồn tại.
5. **Nghiệm thu:** test cô lập không network với config chụp live; lỗi lưu/ghi không chắc chắn, gọi đồng thời, lặp, đổi ngày, reconnect và callback native. Sau đó backup/CAS, restart từng S1–S6, kiểm `/ready`, hash, log và browser. Gameplay thật do tài khoản QA được ủy quyền thực hiện.

## Chốt dữ liệu còn thiếu trước khi gọi là chuẩn gốc

- Cúng tượng gốc đổi linh vật thành **Họa Linh Tệ 224**, không cộng Nguyên bảo/bạc. Config có pool/trọng số và dao động 9500–10500, nhưng **không có giá trị quy đổi cơ sở của 12 linh vật**. Công thức `quality × 100` của bản trước không có bằng chứng gốc.
- Vẽ: config có tỷ lệ hiển thị, mốc bảo đảm 100 và số thưởng may mắn; chưa có quy tắc backend gốc cho bảo đảm/bonus và đổi mảnh khi đã tối đa.
- Khách: số khách theo mỹ quan và wishlist 80% có mô tả; xác suất tặng manh mối theo cấp không có trong config client.
- Các nhánh thiếu dữ liệu không được tự gán tỷ lệ/phần thưởng rồi gọi là chuẩn gốc. Cần chốt cấu hình kinh tế hoặc nguồn server gốc trước nghiệm thu toàn bộ.

## Hướng dẫn test bằng tài khoản QA

Ghi lại server, tên nhân vật, giờ, cấp Họa Trung Các, ảnh túi/nguyên liệu trước và sau; test trên cùng server. Reload client sau khi phiên bản mới được triển khai. Không dùng tài khoản người chơi để thử nhận thưởng hàng loạt.

| Nhóm | Cách thử | Kết quả bắt buộc |
|---|---|---|
| Cúng tượng | Bấm 3 lượt miễn phí, thử lượt miễn phí thứ 4; sau đó 2 lượt trả phí và thử lượt 6 | Đúng giới hạn; phí đúng config; thưởng chỉ 224 khi bảng quy đổi đã được chốt; relog không hồi lượt |
| Bấm nhanh/lặp | Bấm liên tiếp cùng nút đang chờ; reconnect rồi mở lại | Không trả cùng quà hai lần; không trừ hai lần cho cùng request |
| Vẽ | 2 lượt miễn phí; vẽ 1 và nhiều lần khi đủ/thiếu bút | Số bút trừ bằng số lần; đủ số ô kết quả; thiếu bút không mất gì; không kẹt animation khi từ chối |
| Kích hoạt công trình | Thử thiếu rồi đủ số mảnh ghi trên UI | Thiếu không kích hoạt; đủ trừ đúng mảnh, chỉ kích hoạt một lần |
| Nâng công trình | Thử thiếu vật liệu; đủ; nâng tất cả với vật liệu đủ một phần | Chỉ nâng công trình đủ điều kiện; trừ đúng từng loại; không nhận lại mảnh đã tiêu |
| Tài nguyên | Thu lúc chưa đủ 5 phút; thu sau 5 phút; thu tiếp ngay; relog | Không tạo quà khi chưa có; thu đúng stock; không nhận lặp; giữ phần chu kỳ chưa đủ |
| Công trình đang nâng | Thử nâng lần nữa, tăng tốc, chờ hoàn tất | Không nhân cấp; tăng tốc đúng số giây; hoàn tất không tự sinh thêm nguyên liệu |
| Phong thủy | So sánh điểm 999 và 1000 ở fixture / nhân vật phù hợp | 999 cấp 1, 1000 cấp 2; server/client cùng mốc |
| Cầu phúc | Miễn phí đầu ngày; đổi lại; thiếu tiền; giữ buff hôm trước | Buff đúng config, đổi lại trừ phí; giữ chỉ buff hợp lệ; buff hết hạn qua ngày |
| Cộng hưởng | Chưa đủ bộ; đủ bộ; bấm lại | Chưa đủ bị chặn; đủ kích hoạt một lần, phần thưởng đúng config |
| Manh mối | Mở phần 1–4, thiếu mảnh, gọi lại phần cũ | Trừ 1 manh mối/part, nhận 10 mảnh theo config; không yêu cầu sở hữu công trình trước; không nhận lại part cũ |
| Khách | Nhận quà có sẵn rồi bấm lại/relog | Chỉ nhận đúng reward đã lưu, một lần/ngày; không có khách thì không trả quà giả |
| Thích | Thích A, lặp A, thích B; xem lượt nhận ở A | Chỉ một thưởng đầu ngày; mỗi đích một lần; lượt nhận thuộc người được thích |
| Hạng/thăm nhà | Mở hạng; chọn nhân vật khác; mã chia sẻ sai | Đúng nhân vật/server; không dữ liệu giả; mã sai báo lỗi |
| Đổi ngày | Giữ phiên qua 00:00 GMT+7 rồi mở lại; relog đối chiếu | Lượt ngày mới đồng bộ; không reset nhiều lần; buff cũ hết hiệu lực |

## Điều kiện dừng và khôi phục

- Dừng rollout nếu CAS source lệch, test kinh tế sai, server mất readiness hoặc xuất hiện lỗi handler mới.
- Sao lưu riêng file thay đổi; khôi phục atomic đúng hash bản trước và restart từng node đã tải code mới. Không import lại toàn bộ DB hoặc trừ thưởng lịch sử khi chưa có ledger đối chiếu.
- Kết quả triển khai/test thực tế sẽ được cập nhật bên dưới; bảng trên là tiêu chí nghiệm thu, chưa phải danh sách đã PASS.

## Candidate local và trạng thái production — 03/10/2026

- Candidate local đã thêm `HomelandMutationService` với CAS `homelandInfo/items/currencies`, receipt theo `requestId`, không publish draft khi save không xác nhận; sửa reset ngày, ngưỡng thuộc tính, chu kỳ thu, mốc mở đất theo cảnh giới, resonance/clue validation và callback guard client `lhs-homeland-guard-v1.js`.
- Fixture RAM-only PASS: giới hạn 2 lượt vẽ miễn phí, Cúng tượng fail-closed khi thiếu bảng quy đổi, CAS chỉ nhận một request đồng thời, save lỗi không ghi reward/cost. Tool: `_ai_workbench/tools/test_homeland_fix_candidate_20261003.js`.
- Precheck live lúc 03/10 13:11 ICT: S1–S6 online, `/ready` Mongo/Redis 6/6; source live vẫn là bản deploy cũ và **không khớp candidate local**. Không restart, không ghi player/DB trong follow-up này.
- **Chưa deploy candidate** vì `HomelandStatueConversionConfig` không tồn tại trong 718 bảng config live, Cozy/client Trung chỉ nêu ID224 và trọng số, không nêu số Họa Linh Tệ theo từng linh vật. Candidate cố ý trả `HOMELAND_STATUE_CONVERSION_PENDING` trước khi trừ lượt/Nguyên bảo; không dùng lại công thức `quality × 100` chưa có chứng cứ.
- Backup candidate local: `_ai_workbench/backups/homeland_followup_20261003_124149`. Muốn rollout cần bổ sung bảng quy đổi có kiểm chứng, rồi chạy lại fixture, deploy CAS/atomic + rolling restart S1–S6 và browser E2E bằng tài khoản QA được ủy quyền.
