# Phát hành sửa hiệu ứng kết liễu Kaká — 17/09/2026

## Kết quả

**DEPLOYED trên S1–S4.** Hậu kiểm lúc 10:23 GMT+7 ngày 17/09: bốn node online, `/ready` 8080/8083/8084/8085 = 200, SHA file live khớp candidate.

- Sửa đúng một file production: `/linhhoasu/lhs/newServer/src/handlers/fashion.js`.
- `type=304` được chọn khi item tồn tại, đúng loại, đã sở hữu, bộ cha `isSuit=4` và `FashionEndDressConfig.endEffectId` khớp ID. Effect đi qua luồng preset, transaction, receipt và save trước ACK sẵn có; không return sớm bỏ qua lưu preset.
- Giữ chặn mảnh nguyên bộ; không bỏ kiểm ownership, không đổi quyền/kênh nhận thưởng. Người có nguyên bộ nhưng chưa có effect riêng vẫn không được tự cấp effect.
- Áp dụng cho `28320 → 28324` (Kaká – Con trai của cỏ), `28330 → 28334` (Kaká Milan Quý Ông), lấy quan hệ từ config, không whitelist cứng hai ID trong handler.
- Không thay client, config, giá trị thưởng hoặc hạ tầng Redis. Không ghi/cấp/bù dữ liệu tài khoản người chơi thật; chỉ tạo nhân vật QA riêng rồi dọn theo identity chính xác.
- SHA trước: `88cb13e325637be33f5d4285736f2cf0d9b46654460d128dbe5ebb765ff2e2d1`.
- SHA sau: `56420e785ca0623fa6ce35e098eb02797466552c5afda777100379cc0cda21fe`.

## Kiểm chứng

| Lớp kiểm tra | Kết quả |
|---|---|
| Tái hiện trên bản cũ | Bản cũ từ chối effect304 dù đã sở hữu; test mới thất bại đúng tại bật effect |
| Test riêng trên local, staging và mã đã cài | 18 nhóm PASS: native request/checkbox callback, sở hữu riêng, không sở hữu, sai mapping/ID/type/preset, mảnh nguyên bộ, preset thường/suối nóng, reload, replay sau lựa chọn mới, 20 request trùng, save null/throw/commit-mơ-hồ, hồi quy306 |
| Hồi quy thời trang trên staging và mã đã cài | 15 nhóm PASS; 394 save đều ở RAM, networkAttempts0, productionWrites0 |
| SDK + WebSocket + MongoDB production, tài khoản QA | Cả S1/S2/S3/S4 PASS: mặc cả2bộ, đeo/tháo effect, replay, read-back từng thay đổi, đổi preset,4request sai bị từ chối,306 giữ hoạt động, đăng nhập lại đúng; tiền/item QA không đổi qua thao tác |
| Browser native QA cô lập qua computer-use | 6/6 bật–tắt–bật trên2bộ PASS: checkbox khớp ACK, mỗi thao tác1request, đọc lại RAM giữ trạng thái, `BattleTurnDataParse.checkIsUseZhanSha` true/false đúng |
| Renderer thật/tài nguyên thật | Clip kết liễu `m_attack_9_a` trên2model hoàn tất callback; duration28320≈3,367s /28330≈4,067s. HaiFX và camera của mỗi bộ load được |
| Hậu kiểm identity QA | 0 account `qa_kaka_*`, 0 playerQA trong cả4DB; không dùng account thật |
| Process ngoài phạm vi | dist/admin và4bot worker giữ nguyên PID/restart từ đầu công việc |

**Giới hạn:** browser QA dùng UI/model/clip native nhưng persistence RAM; kiểm production dùng protocol thật và MongoDB nhưng không mở toàn bộ trận bằng browser trên tài khoản QA. Chưa nghiệm thu một trận kết liễu live hoàn chỉnh có đối thủ, camera và timing toàn chuỗi. Không gộp hai lớp kiểm này thành native account combat E2E đã hoàn tất. Fixture UI còn cảnh báo ảnh trang trí `main_bm_shuzhi` không resolve trong resource adapter riêng; không có JS error trong bài cuối, không kết luận ảnh đó thiếu ở production.

