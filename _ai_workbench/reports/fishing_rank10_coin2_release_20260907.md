# Thưởng mọi hạng ×10 và Tiền đồng 2% — 07/09/2026

## 1. Tóm tắt công việc

Đã triển khai lên S1/S2 hai yêu cầu trong cùng bản `20260907_fishing_rank10_coin2_v1`:

- Nhân thêm ×10 Nguyên bảo (item1) và vé tăng tốc (item6) ở toàn bộ 8 nhóm hạng Đại hội câu cá, bảng `Activity6RankConfig[6006]`.
- Giảm tỷ lệ Tiền đồng khi bán cá mới câu trong ngư trường sự kiện từ20% xuống2%: `saleChanceBps=200/10000`.
- Giữ nguyên số lượng1–3 mỗi lần rơi, bonus số lượng Huyền Vũ25%, đổi cuối kỳ1:1.000 Bạc, mọi quà khác và năm gói mua.
- Mô tả Tiền đồng trong client cập nhật thành2%; giữ bản sửa hiển thị K/M/B/T đang chạy.

### Thưởng mới ở tất cả nhóm hạng

| Hạng | Nguyên bảo | Vé tăng tốc | Hiển thị mỗi loại |
|---|---:|---:|---|
|1|10.000.000|10.000.000|10M|
|2|8.000.000|8.000.000|8M|
|3|6.000.000|6.000.000|6M|
|4–10|5.000.000|5.000.000|5M|
|11–50|4.000.000|4.000.000|4M|
|51–100|3.500.000|3.500.000|3.5M|
|101–500|3.000.000|3.000.000|3M|
|501 trở đi|2.000.000|2.000.000|2M|

Không thay đổi lịch sự kiện, điều kiện xếp hạng hoặc quà khác. Không cấp bù/thu hồi/reset bản ghi đã nhận thưởng, không sửa nhân vật người thật.

## 2. File/thư mục đã thay đổi

### Source/config chính — 5 file

- `linhhoasu/lhs/newServer/src/config/fishingEconomy.json`: saleChanceBps200, versionv2-coin2; các trường khác giữ nguyên.
- `linhhoasu/lhs/update/resource/assets/excel/config_e5ac72c2.bin`: chỉ16count item1/item6 thuộc8nhóm hạng6006.
- `linhhoasu/webgame/game/update/resource/assets/excel/config_e5ac72c2.bin`: cùng bảng thưởng với server.
- `linhhoasu/webgame/game/update/resource/assets/excel/lang_cn/config_lang_c2fa8585.bin`: chỉ câu mô tả10000119 đổi20%→2%.
- `linhhoasu/webgame/game/index.html`: thay translationVersion để tải lại config/lang; giữ manifest module số lượngv2.

Binary local server có `SystemConfig` khác sẵn so với VPS. Đã giữ nguyên khác biệt đó; chỉ ghép bảng mục tiêu, không overwrite cả file bằng bản VPS.

### Tool/evidence

- `_ai_workbench/tools/preflight_fishing_rank_x10_20260907.py`: baseline, runtime config path, PID/health; mở rộng thêm nguồn currency trước deploy.
- `_ai_workbench/tools/build_fishing_rank_x10_20260907.js`: build rank-only; guard số cũ ngăn nhân lần hai; roundtrip714bảng.
- `_ai_workbench/tools/build_fishing_currency_2percent_20260907.js`: language và quy tắc Tiền đồng, so sánh chống đổi ngoài phạm vi.
- `_ai_workbench/tools/test_fishing_rank_x10_20260907.js`:34ca rank/currency với cấm kết nối mạng và fixture save; không ghi DB.
- `_ai_workbench/tools/verify_fishing_rank10_coin2_client_20260907.js`:16giá trị client và formatter thật, mô tả2%, manifest không mất patch hiển thị.
- `_ai_workbench/tools/release_fishing_rank_x10_20260907.py`: staging/deploy/verify có baseline, backup, atomic rename, restart tuần tự, rollback tự động nếu rollout lỗi.
- `_ai_workbench/tools/sync_fishing_rank10_coin2_local_20260907.js`: đồng bộ binary local sau deploy, giữ bảng khác.
- `_ai_workbench/tools/check_fishing_rank10_restart_warnings_20260907.py`: phân loại phần stderr mới, không xuất log tài khoản.
- Evidence: `_ai_workbench/temp/fishing_rank_x10_20260907/` gồm preflight, build, currency-build, client-check, stage, release, local-sync, restart-warnings. Tên thư mục giữ theo yêu cầu đầu; bản cuối chứa cả×10 và2%.
- Báo cáo này và HTML; cập nhật `session_report.md/.html`.

