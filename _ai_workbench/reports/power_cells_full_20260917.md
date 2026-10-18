# Lực chiến đầy đủ ở hồ sơ và BXH — 17/09/2026

## Kết quả

Đã phát hành addon `lhs-power-cells-full-v1.js` và thêm đúng1dòng index sau HUDv2. Các `PowerCell` dùng chung ở thông tin cá nhân, người khác, các dòng/bục BXH, Arena/liên-server, bang hội và các thẻ lực chiến nhận số đầy đủ có dấu chấm, ví dụ `898.043.239`.

- Giá trị numeric và data nguồn giữ nguyên; không nhân/chia hệ số hay đổi calculator. Không ghiDB, cấp/bù/trừ vật phẩm hoặc restart.
- Giữ nguyên addon HUDv2 đã được người dùng xác nhận hiển thị đúng; các ô được HUD đánh dấu tiếp tục đi qua rendererHUDv2.
- Giữ số cố ý bị che và chuỗi không phải rawinteger. `OldTrekPowerItem` giữ `isUnknow`/dấu hỏi; các ô so sánh `TempleAttrPkCell` chỉ đổi khi `isPower=true`, trả lại style cũ khi renderer tái dùng cho thuộc tính thường.
- Không thay `overLengthPower` toàn cục vì hàm này còn dùng cho sát thương, điểm và phần thưởng. Nhãn chuyên biệt khác không dùng PowerCell/adapter nêu trên, như lực chiến khuyến nghị khám phá OldTrek, không được thay đổi trong đợt này.
- Số dài đo theo glyph thật rồi scale theo ô; tôn trọng explicitwidth và vùng cha có kích thước xác định, tránh co dần do dùng measuredwidth của lần trước. Các peer cùng hàng như danh hiệu/điểm được xét bounds. Nút phúc trong hồ sơ được dời riêng khi nằm cạnh số mới, không đổi chức năng.
- Font chưa có: giữ scale1, retrybounded; font tới đo lại giá trị mới nhất. Rời stage dọn timer, vào lại phục hồi; không dùng width4096 làm widthđãđo.
- Giữ tween/callback native. Framecuối của native ghi plain digits sau callback; addon định dạng lại ở framekếtiếp để giữ dấuphâncách sau animation. Không đổi rawdata hoặc thời gian/callback tăngLC.

## Kiểm chứng

| Phạm vi | Kết quả |
|---|---|
| Logic riêng | 98 kiểm tra PASS: raw/masked, explicitwidth, không co dần, HUD delegation, nút cạnh số, peerbounds, fontmuộn, detach/reuse, animation/callback, so sánhthuộctính, cài lặp |
| Hồi quy HUDv2 | 316 kiểm tra PASS; source/hashHUDv2 không đổi |
| Font/PowerCell native, layout theo skin | 56 vịtrí thuộc55skin;2HUD giữv2,54vịtríngoàiHUD được thử4mốc898triệu/8,9tỷ/nghìntỷ/MAX_SAFE_INTEGER |
| Khung desktop mặc định | 217casePASS, gồm216layout +1animation; viewport408×647 |
| Điện thoại | 217casePASS; viewport390×844 |
| Fontđếnmuộn | cold-desktop/cold-mobile2giây vàcold-late6,5giâyPASS; số tự hiện898.077.319, scale1, timerđược dọn |
| Production | Publicindex/addonhashkhớp; S1–S4 ready200; PM2PID/restartkhôngđổi; playerWrites0 |

Client public mới đã ghi log `[LHS][PowerCellsFull] installed 20260917_power_cells_full_v1`; không có error gắn addon trong log đã lọc. Chưa dùng thông tin đăng nhập lưu sẵn để vào tài khoản thật/mở profile sau deploy.

Các bài native chạy qua computer-use với engine/font/PowerCell thật và hình học lấy từ skin, dữ liệu QA riêng. Đây **không phải** xác nhận đã đăng nhập mở mọi màn/profile/BXH bằng tài khoản thật sau deploy. Một số thành phần bên cạnh như avatar/nút được dựng tối thiểu để đo; không coi fixture là ảnh toàn bộ màn hình production.

## Phát hành / khôi phục

- SHA addon: `00f0802d13393a47bb0596b7baf35cbe303e089a0a5e0ef7058c65f546fb8f88`.
- SHA index mới: `66d4d14cc030cf09fda72fb8076005aa20e598ef70af1f5ef263a4703711de13`.
- Backup: `/linhhoasu/_ai_workbench/backups/power_cells_full_20260917_054249/index.html.before`.
- Staging: `/linhhoasu/_ai_workbench/temp/power_cells_full_20260917_054249`.
- Cài addon trước index theo CAS; mainDrop100,HUDv2,healthbar không đổi. Không sửa backend, không restart; không rollback trong lần phát hành này.
- Nếu cần rollback: đối chiếu hash với manifest trước, phục hồi index backup theo CAS và chuyển addon mới vào backup; không ghi đè thay đổi mới hơn và không rollbackDB.

## Source và bằng chứng

- `linhhoasu/webgame/game/js/lhs-power-cells-full-v1.js`, `linhhoasu/webgame/game/index.html`.
- Test `tools/test_power_cells_full_20260917.js`; frontendQA `tools/power_cells_visual_qa_20260917.js`; dùng lại server/asset-bootstrap HUD.
- Release tool `tools/release_hud_power_full_20260917.py power-cells`.
- Evidence `_ai_workbench/temp/power_cells_full_20260917/`: baseline/preimage,5visualJSON,release.json.
- Trình điều khiển browser cập nhật giữa lượt làm việc làm mất binding/tabQA và processlocal; đã mở lại fixture, không dùng phiên bảnPASS cũ. Thiếu `GlobalManager.MessageCenter` trong fixture và thiếu định dạng sau Tween.onChange đã được phát hiện/sửa trước deploy.

Người chơi Ctrl+F5 và đăng nhập lại để tải addon; không cần đổi đồ/nâng cấp để kích hoạt số đầy đủ. Chỉ dữ liệu raw đã có mới được định dạng; không đoán số thật từ chuỗi đã rút gọn hoặc bị che.
