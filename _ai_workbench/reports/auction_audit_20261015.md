# Audit Thiên Vận đấu giá — 15/10/2026

## Kết luận

- Đã triển khai backend đấu giá hệ thống và catalog được người dùng phê duyệt. Hậu kiểm `2026-10-15T05:37:25Z` (12:37 ICT): S1 có đúng 5 lô; S2–S8 chưa tới cửa sổ event theo tuổi server nên có 0 lô. 8/8 node online, Mongo/Redis ready, 10/10 file đúng hash, không thấy lỗi `[Auction]` sau restart trong phần log đã kiểm tra.
- Giờ Việt Nam: 12:00 lên kệ, 20:00–22:00 đấu, có bid trong phút cuối thì hạn kết thúc là `now + 60s`. Helper client tên `getGMT8*` nhưng mã live dùng offset `-420` (GMT+7); không suy timezone từ tên hàm. Timestamp client là mili-giây. Lịch toàn event được tính bằng `GameServer.openTime` native suy ra từ `serverRunDay`, không lấy trực tiếp timestamp mở server.
- Catalog system-only: 5 món, khởi điểm 3978 token `1001`, mua ngay 10000, bước tăng tối thiểu 6% làm tròn lên. Ký gửi/thu hồi của player tiếp tục đóng. Không tạo tài khoản game hay dùng tiền/vật phẩm người chơi thật để thử.
- Kiểm thử offline 29 nhóm và tích hợp Mongo thật 8 nhóm PASS. Chưa có native E2E qua hai tài khoản QA được ủy quyền; không tuyên bố tuyệt đối không còn bug.

### Audit ban đầu, trước sửa

- Ảnh `06:45:43` ICT chụp trước giờ mở; danh sách trống lúc đó chưa chứng minh UI lỗi. Nhưng backend cũ thiếu luồng kinh tế/settlement; tại `2026-10-15T00:02:30Z` cả 8 DB chưa có legacy auction rows. Tám node vẫn ready: lỗi logic/dữ liệu, không phải outage hạ tầng.

## Bằng chứng chính

- Live `AuctionBaseConfig`: `openDay=1..7`, `openTime=[43200,79200]`, `stopOnShelf=3600`, `onShelfLimit=5`, `bidLimit=10`, `delay=60`, `dealCD=30`.
- Live handler `/linhhoasu/lhs/newServer/src/handlers/auction.js` lưu `records/auctions/deals` bên trong `session.player.auctionInfo`; `5100` chỉ trả dữ liệu của player hiện tại.
- `5102` tìm món trong chính `player.auctionInfo.auctions`; không có repository/broadcast dùng chung, không trừ tiền người đấu, không hoàn tiền người bị vượt giá và không có settlement đưa món vào `deals`.
- `5101` chỉ trả `5105` cho socket hiện tại; client live chờ push `5104` để cập nhật trạng thái đấu giá. Đây là thiếu broadcast/settlement, không phải bằng chứng rằng các số tag RPC và push phải khác nhau.
- Client map push `5101→onAuctionAddRecord`, `5102→onAuctionOnShelfItem`, `5103→onAuctionOffShelfItem`, `5104→onUpdateAuctionInfo`, `5105→onAuctionOnshelfItemsUpdate`; handler cũ không phát các push dùng chung cần thiết.
- Handler không đọc `AuctionBaseConfig`, không tự tạo vòng hàng lúc 12:00, không enforce server-side giờ mở, khoảng công khai/đấu, giới hạn 5 món/10 món, giá hoặc bước tăng. Bot scripts live không có luồng `5101/5102/5111`.
- Client live truyền `artifact.uid` vào trường `count` khi niêm yết/thu hồi; handler dùng trường này như số lượng item và chỉ kiểm `player.items[itemId]`. Đây là lệch contract có thể làm sai số lượng hoặc không trừ thần binh authoritative.
- Harness RAM-only trên đúng handler live (mock `savePlayer`, không DB write) tái hiện đường thu hồi giả có thể cộng vàng khi không có item authoritative; đường bid cũ cũng không trừ tiền/không có escrow. Đây là bằng chứng từ mã và harness, không phải giao dịch player thật.

## Hướng xử lý đề xuất

