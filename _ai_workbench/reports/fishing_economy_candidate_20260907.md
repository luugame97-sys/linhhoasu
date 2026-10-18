# Session Report — Bản thử kinh tế câu cá

## 1. Tóm tắt công việc

Dừng theo tin nhắn “ok r” của người dùng. Đã tạo và kiểm thử candidate, **chưa deploy production**.

Thiết kế: bán cá mới câu trong ngư trường sự kiện có20% nhận1–3 Tiền đồng119; Huyền Vũ+25% có lưu phần lẻ; hết kỳ đổi1 tiền thành1.000 Bạc. Túi94501 mở quà theo bảng riêng, tự mở quà mới và cho dùng túi tồn tối đa100/lần. Năm gói11001401–11001405 và BXH6006: Nguyên bảo x1.000, vé tăng tốc x10.000, giữ giá/lượt/quà khác.

## 2. File/thư mục đã thay đổi

Chỉ candidate `_ai_workbench/temp/fishing_economy_20260907/`: thêm FishingEconomyService.js/fishingEconomy.json; sửa handler item/raid/fish/playerPayload và FishingGameplayService/FishingEventService. Sinh server.bin/client.bin/lang.bin. Tools build/test/stage trong `_ai_workbench/tools/`. Baseline `temp/fishing_audit_20260906T212212Z/`. Staging VPS `/linhhoasu/_ai_workbench/temp/fishing_economy_20260907/`.

Không thay source/config đang chạy, không restart game, không dùng item hoặc thay ví người thật trong đợt candidate này.

## 3. Lỗi đã gặp & giải pháp

| Lỗi | Nguyên nhân | Cách xử lý | Chống lặp |
|---|---|---|---|
|119 chỉ hiện/tiêu, không cấp|Thiếu reward implementation|Candidate đánh dấu nguồn cá server-side, roll khi bán|Không đem cá cũ vào event để farm|
|94501 không mở|Type99 thiếu use config/pool|Candidate auto-expand và handler dùng túi tồn|Save fail/replay/concurrency tests|
|Patch nhiều file thất bại|Đoạn require khác baseline|Đọc source hiện hành rồi patch đúng|Không bỏ guard khi context khác|
|Build ngôn ngữ lâu|Encode lại bảng lớn|Chờ kết quả và kiểm roundtrip|Không publish artifact chưa xong|

## 4. Kỹ năng / kinh nghiệm mới

Nguồn cá và tiền sự kiện là state server; không tin dữ liệu client. Cửa hàng119 phải giới hạn theo kỳ, không chỉ kiểm tiền. Bản config client/server phải cùng phần thưởng; không nhân giá thanh toán. Tỷ lệ quà94501 là custom, không phải bảng Trung chính thức.

## 5. Trạng thái hiện tại

22 nhóm kiểm thử local và Linux staging PASS; core staging PASS. Kiểm mở66 túi, concurrent/retry/savefail, normal/auto sale, bonus25%, cuối kỳ, shop119, payout BXH và resolver gói. Config714 bảng mỗi bản roundtrip PASS, thay đúng4 bảng; ngôn ngữ đổi2 mô tả. Staging kiểm thấy S1/S2 dùng config mặc định (không có CONFIG_BIN_PATH).

Chưa triển khai, chưa QA native end-to-end trên tài khoản test, chưa nghiệm thu UI mở túi hoặc sự kiện cuối kỳ. Không tuyên bố tính năng đã có trên live.

## 6. Bước tiếp theo

Chỉ tiếp tục khi người dùng yêu cầu: kiểm drift source/config runtime, kiểm lại candidate và native UI, bổ sung E2E test account được phép, backup/rollback trước deploy. Chưa sửa file index/cache token hoặc publish config; không chạy lại roll/claim trên người chơi để kiểm thử.
