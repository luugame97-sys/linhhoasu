# Túi tự chọn Hồn ngọc cấp 6–12 bằng Nguyên bảo — 06/10/2026

## Đã triển khai S1–S7

| Cấp | Túi | Shop ID | Nguyên bảo/túi |
|---:|---:|---:|---:|
| 6 | 90076 | 10000008 | 9.720 |
| 7 | 90077 | 10000009 | 38.880 |
| 8 | 90078 | 10000010 | 116.640 |
| 9 | 90079 | 10000011 | 349.920 |
| 10 | 100097 | 10000012 | 1.049.760 |
| 11 | 100098 | 10000013 | 3.149.280 |
| 12 | 100099 | 10000014 | 9.447.840 |

- Chỉ bán bằng Nguyên bảo, không giới hạn lượt mua. Một túi chọn một viên đúng cấp: 4 loại ở cấp 6, 6 loại mỗi cấp 7–12, tổng 40 lựa chọn.
- Tái sử dụng túi 6/7/8/10, thêm đúng ba túi 9/11/12. Sáu SKU ngẫu nhiên cũ giữ nguyên; SKU 10000007 vẫn tắt, túi 10 bán bằng ID mới 10000012.
- Giá đúng phương án nguyên liệu đã duyệt: P6=3×3.240, P7=4×P6, các cấp sau nhân 3. Không cộng phí phân giải vào giá nâng.
- Client đồng bộ tên Việt/icon/choice route và tái tạo native ShopModel index để Tiệm Ngọc đọc đủ 13 hàng. Không ghi đè khóa ngôn ngữ 10000008–14 dùng cho mô tả tiền tệ.

## Sửa các đường giao dịch cần thiết

- Mua bảy SKU và mở bảy túi dùng draft riêng, khóa theo nhân vật, snapshot mới, receipt và lưu xác nhận; replay trả wallet/túi/ngọc hiện tại, không trừ/cấp lần hai.
- Client lưu intent theo server+nhân vật, kiểm schema, watchdog/retry, bỏ callback muộn và đồng bộ pending sau đăng nhập lại cùng nhân vật. Khi mở hết túi nhưng mất ACK vẫn phục hồi giao dịch cũ.
- Đổi ngọc 3904 chỉ đổi màu cùng cấp 4–6/basic type 1–4, giữ UID/shape/số lượng; chặn ngọc đang đặt, input sai/trộn cấp và đường tăng lên cấp 100. Giữ 10 lượt/ngày theo GMT+7.
- Hotfix bổ sung: legacy chạm trần nhưng chưa có exchangeDay lưu ngày tiếp nhận đúng một lần, giữ lượt hôm nay; ngày sau reset được. Input sai không ghi, save lỗi không xuất bản draft.
- Client cũ thiếu nonce sẽ bị từ chối mua/mở các túi này; cần tải lại addon mới.

## Kiểm chứng

- VPS candidate/installed: 27 nhóm đổi ngọc sau hotfix, 11 nhóm giao dịch, 5 nhóm catalog, 25 kiểm tra client. Codec native↔server giữ chính xác giá 9.447.840 và tổng 9.999 túi 94.468.952.160. Có kiểm cache shop và choice indices bằng hàm native.
- QA RAM gồm 40 lựa chọn, thiếu/đủ tiền, nonce trùng/xung đột, đồng thời, null/throw/postcommit, reconnect/callback muộn và số lớn. Bag 10.000 ngọc mở 100/1.000 túi chỉ chuẩn hóa hai lần, lưu một lần, không trùng UID. Không gửi mua/mở/đổi RPC thử trên nhân vật thật.
- Read-back live: đủ bảy giá NB, 40 choice, sáu hàng cũ giữ nguyên, SKU cũ 7 tắt; tám hash cuối đúng theo main/hotfix/static v2. Public game/addon/WebGM HTTP200 và hash phần quản lý đúng; HTML chỉ thêm beacon Cloudflare.
- Hậu kiểm cuối 7/7 readiness status=ok, Mongo/Redis=true. S2 có timeout ở ngưỡng 5 giây; mẫu cuối trả readiness khoảng 5,5 giây, log có hàng đợi/PlayerSave/RPC khác chậm. Chưa xác định nguyên nhân độ trễ đó trong phạm vi shop; không tuyên bố đã xử lý toàn bộ lag.
- Admin/dist/bots giữ PID/trạng thái/uptime. Chưa nghiệm thu visual hoặc giao dịch E2E thật vì giữ nguyên tab người dùng đang chơi; không tuyên bố người chơi thật đã nhận túi/ngọc.

## Files / khôi phục

- Chính sách: `linhhoasu/lhs/newServer/src/config/gemChoiceShop.js` + `.json`. ConfigService candidate xây từ preimage live, giữ các overlay production.
- Handler/service triển khai lấy từ `_ai_workbench/temp/gem_choice_shop_20261005/candidate/src/`; gem.js cuối ở `_ai_workbench/temp/gem_exchange_day_20261006/candidate/lhs/newServer/src/handlers/gem.js`. Local handler cũ không bị ghi đè toàn bộ để tránh mất thay đổi khác.
- Client: `linhhoasu/webgame/game/js/lhs-gem-choice-shop-v1.js`, public version `20261006_gem_choice_shop_v2`.
- Backup main `/linhhoasu/_ai_workbench/backups/pet_grid48_20261006_072615`; hotfix `/linhhoasu/_ai_workbench/backups/pet_grid48_20261006_141142`; static `/linhhoasu/_ai_workbench/backups/gem_shop_static_20261006_141931`.
- Receipts: `temp/gem_choice_shop_20261005/{deployment.json,postcheck.json,preflight.json}`, `temp/gem_exchange_day_20261006/deployment.json`, `temp/gem_shop_static_20261006/deployment.json` trong workbench.
- Nếu cần dừng bán: tắt riêng bảy SKU bằng CAS nhưng giữ Assets/AssetsUse túi đã bán, receipt và các fix bảo vệ; không rollback mù làm mất đường mở túi đã mua hoặc khôi phục lỗi tăng cấp 3904.
- URL: `https://linhhoasu.lol/index.html?v=20261006_gem_choice_shop_v2`.
