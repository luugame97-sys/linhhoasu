# Session Report — sửa mồi, mở lại đơn và xử lý linh hồn

Ngày 06/09/2026, hậu kiểm 07:00:54 UTC+7. **Đã triển khai sửa mồi/câu3, làm mới đơn có vé và xử lý ô linh hồn đã có cá trên S1/S2. Tẩy thuộc tính cần và hộp kho báu vẫn cần dữ liệu gốc hoặc phê duyệt bảng cân bằng mới, không giả vờ đã mở lại. Không bù hoặc repair cá lịch sử.**

## 1. Tóm tắt công việc

- Đọc báo cáo phiên trước, lấy snapshot production mới149 artifact tại `temp/fishing_audit_20260905T234528Z/`. Làm candidate riêng, không ghi cây tham chiếu hoặc giải nén đè source từ gói cũ.
- Mồi được dùng theo thứ tự túi trên từng lần thả câu. Ví dụ câu3 với5512×2 và5514×90: dùng2 mồi5512 +1 mồi5514, còn5514×89; không từ chối cả lượt vì mồi đầu chỉ còn2. Hết mồi phụ thì tự dùng mồi mặc định5501.
- Tách rõ Đùi Gà65 là năng lượng câu và mồi phụ là vật phẩm khác. Một lượt3 cần3 Đùi Gà, mồi phụ dùng riêng; kiểm đủ năng lượng trước mọi tiêu hao. Quy tắc này căn cứ help30033014/30033060 và nút client getPowerId=65, không coi mồi phụ thay thế năng lượng.
- Bỏ hết mồi `foodBag=[]` lưu đúng danh sách rỗng và chọn5501. Client nhận danh sách chuẩn từ server; giới hạn túi5 loại theo native MaxFiahBaitBagCount.
- Mở lại làm mới đơn với item70×1 theo native FishOrderItem. Đơn đã nhận thưởng không được refresh. Native gửi expectedId để chống click/retry trừ vé khi đơn đã đổi. Chọn đơn khác trong cấu hình, tối đa5 sao hoặc6 nếu sở hữu bè6205.
- Mở xử lý cá linh hồn vào ô có cá: so phẩm chất trước, cùng phẩm chất so multi theo native checkIsPowerUp. Không đè ô khóa; không thay cá mạnh bằng cá yếu.
- Mọi linh hồn bị thay ra/không được chọn được giữ nguyên entity trong `fishSoulReserve` phía server, không tự bán/xóa/phát bạc. Cập nhật đồ giám tất cả cá vừa xử lý, xóa pending chỉ sau xử lý đã lập kế hoạch và save xác nhận. Có thể câu tiếp sau khi xử lý pending.
- Dự phòng giới hạn4096 entry để tránh document tăng vô hạn. Đầy thì từ chối cả giao dịch và giữ pending, không cắt/xóa cá cũ. Đây là kho phục hồi nội bộ, chưa có UI rút cá hoặc quy tắc bán/recycle.
- Sửa pool cá đã mở: help30033014 xác nhận cá thuộc mọi khu đã mở có thể câu ở mọi ngư trường thường, chỉ di vật theo khu. Bản audit/release trước đã hiểu sai khi chỉ lấy pool khu đang đứng; nay lấy hợp các khu đủ cấp/ngày, vẫn loại khu khóa/event chưa hỗ trợ.
- Client thông báo rõ lỗi thiếu Đùi Gà, thiếu vé, đơn đã nhận/đổi, dữ liệu linh hồn lỗi, kho dự phòng đầy. Giữ các chốt save/cost/pending/full-entity của bản trước.

## 2. File/thư mục đã thay đổi

### Source chính, local và production

| File | Nội dung |
|---|---|
| `linhhoasu/lhs/newServer/src/handlers/fish.js` | FIFO mồi, năng lượng, emptybag, refresh vé70, pool khu đã mở |
| `linhhoasu/lhs/newServer/src/handlers/fish-soul.js` | Chọn linh hồn tốt hơn/giữ khóa, reserve, ledger đồ giám, pending/replay |
| `linhhoasu/lhs/newServer/src/handlers/playerPayload.js` | Chỉ gửi số lượng reserve, không gửi archive nội bộ qua login |
| `linhhoasu/webgame/game/js/main.min_a6195824.js` |4 hàm native sửa dữ liệu +24 nơi thông báo lỗi |
| `linhhoasu/webgame/game/index.html` | Cache key20260906_fishing_bait_order_soul_v2 |

Không đổi config, WebGM, logic ngoại quan, PlayerService, WSServer, Redis/Mongo schema hoặc bot worker.

### Tool, evidence và backup