## Các lần dừng/hoàn tác trong quá trình

Candidate gameplay giữ nguyên suốt quá trình. Có năm lần phát hành bị hoàn tác bởi bước xác minh; lịch sử và backup mỗi lần lưu trong `release.json.priorAttempts`:

1. Account QA ban đầu dài27ký tự, vi phạm giới hạn4–20; sửa dữ liệu QA, không sửa đăng nhập game. Password QA cũng được giới hạn đúng8–32.
2. HTTP ready xuất hiện trước khi SDK proxy sẵn sàng sau restart; gặp `SERVER_NODE_UNAVAILABLE`. Bổ sung retry bounded chỉ cho mã này.
3. Fixture chờ snapshot/SSH hết hạn trong lúc node tiếp nhận lại nhiều kết nối. Bổ sung heartbeat, progress và timeout phân pha; auth/relog baseline được chạy trước phát hành lại.
4. Readiness gate500ms tự đặt quá chặt khi reconnect; mẫu bản gốc cũng0,3–1s. Điều chỉnh chờ nhiều mẫu200/<2s, giữ kiểm chức năng SDK/WS/DB làm gate chính.
5. EPIPE/Connection-is-closed của Redis ở tiến trình S2 đang tắt bị nhầm thành lỗi tiến trình mới. Đối chiếu PM2 stop/start và log timezone: lỗi11:13:25 UTC+8 tương ứng PM2 stop10:13:25 UTC+7, trước new-start10:13:26. Chỉ phân loại riêng đúng hai lỗi này trong cửa sổ stop→new-start của đúng node; mọi lỗi sau new-start vẫn chặn. Không sửa shutdown/Redis.

Tổng restart thực tế cả các lần rollback: **S1=1, S2=3, S3=5, S4=11**. Có thể làm các phiên game trên node đang restart phải kết nối lại. Không ghi nhận restart ở dist/admin/bot worker. Lượt cuối đi tuần tự S4→S3→S2→S1; từng node phải qua QA rồi mới sang node sau. Hai cảnh báo Redis trong cửa sổ tắt tiến trình cũ được giữ trong bằng chứng, không gọi toàn bộ log là sạch.

## Backup / rollback

- Backup cuối: `/linhhoasu/_ai_workbench/backups/kaka_end_effect_20260917_031930/fashion.js.before`.
- Staging: `/linhhoasu/_ai_workbench/temp/kaka_end_effect_20260916_182336`.
- Deploy kiểm SHA baseline/context/candidate và thay file qua rename cùng filesystem. Khôi phục chỉ khi SHA live còn đúng candidate, phục hồi file backup và restart riêng node đã cập nhật, không rollback DB.
- Tool local: `_ai_workbench/tools/release_kaka_end_effect_20260917.py` có `verify` / `rollback`; kiểm manifest trước khi chạy rollback, không chạy tự động chỉ vì phát hiện một lỗi khác ngoài scope.

## File và bằng chứng

- Source: `linhhoasu/lhs/newServer/src/handlers/fashion.js`.
- Regression: `linhhoasu/lhs/newServer/scripts/test-fashion-end-effect.js`.
- QA/release: `_ai_workbench/tools/qa_kaka_end_effect_live_20260917.js`, `release_kaka_end_effect_20260917.py`, `serve_kaka_end_effect_qa_20260917.js`, `kaka_end_effect_visual_qa_20260917.js`.
- `_ai_workbench/temp/kaka_end_effect_release_20260917/release.json`: từng node/attempt, backup, hash, tests, log và process.
- `postcheck.json`: residue QA0, process invariants, restart thực tế.
- `visual.json`:6caseUI,2cliprender,FX đã tải; hash handler khớp live.
- `review.diff`, `fashion.before.js`: diff hẹp và baseline local. Bằng chứng/cache riêng khoảng6,8MiB; giữ config và2pack để tái hiện QA. Không xóa backup hoặc dữ liệu cũ.

Người chơi đăng nhập lại rồi bật ô **Đeo** dưới icon kết liễu; không cần nhận lại bộ hoặc effect đã sở hữu. Các lỗi addon day1, special28340 và opening-effect28416 trong audit trước **không thuộc bản sửa này**.
