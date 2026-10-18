# Tiên Vực Tranh Phong — đã mở công khai sau native QA

Cập nhật 15/10/2026, 16:35 ICT. Đã hoàn tất native QA có kiểm soát bằng tài khoản `vanduc97` trên S1 và S2, sửa các lỗi phát hiện từ client thật, rồi mở public cho toàn bộ S1–S8. Release hiện hành `enabled=true`, `qaActors=[]`, `activationAt=1792055286791`; world public `rival_v2_C4_1791738000000` được tạo riêng sau khi đóng namespace QA. Không còn giới hạn người dùng theo allowlist.

## Bằng chứng mới

- Cấp tài nguyên thử đúng 8 active role của `vanduc97` qua API GM hiện có, có preimage/read-back; không đụng hai role orphan. S1 sau cấp: vé310=100, tiền sự kiện311=20.000, props312–318=100; các server còn lại cũng đủ điều kiện level100. Receipt `_ai_workbench/temp/cross_rival_20261015/admin-native-resource-grant.json` và kế hoạch trước ghi riêng.
- Native browser đã vào lobby, vào map đối phương bằng vé, thấy nhân vật khác server trong cùng room `1_0`, thu thập rương và ghi 300 điểm vào world QA. DB hậu kiểm không có outbox lỗi hoặc log `[CrossRival]` lỗi. Hai lỗi thật được phát hiện và sửa: leave lobby phát nhầm gói6502 làm bật bảng Top3 giữa mùa; packet1202 dùng delta làm vé hiển thị 199 thay vì số tuyệt đối. Sửa thêm HP core/flag về basis-point10000 và giữ tọa độ truyền tống hợp lệ.
- Rollout `integration-native-fix1` và `integration-native-fix2` đều backup/CAS/syntax, restart tuần tự và readiness8/8. Backup mới nhất `/linhhoasu/_ai_workbench/backups/cross_rival_integration-native-fix2_20261015_085129`; public-open backup `/linhhoasu/_ai_workbench/backups/cross_rival_integration-public-open_20261015_091836`.
- `integration-tests.json` sau hai fix: **21 PASS**, MongoDB/PlayerService/BattleService thật, hai instance và hai tiến trình deadline; có wallet absolute/HP/leave settlement. `integration-safety-tests.json`: **49 PASS**, 1.700 refusal, network/productionWrites=0 trong fixture. Public gate test: **PASS**, 8 server, `maintenance=false`, `qaActors=0`.
- Hậu kiểm public lúc09:23UTC: `publicWorlds=1`, world public revision0, điểm/phe/player/outbox đều rỗng trước người chơi đầu tiên; QA world và lease đã dọn theo namespace exact, public world vẫn giữ nguyên. Không xóa mail hoặc dữ liệu player.
- Client sau public đã đăng nhập lại S1 và render bình thường. Lượt native trước khi public đã kiểm chứng map, vé, thu thập, packet state và hai client server; event public gate đã được mở sau khi QA pass. Native browser không tự động hóa được đủ combat/claim mail trên cả tám server do UI canvas/phiên một tài khoản, nên phần đó vẫn cần theo dõi log/DB khi người chơi thật tham gia.

## Trạng thái mở

Đã mở cho người chơi S1–S8, cấp100/ngày1, Du kích10:00–19:55 và Kịch chiến20:00–20:30 GMT+7. Không gọi đây là load-tested không giới hạn: world vẫn giới hạn2.000 hồ sơ/8MiB và wallet4.096 receipt/nhân vật; cần theo dõi production metrics và xử lý rollback theo receipt nếu phát sinh lỗi mới. Không có direct player write từ deployment; chỉ có grant tài nguyên QA đã được người dùng ủy quyền cho `vanduc97`.

# Tiên Vực Tranh Phong — tích hợp gameplay, chưa nghiệm thu mở công khai

