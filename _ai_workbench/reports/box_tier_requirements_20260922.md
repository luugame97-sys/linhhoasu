# Điều kiện Rơi thăng bậc 1–100 — audit ngày 22/09/2026

## Kết luận

- Xác minh từ config tại runtime VPS lúc 2026-09-22T06:08:50.316Z: **10 → 11 cần cấp nhân vật 800**, cấp rơi27, Yêu Vương stage36; 5 lần ×450 Nguyên bảo =2.250; chờ2 giờ.
- `BoxTierConfig[10].task=[70010,70110,70210]`; task70110 có `activeId=6, taskValue1=800`. Dữ liệu này đã có trong binary gốc `config_fashion_20260909.bin`, không do client tự nhân hay đọc sai cấp.
- Đây là **Rơi thăng bậc** (`boxInfo.tier`), khác **Rơi tăng cấp** (`boxInfo.level`).
- Không đổi config/source game, không deploy/restart, không gọi RPC/gameplay, không đọc/ghi hồ sơ người chơi để làm audit. Thử sửa local trong lượt kiểm tra đã gỡ lại; hash server/client trở về đúng bản được kiểm chứng, không phát hành.

## Vì sao ảnh hiện 783/730 và Đã max

Ảnh không hiển thị điều kiện10→11. Client đang không có dòng bậc11 nên coi bậc10 là cuối. Hàm native `BoxStageUpPanel.updateUI` lấy task theo `(isMax ? BoxTierConfig[tier-1] : BoxTierConfig[tier]).task`.

Vì vậy ở bậc10 đang Đã max, ảnh hiển thị task bậc9: cấp rơi26, nhân vật730, boss35 (Thiên Tiên trung kỳ). Sau khi có bậc11, panel phải chuyển sang task bậc10: cấp rơi27, nhân vật800, boss36 (Thiên Tiên hậu kỳ).

Log addon “tiers=100” ở màn hình login chỉ xác nhận tại thời điểm đó, chưa chứng minh config còn nguyên sau login hoặc task đã đồng bộ; kết luận trước quy hoàn toàn cho cache là chưa đủ chứng cứ. Lượt này không tái hiện session của người trong ảnh.

## Luồng nâng bậc thực tế

1. Server lấy dòng của **bậc hiện tại n**, không lấy dòng n+1; phải có dòng n+1 mới được nâng.
2. Với tiến độ chưa đủ, chuẩn hóa task của người chơi và kiểm **đồng thời cả ba điều kiện**: cấp rơi, cấp nhân vật, tiến độ Yêu Vương. Thiếu task trả `result=-2, taskId`, không trừ Nguyên bảo.
3. Mỗi lần RPC2150 thành công tiêu item1 = `tierUpCost[tierExp]`, tăng tierExp thêm1. Thiếu tiền trả result=-1. Tham số client không quyết định bậc hay target.
4. Đủ nấc chi phí (bậc1 có3 nấc, các bậc2–99 có5 nấc) mới bắt đầu `tierUpTime = now + timeCost*1000`.
5. Hết giờ, RPC2152 hoặc xử lý login tăng **một bậc**, reset tierExp/thời gian. Không có xác suất thất bại theo code này.
6. RPC2151 dùng **Phù tăng tốc/item6**, mặc định mỗi phù giảm **300 giây =5 phút**. Runtime S1–S5 không đặt env override thời gian chờ/đơn vị phù. Cờ “speedUp” mở nhanh không tự chia đôi thời gian nâng bậc khi không có override.
7. Bậc100 có count100, không có dòng101; không thu phí để nâng tiếp. Hàng100 có target nhân vật1000 nhưng **không dùng để đạt bậc100**: bước99→100 dùng target998 từ hàng99.
8. Số món mỗi lần bằng count của bậc đang có, cộng quyền thẻ tháng còn hạn, server cap100. Vẫn tiêu Baozi theo số món thực mở; không được100 món miễn phí hay cấp thẳng bậc.

### Cách server tính tiến độ nhiệm vụ

- activeId9: `boxInfo.level` (cấp rơi).
- activeId6: `player.level` (cấp nhân vật).
- activeId39: max của `other_attr_info.mainTaskProgress.dungeonBossMaxMapId`, `raidInfo.demonBossInfo.stage`, `raidInfo.bossStage`, `roleInfo.stage-1`, cộng khả năng giữ progress đã lưu; không chỉ đọc log thắng boss.
- State nhiệm vụ đã hoàn tất/nhận thưởng được giữ lại. Vì vậy khi tăng target trong tương lai phải xét progress/status cũ; chỉ sửa TaskConfig có thể chưa đủ để siết tài khoản đã hoàn thành. Không tự reset dữ liệu người chơi.

