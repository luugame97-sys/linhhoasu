# Kiểm tra auto câu cá khi ra map train quái — 07/09/2026

## 1. Tóm tắt công việc

Yêu cầu: kiểm tra auto câu cá có tiếp tục sau khi rời màn câu cá ra map đánh quái hay không. Đây là phiên chẩn đoán, không được yêu cầu sửa hành vi.

Kết luận theo source hiện tại đã đối chiếu VPS và kiểm thử các hàm thật: **có tiếp tục, nếu bấm nút quay lại khi auto đang bật và phiên game vẫn online**. Nhánh này ẩn màn câu cá nhưng giữ bộ điều khiển, phòng câu và timer. Map thường/đánh quái có vòng cập nhật riêng, không xóa vòng câu cá.

Đây không phải auto offline phía server: đóng game, mất kết nối hoặc reconnect sẽ không tự duy trì chuỗi câu. Nhãn auto đang bật cũng không đảm bảo luôn phát lượt mới nếu còn cá chờ xử lý thủ công.

Không sửa source/config, không deploy/restart, không nhận thưởng/bán cá bằng tài khoản thật, không ghi DB người chơi.

## 2. File/thư mục đã thay đổi

Chỉ tạo tool và báo cáo trong `_ai_workbench/`:

- `tools/inspect_fishing_background_20260907.js`: trích xuất có giới hạn các hàm thật từ bundle bằng parser, không dump toàn bộ bundle.
- `tools/check_fishing_background_live_20260907.py`: đọc hash 11 file liên quan trên VPS, health/PID; không ghi remote.
- `tools/test_fishing_background_client_20260907.js`: 12 ca với hàm client thật, bộ timer/RPC giả lập cô lập và không truy cập mạng.
- `tools/test_fishing_background_server_20260907.js`: 4 ca tích hợp handler thật, lưu trong bộ nhớ, cấm socket ra ngoài.
- `temp/fishing_background_audit_20260907/`: `client-methods.json`, `client-tests.json`, `server-tests.json`, `live-hashes.json`.
- `reports/fishing_background_audit_20260907.md/.html` và cập nhật `reports/session_report.md/.html`.
- Backup báo cáo cũ: `backups/fishing_background_audit_reports_20260907/`.

Source đã đọc, không chỉnh: main client, fish/basic/raid handlers, WSServer, FishingAutoService, FishingRoomService, FishingEventService và FishingGameplayService.

## 3. Lỗi đã gặp & giải pháp

| Vấn đề | Bằng chứng/nguyên nhân | Kết quả xử lý | Cách tránh kết luận sai |
|---|---|---|---|
| Dễ nhầm đóng màn câu cá với tắt auto | Nút quay lại kiểm isAutoFish; true gọi backExit, false gọi RPC4051 | Xác minh hai nhánh bằng hàm thật | Không suy từ việc nhân vật/hoạt ảnh câu cá biến mất |
| Dễ nhầm auto xử lý cá với auto offline | FishingAutoService chỉ lập kế hoạch trang bị/bán; chuỗi phát lượt nằm ở client | Đối chiếu callback4000 → timer →4008 → lượt4000 mới | Không hứa tiếp tục khi tắt app/mất mạng |
| Có thể thấy auto bật nhưng không có lượt mới | Bộ lọc giữ cá cần xử lý; auto thường có thể giữ cờ bật khi cá còn chờ | Negative test xác nhận không phát lượt tiếp | Kiểm lượt/UID/tiêu hao, không chỉ icon trạng thái |
| Index local/VPS khác hash | Chỉ khác CRLF/LF; nội dung chuẩn hóa giống nhau | Ghi rõ10/11 hash khớp, index tương đương nội dung; không tự ghi đè | Phân biệt sai khác logic với dòng kết thúc |
| Cảnh báo Mongoose isNew trong fixture | Schema hiện hành dùng tên reserved | Ghi nhận warning; test vẫn PASS, không sửa schema ngoài phạm vi | Không gọi warning là lỗi auto hoặc báo log sạch hoàn toàn |

Không có bằng chứng mojibake mới và không chuyển mã file nào.

### Bằng chứng luồng client

