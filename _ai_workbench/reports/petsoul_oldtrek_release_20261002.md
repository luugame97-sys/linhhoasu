# OldTrek và Hồn thú — triển khai 02/10/2026, 09:56–09:58 ICT

## Kết quả

Đã publish 4 file server và 3 file client lên VPS 103.116.104.165. S1–S6 chỉ rolling restart một lượt, đều online và `/ready` Mongo/Redis true. PID/restart của admin, dist, bot và supervisor giữ nguyên. Không trực tiếp sửa player/DB, reset hành trình hoặc cấp thưởng thử.

## Nguyên nhân và thay đổi

### OldTrek còn kẹt sau bản trước

- Tái hiện bằng hàm native thật: `OldTrekMainView.onClickSpeedUp` ở Dock + có event chỉ hiện thông báo, không gửi RPC và không mở event. Vì vậy vá save/CAS trước đó chưa giải quyết hết phía client.
- Addon cũ chặn callback success khi 7001/7005 bị từ chối nhưng không nhập lại event authoritative. Server 7005 cũng không trả event trong lỗi pending.
- Server mới thêm event/updateData trong pending7005 (chỉ một dòng). Client v4 đồng bộ payload pending; thao tác speed/event khi có event đọc snapshot7008 một lần rồi đi theo `checkHandleEvent` native. Không polling và không tự lặp tăng tốc tốn vật phẩm.
- Xử lý stale UID/revision của7002 bằng snapshot; không tự gửi lại cùng event bị từ chối. Timer resume cũ không xử lý lặp event khi push7006 đã chuyển nhánh. Sự kiện cần lựa chọn vẫn mở UI để người chơi chọn.
- **Đính chính chẩn đoán đầu lượt:** event4017 quá hạn ở S6 chưa được chứng minh là nguyên nhân ảnh Talo. Candidate tự kết thúc expired bị loại vì thiếu shipExp/settlement đầy đủ. Không triển khai helper đó, không tự xoá event. Snapshot Talo S1 lúc09:30 có revision235/currentEvent=null; lỗi là gián đoạn, không phải bằng chứng đang kẹt tại thời điểm đọc.

### Rương nguyên liệu100802

- Native asset là type99/icon `random_petsoul_02`, quality6; thiếu AssetsUseConfig và resolver mở rương. UI không có đường sử dụng đầy đủ.
- Addon bổ sung useType102/AssetsUseConfig cho đúng100802. Server xử lý100802 qua pool5 vật liệu268–272, mỗi rương một quả phẩm6. Năm loại được chọn đều nhau; không tuyên bố đây là trọng số server CN gốc.
- Kiểm tra metadata nguồn/đích, count1–10000; nếu pool không hợp lệ thì từ chối trước khi tiêu rương. Không sửa các rương khác.

### Tăng sao ở tỷ lệ cao

- Ảnh200% phát lỗi ở nút **Đặt vào** (thêm vật liệu), không chứng minh RPC tăng sao bị server từ chối. Native6901 và server vốn không có trần100%; ngưỡng hiện có vẫn là60%.
- Khi đã đủ100%, Đặt vào xác nhận/đóng panel chọn qua OnClose callback native; không tự gửi tăng sao. Người chơi bấm Tăng sao ở màn chính. Hiển thị xác suất tối đa100%.
- OneKey ưu tiên phương án ít điểm thừa hơn. Server chỉ trừ số quả cần cho một bước sao, giữ lại các quả chưa cần dùng; vẫn kiểm toàn bộ lựa chọn có trong túi và số lượng/ID hợp lệ. Một quả riêng lẻ vượt điểm yêu cầu vẫn cần dùng nguyên quả, không có cơ chế chia quả hay chuyển điểm dư sang sao sau.
- Giữ cơ chế thành công hiện hành từ ngưỡng60%, giới hạn sao và vật liệu; không thay công thức RNG khác. PetDetail nghe STAR/DATA update để cập nhật trần cấp sau thay đổi Uy áp.

## Kiểm chứng

