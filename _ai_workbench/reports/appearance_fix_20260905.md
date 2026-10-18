# Fix triệt để ngoại quan — 05/09/2026

## 1. Tóm tắt công việc

- Hợp nhất đường cấp ngoại quan cho nạp gói, giftcode, sự kiện, shop, dùng item và nhận mail.
- Khi ID trùng `FashionConfig` và collection gameplay, server cấp đồng thời quyền hiển thị Fashion và object native của pháp trận, thú cưỡi, pháp bảo hoặc pháp tướng.
- Danh hiệu có thời hạn được lưu `fashionData.limitValues[10]` bằng epoch server; nhận thêm gia hạn nối tiếp thời gian còn lại.
- Sửa 59 suit: item mở component, mặc đúng component, đổi màu có ownership/cost, nâng sao tuần tự có cost/cap và `dress` đúng schema array.
- Chặn mặc ID chưa sở hữu, client khai hết hạn giả, màu/sao giả và emoji group không có config.
- Repair 150 người S1 có state lệch; S2 không có người cần repair. Audit sau repair còn 0.

## 2. File/thư mục đã thay đổi

### Source chính

- `src/services/RoleAppearanceService.js`
- `src/services/RewardGrantService.js`
- `src/services/FormationService.js`
- `src/handlers/spirit.js`
- `src/handlers/item.js`
- `src/handlers/mail.js`
- `src/handlers/activity.js`
- `src/handlers/fashion.js`
- `src/handlers/official-compat.js`
- `src/handlers/playerPayload.js`
- `src/handlers/recharge.js`
- `src/handlers/compat.js`

### Tool/evidence hỗ trợ

- Tool test/deploy/repair/QA đặt trong `_ai_workbench/tools/`.
- Evidence deploy: `_ai_workbench/temp/appearance_fix_deploy_20260905_002742.json`.
- Hậu kiểm độc lập: `_ai_workbench/temp/appearance_fix_postdeploy_20260905_003433.json`.
- Audit runtime sạch: `_ai_workbench/temp/appearance_runtime_audit_20260905_003105.json`.
- Health cuối: `_ai_workbench/temp/appearance_postdeploy_health_20260905_003329.json`.

### Backup production

- `/linhhoasu/_ai_workbench/backups/appearance_fix_20260905_002742/` — khoảng 95 MB.
- Có 12 source trước sửa, `mongodump` collection `players` S1/S2 và preimage 150 player trước repair.

## 3. Lỗi đã gặp & giải pháp

| Lỗi | Nguyên nhân | Cách xử lý | Cách tránh lặp lại |
|---|---|---|---|
| Nhận gói/code nhưng chỉ sáng hình, không có tính năng native | ID tồn tại đồng thời trong Fashion và collection; router xét Fashion trước | Native thắng route, sau đó cấp thêm Fashion hiển thị | Mọi kênh phải gọi một router chung và test cả hai lớp |
| Danh hiệu thời hạn không kích hoạt chuẩn | Unlock chỉ ghi ownership, thiếu `fashionData.limitValues` | Tạo expiry server-authoritative và gia hạn từ `max(now, expiry)` | Contract mọi Fashion có condition 10 |
| Suit ID bị ghi vào slot type 1 | `handleChangeSuit` mặc chính suit ID thay vì component | Resolve component theo đúng bảng từng loại suit | Test dùng item → mặc → relog cho toàn bộ suit |
| Đổi màu/nâng sao không tốn nguyên liệu | Server tin tham số client | Kiểm config, ownership, bước kế tiếp, cost, cap; trừ và sync item | Không dùng client làm nguồn authority |
| Client xóa Fashion vĩnh viễn qua tag 1811 | Handler tin danh sách ID client gửi | Bỏ qua danh sách client; tự tính expiry từ timestamp server | Expiry chỉ do server quyết định |
| Giftcode có nguy cơ grant lặp nếu cập nhật thống kê code lỗi | Thống kê code và snapshot player lưu khác thời điểm | Lưu reward + per-player ledger trước; lỗi aggregate không biến thành retry grant | Ledger người chơi là nguồn chống trùng chính |
| Deploy lần 1 rollback dù code/E2E đã PASS | Gate đợi bot 580/580 hết 720 giây khi S1 còn 565 | Rollback byte-for-byte; deploy v2 tách bot reconnect khỏi gate mutation | Bot reconnect là hậu kiểm dài, không dùng làm nguyên nhân rollback source tốt |
| Repair khi player online có thể bị snapshot cũ ghi đè | Session game còn chạy trong lúc DB update | Dừng riêng S1/S2, repair có preimage rồi khởi động lại | Mutation player phải có maintenance window ngắn |
| Contract giftcode cũ báo bộ thời trang rỗng | Test chỉ đếm item/native cũ, không đếm Fashion | Bổ sung `fashion/formations/spirits` vào assertion | Test contract phải theo schema reward hiện hành |

## 4. Kỹ năng / kinh nghiệm mới

- Ngoại quan overlap phải cấp hai lớp: collection gameplay trước, Fashion hiển thị sau.
- Reward response và packet sync phải cùng dùng một `rewardInfo`; đặc biệt giftcode ngoại quan không được chỉ gửi `1202` item.
- Repair native phải dùng helper thật để tạo UID/default attrs, không tự chắp object gần đúng.
- Preimage từng player phải ghi ra file trước mỗi update, ngoài full `mongodump`.

## 5. Trạng thái hiện tại

- Contract ngoại quan: **2.192 ID**, lỗi 0; 234 assertion.
- Suit: 56 item dùng/mặc, 37 biến thể màu gửi được và 54 bước nâng sao PASS.
- E2E S1: 45 check gồm nạp gói `11000003`, giftcode, mail, title thời hạn, pháp trận/thú cưỡi/pháp bảo/pháp tướng, suit, duplicate, relog và cleanup.
- S2 dùng cùng source/config: full contract 2.192 ID PASS; entry vẫn theo lịch mở S2.
- Repair S1: 150 người, gồm 18 pháp trận, 93 thú cưỡi, 128 pháp bảo, 32 pháp tướng và 23 slot suit; verify còn 0. S2: 0 → 0.
- Runtime audit độc lập: S1 1.769 player/609 người thật, issue 0; S2 581/1, issue 0.
- 12/12 hash source production khớp candidate.
- PM2 online; `/ready` S1/S2 đều HTTP 200.
- Bot S1/S2 580/580; quái 2.466 slot/server, hệ số ×2, invalid 0.
- Log lỗi S1/S2 rỗng; QA player/code/mail residue bằng 0.
- Regression PASS: Activity 7 58 assertion, Activity 9, event 43/44, core 714 bảng, Ủy thác/auto-equip, bot combat, quái ×2, guide và Tĩnh lặng.

## 6. Bước tiếp theo

1. Người chơi đang online lúc maintenance nên đăng nhập lại để tải state ngoại quan đã repair.
2. Test thực tế một gói nạp và một giftcode có ngoại quan trên tài khoản người chơi; không cần phát bù lại các ID đã repair.
3. Tiếp tục test hiển thị native 309 ID asset trong atlas theo danh sách audit trước; phần này độc lập với lỗi kích hoạt đã sửa.