- Tools mới trong `_ai_workbench/tools/`: inspect_fishing_complete_20260906.js, build_fishing_complete_client_20260906.js, extend_fishing_complete_tests_20260906.js, test_fishing_complete_20260906.js, release_fishing_complete_20260906.py, qa_fishing_complete_live_20260906.js, run_fishing_complete_live_20260906.py, check_fishing_complete_runtime_20260906.py, sync_fishing_complete_local_20260906.py, sync_fishing_complete_followup_20260906.py, final_fishing_complete_20260906.py.
- Candidate/evidence: `_ai_workbench/temp/fishing_complete_20260906/`. `tests.json`, `stage-v2.json`, `deploy-v2.json`, `stage.json`, `deploy.json`, `live-qa.json`, `runtime-check.json`, `unverified-contracts.json`, `final-check.json`.
- Backup production lượt1: `/linhhoasu/_ai_workbench/backups/fishing_complete_20260905_235151/`; follow-up: `/linhhoasu/_ai_workbench/backups/fishing_complete_20260905_235750/`.
- Backup local: `backups/fishing_complete_local_20260906/`, `backups/fishing_complete_followup_local_20260906/`. Backup report: `backups/fishing_complete_reports_20260906/`.
- Gói source-only `temp/fishing_complete_20260906/fishing_bait_order_soul_v2_20260906.zip`,6 entry,2.188.212 bytes; yêu cầu bản fishing_integrity_v1 đã có. SHA256 `ed51be1667cdcfedfbbe1a3cad0f52dca2c462c75af60c7a92106c64251d8503`.
- Gói không chứa config, credential, DB hoặc runtime snapshot. Evidence log/snapshot chỉ dùng nội bộ, không đưa lênweb.

## 3. Lỗi đã gặp & giải pháp

| Lỗi | Nguyên nhân | Cách xử lý | Cách tránh lặp lại |
|---|---|---|---|
| Mồi2/câu3 bị chặn | Chỉ kiểm một loại mồi cho cả batch | Lập kế hoạch theo từng cast/FIFO, fallback5501 | Test tồn0/1/2/3/4 và túi1+1+default |
| Mồi phụ thay năng lượng | Code chọn costId là65 hoặc mồi | Luôn kiểm/trừ năng lượng65; mồi phụ độc lập | Đọc help/getPowerId, test thiếu65 nhưng nhiều mồi |
| Bỏ hết mồi không lưu | Bỏ qua mảngrỗng | Lưu[] vàdefault, syncserver bag | ACK+payload relog thật |
| Refresh đơn bị khóa hoặc mở quà lặp | Audit chưa đọc chi phí70 và điều kiện received | Vé70×1, không refresh đơn đã nhận, kiểm expectedId | Test thiếu vé, replay stale, giới hạn sao |
| Linh hồn ô có cá bị khóa hoặc mất cá | Thay mù hoặc chặn toàn bộ | So quality/multi như native, lưu nguyên entity dự phòng | Test mạnh/yếu/khóa/trùngUID/đầy dự phòng/relog |
| Pool khu bị thu hẹp sai | Hiểu fishes như danh sách độc quyền của khu | Hợp các khu đã mở theo help30033014 | Cấp3 đứng khu1 vẫn có cá khu2, không có cá khu3 |
| Archive làm nặng login | Spread fishInfo gửi toàn bộ reserve | Chỉ gửi reserveCount, DB vẫn giữ archive | Test payload không có archive, player gốc không bị xóa |
| QA websocket handshake timeout | Có nhiều kết nối lại sau restart; chưa chứng minh nguyên nhân duy nhất | Kiểm HTTP/WS ready,101/listener, không restart bot; thử QA lại sau khi ổn | Không dùng HTTP ready thay cho WS QA |
| Lang decode EOF | lang.bin là container LanguageConfig, không phải raw zlib JSON | Dùng ConfigService.reload(lang.bin) | Không sửa encoding bằng đoán |
| Regex log lỗi escape Python | Chuỗi JS regex không phải raw bị xuống dòng | Dùng chuỗi r cho đoạn JS | Kiểm cú pháp tool, không quy lỗi cho server |

## 4. Kỹ năng / kinh nghiệm mới

- Native/UI help là bằng chứng để hiệu chỉnh hợp đồng: foodBag30035898, energy30033014, wash30033060, soul30033154, refreshUI ID70×1. Không chỉ suy tênfield.
- `FishSoulPrivilegeConfig.privRewardShow` là danh sách hiển thị, không chứaweight. Không chiađều xácsuất hoặc phát tấtcả chỉ vì cólist.
- `FishLevelConfig.washCount` cho sốdòng vàweight sốdòng, không chophép suy giátrị/qualityweight từngthuộctính. `FishWashAttrDescConfig` chỉ mô tả/type/isWash.
- Kho dự phòng server giữ tính phục hồi nhưng chưa thaythế UI quảnlý/kịchbản recycle; đầykho phảiholdkhôngdrop.
- Múi giờ máy/VPS+0700, logger+0800, tênstageUTC. Không nhầm07:xx logger với07:xx giờuser.

