# Fix timing nhãn Ngoại quan — 23/09/2026

## Kết quả

- Nguyên nhân: `lhs-fashion-content-v1.js` đánh dấu `installed` ngay khi `GlobalManager` có mặt, trước khi `GlobalManager.Config/LanguageConfig/FashionConfig` được lazy-load. Mapping tên bị bỏ qua và console báo thiếu `28371/128370`.
- Đã thay bằng v2: chờ đủ Config/Fashion tables rồi mới áp mapping; bổ sung `vi/vn` cùng nhãn tiếng Việt, giữ nguyên xử lý suit color.
- Không đổi layout bounds, ownership, chỉ số, RPC hoặc dữ liệu player.

## Kiểm chứng

- VM timing test: Config chưa sẵn sàng → chưa installed; Config sẵn sàng → mapping `28371` được áp dụng, PASS.
- Client reload thực tế: log `[LHS FashionContent] 20260923_fashion_content_v2 ready names=78`; không còn cảnh báo thiếu `28371` trong log sau v2.
- HTTP index/source 200 + hash PASS; không restart game process.

Backup: `/linhhoasu/_ai_workbench/backups/fashion_content_timing_fix_20260923/`.
