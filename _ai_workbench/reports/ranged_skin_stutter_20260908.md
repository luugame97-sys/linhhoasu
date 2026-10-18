# Kiểm tra khựng khi thời trang đánh xa — 08/09/2026

**Đã xử lý và phát hành ngày09/09:** xem `ranged_action_fix_20260909.md`. Nội dung bên dưới là audit trước sửa, không dùng giới hạn5s/timerlỗi như trạng thái bản mới.

## Kết luận và phạm vi

Chỉ chẩn đoán/lập phương án, chưa sửa source/config, deploy/restart, ghi DB hoặc thao tác người chơi. Có lỗi vòng đời hiệu ứng/callback trong client và cơ chế đứng chờ phù hợp hiện tượng. Người dùng đã xác nhận Phượng Cầu Hoàng và Mặc Nhiễm Tinh Hà các màu bị khựng; chưa có độ dài khựng hoặc trace/video phiên thật để kết luận chính xác trigger.

## Đối chiếu bộ người dùng nêu và phương án đề xuất

- `28040` = Phượng Cầu Hoàng, weapon `28041` → effect `2804`, `atkType=1` (đánh xa). `28340` = Mặc Nhiễm Tinh Hà (tên parent dịch là Mực nhuộm ngân hà), 5 màu0–4: weapons `28341/80128341/80228341/80328341/80428341` → effect `2834/8012834/8022834/8032834/8042834`, đều đánh xa. Cả hai dùng `m_attack_1_a`, `m_attack_2_a` và crit `m_attack_4_a`; có projectile ở các đòn này. Đối chiếu thêm language client và cấu hình, source hash vẫn bằng audit trước; không chạy lại toàn bộ test không đổi.
- Sửa tối thiểu luồng map `RemoteAtkAction`, không special-case theo tên bộ và không sửa tầm đánh/animation/speed/damage/drop. Mỗi action giữ generation/token và reference actor/target/raid; callback muộn chỉ hợp lệ khi đúng action/cảnh. Tất cả timer của đòn thuộc action để OnExit dọn đúng, không removeAll(actor).
- Tách hoàn tất animation, thời điểm hit và kết thúc action; chỉ kết thúc một lần khi timeline hợp lệ hoàn tất. Nếu renderer/FX lỗi thì bỏ riêng hiệu ứng hoặc dùng fallback có sẵn, không bỏ hit logic hay phát hit/claim thêm lần nữa. Không chuyển state nhận thưởng chỉ vì timeout.
- Sửa `MapEffMgr` tại vòng đời object dùng chung: callback giữ instance effect + generation, không truy cập mù `holder.mc` đã được pool tái dùng. Khi hết hạn/dispose phải vô hiệu callback trước trả pool; không xóa effect của đòn mới.
- Watchdog chỉ là cứu hộ: dựa animation thực, khoảng bay và modeSpeed hiện hành, không deadline cố định ngắn cắt animation; phân biệt chờ tải/chạy/hủy và pause khi tab ẩn. Không nhân thêm lớp timeout toàn cục; chỉ đổi timing nếu trace chứng minh cần, giữ timeline khỏe nguyên.
- Trước phát hành: trace giới hạn trên QA khi khựng, đo action/anim/hit/flight/target-load và frame time; kiểm Phượng +5màu trên browser, chạy matrix78appearance/468ca, lỗi tải/interrupt/target mất/đổi map/callback muộn/pool reuse, cùng hồi quy đánh gần, crit, số hit và luồng2000→2001/relog. Kết quả không có callback sau cancel, không ảnh hưởng effect mới, không hit/claim trùng/thiếu và không cần guard5s trong ca đã tái hiện.
- Sau khi được duyệt: candidate local + backup/hash/CAS, test mã thật/staging, nghiệm thu browser rồi mới lên live. Client S1/S2 dùng chung bundle: QA S2 phải bằng candidate/phiên QA riêng, không giả định upload client là rollout riêng từng server. Giữ rollback source, không restart backend hay repair DB. Hiện mới là đề xuất, không phải kết quả fix.

## Bằng chứng