1. Chốt mô hình: đấu giá dùng chung theo từng server hay cross-server; không tiếp tục dùng `auctionInfo` per-player làm sổ cái chung.
2. Tạo repository/collection đấu giá dùng chung, ID toàn cục và `cycleKey`; seed vòng mới idempotent lúc 12:00 hoặc khi request đầu tiên sau 12:00.
3. Enforce server-side các phase theo đúng múi giờ của helper native: đóng, 12:00–20:00 công khai, 20:00–21:59 đấu, 21:59 gia hạn 60 giây; áp dụng CAS/transaction cho niêm yết, bid, hoàn tiền, settlement và claim.
4. Tách contract item thường/thần binh theo `count` và `uid`; kiểm ownership authoritative. Bổ sung broadcast `5104`, settlement ra `deals`/mail, payout sau thuế và receipt chống retry/double-claim.
5. QA bắt buộc bằng hai tài khoản được ủy quyền: seller/buyer khác nhau, các mốc biên giờ, bid/overbid/refund, giới hạn, restart/relogin và đối chiếu Mongo/mail/balance.

## Triển khai 15/10/2026

- Đã triển khai `20261015_auction_guard_v1` lên S1–S8: `src/handlers/auction.js` fail-closed cho `5101/5102/5103/5110/5111/5113`; `5100` chỉ đọc và trả `auctionStatus=maintenance`, giữ dữ liệu lịch sử.
- Thêm client addon `lhs-auction-status-v1.js` và nạp sau bundle native; thông báo bảo trì, chặn claim-all callback cũ tự mở reward window, không sửa layout/logic kinh tế native.
- Backup và receipt: `/linhhoasu/_ai_workbench/backups/auction_guard_20261015_022118`, `_ai_workbench/temp/auction_20261015/deployment.json`. Source CAS trước swap; restart tuần tự đúng 8 process game; PID/readiness Mongo+Redis 8/8; process ngoài phạm vi giữ nguyên; `directPlayerWrites=0`.
- Hash sau rollout: handler `a14db08be867af5d9ef0aa756e95502f5008c404947b389a8c71478ba43f8a01`, addon `9821fef0d72e1ba96fc0e0c8664b563fc7096ac2ec2da1257fff36edd5c2d597`, index `47b2331a233b49b1bf61fd5ca377381fed18d38f31d064c31100d03928d3ee61`; HTTP 80/81/443 phục vụ đúng hash/marker.
- Kiểm thử cô lập 21/21, gồm 600 request đồng thời/lặp lại, không network/player write. Hậu kiểm DB sau deploy: cả 8 DB không có legacy auction rows; không tạo collection hay phát sinh dữ liệu player.

## Giới hạn kiểm chứng

- Chưa chạy native E2E bằng tài khoản QA được ủy quyền. Không có tab game đang mở trong browser được kết nối để kiểm tra trực quan. Cần tải lại game để nhận addon mới rồi kiểm tra phiên đấu giá, hoàn tiền và nhận thần binh bằng hai tài khoản QA riêng.
- Catalog không phải export server Trung: nguồn 1 không tìm thấy catalog; người dùng đã phê duyệt công thức VN ở nguồn 2. Test Mongo thật dùng database tạm riêng, không phải giao dịch game production.

## Đối chiếu bản Trung

- Bundle bản Trung có cùng contract native cho đấu giá hệ thống: `type=1`, `item`, `detail.artifact`, `fixedValue`, `payId`, giá/thời gian và các push cập nhật `5104/5105`. Công thức bước giá đọc từ `AuctionBaseConfig`; tên robot rèn dùng `AuctionRobotConfig` (10 dòng tên bản địa hóa).
- Trong các bundle/config local đã kiểm tra chưa có bảng catalog lô đấu giá gồm item thực tế, thuộc tính thần binh, số lượng, giá khởi điểm hoặc giá mua ngay. `AuctionRobotConfig` chỉ là tên robot, không phải nguồn hàng.
- Vì vậy bản Trung phù hợp làm nguồn tham khảo contract, UI và công thức. Không được copy nguyên catalog/giá hoặc `payId` sang bản Việt nếu chưa có export server Trung và chưa đối chiếu ID vật phẩm, tiền thanh toán, múi giờ và thiết kế kinh tế của server Việt.

## Candidate catalog theo công thức bản Trung

- Đã tìm kiếm có giới hạn trong workspace và VPS: không có CN server export/catalog lô; nhánh nguồn 1 hiện chưa cung cấp dữ liệu hàng thực tế.
- Đã dựng catalog review-only `_ai_workbench/temp/auction_20261015/candidate/catalog-vn-system-v1.json` theo nhánh nguồn 2. Candidate chỉ bật system auction, 5 lô, server `1001–1008`, token `payId=1001`, không cho player consignment và không cho recycle.
- 5 lô dùng `SpecialArtifactConfig` `51301–51305`, artifact `23103/23113/23123/23133/23143`, giá công thức `3978`, trần `fixedValue=10000`. Đây là giá suy ra từ `artifactValueSuggest`, `moneyConversion` và `Artifact*Config`, chưa phải giá đã được duyệt kinh tế.
- Builder/validator: `_ai_workbench/tools/build_auction_catalog_vn_20261015.js`, `_ai_workbench/tools/validate_auction_catalog_vn_20261015.js`; kiểm thử catalog PASS, `productionWrites=0`, `networkAttempts=0`. Catalog chỉ được phê duyệt sau khi người dùng chốt công thức; production chưa seed trước lượt triển khai.

