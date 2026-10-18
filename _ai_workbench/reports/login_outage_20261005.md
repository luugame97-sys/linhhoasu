# Sửa lỗi không vào game / WebGM — 05/10/2026

## Nguyên nhân đã kiểm chứng

- S2 (`lhs-s1002`, HTTP 8083 / WS 9201) vẫn PM2 online nhưng event loop nghẽn CPU, `/ready` timeout. Mongo ping và bộ nhớ/dung lượng hệ thống bình thường. S1/S3–S7 vẫn phản hồi; homepage game và trang đăng nhập WebGM vẫn HTTP 200. Không suy ra toàn bộ web chết từ việc đăng nhập vào S2 thất bại.
- `votinh135` có nhân vật chính **Lão Tổ / S2 / cấp 1260**, account/role active và không bị ban. UID trong log gây tải thuộc một tài khoản khác, không phải Votinh135; không khóa hoặc sửa tài khoản nào.
- CPU profile S2 PID 497786: khoảng **97,6%** CPU trong `grantGemPackRewards → grantGemRewards → ensureGemInfo → normalizeGem`. Mỗi túi ngọc lại chuẩn hóa toàn bộ túi đồ, mỗi viên hợp lệ vẫn sắp xếp/quét fallback config. Mua nhiều túi tạo chi phí gần bậc hai; tag 1200 có mẫu60–150 giây. Không phải kết luận từ HTTP 200, RAM hoặc lỗi Mongo lịch sử.
- Queue socket không có giới hạn làm lỗi nặng hơn: >2.000 request chờ, có mẫu chờ~39 phút. Bản giới hạn queue đơn lẻ chưa đủ: tag 1200 vẫn mất~100 giây ở queueDepth 1; phải sửa cả hàm ngọc.

## Sửa và triển khai

- `WSServer.js`: queue tối đa 256, trả lỗi retryable trước khi nhận thêm; chống request snapshot trùng cho 6198/6199 và 1200 **không có id/goodsId**. Không coalesce 1200 mua hàng hoặc các tag 2408/2417/2001/2002 có mutation; các request đã nhận giữ FIFO.
- `item.js`: lấy gem info/pool một lần mỗi lô rồi append ngọc; chia sẻ prepared gem info trong cùng request mua nhiều vật phẩm. Giữ RNG, số ngọc, UID, tiền/record và save contract.
- `gem.js`: fallback ID/shape chỉ tính khi cần; ngọc hợp lệ giữ đường nhanh. Giữ semantics với dữ liệu thiếu/sai, plan và nextUid.
- Candidate từ exact live, không port các khác biệt local về box/equipment. Backup/CAS/hashes: `/linhhoasu/_ai_workbench/backups/login_gem_20261005_052215`; queue backup `/linhhoasu/_ai_workbench/backups/ws_backpressure_20261005_20261005_120025_pre`.
- Đã rolling S2→S7→S1→S3→S4→S5→S6. Hash live item=`e03350ff…`, gem=`04023d14…`, WSServer=`191dede9…`. Inspector chẩn đoán đã tắt theo restart, không còn listener 9229.

## Kiểm chứng

- Syntax PASS. RAM normalization **1.029 case PASS**, gồm invalid/null/missing/NaN/Infinity/UID và plan; output/nextUid bằng baseline.
- Handler thật `handleGetItems({id:10000004,count:3})` trong RAM: toàn bộ packet, reward/RNG/UID/tiền/state bằng baseline, một mocked save. 10.000 ngọc + 100 túi: 119 ms; +1.000 túi: 390 ms; normalize 2 lần. Baseline 100 túi không xong trong timeout 55 giây nên không claim exact parity mẫu stress lớn. Không mua hoặc phát thưởng thử trên player thật.
- Sau deploy, cùng phiên gây tải có tag 1200 **802–897 ms**, giảm từ60–150 giây; queue đã drain. Hậu kiểm12:31 ICT (~9 phút sau canary): S2 CPU 0,8%, readiness 34 ms; **7/7 node HTTP 200/status ok/Mongo+Redis true**, game homepage và WebGM login HTTP 200.
- Browser từng tái hiện lỗi mạng ở S2; sau hotfix đã vào thế giới game nhưng phiên đang hiển thị **Talo**, nên không ghi nhận nhầm là E2E của Votinh135. Votinh135 cần đăng nhập lại đúng tài khoản/S2 sau restart để xác nhận cuối từ thiết bị người chơi.

## Bằng chứng

- `_ai_workbench/temp/outage_s2_20261005.cpuprofile`
- `_ai_workbench/temp/login_outage_20261005/{s2_before.log,gem_hotfix_deployment.json,backpressure_deployment.json,final_health.json}`
- `_ai_workbench/tools/{test_gem_normalize_lazy_20261005.js,test_gem_shop_batch_20261005.js,test_ws_backpressure_20261005.js}`

Không reset nhân vật, không sửa player/DB hoặc cấp/thu hồi đồ trực tiếp. Login/hydration của phiên người chơi vẫn theo luồng game thông thường. Chưa coi đây là bằng chứng mọi chức năng của mọi account đã E2E.