Cập nhật 15/10/2026, 15:01 ICT. Đã nối các adapter và triển khai release `20261015_cross_rival_integration_v2` cùng bản bổ sung đồng bộ phiên/đồng hồ BXH và bảo vệ recovery trên S1–S8 ở trạng thái **bảo trì**: `enabled=false`, `activationAt=0`, `qaActors=[]`. Chưa được gọi toàn bộ event là hoàn chỉnh. Các đợt rollout đều backup/CAS/hash và readiness8/8 đạt.

## Phần đã triển khai

| Hạng mục | Cách xử lý |
|---|---|
| Vé, tiền, vật phẩm | Trừ/cộng cùng receipt trong một CAS document nhân vật; dùng PlayerService và khóa mutation hiện có. Thiếu vật phẩm không âm kho. Lỗi không rõ commit giữ lệnh để đối soát. Hủy lệnh ghi tombstone trước khi hoàn tiền; chỉ tạo refund nếu thực sự có debit, tránh input lỗi làm đầy world. Replay không trừ/phát lại; hồ sơ lỗi không chặn vòng recovery của người khác. Đồng bộ túi bằng packet1202. |
| Combat thật | Nạp nhân vật thật từ DB server tương ứng, gọi BattleService hiện có, lưu kết quả bền vững và dựng packet trận native cho raid61/62/63. Hỗ trợ cả thắng/thua, máu còn lại, chết/bảo hộ, hồi sinh trả phí. Không tạo đối thủ hoặc kết quả thắng giả. |
| Liên server | State Mongo dùng chung theo kỳ, revision/CAS; worker có lease, các node phát thay đổi tới client của mình. Hai tiến trình Node tranh cùng lệnh/deadline chỉ ghi điểm một lần. Mốc đồng bộ theo phiên tránh tạo lại người đã có trong phản hồi vào map. |
| Buff/phòng thủ | Nối vật phẩm312–318 với thời hạn, tiêu hao, cooldown và hiệu ứng theo config/miêu tả Trung; thủ vệ là người phe nhà đang hiện diện gần cột. Có buff số người, giảm tốc phá cột, bỏ qua thủ vệ, ẩn thân, hồi máu, tăng tốc, tăng/suy yếu thuộc tính và tự bạo không kết liễu. |
| Cột/cờ/map | Dùng tọa độ và thông số config, chặn đường xuyên vùng cấm, điểm xuất hiện ở ngoài vùng cấm của cờ. Deadline mới gây sát thương/cộng điểm; có hủy, chết, hết lượt, respawn. Cờ chỉ đánh ở Kịch chiến; chiếm cờ chuyển điểm phe và bonus một lần. |
| Nhiệm vụ và ba loại thưởng | Task phát vào túi qua outbox có receipt. Cuối kỳ đóng snapshot, tạo riêng thư cá nhân/trận doanh/phòng thủ theo bảng quà hiện có. Mỗi node ghi thư vào DB của mình; mail ID xác định trước và claim ledger chống phát lại sau khi thư đã nhận/xóa. Người chỉ vào xem, không có thành tích, không tự nhận quà xếp hạng. |
| Client | Đối chiếu hàm native Trung; thêm request identity và ACK đúng UID, chặn callback thất bại, cập nhật trạng thái/HP/thủ vệ, Việt hóa mô tả vật phẩm. Đồng hồ BXH dùng cutoff kỳ của server. Không đổi main bundle/atlas hoặc tự vẽ lại giao diện. |

Map liên minh cố định: S1+S8 → phe1; S2+S7 → phe2; S3+S6 → phe3; S4+S5 → phe4. Đây là luật tùy biến cho UI bốn phe, chưa chứng minh cân bằng dân số/lực chiến. Cấp100; Du kích10:00–19:55, Kịch chiến20:00–20:30, GMT+7. Vé310 khi vào phe đối phương trong Du kích; vào lại cùng membership còn hạn không trừ lại hoặc gia hạn miễn phí.

