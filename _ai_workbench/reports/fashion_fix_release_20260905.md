# Session Report — sửa ngoại quan và khôi phục quyền sở hữu

Ngày 05/09/2026, UTC+7. **Đã triển khai S1/S2 và khôi phục 56 quyền sở hữu cho 48 nhân vật S1.** Không gửi thêm vật phẩm, không trừ/hoàn Xu, không phát bù người đã sở hữu. Đây là kết quả cho các lỗi đã xác nhận trong audit ngoại quan, không phải tuyên bố toàn bộ thanh toán/model của game đã hoàn hảo.

## 1. Tóm tắt công việc

- Lấy lại baseline production lúc 21:08 trước khi sửa, giữ riêng candidate và backup. Source local khác production ở nhiều file nên không chép cả cây lên VPS.
- Sửa cash callback để dùng cùng khóa thao tác theo nhân vật với gameplay/login/close; đợi các lần lưu đang chạy, đã xếp hàng và lưu trì hoãn trước khi đọc state. Dùng state live làm nguồn cho tiến trình chưa flush, không ghi trả snapshot DB cũ khi retry.
- Đồng bộ đủ ngoại quan, collection native và entitlement sau khi save xác nhận thành công; nếu kết quả save không chắc chắn thì vô hiệu hóa snapshot phiên để bắt buộc tải lại, ngăn close save ghi đè receipt.
- Giữ snapshot của kết nối đang đóng cho tới khi final save xong; cash commit hoặc invalidate vẫn tác động được đúng phiên. Chọn phiên mới nhất khi có kết nối cũ trùng.
- Chặn dùng Fashion body không có use config trước khi tiêu item. 1.914 case body-in-bag đều giữ nguyên item và trả lỗi rõ.
- Bổ sung quy đổi `FashionConfig.swaps` vào grant dùng chung. 631 ID nhận trùng từng thiếu quà nay khớp mail; không cộng lần hai ngoài config, giữ gia hạn danh hiệu có thời hạn.
- Khôi phục dữ liệu đủ căn cứ bằng chuyển 1:1 body trong túi → quyền sở hữu thiếu: 31 Đồ Long Đao29001 và25 danh hiệu11274. Không gửi mail chứa thêm item và không cộng tiền bù tùy ý.

## 2. File/thư mục đã thay đổi

### Source chính đã đồng bộ local và production

| File | Thay đổi |
|---|---|
|`src/services/PlayerMutationService.js` — mới|Queue theo userId, hỗ trợ gọi lồng cùng thao tác; không mở khóa khi công việc async chưa kết thúc|
|`src/services/PlayerService.js`|Drain pending/deferred writes; deadline không cho writer tiếp theo chạy trước khi thao tác DB cũ kết thúc|
|`src/net/WSServer.js`|Khóa toàn lượt xử lý gameplay, final close save; lấy phiên mới nhất, giữ closing snapshot và invalidate an toàn|
|`src/handlers/account.js`|Khóa giai đoạn load/migrate/login và đợi pending saves; giữ nguyên điều kiện S2 và auth|
|`src/services/RewardGrantService.js`|Cấp thưởng quy đổi Fashion trùng qua pipeline thật và đầy đủ reward delta|
|`src/handlers/item.js`|Reject Fashion body thiếu flow dùng hợp lệ trước consume|
|`src/handlers/recharge.js`|Cùng khóa với gameplay, lấy live state đúng, sync sau commit, retry không ghi đè tiến trình/spend mới, bảo vệ save chưa rõ kết quả|

