# Backlog lỗi event hiện tại — 07/10/2026

Audit source/config/live S1–S7, read-only; không RPC gameplay, không ghi player/DB, không restart.

## Đính chính khi lập kế hoạch

Danh sách ban đầu trộn một số audit cũ với lỗi hiện tại. Kế hoạch `_ai_workbench/reports/event_fix_plan_20261007.md` là bản phân loại cập nhật: lỗi Câu cá pending/kỹ năng/pool/shop đã có release sửa06/09; Yêu Vương tụt stage đã sửa22/09 và catalog mở rộng đã lên172 ngày07/10. Hai nhóm này cần hồi quy, không kết luận còn lỗi như các dòng lịch sử bên dưới. Hoang Cổ Mê Hàng event4017 là snapshot02/10, phải kiểm lại vì sau đó có recovery v5. Họa Trung Các cần đối chiếu exact live với candidate03/10 trước sửa.

Tên client đúng: type21 **Đào bảo Tinh Cung**; type27 **Chọn 1 Trong Quà** (nhổ củ cải); type52 **Thiên Giáng Phúc Lộc**. TopArena là **Thiên Hạ Đệ Nhất Luận Đạo**, khác Đỉnh Phong Diễn Võ.

## P0 — cần khóa hoặc sửa trước khi cho người chơi tiếp tục

| Nhóm | ID/luồng | Lỗi đã xác nhận | Tác động |
|---|---|---|---|
| Rotation QA | type21/27/30/37/49/52 | `requiresNativeQa:true` chỉ là metadata; registry không kiểm tra. Khi `EVENT_ROTATION_NATIVE_ENABLED=1`, event chưa QA vẫn được xoay/mở. Live có row 21/27/30/37/49/52 trên player S3–S7. | Mở event chưa an toàn |
| Đào bảo Tinh Cung | type21, ID21001 | Cần xác thực tham số bước theo loại xúc xắc và trừ phí từ config, không nhận kết quả bước tùy ý. | Bước/thưởng sai |
| Chọn 1 Trong Quà (nhổ củ cải) | type27, ID27001 | Tin `params.index`; index chọn nhánh thưởng và boss/tầng, chưa xác thực board state. | Chọn nhánh thưởng từ client |
| Secret Treasure | type30, ID30001 | Chỉ dựng packet trạng thái 1760–1763; thiếu tiến độ, trừ phí và claim reward. | Event mở nhưng không hoàn chỉnh |
| Thiên Giáng Phúc Lộc | type52, ID52001 | Trừ vật phẩm trước khi kiểm arrangement; nhánh persist vẫn chạy khi kiểm thất bại. | Có nguy cơ mất nguyên liệu |

## P1 — lỗi runtime hoặc có thể mất tiến độ/quà

| Nhóm | Lỗi đã xác nhận | Trạng thái |
|---|---|---|
| Hoang Cổ Mê Hàng | S6 có 6 lần `OLD_TREK_SAVE_NOT_CONFIRMED` khoảng 09:18–09:22; trước đó có stale-save, sau đó tag7002 bị từ chối và socket đóng. | Xác nhận log07/10; chưa chứng minh mất thưởng |

## Cần kiểm lại / hồi quy

- Hoang Cổ Mê Hàng event4017: snapshot02/10 thấy quá hạn; sau đó đã có recovery v5, phải đọc hiện trạng mới trước repair.
- Họa Trung Các: candidate follow-up03/10 chưa deploy theo report; source local có kiểm tra mới, cần đối chiếu bản live. Không khẳng định toàn bộ8 lỗi cũ vẫn còn.
- Câu cá pending/UID/kỹ năng/pool/multiplier/shop: đã có release06/09; kiểm hồi quy trên S1–S7, không mặc định còn lỗi.
- Yêu Vương tụt stage: đã sửa22/09; catalog mở rộng đã có tới172 ngày07/10. Chỉ hồi quy mốc/nhiệm vụ/relog.

## P2 — chưa nên mở rộng, chưa gọi là lỗi live chung

- Alchemy type37 / Box Draw type49: có handler nhưng chưa có native E2E đủ.
- Thiên Hạ Đệ Nhất Luận Đạo/TopArena: đang rollback/khóa; audit cũ còn thiếu vé, reward config, robot snapshot, round settlement, claim replay. Khác Đỉnh Phong Diễn Võ.
- Type35 ID35201/35202: operate chỉ tăng record, chưa thấy reward/config chuyên dụng.
- Generic types khác: không có handler nghiệp vụ; không nên bật bằng registry.
- Activation Pass type7/Login Privileges type9: không xếp lỗi hiện tại; là luồng trả phí/entitlement riêng.

## Nhóm đang ổn trong audit

S1–S7 `/ready` 200, Mongo/Redis true; CrossArena/CrossRival và Fishing settlement gần đây done; `EventSettlement enabled v2` chỉ là startup warning.

## Thứ tự sửa

Theo kế hoạch cập nhật `event_fix_plan_20261007.md`: chốt baseline → kiểm soát event lỗi → Thiên Giáng Phúc Lộc → Hoang Cổ Mê Hàng/S6 → Đào bảo Tinh Cung → Chọn 1 Trong Quà → Bí bảo Thiên Cơ → QA37/49/Họa Trung Các → hồi quy Câu cá/Yêu Vương → TopArena. Đây là kế hoạch, chưa đóng hoặc sửa event trong lượt này.

## Evidence

- `_ai_workbench/reports/event_live_health_20261007.md`
- `_ai_workbench/reports/events_extra_audit_20261004.md`
- `_ai_workbench/reports/fishing_events_readiness_plan_20260906.md`
- `_ai_workbench/reports/petsoul_oldtrek_release_20261002.md`
- `_ai_workbench/reports/oldtrek_stuck_plan_20261002.md`
- `_ai_workbench/reports/toparena_audit_20260927.md`
- Live `activity.js` SHA256: `097a2b1c8dc222460d01cffb69035251eb7abb0f94914622512924a09a0f2ba6`
- Live `EventRotationRegistry.js` SHA256: `af329b71e866866aa34894e8b7d9f94ee861f6eed420d4b04d9bf6f50efe4e59`
- Live `eventRotation.json` SHA256: `bfaa48490e554e117c3dd6ca0ffb2d8377de2b3719d2016c0b67ce158a4be47c`