### Backup và artifact

- VPS: `/linhhoasu/_ai_workbench/backups/fishing_rank_x10_20260907_030647/`.
- Local: `_ai_workbench/backups/fishing_rank10_coin2_local_20260907/` gồm source JSON,3binary,index và báo cáo cũ.
- Candidate đầy đủ: `server.next.bin`, `economy.next.json`, `client.next.bin`, `lang.next.bin`, `index.next.html` trong thư mục evidence. Không có credential trong các artifact này.

## 3. Lỗi đã gặp & giải pháp

| Vấn đề | Nguyên nhân/bằng chứng | Cách xử lý | Cách tránh lặp lại |
|---|---|---|---|
| Dễ chỉ tăng hạng1 | Yêu cầu được làm rõ là mọi hạng |8nhóm×2item=16count; test hạng đầu/cuối nhóm | Guard đủ8key và đủ2item mỗi nhóm |
| Nguy cơ nhân×10 lần hai | Build theo giá trị hiện tại nếu chạy lại không guard | Assert baseline1M/800K/…; deploy chặn state đã tồn tại | Không chạy lại generator trên config mới |
| Server còn tỷ lệ cũ sau sửa file | FishingEconomyService require JSON và ConfigService cache trong process | Cài binary/rules trước; restart riêng S2 rồi S1 | Kiểm config path từ process, health và PID/restart |
| UI vẫn ghi20% | Tỷ lệ server và LanguageConfig là hai nguồn khác nhau | Cập nhật đúng10000119 và cache token | Test mô tả2%, HTTP hash config/lang |
| Local config có khác biệt độc lập | SystemConfig local khác VPS trước phiên | Preserve toàn bộ chunk ngoài bảng mục tiêu | So raw bytes713bảng không đổi |
| Cảnh báo Mongoose khi restart | stderr mới309bytes mỗi server, có marker MONGOOSE | Ghi nhận, không sửa schema ngoài phạm vi;0fatal marker trong mẫu | Không tuyên bố log hoàn toàn trống hoặc đã fix warning |

Không phát hiện mojibake mới. Mô tả tiếng Việt được giải mã/ghi lại đúng binary schema, chỉ thay20% thành2%, không convert encoding đại trà.

## 4. Kỹ năng / kinh nghiệm mới

- Tỷ lệ2% được kiểm định bằng cách duyệt đủ10.000 kết quả RNG: đúng200kết quả trúng. Đây là kiểm logic ngưỡng, không phải mẫu ngẫu nhiên live.
- Bonus Huyền Vũ là tăng số lượng25% có lưu phần lẻ, không tăng xác suất rơi; giữ nguyên phân biệt này.
- Bán tay và bán tự động dùng chung saleBonus/provenance. Cá cũ, sai ngư trường, cá khóa, quá kỳ hoặc bán lại không tạo thêm Tiền đồng.
- Không làm tròn tăng số thưởng trên client; formatter đang chạy cho đúng10M/8M/6M/5M/4M/3.5M/3M/2M.
- Test fixture không được gọi là giao dịch người thật; keep save/replay/commit-timeout cases độc lập với kiểm HTTP/health.

## 5. Trạng thái hiện tại

### Đã xác minh

