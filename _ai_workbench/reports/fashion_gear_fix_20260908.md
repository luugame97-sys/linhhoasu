# Sửa Thời trang / Cần câu / Bè — 08/09/2026

## Kết quả phát hành

Bản cuối `20260908_fashion_gear_v2` đã triển khai S2 rồi S1, hoàn tất **18:19 GMT+7** (11:19 UTC theo manifest). Có hai lượt phát hành trong phiên; mỗi game process restart tổng2 lần. Bốn process dist/admin/bot không đổi. Không sửa giá, chỉ số cần/bè, thời hạn thẻ hoặc lịch sự kiện; không repair/bù/thu hồi người chơi.

- Cần/bè: bỏ gate ngày mở (`condition.type=5`) riêng catalog `FishRodConfig`/`FishRaftConfig`. Cả8 cần và10 bè có thể xem từ ngày đầu ở S1/S2; vẫn cần sở hữu hoặc thẻ còn hạn để chọn dùng. Giữ các điều kiện không phải ngày và điều kiện mở hệ215/223.
- Hợp nhất init/refresh danh sách; giữ đúng mục đang xem, rebuild khi tập ID thay đổi; ép đo renderer trước tính chiều rộng; không cuộn999 vòng khi mất mục tiêu. Mua/nhận cần,bè đẩy refresh danh sách. Cần/bè mặc định nhất quán client/server.
- Rương bộ: theo quyết định đã duyệt, **nhận rương → rương ở túi → bấm sử dụng/mở → nhận component**. Áp dụng56 rương fixed type100/use105 đã kiểm cấu hình; không đổi các rương lựa chọn/ngẫu nhiên. Số rương cũ có trong túi cũng hiện, không tự mở khi login. ID29040 trước đây tự mở; bản v1 trong phiên vẫn giữ auto-grant, bản v2 đã sửa về mở chủ động. Không thu hồi component đã được cấp trước bản v2.
- Mở rương trừ đúng số lượng, đồ trùng quy đổi theo `swaps`; cùng save với receipt, phát ownership và số túi tuyệt đối. Save null/throw/commit-mơ-hồ không trả thành công giả; replay không cấp hoặc trừ lại.
- Thời trang: giữ ID0/-1 qua normalizer/showInfo và các map lựa chọn; preset0–2 lưu snapshot slot, quay lại preset cũ khôi phục các món còn quyền. Mặc nguyên bộ yêu cầu đủ component; bộ dạng liền khối chỉ đi qua1802. Các bộ thường có thể phối phần lẻ có ownership. Bath preset999 tách khỏi outfit thường.
- Khi mặc bộ, chỉ tắt các phần bị `banTypeIds` cấm. **Đính chính audit:** bộ28010 không cấm vũ khí, nên giữ vũ khí cũ là hợp lệ; không ép xóa toàn bộ slot thiếu. Normalizer giữ ẩn; client không tải model mặc định thay cho phần bị tắt.
- Icon thiếu: dùng ảnh bộ/portrait đã tồn tại trong registry pack và nhãn phần, không dùng icon Nguyên bảo giả; ID/quyền và giá trị vật phẩm không đổi. Các thành phần2834 dùng portrait `head_rs_2834` khi thiếu icon con/cha.
- Callback chỉ áp trạng thái khi ACK thành công; selection push + preset được đồng bộ trước/sau native callback. Request ID dùng epoch do server cấp, không dựa giờ thiết bị; replay áp trạng thái hiện tại, không lùi về lựa chọn cũ. Broadcast ngoại quan map sau commit, lỗi broadcast không biến thành giao dịch mới.

## Kiểm chứng