## 5. Trạng thái hiện tại

### Đã đạt

- 50 tests in-memory PASS trên Windows và staging Node20: FIFO, emptybag, thiếu năng lượng, chi phí/nhận lặp, native callbacks, soul reserve, full entity/relog, save null/throw, pool đã mở và các chốt v1.
- Core gameplay contract PASS trên staging và source local,714 bảng; cú pháp3 source và main PASS.
- Live WS QA cuối PASS cả1001/1002: nhận/giữ cá fixture đầy đủ stat, câu3 dùng mồi2+1, emptybag, refresh vé/expectedId, nâng cấp linh hồn và lưu dự phòng, nhận thưởng lặp và2 lần disconnect/relog. QA có thể tự lên117 do template/task; không dựa vào level đó để so người thật.
- Các lần QA đầu timeout đều cleanup đúng UID; final qaRemaining0. Không gọi RPC hoặc sửa inventory/cá tài khoản người chơi; không compensation.
- 150 hash PASS;5 file release đúng,145 artifact khác giữ nguyên. Local3 source khớp candidate; main/index phục vụ ở cổng81 đúng hash.
- S1 PID17992/restart1370, S2 PID17937/restart34. Có2 lần triển khai trong phiên (lượt đầu mồi/đơn/soul, lượt sau pool/payload), mỗi lượt restart chỉS1/S2. Dist/admin/2 bot worker giữ PID và restart count.
- Ready8080/8083=200; WS ready9200/9201=200 và HTTP101 upgrade. Error tail không có TypeError/ReferenceError/Unhandled/FATAL/SyntaxError. Chưa chẩn đoán sâu đợt kết nối lại; không tự sửa WSServer hoặc bot worker.

### Chưa mở / cần quyết định

| Phần | Điều còn thiếu |
|---|---|
| Tẩy thuộc tính cần4012 | Chưa có bảng min/max, trọng số phẩm chất và thuộc tính. Đã xác minh cost135×10 và washCount, nhưng chưa đủ sinh thuộc tính đúng. Vẫn khóa, không trừ đá |
| Mở hộp94821–94825/tag4063 | Có5 dòng quà hiển thị mỗi hộp, thiếu tỉ lệ rơi, cơ chế bảo đảm và contract cấp quà190001..190005. Vẫn khóa, không trừ hộp |
| Hiệu ứng/tỷ lệ mồi, RNG/di vật/event, soul RNG | Chưa xác minh tương đương bản gốc. Phiên này sửa tiêu hao/routing và tính toàn vẹn, không hứa hiệu ứng mọi loại mồi đã chuẩn. Thuật toán soul first-N cũ chưa thay |
| Dự phòng linh hồn | Chỉ là backup server, chưa có UI rút/lựa lại/recycle. Đầy4096 giữ pending và cần quản trị, không tự cắt dữ liệu |
| UI game trực tiếp / save xuyên restart | Callback thật và live WS đã kiểm; chưa nghiệm thu hình ảnh native hoặc giữ cá QA xuyên thêm một lần restart |

Đã tìm trong714 bảng production,22 bảng Fish* của resource tham chiếu (khớp hiện hành), archive1server.zip/server.zip và globalconfig keys liên quan (không có). Gói cũ chứa JS đơn giản hóa và dump client; chưa tìm được bảng server-only chuẩn. Không được gọi2 phần đang khóa là “fix xong”.

## 6. Bước tiếp theo

1. User tải lại game để nhận clientv2; thử câu3 khi mồi còn2, bỏ hết mồi, refresh đơn chưa nhận bằng vé70 và xử lý linh hồn.
2. Để mở tẩy/hộp: cần user cung cấp bảng/source gốc hoặc cho phép thiết lập bảng cân bằng riêng. Khi được tự thiết lập phải công khai tỉ lệ/giá trị và test ngoại quan190001..190005 trước khi mở hộp.
3. Ưu tiên sửa hiệu ứng mồi/RNG soul và quản lý reserve tiếp theo, không bỏ chốt hoặc phát quà tạm để test.
4. Nếu rollback: chỉ source có hash guard; không xóa reserve, không rollback document người đang chơi từ snapshot cũ. Backup235750 làv2 trước follow-up; muốn vềv1 cần preimage235151 và payloadv1.
5. Không chạy compensation, reroll/backfill cá theo yêu cầu hiện tại.
