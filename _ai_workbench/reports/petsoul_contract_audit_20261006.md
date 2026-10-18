# Kiểm tra Khế Ước Thú Hồn / ước nguyện — 06/10/2026

## Kết luận

Gói đang lỗi logic quyền lợi và ước nguyện trên source/config live. Chỉ audit; chưa sửa source, bật quyền, reset lượt, cấp bù, deploy/restart hoặc gửi RPC người chơi thật.

## Gói và giao diện

- Ảnh là DungeonPetSoulWishPanel, nút kích hoạt mở FirstRechargeMainPanel với pay/shop11000021. PayConfig: priceR128, priceD1999, priceNT660. Gói mua một lần/limit1,limitType4; quà288×1,287×1,Nguyên bảo1280,261×50.
- Native getWishCountMax chỉ trả1 khi RechargeModel.checkPrivilegeItem(44) active: expiry=-1 hoặc lớn hơn serverTimeMilli. getWishCount(q)=max(max−wishCount[q],0); wishCount là số đã dùng.
- Phẩm6=Sử Thi, phẩm7=Truyền Thuyết; mỗi phẩm có1lượt hiệu lực khi active và chưa dùng. CTA mua vẫn hiện nghĩa là client không nhận active44 tại thời điểm ảnh. Không xác định tài khoản/server trong ảnh từ screenshot.
- 6case native RAM: chưa active/đã expired→0/0+CTA; active chưa dùng→1/1; dùngq6→0/1; dùng hết→0/0 nhưng CTAẩn; permanent−1→1/1.

## Lỗi xác nhận bằng live source và RAM

1. **Mua gói không tự kích hoạt quyền44.** Resolver chấp nhận đơn mới đúng giá, nhận đúng4quà; RechargeBenefit chỉ ghi records, không có PrivilegeConfig11000021 nên không cấp monthcard. Item287 là type34 nhưng RewardGrantService trả kind=item, cộng vào bag, không set rechargeInfo.privilegeItem[44]. Đơn trước có recordcount1 bị LIMIT_REACHED, nên mua lại không phải giải pháp.
2. **Ước nguyện lưu sai khóa.** 6922 với lựa chọnq7/q6 hợp lệ trảwishId{"1":210501,"2":210401}; client đọc[7]/[6] nên không thấy chọn. Source live còn lọc chỉ Hồn Thú đã sở hữu; chọn loại chưa có âm thầm bị bỏ rồi ACKsuccess. Server chưa kiểm active44.
3. **Triệu hồi không áp dụng ước nguyện.** RAM cấp active44 và đặtwishId đúngnative[7]/[6], ép phẩm7 bằng RNGfixture: cả3con raID250501 thay vì lựa chọn210501; wishCount6/7 vẫn0. Luồng triệu hồi và bắt không dùng lựa chọn/lượt để thực thi quyền lợi.

## Đối chiếu dữ liệu live, chỉ projection

- S1–S7 có25recordplayer đã mua11000021 (6/4/2/1/3/3/6), **0/25 có active44**. 24/25 còn item287; không suy trường hợp còn lại đã mất đồ hay đã kích hoạt ở nguồn khác.
- Mẫu query matched=sampled ở từngserver, không bị truncatelimit100. Không lấy password/token/account vào báo cáo và không sửa dữ liệu.
- Đây là bằng chứng quyền lợi thiếu trên những recordđã mua; chưa đối chiếu paymenttransaction/mail từngđơn hoặc xác minh người chụp ảnh nằm trong25recordnày.

## Hướng sửa sau khi được yêu cầu

- Cấp entitlement44 từ giao dịch11000021 theo cơ chế permanent được xác minh; chỉ backfill từ đơn/mốcfulfillment hợp lệ, không đòi người đã mua mua lại và không phát thêm quà gói.
- Lưu wishId/wishCount theo phẩm6/7; validation active/sốlượt/quality/selection và bảo toàn dữ liệu cũ. Không reset bừa lượt đã dùng.
- Áp dụng chọn đúng Hồn Thú khi ra đúng phẩm được hứa trong native description; chốt thời điểm tiêu lượt (summon/catch success) bằng contract/reference, bảo vệ replay/concurrent/savefail.
- Đồng bộ packet/pushclient entitlement+wish và kiểm purchase→selection→summon/catch→relogin trước kết luận sửa xong.

## Bằng chứng

- Live source hashes: pet-soul.js `c69f4753202e9b0756ccdba1ba61ef8e6cc1378d0d209e1d1030efd84f26a088`; recharge.js `9275d2866648cfbfdca84f714b023522c0717e6378ce7b4c7571a403f1fc25d4`; resolver `d54222a3d52f3f6e057a7d38b81b9e580b4ce2fd2e666a50af0abb960abf337e`.
- `_ai_workbench/temp/petsoul_contract_audit_20261006/{live_config.json,ram_audit.json,player_projection.json,source/}`.
- `_ai_workbench/tools/audit_petsoul_wish_contract_20261006.js`: exactlivehandlerVM,4mocksaves, productionWrites0/networkAttempts0. Native/payment/grant QA cũng dùng RAM, không mua/tiêuđồ thật.

## Triển khai và cấp bù — 07/10/2026

- Đã triển khai S1–S7: handler giao dịch ghi `privilegeItem[44]=-1`, đẩy packet quyền lợi khi thanh toán thành công và replay; ước nguyện dùng khóa phẩm `6/7`, cho phép chọn 1 hoặc 2 Hồn Thú hợp lệ, không bắt buộc đã sở hữu, và dùng đúng lựa chọn khi triệu hồi phẩm tương ứng. Save lỗi vô hiệu session.
- Đã đối soát 25 role có `rechargeInfo.records` payId11000021 và thiếu quyền44. CAS marker `petsoul_wish_entitlement_repair_v1_20261006` cấp quyền44 permanent cho đủ **25/25**, giữ nguyên `wishCount`, vật phẩm, Nguyên bảo và quà cũ. Không cấp lại item287/288 hoặc Nguyên bảo.
- Compensation preimage backup: `/linhhoasu/_ai_workbench/backups/petsoul_fix_20261006/preimage_20261006_172451.json`; marker receipts `_ai_workbench/temp/petsoul_fix_20261006/{compensation_plan.json,compensation_apply.json,postcheck.json}`. Cấp bù idempotent; các lần CAS lặp không tăng quà hoặc lượt.
- Sau cấp bù đã dừng/khởi động lại riêng 7 node để loại session cũ; S1–S7 readiness statusok, Mongo/Redis true. Không restart admin/dist/bots. Không mua/đổi/gọi RPC trên nhân vật thật.
- Candidate/installed QA: 6 nhóm RAM cho entitlement + wish, bao gồm quyền44, chọn 1/2, unowned wish, summon dùng wish, inactive reject, `productionWrites=0`; audit ban đầu 25 player projection/read-only. Native UI E2E chưa chạy do giữ tab người dùng.
