# Danh sách ưu tiên sửa nốt sự kiện — 08/10/2026

Đối chiếu các báo cáo, biên bản triển khai và kết quả kiểm thử đã lưu ngày 07–08/10. Lượt lập danh sách này chưa kiểm tra lại production hoặc thay đổi gameplay. Dùng file này làm checklist hiện hành; các audit cũ là lịch sử. Không gán phần trăm vì chưa có trọng số công việc đã thống nhất.

## 1. Ba mục nên chốt trước

| Ưu tiên | Sự kiện | Phần đã có bằng chứng | Phần phải làm nốt |
|---|---|---|---|
| 1 | **Thiên Giáng Phúc Lộc — type52 / 52001** | Bản sửa đã triển khai; từng QA trực tiếp Talo/S1 claim, draw, relog và đọc DB. RAM 41 ca + 40 kiểm tra tích hợp; Mongo cô lập đạt đồng thời/CAS/replay/reset ngày. | Nghiệm thu chuỗi chơi trên bản hiện hành sau OldTrek rollout: relog → nhận nhiệm vụ → quay → thử lại request → callback/số dư/DB; chốt mốc bảo đảm và chuyển kỳ. Sau khi đạt mới duyệt mở public từng đợt. |
| 2 | **Hoang Cổ Mê Hàng — OldTrek** | Bản sửa lỗi lưu scoped-CAS v3 đã bật S1–S7; hash và readiness 7/7 đạt, cửa sổ hậu kiểm không phát hiện lỗi lưu mới. | Kiểm hành trình/checkpoint/giải event/kết thúc/relog, cargo và thưởng giữ đúng; tương tác cùng task/auto phải không hạ cấp/mất đồ. Theo dõi save conflict và độ trễ dưới tải thực. Đây là mục chốt lỗi lưu, chưa khẳng định toàn bộ mini-game đã hoàn chỉnh. |
| 3 | **Lô hỏa đan tâm — type37 / 37001** | Handler luyện/quay/nhận mốc đã triển khai, 10 tình huống tích hợp và 8 client đạt. | Xác minh nguồn nguyên liệu 154/155/156 từ hoạt động thật; kiểm giao dịch native và lưu/relog/replay/thưởng. Mẫu QA cũ thiếu nguyên liệu; chưa chứng minh producer155/156 hoạt động, nên chưa coi chỉ còn một bước bấm thử. |

### Checklist chốt Phúc Lộc

- [ ] Sau relog trên bản hiện hành, năm nhiệm vụ vẫn đúng; nhiệm vụ đã nhận không cấp lại cùng ngày/kỳ.
- [ ] Quay trừ đúng233, quà/điểm đúng; mất ACK hoặc request trùng không trừ/cấp lần hai; client kết thúc loading/animation ở nhánh thành công và lỗi.
- [ ] Mốc bảo đảm/multiplier, reset ngày và chuyển kỳ đúng; tách rõ ca mô phỏng với ca chơi thật.
- [ ] Read-back raw task, ledger, receipt, vật phẩm và tiến độ; nguồn thay đổi item233 có đủ dấu vết (audit cũ khớp shop3+7 nhưng chưa xác định timeline).
- [ ] Sau nghiệm thu, cập nhật phiên bản được duyệt mở public, triển khai có backup/CAS rồi đối chiếu đủ S1–S7.

### Checklist chốt lỗi lưu OldTrek

- [ ] Hành trình → checkpoint7008 → xử lý encounter7002 → kết thúc7005 → relog giữ tiến độ/cargo/thưởng.
- [ ] Task/tăng cấp/auto đồng thời giữ tiến độ; cùng request/event/chuyến không nhận lại thưởng.
- [ ] Khi có xung đột thật, client phục hồi trạng thái đúng; save chưa xác nhận không báo thành công.
- [ ] Đủ S1–S7 dùng đúng flag/source, log sau thao tác và độ trễ không phát sinh lỗi do bản sửa.

## 2. Sửa được một phần, chưa xếp gần hoàn thiện toàn sự kiện