- SyntaxJS/Python PASS. Năm fixture tập trung PASS: tăng sao60/200/2000%, thiếu/sai vật liệu, trần sao, làm tròn, hai sao liên tiếp; mở1/55 rương và invalid-pool giữ rương; native chọn liệu/mởrương; native Dock, snapshot, stale/CAS, event-chain; guard cũ/chat/BidKing/settlement.
- Fixture dùng config live SHA256 `eaa97e8f…` và bundle live khớp local `1ae070b1…`. Test OldTrek mới nạp đúng candidate; test expired cũ đã bị loại khỏi gate vì trước đó nạp nhầm path.
- Public index và hai addon hash khớp byte production/candidate. Read-back7/7 file và các process online hậu kiểm10:01 ICT. Không thấy lỗi module liên quan trong cửa sổ error-log09:58–10:01; log yên không được xem là chứng minh gameplay hết lỗi.
- Reload tab thực tế tải tới màn đăng nhập; console sau reload chỉ thấy autoplay NotAllowedError. Chưa đăng nhập/tiêu vật phẩm để chạy đầy đủ gameplay E2E trên người chơi thật. Không kết luận mọi lỗi gián đoạn đã được loại bỏ.
- Thông báo chung “Thao tác chưa thành công…” có trong addon FarmAlchemy live; scope của nó không bao gồm1300/6901/OldTrek. Không dùng riêng toast đó để quy tất cả lỗi cùng nguồn, không mở rộng sửa farm.

## File và biên nhận

| File production | SHA256 sau triển khai (rút gọn) |
|---|---|
| `lhs/newServer/src/handlers/old-trek.js` | `51998a3a…` |
| `lhs/newServer/src/handlers/pet-soul.js` | `c69f4753…` |
| `lhs/newServer/src/handlers/item.js` | `19d1cef8…` |
| `lhs/newServer/src/services/RandomUsableItemRewardService.js` | `0b5ac22c…` |
| `webgame/game/index.html` | `1bae47e1…` |
| `webgame/game/js/lhs-oldtrek-errors-v1.js` | `f76f6fd1…` |
| `webgame/game/js/lhs-petsoul-fix-v1.js` | `5bca3a05…` |

- Server receipt: `_ai_workbench/temp/petsoul_box_star_release_20261002/deployment.json`.
- Client receipt: `_ai_workbench/temp/petsoul_static_release_20261002/deployment.json`.
- Snapshot/validation/postcheck: `_ai_workbench/temp/petsoul_release_20261002/`.
- Server candidates dựa trên live nằm trong `_ai_workbench/temp/petsoul_oldtrek_live_20261002/` và `_ai_workbench/temp/oldtrek_expired_candidate_20261002/server/old-trek.js` (tên thư mục lịch sử, nội dung cuối không còn expired helper).
- Canonical source local có chênh lệch từ trước so với live; không ghi đè toàn bộ các handler hoặc index local bằng snapshot production. Deploy sau cần lấy live làm baseline/CAS.

## Khôi phục nếu có regression

- Backup server: `/linhhoasu/_ai_workbench/backups/petsoul_oldtrek_20261002_095608` (4 file).
- Backup static: `/linhhoasu/_ai_workbench/backups/petsoul_static_20261002_095824` (index và addonOldTrek).
- So sánh hash live với post-hash trong receipt; nếu khớp, stage file backup và atomic rename đúng đường dẫn ban đầu. Rolling restart từng S1–S6, chờ ready sau mỗi node. Client restore index/addon và dùng cache key mới để tránh CDN giữ bản sai. Không ghi đè nếu hash đã drift; không phục hồi playerDB.
- Addon PetSoul mới có thể giữ trên disk khi index đã bỏ tham chiếu. Các script triển khai đã có rollback CAS cho file đã swap và read-back; không chạy lại script expired cũ.

## Hướng dẫn người chơi

Nạp lại client/đăng nhập một lần để dùng addon mới. Hồn thú: chọn nguyên liệu → Đặt vào để xác nhận khi đủ → Tăng sao. OldTrek: bấm nút sự kiện/chuyến đi để đồng bộ và xử lý sự kiện đang chờ, không cần reset hành trình.