-34ca local PASS;34ca staging Linux PASS;34ca chạy source runtime trong process test riêng sau mỗi restart PASS.
- Core gameplay contract:714bảng, PASS trên staging.
-16giá trị rank giữa client/server đúng; các row/item khác trong Activity6RankConfig và713bảng khác giữ nguyên. Mô tả2% được kiểm từ binary.
- Test gồm tất cả nhóm hạng trên serverId1001/1002, biên cuối10/50/100/500/999999, đã settled không cấp lại, score0 không nhận, chưa hết kỳ không phát, savefail và timeout đã commit không nhân đôi.
- Currency: exact200/10.000, boundary199/200,1–3,bonus25%/phần lẻ/relog, sai scene/cũ/locked/expired/replay, đổi cuối kỳ, bán tay và tự động ở cả hai phía ngưỡng.
- Đĩa VPS16file được guard và đối chiếu expected; HTTP nội bộ/công khai của client bin,lang,index khớp hash mới.
- S2 PID15439/restart58, S1 PID17235/restart1386: mỗi game server restart đúng1lần. Bốn process dist/admin/bots giữ nguyên PID/restart. Ready8080/8083 đều200.
- Hậu kiểm lúc10:07:57 GMT+7; số liệu mới hơn nếu có nằm trong `release.json`.
- Local sync PASS; giữ SystemConfig khác sẵn. Module hiển thị số lượng và bundle main không đổi.

### SHA-256

| File trên VPS | SHA-256 |
|---|---|
| Server config bin |6e357dfc321709aa0fcd8cdcb36e624522d1aa65fb71abd0e711c3f209d03fd6|
| fishingEconomy.json |e8fca4674398f94c665ba930345e57afd094a04ce45b5aebc99fbc9d1f5127d0|
| Client config bin |9a405adfbd064e74afaf25819b005d826590fdbbed31542f8653b013c6111c7b|
| Language bin |17be1f47ce9de5d3b60c0328688f48dd0c2259be83b2ac5c269884b59fcb7cf4|
| index.html |f69a4f8f17e2f84a65eea77a6e64acbb53621d9a52b642a8cd2ee1935f4fe232|

### Giới hạn

- Không đăng nhập/nhận thưởng/bán cá bằng tài khoản thật; test settlement/RNG/save là fixture cấm network trong process riêng.
- Không mở lại native UI ở phiên này; đã kiểm data/formatter thật và HTTP. Phần renderer native là bảnv2 đã kiểm ở phiên trước, không bị sửa.
- Không kiểm nhận thưởng cuối kỳ thật trong tương lai; không tự chạy bù lịch sử. Cờ settled cũ giữ nguyên.
- Chưa xử lý cảnh báo Mongoose startup vì ngoài phạm vi.0fatal marker không đồng nghĩa mọi log toàn hệ thống không có cảnh báo.

## 6. Bước tiếp theo

1. Reload game/Ctrl+F5 để nhận token `20260907_fishing_rank10_coin2_v1`; không cần xóa dữ liệu tài khoản.
2. Kiểm bảng thưởng Đại hội câu cá: mọi nhóm hạng dùng số trong bảng trên; mô tả Tiền đồng ghi2%.
3. 2% là xác suất mỗi lần bán cá đủ điều kiện, không cam kết cứ 50 con chắc chắn rơi 1 lần. Quyền lợi Huyền Vũ và số lượng 1–3 không đổi.
4. Nếu có lỗi mới, dùng manifest release hiện tại để kiểm. Không chạy verify release cũ rồi coi hash khác do bản mới là lỗi, không reapply multiplier cũ.
5. Khi cần rollback sau phát hành, phải kiểm hash hiện tại, khôi phục đúng5file backup và chỉ nạp lại hai game server. Tool hiện có rollback tự động trong quá trình deploy, không có lệnh rollback hậu kỳ độc lập; không tự rollback khi đã có giao dịch với thiết kế mới.