## Công thức mở rộng hiện đang phát hành

Bậc1–10 dùng config gốc. Với **n là bậc hiện tại, 11≤n≤99**:

```text
Cấp rơi       = min(100, 27 + ceil((n-10) × 73 / 90))
Cấp nhân vật  = min(1000,800 + ceil((n-10) ×200 / 90))
Boss stage    = min(100, 36 + ceil((n-10) × 64 / 90))
Phí mỗi nấc   = 450 + (n-10) ×50 Nguyên bảo
Số nấc        = 5
Tổng phí      = 5 × phí mỗi nấc
Thời gian     = 7200 + (n-10) ×1800 giây
Task IDs      = 970000+n, 971000+n, 972000+n
```

“ceil” là làm tròn lên. Ví dụ hàng11 áp dụng cho11→12, không phải10→11.

## Lỗi/rủi ro đã xác nhận để chỉnh đúng

- **Boss vượt giới hạn:** DemonBossConfig chỉ đến45, trong khi công thức từ23→24 đòi46; tất cả77 bước từ23→24 đến99→100 đòi boss46–100 không tồn tại. Nhân vật thường không có đường tiến độ hợp lệ để đáp ứng; dữ liệu GM/legacy có thể khác. Đây là lỗi của bản mở rộng trước, không phải người chơi thiếu thao tác.
- **Tên boss sai:** task972011–972100 đều sao chép textId20070207 (“Địa Tiên tiền kỳ”), dù target37–100. Không dùng tên trên UI để suy ra đúng stage trong các dòng mở rộng.
- **Mốc730/800:** 730 chỉ để9→10;800 để10→11. Muốn giảm ngưỡng10→11 phải sửa task70110 trên cả client/server, không chỉ đổi số800 trong công thức từ11 trở lên.
- **Thời gian dài:** riêng10→100 tổng lý thuyết 1.203.750 Nguyên bảo và 90 ngày 22 giờ 30 phút, chưa gồm thời gian đạt cấp rơi/nhân vật/boss. Đây là tổng trên config, không khẳng định thực sự nâng được đến100 với lỗi boss hiện tại.
- Cấp rơi100/nhân vật998 có tồn tại trong config (max cấp nhân vật1305), nhưng cấp rơi có progression chi phí/thời gian riêng, không chỉ điều kiện level.

## Các điểm tùy chỉnh và file

| Muốn đổi | Dữ liệu cần sửa đồng bộ |
|---|---|
| Mốc10→11 | TaskConfig70010/70110/70210 và BoxTierConfig10 |
| Mốc11→100 | công thức targets trong generator server và client |
| Bỏ/đổi yêu cầu Yêu Vương | task list + activeId/target; không đặt stage ngoài DemonBossConfig |
| Nguyên bảo | tierUpCost của dòng hiện tại |
| Số lần góp phí | độ dài tierUpCost; UI có progress nấc |
| Thời gian chờ | timeCost (giây); 2150/2151/2152 và login phải thống nhất |
| Số món | count, server maxOpenCount, client getAutoNum/list/UI; không đổi ownership thẻ tháng ngầm |
| Mô tả hiển thị | TaskConfig.textId + LanguageConfig; tên boss đúng target |

- [Generator server](I:/Linhhoasu/server/server/linhhoasu/lhs/newServer/src/config/dropLevel100.js:70)
- [Generator client](I:/Linhhoasu/server/server/linhhoasu/webgame/game/js/lhs-box-tier100-v1.js:24)
- [Handler thăng bậc](I:/Linhhoasu/server/server/linhhoasu/lhs/newServer/src/handlers/compat.js:1272)
- [Tiến độ nhiệm vụ](I:/Linhhoasu/server/server/linhhoasu/lhs/newServer/src/handlers/playerPayload.js:548)
- [Đơn vị phù tăng tốc](I:/Linhhoasu/server/server/linhhoasu/lhs/newServer/src/utils/boxTiming.js:46)
- [Bằng chứng runtime đầy đủ](I:/Linhhoasu/server/server/_ai_workbench/temp/box_tier100_20260922/requirements_live.json)

## Toàn bộ99 bước nâng bậc theo config live

Cột thời gian là thời gian chờ sau khi trả đủ Nguyên bảo; boss là stage tiến độ yêu cầu, không phải số lần tiêu diệt. Dấu ⚠ là stage vượt45 chưa tồn tại. Chưa áp dụng sửa/đề xuất mới vào bảng này.