| Phạm vi | Kết quả |
|---|---|
| Backend + overlay | 15 nhóm PASS:56 rương mở/đồ trùng,300 tổ hợp bộ–màu–giới tính, preset, ẩn, null/throw/commit-mơ-hồ/replay |
| Hàm native thật trong VM | 8 nhóm PASS;216 tổ hợp 2server ×6mốc ngày ×18cần/bè; carousel vị trí/chọn/cuộn, túi rương, callback lỗi/replay |
| Hồi quy | foundation18, farm/alchemy48, luyệnđan19, nguồnnguyênliệu17, core714bảng và show-info PASS local/Node20/mã cài live |
| WebSocket + MongoDB + relog thật | S1/S2 PASS trên nhân vật QA riêng: mua cần Trúc, đổi đủ8cần/10bè, mở29040/28040/28010, quàtrùng2000Nguyênbảo, epoch/replay, preset và hidden state sau relog |
| Hậu kiểm | Hash9file local/live + index/patch HTTP nội bộ/công khai khớp;ready8080/8083=200;process ngoài phạmvi khôngđổi;không marker lỗi mới trong đuôi log kiểm;warningMongoose `isNew` cũ còn |
| Dọn QA | 0 profile/0mail `qafgear_` ở cảS1/S2 sau close;không dùng tiền/tài nguyên tài khoản người chơi cho QA |

Các fixture dùng DB bộ nhớ, không ghi production. Kiểm thử WebSocket tạo tài khoản QA tạm rồi xóa đúng identity. Không coi fixture hoặc ready200 là kiểm chứng toàn bộ hình native.

## Giới hạn chưa nghiệm thu

- **Browser visual QA bị chặn:** sau tải bảnv2 và vàoS1, màn100% gặp `TypeError: Illegal invocation` ở `index.html:682` (`HTML5WebSocket._nativeSend`). Stack/cause đã thấy trước đợt sửa; phiên này không sửa transport. Không kết luận toàn bộ ảnh/bộ/màu/thiết bị đã đẹp chuẩn100%.
- Chưa có ảnh sau fix của8cần/10bè và toàn bộ59bộ trên trình duyệt thật. Các kiểm tra native VM/WS đã nêu không thay thế bước này. Cần giải quyết/reproduce lỗi kết nối trên phiên sạch để hoàn tất nghiệm thu hình ảnh.
- Không kiểm/đền bù đầy đủ lịch sử mua fashion. Dữ liệu cần live trước sửa: nicky có ThanhLong5907; các gói5904–5908 đã kiểm không có purchase-count>0 nhưng thiếu item. Không dùng kết quả này để suy mọi đơn hàng ở mọi kênh đều đúng.
- Quy tắc `0`/`-1` theo từng nhóm native phải giữ nguyên: cosmetic phụ trợ0=ẩn, -1=cơ chế mặc định; quần/áo/vũkhí-1=ẩn. Không coi chúng là ownership hoặc dùng nguồn bộ cũ để tựcấp.

## File và khôi phục

Source: `src/handlers/fashion.js`, `src/handlers/item.js`, `src/services/RoleAppearanceService.js`, `FashionTransactionService.js`, `FashionBoxService.js`, `FashionBoxRepairService.js`, `RewardGrantService.js`.

Client: `linhhoasu/webgame/game/js/lhs-fashion-gear-v1.js` (versionv2), `index.html`. Không chỉnh minifiedmain hoặc configbin.

Test: `scripts/test-fashion-gear-fix.js`, `scripts/test-fashion-gear-native.js`; tool `tools/qa_fashion_gear_live_20260908.js`, `tools/release_fashion_gear_20260908.py`.

Manifest cuối: `_ai_workbench/temp/fashion_gear_release_20260908_v2/release.json`; hậu kiểm `postcheck.json`. Bảnv1: `temp/fashion_gear_release_20260908/release.json` (đã thay bằngv2).

Backup VPS cuối: `/linhhoasu/_ai_workbench/backups/fashion_gear_v2_20260908_111509` — quay lạiv1 bằng CAS theo tool `rollback`, không rollback dữ liệu người chơi. Backup trước toàn đợt: `/linhhoasu/_ai_workbench/backups/fashion_gear_release_20260908_105011`. Trước rollback toàn bộ phải chọn đúng2tầng baseline, không chạy script cũ mù.

Dung lượng hỗ trợ: hai staging khoảng10,6MiB;backupsource312KiB;resourceindexaudit local khoảng12MiB. Giữ để đối chiếu/rollback; không tạo dependency mới, chưa xóa backup cũ.