| Sự kiện | Đã có | Việc còn thiếu |
|---|---|---|
| **Hộp báu Khí Vận — type49 / 49001** | Đổi quà module2 đã triển khai, có chống lặp/CAS. | Bàn mở hộp module0/1 vẫn khóa vì thiếu luật bàn/boss. Kiểm nguồn nhiệm vụ72101–72105 và nguyên liệu210/211/212; mẫu QA cũ không có task. Có thể chốt riêng đổi quà, chưa gọi cả event sắp xong. |
| **Bí bảo Thiên Cơ — type30 / 30001** | Candidate đăng ký, đọc trạng thái, xếp hạng/kết toán; Mongo thật cô lập ngày07/10 đã PASS. | Chốt cohort và múi giờ/cutoff theo runtime, nối nhiệm vụ đã hoàn thành từ server, handler1760–1763, scheduler owner và phát thư bền vững; nghiệm thu toàn luồng trước deploy/mở. |
| **Đào bảo Tinh Cung — type21 / 21001** | Candidate xác thực/receipt/CAS, kiểm thử tích hợp. | Thiếu luật RNG/vận mệnh được xác minh; cần hoàn chỉnh xúc xắc/ô/thưởng/mốc, lưu và callback. Vẫn bảo trì. |
| **Chọn 1 Trong Quà — type27 / 27001** | Candidate bảo vệ input/receipt/CAS. | Thiếu contract bàn củ cải/boss/tầng; không thể dùng index ô làm kết quả thưởng. Vẫn bảo trì. |
| **Họa Trung Các — Homeland** | Guard lưu dữ liệu và các kiểm tra tĩnh; nhánh Cúng tượng đang khóa khi thiếu cấu hình. | Nguồn quy đổi tượng, gameplay vẽ/cầu phúc/công trình, thăm nhà/rank/share và replay/relog. |
| **Thiên Hạ Đệ Nhất Luận Đạo — TopArena** | Gate router16 tag đã kiểm; event khóa sau rollback. | Sửa nguyên nhân rollout hỏng đăng nhập; phase/roster/chiến đấu/vé/dự đoán/pass và kết toán thư. Làm cuối sau kiểm login/client. |

## 3. Đã có bản sửa trước, đưa vào hồi quy

- **Yêu Vương:** đã có bản sửa tiến độ và kiểm124 mốc tới172; kiểm lại thắng/thua/claim/càn quét/nhiệm vụ/relog khi thay handler chung.
- **Đại hội câu cá / Ngư trường / Chai trôi:** đã có release và bằng chứng hồi quy trước; kiểm bản server/client hiện hành và settlement. Không suy ra lỗi live từ test trộn snapshot/config cũ.
- **Fortune, Kim Mã, Võ Đạo Hội, Đỉnh Phong Diễn Võ/CrossArena và CrossRival:** bảo toàn các bản đang chạy và biên bản kết toán đã kiểm; phát sinh lỗi mới phải chỉ rõ request/receipt/log. Không khẳng định toàn bộ mọi mùa giải đã đạt100%.

## 4. Quy tắc thực hiện để tránh trạng thái chồng chéo

Thứ tự chốt: **Phúc Lộc → lỗi lưu OldTrek → Lô hỏa đan tâm → phần đổi quà Hộp báu → Bí bảo Thiên Cơ → các event còn thiếu luật → TopArena**. Rủi ro đang gây gián đoạn phiên được xử lý trước khi mở thêm event.

Mỗi mục chỉ chuyển sang hoàn tất khi có thao tác hợp lệ/không hợp lệ, cost/reward, chống lặp, lưu/relog, ngày/kỳ và client phù hợp; phát hành đối chiếu source/config/flags trên đủ7 node. Readiness chỉ chứng minh khả năng sẵn sàng phục vụ. Giữ lịch/tiến độ/quyền lợi đã lưu trong mọi đợt.

Đính chính phạm vi kiểm thử: Fulu Mongo ngày08/10 dùng **7 role synthetic mang serverId1001–1007 trong một DB QA và một tiến trình kiểm thử**; đây không phải7 phiên WebSocket gameplay trên7 game node. Đã dọn7 role, productionPlayerWrites=0.

Đính chính Type30: `runtime_candidate/mongo-repository-result.json` chứng minh Mongo7.0.43 thật, index,12 writer, DB-clock cutoff, server isolation và14 mail/marker đúng một lần ngày07/10; cleanup sạch. Dòng audit08/10 “Mongo chưa chạy” chỉ là lần harness mới lỗi đường dẫn, không phủ nhận kết quả này. Vẫn chưa đạt gameplay/runtime integration.

## 5. Bằng chứng chính

- Phúc Lộc: `temp/event_goal_20261007/phase_ab/release.json`, `fulu/qa/`, `fulu/mongo_20261008/remote_mongo_result.json`.
- OldTrek: `temp/event_goal_20261008/oldtrek_rollout.json` và candidate test-scoped/test-handler.
- Lô hỏa/Hộp báu: `temp/event_goal_20261007/draws/release/receipt.json`, `draws/report.md`, `draws/native_qa_access.md`.
- Bí bảo: `temp/event_goal_20261007/secret_treasure/runtime_candidate/mongo-repository-result.json`.
- Kế hoạch chi tiết: `reports/event_fix_plan_20261007.md`; diễn biến: `reports/session_report.md`. Các đường dẫn trên tương đối với `_ai_workbench/`.
