# Sửa 5 thiếu sót pet — 18/10/2026

Hậu kiểm native sau deploy: xem `pet_live_qa_20261018.md`. Đã xác minh giao dịch/lưu thật nhưng tìm thêm lỗi giá preview giữ nhịp tăng tốc cũ; không dùng kết quả fixture PASS bên dưới để kết luận UI đã hoàn thiện.

## Kết quả

Đã triển khai `20261018_pet_followup_v1`, trạng thái `DEPLOYED_VERIFIED`, toàn bộ S1–S9 dùng chung source. Bản mới chỉ thay 4 file; không migration hoặc ghi trực tiếp dữ liệu người chơi.

1. **Auto ghép lặp vô hạn sau lỗi phiên/lưu:** server trả mã lỗi và `requiresReconnect`; client dừng, yêu cầu đăng nhập lại. Giữ requestId đang chờ để đối chiếu receipt nếu lần lưu thực tế đã commit. Lỗi mạng tạm thời chỉ thử lại tối đa 3 lần, giữ cùng requestId. Không trả `retryable:false` cho lỗi lưu không rõ kết quả vì client cũ có thể xóa mã giao dịch.
2. **Phí nâng nhiều cấp sai:** cộng đúng giá từng cấp theo bảng cấu hình server, tự chọn số cấp có thể mua bằng nguyên liệu hiện tại. Ví dụ Q10 cấp21 nâng5 cần21.050; có20.000 chỉ nâng4 với16.480. Nhãn giá và payload dùng cùng phép tính.
3. **Hiệu ứng thành công trước ACK:** PetDetailView chỉ chạy hiệu ứng sau phản hồi thành công. Đóng/mở lại cửa sổ không nhận hoạt ảnh từ lượt cũ.
4. **Giữ nút gây dồn request:** mỗi PetModel chỉ có một yêu cầu nâng đang chờ. Lỗi chắc chắn dừng lần giữ nút; chạm mới có thể thử lại. Timeout15 giây/lưu không rõ kết quả/phản hồi sai cấu trúc chặn gửi tiếp đến khi có snapshot đăng nhập mới, không tự lặp giao dịch nâng cấp.
5. **Thông báo đầy ô che lý do khác:** kết quả auto ghép có thể đồng thời nêu đầy ô, EXP vượt giới hạn và thiếu nguyên liệu, thay vì chỉ hiện một thông báo đầy ô.

Chính sách manual ăn EXP bỏ dư và auto bảo toàn EXP của bản trước được giữ. Không đưa lại phần quét batch Hư Thiên Bảo Điện đã rollback.

## File chính

- VPS `/linhhoasu/lhs/newServer/src/handlers/pet.js`: mã lỗi auto/session/save.
- VPS `/linhhoasu/webgame/game/js/lhs-pet-grid48-v1.js`: dừng/retry/giữ intent/thông báo.
- VPS `/linhhoasu/webgame/game/js/lhs-pet-safety-v1.js`: phí, giới hạn request và ACK/lifecycle của nâng cấp.
- VPS `/linhhoasu/webgame/game/index.html`: cache addon `20261018_pet_auto_notice_v5` và `20261018_pet_safety_v2`.
- Snapshot local: `_ai_workbench/temp/pet_followup_20261018/{baseline,candidate}/`; đây là bản lấy từ VPS, không dùng cây source local cũ làm baseline.

## Kiểm chứng

- `test_pet_followup_20261018.js`: **12/12 nhóm PASS**, gồm phí/cap/thiếu tiền, giữ nút, ACK chậm, từ chối, timeout, đóng/mở view, lỗi save/transport, dừng auto và replay cùng intent, đủ lý do dừng, hồi quy guard9route và recipient trang bị.
- `test_pet_followup_server_20261018.py`: **24/24 nhóm PASS** với binary config hiện tại trên VPS, FeatureReceiptService và PlayerMutationService thật; persistence giả lập trong RAM. Kiểm tra trước/sau commit chưa rõ kết quả, cùng intent không tiêu hai lần, hatching/EXP/board48 và các nhánh ghép cũ. NetworkAttempts0, productionWrites0. Đây không phải test ghi Mongo thật.
- Syntax gate và hash candidate khớp receipt kiểm thử trước deploy.
- Backup chọn lọc, CAS trước thay, swap atomic từng file; launcher có khôi phục preimage và restart nếu rollout lỗi sau swap.
- Restart tuần tự S1–S9, readiness Mongo/Redis **9/9**, PID/restart đúng, PM2save; process ngoài phạm vi thay đổi **0**. Read-back hash4file và HTTPS3file đạt.
- Browser tab đã reload; resource inventory xác nhận tải hai addon với cache version mới. Trước reload ở màn đăng nhập, sau reload loader kết thúc; console mẫu chỉ thấy trình duyệt chặn tự phát âm thanh. Không dùng truy cập window globals qua DOM snapshot làm bằng chứng addon đã cài hook; chưa có native authenticated pet E2E.

## Bằng chứng và khôi phục

- Receipt: `_ai_workbench/temp/pet_followup_20261018/{tests,server-tests,deployment}.json`.
- Công cụ: `_ai_workbench/tools/deploy_pet_followup_20261018.py`.
- Backup VPS: `/linhhoasu/_ai_workbench/backups/pet_followup_20261018_000156`, có exact preimages và deployment receipt.
- Khi rollback: chỉ phục hồi 4 preimage nếu live hash còn khớp release này, rồi restart tuần tự S1–S9 và kiểm tra `/ready`, PM2save. Không phục hồi DB/player.
- Còn thiếu: nâng/ghép bằng UI native với tài khoản đã đăng nhập, kiểm tra hiển thị thực tế và đối chiếu giao dịch lưu thật; chưa tiêu pet/nguyên liệu của người chơi để test. Tab client cũ cần tải lại.