Các lựa chọn tùy biến cần nghiệm thu: phòng thủ bằng người đang hiện diện, không có NPC tuần tra giả; chống farm cùng cặp trong10phút; mỗi mục tiêu chỉ một người thực hiện thao tác tại một thời điểm; ba loại thưởng chốt tại `cycle.endTime`. Shop vật phẩm chiến đấu native có thời điểm đóng riêng theo trận cuối. Không khẳng định toàn bộ luật đã giống Cozy/Trung.

## Kiểm chứng và giới hạn bằng chứng

- `integration-safety-tests.json`: **48 PASS**, gồm1.700 gọi lặp/đồng thời bị từ chối khi bảo trì; dùng callback/hàm đếm giờ trích từ bundle native thật trong VM. Đây không phải trình duyệt chơi game.
- `world-ram-tests.json`: **26 PASS** domain hiện tại. Kết quả Mongo domain25ca ở lượt trước là lịch sử của prototype; không gộp thành kết quả hiện tại.
- `integration-tests.json`: **18 nhóm PASS** với MongoDB, PlayerService, BattleService thật trong DB QA riêng; hai instance service và hai tiến trình Node. Có debit/replay/hoàn tiền/commit-unknown, không sinh refund khi chưa thu tiền, cách ly lỗi từng hồ sơ recovery, buff/guard, thắng/thua/packet trận, hồi sinh, task vào túi, cờ, ba luồng thư, reconnect/presence. Mốc cờ còn1500HP và điều kiện thưởng thủ được seed riêng trong fixture, không giả làm một mùa chơi tự nhiên.
- Các DB fixture do lượt này tạo đã được xóa sau khi xác minh owner và đúng hai nhân vật `QA_RIVAL_A/B`. `integration-qa-cleanup.json` ghi riêng hai fixture từ lần test tọa độ thất bại. Không thay DB người chơi, không tạo account production, không gửi thư thử cho người thật.
- `integration-player-preflight.json`: tại07:32UTC, S1–S8 không có điểm hoặc task đã nhận dương trong C4; chưa có worldv2 production. Code chỉ adopt task đã claim đúng kỳ, không đem điểm mô phỏng cũ sang bảng điểm mới. Không sửa thư/thưởng C3 lịch sử.
- `integration-population-preflight.json`:07:53UTC có154 nhân vật cấp≥100 kể cả bot: S1…S8 lần lượt49/19/16/12/16/10/17/15; thấp hơn cap2.000. Đây là số lượng hồ sơ, không phải số online hoặc benchmark tải. C4 vẫn không có legacy điểm/task đã nhận dương; worldv2 production vẫn0.
- `integration-deployment.json`:16file, backup/CAS/hash và restart tuần tự, readiness Mongo/Redis **8/8**. `integration-verification.json`: nguồn hiện hành có28handler, maintenance bật, HTTPS index/addon khớp file VPS, hạng499/500/501 không chồng.
- `integration-sync-deployment.json`: bổ sung4file (hai service, addon, index), hoàn tất07:50UTC. `integration-sync-verification.json`: readiness8/8, PID/restart khớp receipt, ba file HTTPS khớp disk, gate bảo trì còn bật. Process ngoài phạm vi giữ nguyên tại mỗi rollout.
- `integration-recovery-deployment.json`: hai service domain/runtime; backup `cross_rival_integration-recovery_20261015_075743`. Hậu kiểm `integration-recovery-verification.json` lúc08:01UTC: readiness8/8, PID/restart khớp receipt cuối,28handler, ba HTTPS hash khớp disk và maintenance=true. Đây là trạng thái triển khai cuối của lượt này.
- Đã mở client HTTPS thật: màn hình đăng nhập render được. Chưa đăng nhập/chơi sự kiện bằng danh tính QA được phép; chưa nghiệm thu animation chiến đấu, thao tác bản đồ, cửa hàng, nhận thư và desktop/mobile sau login. Không dùng tài khoản người chơi đã lưu trong trình duyệt để thử.