- `FishMainPanel.onClick`, offset766545: nhấn returnBtn đóng panel; nếu isAutoFish=true gọi `RaidMgr.mFishRaid.backExit()`, nếu false mới gọi `cs_fish_map_leave()`.
- `FishMapRaid.backExit`, offset1703591: chỉ RemoveAllEntity và đặt fishMainView=null; không xóa mFishRaid, không hủy timer.
- `FishMapRaid.startFishing`, offset1704803: gọi hoạt ảnh chỉ khi có entity, nhưng luôn tạo timer hoàn tất lượt. Vì vậy không có entity vẫn có callback tiếp tục.
- `FishingModel.sendFishing`, offset4592818: sau ACK4000 và timer, nếu auto=true thì câu tiếp khi hụt hoặc xử lý cá rồi tiếp tục.
- `sendAutoPowerFish`, offset4598045: cập nhật state từ ACK4008; khi không có cá giữ lại và auto=true thì doNext(startAutoFish). Hiệu ứng bị bỏ qua nếu panel không còn, không bỏ phần cập nhật state/lượt tiếp.
- `RaidMgr.UpdateTime`, offset7276454: cập nhật map thường, battle, fish riêng. Nhánh đổi map thường không xóa mFishRaid.
- `reconnectSuccess`, offset4590298: tắt auto, tăng generation, hủy hiệu lực callback cũ.
- `isNeedSlientMode`, offset4611089: phân biệt ngoài màn câu cá để giảm hiển thị thưởng, không tự tắt auto.

### Bằng chứng luồng server

- `handlers/basic.js::handleEnterMap`: đặt session._mapId và vị trí map thường; không đổi fishInfo.scene hoặc phòng câu.
- `handlers/fish.js::handleFishCatch`: kiểm count, cá đang chờ, cooldown, ngư trường hợp lệ và Đùi Gà. Không yêu cầu giao diện câu cá phải mở hay map thường phải trùng ngư trường.
- `handleFishLeaveMap` chỉ khi có RPC4051 mới giải phóng phòng và đặt fishInfo.scene=1. Nút quay lại khi đang auto không gửi RPC này.
- Heartbeat phía server hồi năng lượng/đồng bộ/kết toán sự kiện; không tự gọi phát lượt câu mới.

## 4. Kỹ năng / kinh nghiệm mới

- Tách ba trạng thái: ẩn panel, rời phòng câu thật sự, và ngắt kết nối game. Chúng không tương đương.
- Sự tồn tại của controller/timer quyết định auto tiếp tục; sự tồn tại của entity/hoạt ảnh chỉ quyết định phần vẽ.
- Auto-power và auto bán thường có nhánh callback khác nhau; đã kiểm cả hai, gồm trường hợp đóng panel trước ACK lượt đầu.
- Tính năng online phía client có thể bị trình duyệt/điện thoại hạn chế khi khóa màn hình hoặc đưa app nền. Phiên này không kiểm thiết bị vật lý và không cam kết hành vi đó.

## 5. Trạng thái hiện tại

### Đã kiểm chứng

- Live read-only lúc10:17:16 GMT+7:10/11 file khớp SHA-256; index chỉ khác kết thúc dòng và nội dung chuẩn hóa khớp.
- Main client SHA-256: `2cc9a3811fd61cc421c3ce240982aae84582593e38d5d8c679a7a2af8c9d6c42`; test trích đúng bundle này.
-12 ca client PASS: quay lại không leave/hủy timer; auto-power3chu kỳ mới khi ẩn; auto bán thường3chu kỳ; hụt vẫn tiếp tục; đổi map/battle tick vẫn còn controller; tắt auto+leave; reconnect; hết năng lượng; cá giữ; bộ lọc; silentmode; server error.
-4 ca server PASS: serverId1001 và1002 vào map10001 trong khi vẫn ở ngư trường101; mỗi bên3lượt câu, tiêu3Đùi Gà, UID tăng và room được giữ; heartbeat riêng không tự câu; leave4051 giải phóng phòng.
- S1/S2 ready HTTP200; chỉ đọc trạng thái, không restart. Source, config và tiền/quà không thay đổi.

### Giới hạn bằng chứng

- Chưa quan sát trực tiếp tài khoản người dùng hoặc packet đang phát từ phiên game của họ. Kết luận về cơ chế hiện tại, không chứng nhận rằng một tài khoản cụ thể đang câu tại thời điểm hỏi.
- Client test chạy hàm thật với timer/RPC/metadata hoạt ảnh giả lập; server test dùng session và lưu trong bộ nhớ. Đây không phải native UI E2E hoặc cuộc đánh quái thật.
- Không thử đóng app, tắt trình duyệt, khóa điện thoại hoặc background throttling. Khi reconnect, code xác nhận auto bị tắt.

## 6. Bước tiếp theo

1. Khi muốn vừa train vừa câu: bật auto trong ngư trường, dùng nút quay lại, giữ game kết nối. Đảm bảo còn Đùi Gà và không có cá chờ xử lý.
2. Nếu thực tế một tài khoản không tăng lượt: ghi rõ auto thường hay auto theo lực chiến, có thông báo giữ cá/hết Đùi Gà hay không, và có reconnect không; đối chiếu lượt câu/tiêu hao trước-sau, không chỉ nhìn trạng thái nút.
3. Chỉ triển khai thay đổi nếu người dùng yêu cầu sửa. Auto offline/tiếp tục sau mất mạng là phạm vi khác, chưa thực hiện trong phiên này.
