# Thiên Diễm Lệnh cho ba BXH Tiên Vực Tranh Phong — 17/10/2026

## Cấu hình cuối

Thêm item `1001` vào quà hiện có của cả ba bảng. Giữ nguyên mọi vật phẩm cũ, số lượng cũ, điều kiện nhận, phạm vi hạng và thời điểm tổng kết.

| Hạng | Thiên Diễm Lệnh thêm |
|---|---:|
| 1 | 10.000 |
| 2 | 8.000 |
| 3 | 6.000 |
| 4–5 | 5.000 |
| 6–10 | 4.000 |
| 11–20 | 3.000 |
| 21–50 | 2.500 |
| 51–500 | 2.000 |
| 501–9999 | 1.600 |

- Điểm Phá Giới: `CrossRivalScoreRankRewardConfig`, đủ 9 mốc.
- Kích Bại Phòng Thủ: `CrossRivalDefenseRankRewardConfig`, đủ 9 mốc.
- Điểm Trận Doanh: `CrossRivalCampRankRewardConfig`, chỉ có hạng 1–4; thêm lần lượt 10.000 / 8.000 / 6.000 / 5.000.
- Theo contract hiện có, thưởng Trận Doanh áp dụng cho mỗi người đủ điều kiện của phe tương ứng, tối đa 200 người/phe. Người đủ điều kiện nhiều loại BXH có thể nhận từng loại thưởng riêng.

## Phạm vi triển khai

- VPS là baseline. Sửa đúng ba chunk thưởng trong bốn binary tại `lhs/update/resource/assets/excel/` và `webgame/game/update/resource/assets/excel/`, tên `config_fashion_20260909.bin` và `config_e5ac72c2.bin`.
- `webgame/game/index.html` đổi `translationVersion` sang `20261017_cross_rival_rank_1001_v2` để invalidation config client. Giữ nguyên bản Việt hóa thông báo và các script khác.
- Không sửa source handler/service; không trực tiếp sửa player, thư lịch sử, ledger hoặc bù thưởng. Kỳ C4 hiện tại chưa có settlement tại preflight.

## Kiểm chứng

- Codec round-trip bốn binary đạt; 711 chunk ngoài ba bảng thưởng giữ nguyên byte. Mỗi row được so sánh sâu: chỉ thay/thêm item1001, các field khác giữ nguyên. Ba bảng của bốn binary khớp nhau.
- Dùng đúng `CrossRivalRewardService.rewards/recipients` live: 34 trường hợp hạng, gồm ranh giới 499/500/501 và bảng Trận Doanh; 205 người nhận giả lập, cap 200 người của phe top1; DB calls/mail writes trong fixture đều 0.
- Raw config cũ có rankMin500 ở dòng cuối hai BXH cá nhân; giữ nguyên field này trong binary. `CrossRivalRules.applyConfig()` hiện có tiếp tục chuẩn hóa thành501 trong effective config; không mở rộng phạm vi sửa lỗi rank.
- Đã triển khai bản cuối lúc 09:59–10:02 ICT: backup/CAS/atomic swap năm file, restart tuần tự S1–S9; chốt đủ 9/9 PM2 online, PID đổi đúng một lần mỗi node ở lượt cuối, readiness Mongo/Redis 9/9. Đã `pm2 save`.
- Read-back lúc `2026-10-17T03:02:00Z`: ConfigService theo đường dẫn config của chín node đều khớp đủ 22 mốc; bốn binary đúng hash. Hai binary client tải qua HTTPS được decode và xác nhận đúng từng mốc; hash index HTTPS cũng khớp disk.
- Gate rollout ban đầu dừng vì S2 cần khoảng16 giây khởi động, vượt ngưỡng chờ12,5 giây; đọc lại xác nhận sẵn sàng rồi tiếp tục, không restart lại node đã xong. Ở lượt cuối, gate process ngoài phạm vi thấy `lhs-real-bots-s9` đổi PID; log xác nhận worker có gate hẹn10:00 và khởi chạy10:00:38. Không có lệnh tooling restart worker này; các server game vẫn đạt9/9 và verification cuối đạt.
- Native authenticated E2E xem đủ ba cửa sổ/nhận thư chưa chạy. Tab browser được tải lại để nạp index mới, đang ở màn đăng nhập; không dùng thông tin đăng nhập lưu sẵn.

## Bằng chứng và khôi phục

- Evidence cấu hình cuối: `_ai_workbench/temp/cross_rival_top1_20261017/all_ranks/{preflight,release,deployment,rollout,verification}.json`.
- Công cụ: `_ai_workbench/tools/release_cross_rival_top1_20261017.js` và `deploy_cross_rival_top1_20261017.py` (đã mở rộng cho đủ các hạng theo yêu cầu bổ sung).
- Backup trước cấu hình cuối: `/linhhoasu/_ai_workbench/backups/cross_rival_rank_rewards_20261017T025914Z` (preimage đã có item1001 top1).
- Backup trước mọi thay đổi quà trong lượt này: `/linhhoasu/_ai_workbench/backups/cross_rival_top1_20261017T025401Z`.
- Hoàn nguyên cần kiểm tra CAS hash hiện hành, khôi phục đúng bốn binary và index từ backup tương ứng, restart tuần tự S1–S9, kiểm readiness/hash/client cache. Không phát lại hoặc sửa thư đã phát sinh trong thời gian cấu hình mới chạy.