## Còn phải đạt trước khi mở

1. Native E2E ít nhất hai người ở hai node: vào map/trừ vé → thấy nhau/di chuyển → cột/cờ/guard/buff → thắng và thua → hồi sinh → rời/vào lại → ngắt mạng/relog. Smoke quyền vào event đủ S1–S8. Cần tài khoản QA được chỉ định hoặc quyền tạo/cấp tài nguyên thử; QA không được lẫn vào BXH/thưởng của mùa người chơi thật.
2. Client nhận task và nhận cả ba loại thư qua handler mail thật, đối chiếu túi/ledger sau claim/retry/relog; kiểm shop21/22 và quota ngày/kỳ. Test hiện tại xác minh tạo thư và chống phát lại, chưa bấm nhận thư bằng client thật.
3. Kiểm tải theo quy mô thực. World hiện là một document, giới hạn2.000 hồ sơ/kỳ và8MiB; ví có tối đa4.096 receipt/nhân vật. Cần chính sách lưu trữ receipt và kiểm tranh chấp/độ trễ trước khi cam kết phục vụ không giới hạn qua nhiều mùa. Không load-test production bằng người thật.
4. Nghiệm thu tác động đầy đủ của buff/phòng thủ, hitbox/path native, đồng hồ/cửa sổ giờ và cân bằng bốn liên minh. Các test tổng hợp không thay thế nghiệm thu trận đấu thật.

## Source, deploy và rollback

VPS là baseline: `/linhhoasu/lhs/newServer`; web `/linhhoasu/webgame/game`. Bản staged tương ứng ở `_ai_workbench/temp/cross_rival_20261015/next/`; không ghi đè cây source local cũ ngoài phạm vi. Các file chính: `CrossRivalEconomyService`, `CrossRivalBattleAdapter`, `CrossRivalBattlefieldService`, `CrossRivalProtocolService`, `CrossRivalRuntimeService`, `CrossRivalRewardService`, `CrossRivalHandlerService`, `CrossRivalRules`, `crossRivalRelease.json`; sửa hẹp PlayerService/BattleService/app/settlement và addon riêng.

Backup tích hợp trước16file: `/linhhoasu/_ai_workbench/backups/cross_rival_integration_20261015_073309`. Backup đợt safety trước đó: `/linhhoasu/_ai_workbench/backups/cross_rival_safety_20261015_063215`. Backup bản bổ sung: `/linhhoasu/_ai_workbench/backups/cross_rival_integration-sync_20261015_074711` và `/linhhoasu/_ai_workbench/backups/cross_rival_integration-recovery_20261015_075743`.

Rollback theo đúng receipt và hash hiện hành: đóng gate CrossRival, khôi phục đúng preimage từng file, restart tuần tự và kiểm `/ready`/hash/HTTPS. File mới không có preimage phải được chuyển ra khỏi đường import nếu rollback; không xóa receipt/DB/thư sau khi event đã phát sinh giao dịch. Không tắt `CROSS_EVENT_ENABLED` chung hoặc bật lại các handler mô phỏng cũ.

Công cụ tái sử dụng: `_ai_workbench/tools/test_cross_rival_{safety,world,integration}_20261015.*`, `deploy_cross_rival_safety_20261015.py` (`--integration`, `--sync-fix`, `--recovery-fix`), `verify_cross_rival_safety_20261015.js`. Không có automation tự mở sự kiện.

Dung lượng scoped workbench tại lượt bàn giao: khoảng10,4MiB/102file trước receipt cuối; bundle native tham chiếu8,58MiB là phần lớn nhất và đang dùng bởi test callback/cutoff. Các baseline/CAS/test evidence còn cần để rollback hoặc tái hiện, chưa đề xuất xóa chúng trước nghiệm thu. Không tạo dependency/build copy; DB fixture của lượt này đã dọn.
