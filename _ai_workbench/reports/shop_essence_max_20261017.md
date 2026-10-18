# Tăng số lượng mua Tinh túy và thêm Max — 17/10/2026

## Phạm vi và nguyên nhân

- Món trong ảnh: `ShopConfig[1000006]`, đổi `Nguyên bảo ID1 ×100` lấy `Tinh túy ID20 ×250`, không có hạn mức/ngày hoặc giá lũy tiến.
- Native `CommonBuyItemPanel.OnOpen` giới hạn9999 từ `ShopBaseConfig.shopOnceLimitIds`; backend `handleMultiBuyItemUnlocked` cũng chặn9999 và lặp từng lượt để tính tiền/phát quà. Chỉ tăng client hoặc bỏ guard server sẽ không giải quyết đúng và có thể làm server xử lý quá lâu.
- Trần mới cho riêng món này: **999.999.999 lượt/giao dịch**, tương đương **249.999.999.750 Tinh túy**, giá **99.999.999.900 Nguyên bảo**, nếu đủ số dư và headroom số nguyên an toàn. Đây là trần triển khai tương thích ô nhập9chữ số; không gọi là giới hạn tuyệt đối mọi số học của game.

## Thay đổi

- Service `src/services/EssenceBulkShopService.js`: route riêng món1000006, tính tiền/quà bằng phép nhân, một row quà, không lặp theo số lượt. Dùng transaction wrapper `FarmShopService.run` hiện có với khóa player, draft, receipt requestId chống replay, xác nhận lưu trước khi công bố. Không nhận giỏ trộn vật phẩm, giá lũy tiến hoặc cấu hình đã khác baseline. Kiểm tra số dư, integer, cap và safe-integer cho tổng tồn kho/record.
- `src/handlers/item.js`: thêm hai dòng điều phối và sửa đúng parser số lượng legacy của món1000006 để không biến0/âm thành mua1. Các shop khác tiếp tục đi đường cũ và giữ cap/hạn mức.
- `web/js/lhs-essence-buy-max-v1.js`: hook riêng dialog của1000006; bật nútMax cạnh±10/±1, số nhập tối đa9chữ số. Max chọn `min(đủ tiền, trần giao dịch, headroom tồn kho/record, hạn mức cấu hình)` và cập nhật preview/giá; không gửi RPC mua. Chỉ nútMua native mới thực hiện giao dịch. Nếu không đủ100Nguyên bảo, số chọn0 và tắtMua. Khôi phục style/skin khi panel được tái dùng cho shop khác.
- Client gắn requestId cho1200/1202 của riêng1000006. Legacy client vẫn mua≤9999 như trước; số lớn cần addon mới.
- Index nạp addon sau `lhs-item-quantity-v1.js`, cache `20261017_essence_buy_max_v1`; không đổi giá/reward/binary của các shop.

## Kiểm chứng

- `node --check` các candidate PASS. `_ai_workbench/tools/test_shop_essence_max_20261017.js`: **30ca PASS**, gồm9999/10000/trần999999999, thiếu tiền, giá/limit, giỏ trộn, âm/lẻ/NaN/vượt cap, safe-integer, server codec64bit round-trip, clientMax theo tiền mới và tái sử dụng panel.
- Chạy logic thật `FarmShopService.run`, `FeatureReceiptService`, `PlayerMutationService` trong fixture RAM: hai request đồng thời cùngID chỉ debit/grant/save một lần; lỗi lưu không công bố draft và invalidatesession. `productionWrites=0`; không mua bằng tài khoản thật.
- Tab browser trước deploy đang mở đúng dialog Tinh túy. Sau reload về màn đăng nhập; người dùng tự đăng nhập và xác nhận **đã mua được**. Không dùng thông tin đăng nhập lưu sẵn hoặc tự bấm Mua.
- Đối chiếu DB read-only lúc11:09ICT: receipt mới của Talo/S1 lúc11:08:30 ghi `result=0`, mua **1.050.359 lượt**, phát **262.589.750 Tinh túy**, changedNguyên bảo còn**12**. DB hiện tại vẫn12Nguyên bảo; Tinh túy hiện tại đã thay đổi do người chơi tiếp tục sử dụng, không lấy tổng tồn kho hiện tại làm số được phát. Bằng chứng `purchase-readback.json`. Đây là giao dịch thật do người dùng thao tác, tách biệt khỏi30ca fixture; không có thao tác mua thật từ tooling.
- Rollout chín node theo thứ tự, readinessMongo/Redis9/9, `pm2 save`; service/addon/handler/index live hash đúng, hai static asset HTTPS hash khớp. Trình deploy vấp lỗi parseJSON ở bước cuối do loggerConfig được require trước stub; không rollback/restart lại node. Đã sửa tool và chạy read-back riêng xác nhận9PID/restart giữ nguyên và cap999999999; chốt `DEPLOYED_VERIFIED`.
- Chưa có screenshot cửa sổMax sau deploy do người dùng đã đóng cửa sổ và tiếp tục chơi; không tuyên bố automated nativeUI screenshot/E2E. Giao dịch thật được xác nhận bằng lời người dùng và receiptDB.

## Đối chiếu chi phí max thú cưỡi — 11:12 ICT

- Read-only ConfigService live và handler3204 xác nhận `SwordLevelConfig` có cấp1–5000 cho quality2/3/4/6/7; nâng dùng `consumes` của cấp hiện tại, dừng khi không có row kế tiếp. Không dùng mốc1000 trong dữ liệu cũ để suy ra cap hiện tại.
- Tổng Tinh túy cấp1→5000: quality2=124.975.000; quality3=249.950.000; quality4=624.875.000; quality6=1.249.750.000; quality7=2.499.500.000. Trần mua249.999.999.750 đủ100thú quality7 từcấp1.
- Talo/S1 tại11:12:13: kho262.106.250 Tinh túy; thú đang cưỡi22506 quality7 cấp92 còn cần2.498.662.800 để đạt5000. Tổng tất cả39entry thú đang có còn cần47.489.649.000. Đây là trần mua so với tài nguyên thực có, không phải tài nguyên đã được cấp thêm.
- Evidence `mount-cost-readback.json` (tổng hợp theo quality + handler) và `mount-player-readback.json`. Không gọi nâng cấp hoặc ghi player.

## File và rollback

- Baseline/candidate/evidence: `_ai_workbench/temp/shop_essence_max_20261017/`.
- Deploy tool: `_ai_workbench/tools/deploy_shop_essence_max_20261017.py`.
- Backup: `/linhhoasu/_ai_workbench/backups/shop_essence_max_20261017_040627`; trước khi swap đều kiểm CAS/hash, backup đúng source/index; hai file mới có trạng thái absent ghi trong receipt.
- Rollback: kiểm hash postimage, phục hồi itemhandler/index bằng preimage, chuyển service/addon mới khỏi đường nạp nếu rollback toàn bộ; restart tuần tự S1–S9 và readiness. Giữ receipt/player state của các giao dịch đã commit; không hoàn tiền/phát lại tự động.
