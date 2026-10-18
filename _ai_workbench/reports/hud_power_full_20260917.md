# HUD lực chiến đầy đủ — 17/09/2026

## Hotfix v2 đã phát hành — 17/09/2026, 11:24 GMT+7

- Đã thay addon bằng `20260917_hud_power_full_v2`, index chỉ đổi cache token v1→v2. Hash public/installed `d1e1695b5e46dfa4f484e483cc9d23a48feaace14583871fff52588d5c1b2773`.
- Khi `textWidth=0`, giữ scale1, không dùng4096 làm chiều rộng đo được. Hook `$setFontData` riêng đúng label HUD, giữ guard font-key native; font tới thì đo lại với `cell.data` hiện tại, không giữ snapshot số cũ.
- Retry tối đa60lượt×50ms cho giai đoạn skin/font chưa có. Font tới sau thời gian này vẫn được callback đo lại. Skin part đến muộn được nhận qua `partAdded`; đóngHUD dọn timer và bỏ callback cũ, mở lại đo lại. Không hookfont toàn cục hoặc đổi calculator/PowerCell ngoài HUD.
- Test cũv1 thất bại tại scale0,080≠1. Hotfix316unitPASS local/staging; bao gồm delayedfont, latepart, font-key cũ, giá trị đổi trong lúc chờ, timeout,close/reopen,timer cleanup và hồi quy198case trước.
- Native browser cold-desktop,cold-mobile vàcold-late6500ms đềuPASS: trướcfontwidth0/scale1; saufontwidth277/scale1/width279; timerđãdọn. MộtHUD giữ898.043.239, HUDcòn lại nhận898.077.319 ngay khi fontđến màkhôngcần thêm thao tác.
- Warmfont26case desktop+26case mobile390×844PASS với đúng hashv2; giữ một dòng và không đè các vùng lân cận.
- Phát hành CAS+backup chỉaddon/index; mainDrop100,healthbar và toàn bộPM2PID/restart giữ nguyên;4ready200; khôngDB/playerwrites. Backup `/linhhoasu/_ai_workbench/backups/hud_power_font_20260917_042439/{addon.js.before,index.html.before}`.
- Evidence `_ai_workbench/temp/hud_power_full_20260917/hotfix/`: baseline,2preimages,5visualJSON,release.json. Tool release có nhánh `hotfix`, không ghi đè manifest releasev1.
- Chưa xác nhận screenshotHUD tài khoản thật sau reloadv2. CUA đã khôi phục sau debuggerdetach; logtab hiện vẫn cài v1. Kiểm riêng public `/`, `/index.html` đều có tokenv2, addonqueryv2đúnghash; cần Ctrl+F5/đăngnhập lại để bỏ bảncachecũ. Không tựđăngnhập haybấmnângcấp. Kiểmnativefont thật đãPASS trong fixture cô lập; không ghi nhận đó là liveaccountE2E.

## Hậu kiểm theo phản hồi người dùng: cold-font bị co chữ — chưa sửa

Phần này là chẩn đoán baseline v1; hotfix v2 phía trên đã xử lý lỗi được tái hiện.

- Browser live đã đăng nhập Talo xác nhận nền ô lực chiến vẫn còn nhưng số gần như không thấy. Console cài đúng `20260917_hud_power_full_v1`; hash addon/index trùng release, không phải chưa F5/cache cũ. Arena vẫn có sốrútgọn, phù hợp việc addon chỉ đổi HUD.
- Root cause ở `render`: font chưa sẵn sàng → `textWidth=measuredWidth=0` → fallback dùng `label.width=4096`; sau đó width4098 và scale bị đặt0,080078125 (HUDcũ) /0,10261418269230768 (HUDmới).
- Khi font bitmap tải xong, textWidth thật277px và textHeight40px nhưng width/scale vẫn giữ giá trị cũ. Chữ hiệu dụng chỉ≈2–3px nên nhìn như mất. Giá trị `data=898043239` và `text=898.043.239` vẫn nguyên trong fixture.
- Đã tái hiện với adapter font trễ2giây trên cảhaiHUD bằng engine/font thật; `diagnostic-cold.json` resultREPRODUCED, before/after + screenshot quan sát khớp triệu chứng. Chỉ thêm chếđộcold vào toolQA, không sửa sourcegame/deploy/restart/DB trong lượt check này.
- 198unit/52warm-fontcase trước đây không bao phủ cold-font lifecycle. Những PASS đó không đủ để coi lần phát hành đã nghiệm thu đầy đủ.
- Hướng sửa: không lấy widthtạm làm chiều rộng chữ khi font chưa tải; giữ scale an toàn và hẹn đo lại khi font/skin sẵn sàng; dọn retry khi view đóng. Phải kiểm cold/warm, mởđóngHUD, reload/login và tănggiảmLC trên desktop/mobile trước triển khai hotfix. Chưa được thực hiện trong lượt chỉcheck.
- Bằng chứng: `_ai_workbench/temp/hud_power_full_20260917/diagnostic-cold.json`.