## Chốt và triển khai backend theo công thức — 15/10/2026

- Người dùng đã chốt dùng catalog công thức VN theo contract bản Trung. Catalog chuyển sang `status=approved`, vẫn giới hạn `system_only`: 5 lô thần binh `23103/23113/23123/23133/23143`, giá khởi điểm `3978`, trần `10000`, token `1001`, không ký gửi và không recycle.
- Backend dùng chung `AuctionService.js`, `AuctionListing`/`AuctionRecord`; seed idempotent theo server/ngày, ID client khác mỗi ngày. Trước debit phải reserve intent bền vững trên listing. Debit/refund và marker chống lặp cùng một atomic player update; CAS listing ghi đồng thời bid và refund outbox. Scheduler phục hồi intent/outbox/receipt sau crash, kể cả vòng ngày trước. Giao snapshot thần binh + UID mới + marker chống nhận trùng cùng một write có CAS. Dùng role lock thật, drain deferred saves và đồng bộ live/closing player; không rollback tiền suy đoán khi write outcome chưa rõ.
- `5100` đọc catalog chung và trả phase `preopen/onshelf/bidding/settled`; `5101/5103/5111` bị từ chối rõ ràng vì catalog chỉ system; `5110/5113` không cấp thưởng giả. Scheduler 30 giây xử lý settlement và receipt pending; cờ `AUCTION_SHARED_ENABLED` + `AUCTION_SHARED_APPROVED` mới cho phép chạy.
- `test_auction_shared_20261015.js`: 29 nhóm PASS với persistence doubles và role lock thật; không network/player production writes. Bao gồm 6% ceil, nhiều outbid, concurrent CAS, retry, các điểm crash tiền/thưởng, gia hạn sau 22:00, qua ngày, client records và kill switch. Test guard cũ 21/21 PASS riêng; không coi đó là kiểm thử toàn bộ backend mới. Syntax PASS; ESLint thiếu `eslint.config.*` cho ESLint 10.
- `test_auction_mongo_20261015.js`: 8 nhóm PASS trên Mongo thật, database riêng `lhs_qa_auction_20261015_1792042643607`, không account/auth/Redis/WS. Kiểm unique indexes/casting, concurrent bids, nhiều refund, mua ngay, chính xác thuộc tính thần binh, phục hồi sau debit/reward và extension. Database chỉ chứa fixture/owner marker của bài test đã được xóa sau kiểm tra; không xóa DB game.
- Rollout thành công: backup `/linhhoasu/_ai_workbench/backups/auction_shared_20261015_053256`; receipt `_ai_workbench/temp/auction_20261015/shared-deployment.json`, hậu kiểm `shared-verification.json`. Restart tuần tự S1–S8, mỗi node tăng đúng một restart, PID ngoài phạm vi không đổi. Ba biến auction merge vào env runtime hiện có; `pm2 save` sau thành công. S5 vốn chỉ có trong PM2 runtime/dump, không thêm cấu trúc server mới vào ecosystem.
- Lần preflight đầu phát hiện ecosystem chỉ định nghĩa 7 node (không có S5), đã rollback toàn bộ source trước khi restart; bằng chứng `shared-deployment-failed-preflight.json`. Candidate source ghép trên baseline VPS mới nhất tại `_ai_workbench/temp/auction_20261015/shared/`, giữ nguyên các fix forge/quench remote mà local cũ chưa có; không upload đè nguyên local `artifact.js`/`app.js`/ecosystem.
- Web addon đồng bộ `_info.records` từ 5100, chặn reward popup khi claim-all bị từ chối. HTTP port81, HTTP80 và HTTPS443 đều trả đúng addon hash `3aa61de6b84ab0dbf3fe8c666ea80fa65e53022b5a3bf6faf3223f0c61768613`; index đã đổi cache version sang `20261015_auction_shared_v1`.
- Production read-back: S1 5 lô đúng item/giá/time, unique index có thật; S2–S8 không seed sớm, records/pending=0 toàn bộ. Đã ghi catalog hệ thống vào production, không ghi trực tiếp player trong rollout/test. Khi rollback sau khi đã có bid thật: khóa bid trước, giữ nguyên collection/ledger, giải quyết pending; không restore toàn bộ player hoặc xóa collection.
