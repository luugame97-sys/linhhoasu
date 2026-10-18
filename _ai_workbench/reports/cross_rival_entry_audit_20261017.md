# Kiểm tra Tiên Vực Tranh Phong — 17/10/2026, 09:35–09:37 ICT

Phạm vi: đọc source/config/client HTTPS và Mongo trên VPS hiện tại; không deploy, restart, gameplay RPC hoặc ghi dữ liệu người chơi.

## Thông báo trong ảnh: đã xác định chính xác

- Client language binary live có `LanguageConfig[30104048].cn = "Show at could not enter"`.
- Hàm native `CrossRivalEntranceItem.onTouchTap` chỉ cho đi tiếp khi stage bằng 2 hoặc 4. Stage 1/3/5 gọi trực tiếp `showTipsByLangId(30104048)`, trước khi gửi yêu cầu vào map. Vì vậy câu trong ảnh là thông báo ngoài pha tham chiến bị dịch sai; biểu tượng phong ấn không đủ để suy ra thiếu điều kiện mở từng khu vực.
- Lúc kiểm tra `2026-10-17T02:35:10Z` (09:35 ICT), pha authoritative là `stage=1`, `prepare`, `combat=false`; 10:00 mới chuyển sang Du kích. Lịch live GMT+7: Du kích 10:00–19:55; nghỉ 19:55–20:00; Kịch chiến 20:00–20:30; các giờ còn lại không vào map.
- Mô phỏng đúng hàm native đọc từ VPS trong VM: 5/5 trường hợp stage 1–5 đúng nhánh; đây là kiểm chứng code, chưa phải browser E2E và không phải payload của chính lần bấm trong ảnh.

## Hai lỗi riêng được phát hiện

1. **S9 qua calendar nhưng bị chặn gameplay:** `CrossServerEventService.isServerAllowed(1009)=true`, nhưng `CrossRivalRules.ALLIANCES` chỉ chứa S1–S8; `camp(1009)=0`, `allowed(1009)=false`. Cờ chung và readiness không chứng minh S9 chơi được. S1–S8 có phe và `allowed=true`.
2. **Client public thiếu bản vá protocol:** file `js/lhs-cross-rival-safety-v1.js` vẫn tồn tại trên VPS nhưng `index.html` live và hai URL public `/`, `/index.html` không nạp nó. Đọc 51 script được index tham chiếu không có `LhsCrossRivalSafety`, tên addon hoặc prefix request `r2_`. Native `sendMapEnter` chỉ gửi `campId,line,x,y,reEnter`; backend `reserve()` yêu cầu `requestId` hợp lệ hoặc ném `CROSS_RIVAL_REQUEST_REQUIRED`. Đây là contract mismatch có thể chặn thao tác trong giờ mở; chưa chạy authenticated browser E2E để ghi nhận phản hồi trên một player. Không khẳng định nguyên nhân lần bấm trong ảnh là lỗi protocol này vì thông báo trong ảnh thuộc nhánh kiểm tra phase trước RPC.

## Trạng thái và bằng chứng

- S1–S9 PM2 online, `/ready` HTTP 200 và Mongo/Redis true 9/9. Release `enabled=true`, `qaActors=[]`.
- World public kỳ `C4_1791738000000`: 2 participant (S3/S8), pending command 0, pending outbox 0 trong snapshot. Mẫu log cuối 512 KiB/file không có dòng CrossRival phù hợp; không suy ra toàn bộ lịch sử không có lỗi.
- Evidence `_ai_workbench/temp/cross_rival_entry_20261017/`: `live-audit.json`, `client-flow.json`, `message-verification.json`, `loader-verification.json`, `live/` chứa source chính xác đã đọc từ VPS.
- Công cụ read-only: `_ai_workbench/tools/audit_cross_rival_entry_20261017.js`.
- Chưa sửa production. Hướng sửa sau audit: Việt hóa thông báo kèm giờ mở; phục hồi nạp addon protocol đúng cache marker; quyết định luật gán phe ổn định cho S9+ rồi kiểm tra cả calendar/gameplay. Sau sửa cần native E2E trong giờ mở bằng danh tính QA được phép.