## Kết quả

**Release v1 có lỗi cold-font; hotfix v2 đã phát hành như phần cập nhật đầu báo cáo.** Không restart server hay ghi/chỉnh dữ liệu nhân vật. Mục tiêu của addon cho hai HUD `MainPanel`/`MainPanelNew` là hiển thị số gốc với dấu chấm hàng nghìn, ví dụ `898.043.239`, thay cho số rút gọn `8.98` thiếu/sai đơn vị.

- Addon mới: `linhhoasu/webgame/game/js/lhs-hud-power-full-v1.js`.
- `index.html`: thêm đúng một dòng nạp addon sau healthbar v8. Main bundle drop100, healthbar, các addon khác và config giữ nguyên.
- Chỉ đánh dấu `powerCell` của HUD; giữ số `data` numeric. `PowerCell` của popup tăng lực chiến, hồ sơ, BXH và tiền tệ không đổi; không sửa phép tính power hay ownership.
- Số dài được đo bằng font bitmap native, hiển thị một dòng và thu nhỏ khi cần. Giữ bố cục tên/HP; chỉ dời cụm2nút đặc quyền bên phải ở HUD cũ để tránh chồng chữ. HUD mới không dời nút.

## Kiểm chứng

- 198 kiểm tra logic PASS local và staging VPS: số0/âm, ngưỡng nghìn/triệu/trămtriệu/tỷ/nghìntỷ/MAX_SAFE_INTEGER, chuỗi số nguyên, invalid/NaN/Infinity, hai HUD, mở lặp không trôi bố cục, setValue, không đổi power/currency/PowerCell ngoài HUD, cài lặp idempotent.
- Browser computer-use dùng font bitmap, skin PowerCell thật và vị trí hai HUD theo EXML + offset healthbar v8. 26ca desktop773×912 và26ca mobile390×844 PASS; chuỗi đầy đủ đúng, một dòng, không vượt phải704 logicalpx hoặc chồng thanhHP/nútđặcquyền. Thử tăng/giảm giá trị qua cập nhật dữ liệu, không dùng tài nguyên game.
- Visual bắt được lỗi candidate đầu: `maxWidth=NaN` làm bitmap xuống dòng từng ký tự; đã sửa trước deploy bằng đo chiều rộng một dòng rồi scale. Bài kiểm thêm height<=80 và chiều rộng chữ tối thiểu để không nhận PASS giả.
- Public index/addon SHA khớp candidate; addon `41c6db5461d69d291eab2f687d7337d94b5d0920f58a450d146f8391cba7deea`. Main/healthbar hash không đổi.
- PM2 tất cả PID/restart không đổi; S1–S4 `/ready=200`. Không restart node, không cấp/bù/trừ đồ.
- Tải lại tab game thật: console xác nhận `[LHS][HudPowerFull] installed 20260917_hud_power_full_v1`. Sau reload trang quay về màn đăng nhập; không dùng thông tin đăng nhập lưu sẵn để tự đăng nhập.

**Giới hạn:** chưa quan sát HUD của tài khoản thật sau đăng nhập lại ở lượt phát hành này; kiểm hình ảnh đã hoàn thành trong fixture native cô lập. Người dùng đăng nhập lại để tải/quan sát HUD mới. Không lấy bộ kiểm này để khẳng định phép tính lực chiến client/server đã đồng nhất; đợt này chỉ sửa hiển thị số.

## Backup và rollback

- Backup live: `/linhhoasu/_ai_workbench/backups/hud_power_full_20260917_035048/index.html.before`.
- Staging: `/linhhoasu/_ai_workbench/temp/hud_power_full_20260917_035048`.
- Index baseline: `7f36a862aa6d7b25eb848afc49177952c0229f9afb8ce22f653be1826e3b8d26`.
- Nếu cần rollback: đối chiếu hash index/addon với `release.json`, khôi phục index backup theo CAS, chuyển addon mới về backup; không đè index khi đã có thay đổi sau release. Không rollback DB hoặc restart server.
- Không có rollback production ở đợt HUD này.

## Bằng chứng và file hỗ trợ

- `_ai_workbench/temp/hud_power_full_20260917/`: `baseline.json`, `index.before.html`, `visual-desktop.json`, `visual-mobile.json`, `release.json`.
- Tool: `test_hud_power_full_20260917.js`, `serve_hud_power_qa_20260917.js`, `hud_power_visual_qa_20260917.js`, `release_hud_power_full_20260917.py` trong `_ai_workbench/tools`.
- Dùng lại shell HTML/resource có sẵn, không thêm dependency hay tạo bản HTML deliverable. Dừng localhost QA sau kiểm; giữ test/evidence để hồi quy.