| Nâng bậc | Cấp rơi ≥ | Nhân vật ≥ | Boss stage ≥ | Số nấc × Nguyên bảo/nấc | Tổng Nguyên bảo | Chờ |
|---|---:|---:|---:|---:|---:|---|
| 1 → 2 | 8 | 60 | 8 | 3 × 20 | 60 | 10 giây |
| 2 → 3 | 11 | 110 | 12 | 5 × 50 | 250 | 1 phút |
| 3 → 4 | 14 | 190 | 17 | 5 × 100 | 500 | 3 phút |
| 4 → 5 | 17 | 290 | 22 | 5 × 150 | 750 | 5 phút |
| 5 → 6 | 20 | 400 | 26 | 5 × 200 | 1.000 | 9 phút |
| 6 → 7 | 22 | 480 | 28 | 5 × 250 | 1.250 | 15 phút |
| 7 → 8 | 24 | 580 | 31 | 5 × 300 | 1.500 | 30 phút |
| 8 → 9 | 25 | 660 | 33 | 5 × 350 | 1.750 | 1 giờ |
| 9 → 10 | 26 | 730 | 35 | 5 × 400 | 2.000 | 1 giờ 30 phút |
| 10 → 11 | 27 | 800 | 36 | 5 × 450 | 2.250 | 2 giờ |
| 11 → 12 | 28 | 803 | 37 | 5 × 500 | 2.500 | 2 giờ 30 phút |
| 12 → 13 | 29 | 805 | 38 | 5 × 550 | 2.750 | 3 giờ |
| 13 → 14 | 30 | 807 | 39 | 5 × 600 | 3.000 | 3 giờ 30 phút |
| 14 → 15 | 31 | 809 | 39 | 5 × 650 | 3.250 | 4 giờ |
| 15 → 16 | 32 | 812 | 40 | 5 × 700 | 3.500 | 4 giờ 30 phút |
| 16 → 17 | 32 | 814 | 41 | 5 × 750 | 3.750 | 5 giờ |
| 17 → 18 | 33 | 816 | 41 | 5 × 800 | 4.000 | 5 giờ 30 phút |
| 18 → 19 | 34 | 818 | 42 | 5 × 850 | 4.250 | 6 giờ |
| 19 → 20 | 35 | 820 | 43 | 5 × 900 | 4.500 | 6 giờ 30 phút |
| 20 → 21 | 36 | 823 | 44 | 5 × 950 | 4.750 | 7 giờ |
| 21 → 22 | 36 | 825 | 44 | 5 × 1.000 | 5.000 | 7 giờ 30 phút |
| 22 → 23 | 37 | 827 | 45 | 5 × 1.050 | 5.250 | 8 giờ |
| 23 → 24 | 38 | 829 | 46 ⚠ | 5 × 1.100 | 5.500 | 8 giờ 30 phút |
| 24 → 25 | 39 | 832 | 46 ⚠ | 5 × 1.150 | 5.750 | 9 giờ |
| 25 → 26 | 40 | 834 | 47 ⚠ | 5 × 1.200 | 6.000 | 9 giờ 30 phút |
| 26 → 27 | 40 | 836 | 48 ⚠ | 5 × 1.250 | 6.250 | 10 giờ |
| 27 → 28 | 41 | 838 | 49 ⚠ | 5 × 1.300 | 6.500 | 10 giờ 30 phút |
| 28 → 29 | 42 | 840 | 49 ⚠ | 5 × 1.350 | 6.750 | 11 giờ |
| 29 → 30 | 43 | 843 | 50 ⚠ | 5 × 1.400 | 7.000 | 11 giờ 30 phút |
| 30 → 31 | 44 | 845 | 51 ⚠ | 5 × 1.450 | 7.250 | 12 giờ |
| 31 → 32 | 45 | 847 | 51 ⚠ | 5 × 1.500 | 7.500 | 12 giờ 30 phút |
| 32 → 33 | 45 | 849 | 52 ⚠ | 5 × 1.550 | 7.750 | 13 giờ |
| 33 → 34 | 46 | 852 | 53 ⚠ | 5 × 1.600 | 8.000 | 13 giờ 30 phút |
| 34 → 35 | 47 | 854 | 54 ⚠ | 5 × 1.650 | 8.250 | 14 giờ |
| 35 → 36 | 48 | 856 | 54 ⚠ | 5 × 1.700 | 8.500 | 14 giờ 30 phút |
| 36 → 37 | 49 | 858 | 55 ⚠ | 5 × 1.750 | 8.750 | 15 giờ |
| 37 → 38 | 49 | 860 | 56 ⚠ | 5 × 1.800 | 9.000 | 15 giờ 30 phút |
| 38 → 39 | 50 | 863 | 56 ⚠ | 5 × 1.850 | 9.250 | 16 giờ |
| 39 → 40 | 51 | 865 | 57 ⚠ | 5 × 1.900 | 9.500 | 16 giờ 30 phút |
| 40 → 41 | 52 | 867 | 58 ⚠ | 5 × 1.950 | 9.750 | 17 giờ |
| 41 → 42 | 53 | 869 | 59 ⚠ | 5 × 2.000 | 10.000 | 17 giờ 30 phút |
| 42 → 43 | 53 | 872 | 59 ⚠ | 5 × 2.050 | 10.250 | 18 giờ |
| 43 → 44 | 54 | 874 | 60 ⚠ | 5 × 2.100 | 10.500 | 18 giờ 30 phút |
| 44 → 45 | 55 | 876 | 61 ⚠ | 5 × 2.150 | 10.750 | 19 giờ |
| 45 → 46 | 56 | 878 | 61 ⚠ | 5 × 2.200 | 11.000 | 19 giờ 30 phút |
| 46 → 47 | 57 | 880 | 62 ⚠ | 5 × 2.250 | 11.250 | 20 giờ |
| 47 → 48 | 58 | 883 | 63 ⚠ | 5 × 2.300 | 11.500 | 20 giờ 30 phút |
| 48 → 49 | 58 | 885 | 64 ⚠ | 5 × 2.350 | 11.750 | 21 giờ |
| 49 → 50 | 59 | 887 | 64 ⚠ | 5 × 2.400 | 12.000 | 21 giờ 30 phút |
| 50 → 51 | 60 | 889 | 65 ⚠ | 5 × 2.450 | 12.250 | 22 giờ |
| 51 → 52 | 61 | 892 | 66 ⚠ | 5 × 2.500 | 12.500 | 22 giờ 30 phút |
| 52 → 53 | 62 | 894 | 66 ⚠ | 5 × 2.550 | 12.750 | 23 giờ |
| 53 → 54 | 62 | 896 | 67 ⚠ | 5 × 2.600 | 13.000 | 23 giờ 30 phút |
| 54 → 55 | 63 | 898 | 68 ⚠ | 5 × 2.650 | 13.250 | 1 ngày |
| 55 → 56 | 64 | 900 | 68 ⚠ | 5 × 2.700 | 13.500 | 1 ngày 30 phút |
| 56 → 57 | 65 | 903 | 69 ⚠ | 5 × 2.750 | 13.750 | 1 ngày 1 giờ |
| 57 → 58 | 66 | 905 | 70 ⚠ | 5 × 2.800 | 14.000 | 1 ngày 1 giờ 30 phút |
| 58 → 59 | 66 | 907 | 71 ⚠ | 5 × 2.850 | 14.250 | 1 ngày 2 giờ |
| 59 → 60 | 67 | 909 | 71 ⚠ | 5 × 2.900 | 14.500 | 1 ngày 2 giờ 30 phút |
| 60 → 61 | 68 | 912 | 72 ⚠ | 5 × 2.950 | 14.750 | 1 ngày 3 giờ |
| 61 → 62 | 69 | 914 | 73 ⚠ | 5 × 3.000 | 15.000 | 1 ngày 3 giờ 30 phút |
| 62 → 63 | 70 | 916 | 73 ⚠ | 5 × 3.050 | 15.250 | 1 ngày 4 giờ |
| 63 → 64 | 70 | 918 | 74 ⚠ | 5 × 3.100 | 15.500 | 1 ngày 4 giờ 30 phút |
| 64 → 65 | 71 | 920 | 75 ⚠ | 5 × 3.150 | 15.750 | 1 ngày 5 giờ |
| 65 → 66 | 72 | 923 | 76 ⚠ | 5 × 3.200 | 16.000 | 1 ngày 5 giờ 30 phút |
| 66 → 67 | 73 | 925 | 76 ⚠ | 5 × 3.250 | 16.250 | 1 ngày 6 giờ |
| 67 → 68 | 74 | 927 | 77 ⚠ | 5 × 3.300 | 16.500 | 1 ngày 6 giờ 30 phút |
| 68 → 69 | 75 | 929 | 78 ⚠ | 5 × 3.350 | 16.750 | 1 ngày 7 giờ |
| 69 → 70 | 75 | 932 | 78 ⚠ | 5 × 3.400 | 17.000 | 1 ngày 7 giờ 30 phút |
| 70 → 71 | 76 | 934 | 79 ⚠ | 5 × 3.450 | 17.250 | 1 ngày 8 giờ |
| 71 → 72 | 77 | 936 | 80 ⚠ | 5 × 3.500 | 17.500 | 1 ngày 8 giờ 30 phút |
| 72 → 73 | 78 | 938 | 81 ⚠ | 5 × 3.550 | 17.750 | 1 ngày 9 giờ |
| 73 → 74 | 79 | 940 | 81 ⚠ | 5 × 3.600 | 18.000 | 1 ngày 9 giờ 30 phút |
| 74 → 75 | 79 | 943 | 82 ⚠ | 5 × 3.650 | 18.250 | 1 ngày 10 giờ |
| 75 → 76 | 80 | 945 | 83 ⚠ | 5 × 3.700 | 18.500 | 1 ngày 10 giờ 30 phút |
| 76 → 77 | 81 | 947 | 83 ⚠ | 5 × 3.750 | 18.750 | 1 ngày 11 giờ |
| 77 → 78 | 82 | 949 | 84 ⚠ | 5 × 3.800 | 19.000 | 1 ngày 11 giờ 30 phút |
| 78 → 79 | 83 | 952 | 85 ⚠ | 5 × 3.850 | 19.250 | 1 ngày 12 giờ |
| 79 → 80 | 83 | 954 | 86 ⚠ | 5 × 3.900 | 19.500 | 1 ngày 12 giờ 30 phút |
| 80 → 81 | 84 | 956 | 86 ⚠ | 5 × 3.950 | 19.750 | 1 ngày 13 giờ |
| 81 → 82 | 85 | 958 | 87 ⚠ | 5 × 4.000 | 20.000 | 1 ngày 13 giờ 30 phút |
| 82 → 83 | 86 | 960 | 88 ⚠ | 5 × 4.050 | 20.250 | 1 ngày 14 giờ |
| 83 → 84 | 87 | 963 | 88 ⚠ | 5 × 4.100 | 20.500 | 1 ngày 14 giờ 30 phút |
| 84 → 85 | 88 | 965 | 89 ⚠ | 5 × 4.150 | 20.750 | 1 ngày 15 giờ |
| 85 → 86 | 88 | 967 | 90 ⚠ | 5 × 4.200 | 21.000 | 1 ngày 15 giờ 30 phút |
| 86 → 87 | 89 | 969 | 91 ⚠ | 5 × 4.250 | 21.250 | 1 ngày 16 giờ |
| 87 → 88 | 90 | 972 | 91 ⚠ | 5 × 4.300 | 21.500 | 1 ngày 16 giờ 30 phút |
| 88 → 89 | 91 | 974 | 92 ⚠ | 5 × 4.350 | 21.750 | 1 ngày 17 giờ |
| 89 → 90 | 92 | 976 | 93 ⚠ | 5 × 4.400 | 22.000 | 1 ngày 17 giờ 30 phút |
| 90 → 91 | 92 | 978 | 93 ⚠ | 5 × 4.450 | 22.250 | 1 ngày 18 giờ |
| 91 → 92 | 93 | 980 | 94 ⚠ | 5 × 4.500 | 22.500 | 1 ngày 18 giờ 30 phút |
| 92 → 93 | 94 | 983 | 95 ⚠ | 5 × 4.550 | 22.750 | 1 ngày 19 giờ |
| 93 → 94 | 95 | 985 | 96 ⚠ | 5 × 4.600 | 23.000 | 1 ngày 19 giờ 30 phút |
| 94 → 95 | 96 | 987 | 96 ⚠ | 5 × 4.650 | 23.250 | 1 ngày 20 giờ |
| 95 → 96 | 96 | 989 | 97 ⚠ | 5 × 4.700 | 23.500 | 1 ngày 20 giờ 30 phút |
| 96 → 97 | 97 | 992 | 98 ⚠ | 5 × 4.750 | 23.750 | 1 ngày 21 giờ |
| 97 → 98 | 98 | 994 | 98 ⚠ | 5 × 4.800 | 24.000 | 1 ngày 21 giờ 30 phút |
| 98 → 99 | 99 | 996 | 99 ⚠ | 5 × 4.850 | 24.250 | 1 ngày 22 giờ |
| 99 → 100 | 100 | 998 | 100 ⚠ | 5 × 4.900 | 24.500 | 1 ngày 22 giờ 30 phút |

Bậc100 là terminal; không có bước100→101.

## Ranh giới kiểm chứng

Đọc cấu hình từ đúng runtime/PM2, hash source server/client và giải mã bảng/bản dịch live. Không intercept heap của tiến trình game, không sửa/reload game, không thực hiện một lần nâng bậc tài khoản thật.Ảnh chỉ đủ chứng minh panel đang coi10 là cuối, chưa chứng minh nguyên nhân nạp addon/caching.