- `RemoteAtkAction.Init/OnUpdate` trong `main.min_a6195824.js` chờ đồng thời `isEnd` (animation) và `isFlyEnd` (hit sau hiệu ứng bay). Nhánh cận chiến `AtkAction` có timer theo độ dài animation; nhánh đánh xa không có timer tương đương, chỉ dựa guard ở `index.html:600`.
- Chạy hàm native thật với clock ảo: giả lập mất callback animation hoặc throw lúc tạo hiệu ứng bay → đòn đánh xa chỉ thoát ở ngân sách update **5.000 ms** và phát `RemoteAtkAction completion callback fallback`. Giả lập model chưa sẵn sàng liên tục → **15.000 ms**. Cận chiến trong fixture cùng animation700ms thoát ở860ms. Đây là fault injection, không phải đo thời gian animation thật của một skin. Guard giới hạn delta mỗi frame nên thời gian thực có thể khác.
- **Lỗi lifecycle tái hiện:** `RemoteAtkAction.playHitEff()` gắn timer hit sau flight vào attacker (`doTimer(..., o)`), nhưng `OnExit()` chỉ `removeAll(this)` theo action. Trong fixture, thoát đòn lúc450ms vẫn còn hit chạy sau đó. Không có token vô hiệu callback animation của đòn cũ.
- **Lỗi pooling tái hiện:** `MapEffMgr.Update()` đăng ký Promise rồi callback đọc `i.mc`; `CacheData()` trả holder vào pool sau4giây và đặt `mc=null`. Khi holder đã được tái dùng, Promise cũ hoàn tất sẽ xóa **effect mới**. Fixture gọi đúng hàm Update native chứng minh điều này; chưa chứng minh lỗi này một mình làm dừng toàn bộ trận.
- Đối chiếu78 weapon appearance dùng hiệu ứng đánh xa, chạy468 tổ hợp đòn thường/crit × tốc độ1/2 trong scene giả lập. Config không thiếu trường hit bắt buộc và registry đã giải pack có skeleton key cho các hiệu ứng được tham chiếu. **Không tương đương kiểm tải asset/animation/GPU/browser thật**, không kết luận tất cả model đều đúng.

## Live chỉ đọc

- Main/index/overlay v5/handler box: 4/4 hash khớp local; `FashionConfig`, `AppearanceConfig`, `EffectConfig`: 3/3 table hash khớp.
- S1/S2 ready200, process không đổi. Chỉ đọc tối đa256KiB đuôi mỗi error/out log. Không thấy marker exception/open-denied/save-failed của box trong phạm vi đuôi; vẫn có warning Mongoose cũ. Log server không chứa đầy đủ trace lỗi animation phía browser và không loại trừ nghẽn mạng/khựng render.
- Các đoạn combat nằm trong main bundle đã tồn tại trước đợt v5; lượt này không đổi tầm đánh, tốc độ, sát thương, RNG hoặc skin.

## Bước tiếp theo

1. Đã có tên/ID bộ, còn cần xác nhận server, độ dài khựng, thời điểm/video hoặc tái hiện trên QA. Phân biệt đòn dừng nhưng UI vẫn chạy với toàn màn giật; kiểm console `completion callback fallback`, `waitPlayEnd`, `removeEntity`, tài nguyên tải lỗi ngay lúc khựng.
2. Nếu được yêu cầu sửa: kiểm lifecycle theo từng action và identity effect, hủy đúng timer/khóa callback cũ; giữ timeline projectile/animation gốc. Không đổi đánh xa thành cận chiến, tăng speed hoặc chỉ hạ timeout để che lỗi.
3. Test đòn thường/crit, hủy giữa flight, target biến mất, đổi map/skin, tải chậm/lỗi, callback muộn, foreground/background và regression đánh gần. Cần nghiệm thu browser trước khi gọi hoàn chỉnh.

Tool: `tools/audit_ranged_skin_stutter_20260908.js`, `tools/check_ranged_skin_live_20260908.py`.
Evidence: `temp/ranged_skin_stutter_20260908/audit.json`, `live.json`. Fixture chặn network, productionWrites=0.