Local: `I:\Linhhoasu\server\server\linhhoasu\lhs\newServer\`. Production: `/linhhoasu/lhs/newServer/`. Bảy file có hash khớp candidate sau triển khai và sau QA. Không sửa config/client/WebGM, không restart dist/admin/DB/Nginx hay bot worker.

### Tool, candidate và evidence

- Candidate: `_ai_workbench/temp/fashion_fix_20260905/`.
- Snapshot baseline bất biến: `_ai_workbench/temp/fashion_channels_20260905T140803Z/`.
- Test: `test_fashion_writer_20260905.js`, `test_fashion_repair_20260905.js`, `run_fashion_fix_tests_20260905.js`; tái sử dụng audit từng kênh và các regression reward/native/appearance.
- Staging/deploy: `stage_fashion_fix_20260905.py`, `deploy_fashion_fix_20260905.py`.
- Repair: `repair_fashion_ownership_20260905.js`, `resume_fashion_repair_20260905.py`, tool kiểm conflict/state. `FashionInventoryRepairService.js` chỉ có trong candidate/staging để phục vụ repair; **không thêm service repair vào runtime game**.
- Live QA: `final_fashion_verification_20260905.py`, `qa_cash_fashion_live_20260905.py`, `audit_fashion_release_health_20260905.py`.
- Local sync: `build_fashion_local_patch_20260905.py`; chỉ tạo/apply diff bảy file sau khi baseline local khớp, không chép đè thay đổi khác.
- Evidence chính: `stage.json`, `verification.json`, `fixture.json`, `deploy_20260905_142733.json`, `repair_resume_20260905_143005.json`, `repair_failure_audit.json`, `repair_conflict_reason.json`, `final_verification.json`, `cash_live_verification.json`, `health_final.json` trong candidate root.
- Log: `_ai_workbench/logs/fashion_fix_*`, `fashion_cash_live_s1001_20260905.log`, `fashion_cash_live_s1002_20260905.log`.
- Báo cáo MD/HTML này và session_report.md/.html đã cập nhật. Không tạo tool tạm ở root.

### Backup và khả năng phục hồi

- Source production trước sửa: `/linhhoasu/_ai_workbench/backups/fashion_fix_20260905_142733/source/`.
- Preimage/after image đợt đầu: `/linhhoasu/_ai_workbench/backups/fashion_fix_20260905_142733/players/`.
- Preimage/after image đợt tiếp: `/linhhoasu/_ai_workbench/backups/fashion_repair_resume_20260905_143005/`.
- Tổng49 preimage và48 postimage EJSON: có một preimage của bản ghi bị CAS từ chối, sau đó có preimage mới ở đợt tiếp. Hash từng file trong `health_final.json`. Ghi/fsync preimage trước mỗi update.
- Backup source local: `_ai_workbench/backups/fashion_fix_local_20260905/`; backup report: `_ai_workbench/backups/fashion_fix_reports_20260905/`.
- Không rollback DB mù. Nếu cần khôi phục phải so state mới và chỉ phục hồi field/nhân vật đúng phạm vi; không ghi đè tiến trình sau sửa.

## 3. Lỗi đã gặp & giải pháp

| Lỗi / dấu hiệu | Nguyên nhân | Cách xử lý | Cách tránh lặp lại |
|---|---|---|---|
| Nạp có DB ownership nhưng live thiếu | Sync mặc định chỉ bốn trường, callback ở ngoài queue gameplay | Khóa chung theo player, đủ field, live state, drain pending saves | Test DB/RAM/equip ngay/close/relog, không chỉ result success |
| Retry làm lùi tiến trình hoặc hoàn ngược khoản tiêu | Copy snapshot DB cũ lên RAM chưa flush | Retry dùng state live hiện tại; không resync khi receipt đã có ở live | Inject lỗi mail/transaction rồi spend/claim trước retry |
| Snapshot đóng socket xóa quà vừa nạp | Client bị xóa khỏi registry trước final save | Giữ closing snapshot đến hết final save; invalidate cả closing session | Test cash/close và save ambiguous |
| Writer timeout mở đường cho snapshot tiếp theo | Promise.race hết giờ nhưng DB write vẫn chạy nền | Đợi thao tác gốc settle rồi mới trả lỗi/retry, không bỏ thứ tự | Không dùng timeout để mở khóa dữ liệu đang mutate |
| Fashion trong túi bị dùng mất | Thiếu guard khi useCfg=null | Trả FASHION_REQUIRES_OWNERSHIP_REPAIR trước consume |1.914 Fashion body regression; hộp bộ đồ vẫn có flow riêng |
| Nhận trùng code không có quà quy đổi | Generic grant bỏ qua swaps | Quy đổi qua normal grant; item delta/sync thật |631 ID duplicate cross-channel regression |
| Repair dừng ở bản ghi thứ3 | Mongo embedded-object equality phụ thuộc thứ tự key; JS đổi thứ tự numeric bag keys dù nội dung giống hệt | Chẩn đoán read-only xác nhận canonical state không đổi; dùng `$objectToArray` + `$setEquals` so đủ key/value | Không nới thành chỉ check số item; vẫn CAS toàn bag và fashion/ledger |
| Syntax account sau thêm khóa | Đóng callback nhầm ở buildLoginBatch thay vì handleLogin | Sửa đúng ranh giới, node --check trước stage | Kiểm function boundary, không chỉ tìm return cuối file |
| Writer test fail khi chạy runner | Preload cũ stub savePlayer khiến test không còn dùng persistence service thật | Writer/channels tự cách ly, không nạp preload stub | Test concurrency phải dùng queue/save thật với DB giả |
| Native test thiếu acorn/top-combat thiếu client fixture | Candidate source-only chưa có fixture dependency | Pin acorn local, thêm index/main bản local làm test fixture | Không coi thiếu fixture là regression game |
| Repair fixture đầu không tìm thấy config | Chỉ LHS_CONFIG_PATH được set, module đọc CONFIG_BIN_PATH | Test riêng pin rõ config trước require | Ghi config/source hash vào evidence |

Không có lỗi encoding mới trong source/báo cáo. Các thay đổi source giữ comment tiếng Anh/Trung theo style hiện có; báo cáo tiếng Việt UTF-8.

## 4. Kỹ năng / kinh nghiệm mới

- Khóa cash callback riêng không ngăn gameplay/close/autosave. Phải cùng ranh giới thao tác và xử lý cả snapshot đã được chụp trước đó.
- AsyncLocalStorage cho phép save/helper gọi lồng không tự deadlock; token hết hạn khi thao tác hoàn tất để callback trì hoãn không tưởng mình còn giữ khóa.
- Receipt tồn tại trên DB mà thiếu ở live là trạng thái nghi vấn: bắt tải lại, không grant tiếp hoặc copy mù.
- So embedded Mongo document bằng object literal không thích hợp với bag có numeric key order; CAS phải so nội dung đầy đủ độc lập thứ tự.
- Conversion item lỗi sang ownership là khôi phục giá trị đã có, không phải phát thêm quà. Người đã sở hữu hoặc thiếu receipt phải tách riêng.

## 5. Trạng thái hiện tại

### Khôi phục người chơi

| Server | Nhân vật khôi phục | Quyền sở hữu phục hồi | Kết quả |
|---|---:|---:|---|
|S1|48|56 =31 item29001 +25 item11274|Đã commit, đọc lại và hậu kiểm sau restart đúng|
|S2|0|0|Không có trường hợp đủ điều kiện cần sửa|

Đợt đầu commit2 người/4 quyền rồi CAS dừng; server đã khởi động lại ngay. Sau xác định nguyên nhân, đợt tiếp xử lý46 người/52 quyền, không lặp2 người trước. Dry-run lần nữa còn0 người đủ điều kiện ở cả hai server.

**Còn9 bản sao body item ở9 nhân vật đã sở hữu; unowned=0.** Không tự đổi chín bản sao này thành tiền vì cần biết liệu trước đây đã bù/đổi quà hay chưa. Giữ nguyên trong túi và không cho tiêu mất qua use. Ba trường hợp thú cưỡi đã mở hình nhưng thiếu native của audit trước cũng không phát lại khi chưa loại trừ khả năng đã dung luyện.

Không tự bù lịch sử duplicate của631 ID nếu không có receipt chứng minh số lần nhận/số quà thiếu. Luồng nhận mới đã sửa; sửa lịch sử không dùng catalog exposure làm chứng cứ giao dịch thật.

### Kiểm thử và live acceptance

- Fixture cấp thưởng:8.756 ca,0 lỗi ownership;56 bộ đồ,0 lỗi;15 ca gói nạp,0 mismatch cash/live;631 duplicate mismatch về0;1.914 Fashion body consume không hợp lệ về0.
- Writer:18 ca PASS với PlayerService/PlayerMutationService/WSServer wrapper thật, DB giả. Gồm cash↔gameplay, snapshot đã capture, deferred, retry sau spend, commit chưa rõ, socket closing, latest session và timeout không giải phóng writer sớm.
- Repair fixture10 checks PASS: chuyển1:1, giữ số dư bản sao, bảo toàn field khác, chống lặp, thiếu bằng chứng thì giữ, CAS preview đổi thì từ chối.
- Regression cash11/token11, recovery, Activity7 58, cash concurrency8, ngoại quan2.192 ID/234 assertions, native470 ID/940 grant/474 rương/150 đan/4 receiver, gem480, fixed emoji32: PASS. Core714 và top-combat PASS.
- Staging VPS: writer18, repair10 và audit đầy đủ đạt trước promotion.
- Live S1/S2:45 checks mỗi server qua WS cho mua vé1230→giftcode→mail→title thời hạn/native→dùng/mặc suit→relog. Cleanup player/code/mail=0.
- Live cash S1/S2:48 checks mỗi server, gọi **internal callback được ký chỉ cho nhân vật QA riêng**, mặc29001 ngay trong session hiện tại, retry cùng order không grant lặp, gameplay/relog giữ ownership. Cleanup transaction/player/code/mail=0. Không gọi nhà cung cấp thanh toán hoặc dùng tiền thật; upstream payment=false.
- Hash source local/production/candidate7/7 khớp. Ready8080/8083 trả200. Dist/admin/bot workers giữ PID và restart counter trước triển khai.
- Snapshot health đầu sau QA có real bots541 S1 và560 S2 đang reconnect. **Hậu kiểm cuối21:40 UTC+7: real/virtual580/580 mỗi server**, ready200, quái2.466 slot/server, ×2, invalid0; hash7/7 vẫn khớp.

### Giới hạn cần giữ rõ

- Chưa nghiệm thu hình ảnh/model/animation trên native client; người dùng giữ phần kiểm game theo chỉ đạo trước. WS/VM receiver không thay native visual.
- Queue theo player áp dụng cho hai game process hiện chạy fork1/server, đã inventory. Không gọi đây là giải pháp nhiều writer/multi-process trên cùng database hoặc bao phủ mọi admin mutation ngoài phạm vi cash/gameplay.
- Không đổi giá gói, phương án Xu Web, nguồn pool còn thiếu hoặc mở105 item đang fail-closed. Các rủi ro order binding/custom product/distribution recovery ngoài checkpoint ngoại quan chưa được tuyên bố hoàn tất.
- Player writer sẽ chờ DB settle nếu quá deadline; ưu tiên không ghi chồng. Nếu DB thực sự treo, cần vận hành kiểm kết nối thay vì mở khóa để chạy snapshot mới chồng lên.

## 6. Bước tiếp theo

1. Người chơi đăng nhập lại để nhận state đã khôi phục; kiểm Đồ Long Đao29001 và danh hiệu11274 trong mục ngoại quan, không cần tìm mail bù.
2. Test UI một gói11000003, một code/web mail có ngoại quan, hộp29040 và nhận trùng11274. Báo server/nhân vật/ID/thời điểm/ảnh nếu còn lỗi, không gửi mật khẩu hoặc code dùng được.
3. Nếu muốn xử lý chín bản sao dư và lịch sử duplicate, phải đối soát ledger/backup bù cũ trước; chỉ commit phần thực thiếu, không phát lại toàn bộ.
4. Các105 item thiếu pool và ba thú cưỡi native cần dữ liệu/receipt riêng, không trộn vào bản fix này.
5. Package source-only kèm manifest/hash/test/report nằm trong workbench; không chứa credential, env hoặc player preimage. Không dùng script deploy/repair cũ chạy lại tự động.
