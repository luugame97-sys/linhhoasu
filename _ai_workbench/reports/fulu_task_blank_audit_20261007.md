# Fulu task panel trống — audit tiếp theo

Exact-live task.js/playerPayload.js/ActivityCycleSchedule.js/SideTaskProgressService.js/MainTaskProgressService.js đã snapshot vào `event_goal_20261007/fulu/before`. Đã có candidate và39 ca RAM PASS; chưa deploy.

## Nguyên nhân được xác minh

- Native gọi `TaskModel.getTaskDataByType(52001 | (1<<30), true)`; claim all gửi52001.
- Live `playerPayload.normalizeTaskInfo` chỉ đăng ký `Activity43TaskConfig` và `Activity44TaskConfig`; compact cũng chỉ giữ hai map này. Không seed/map nhóm52.
- TaskConfig có năm nhiệm vụ75001–75005 có reward233/232; không có Activity52TaskConfig riêng. `type:6` không đủ lọc vì nhiều nhiệm vụ event khác cùng type6.
- `task.handleClaimTaskRewardCompat` coi id52001 là task id thật, không mở rộng nhóm52. Generic claimTaskRewards không kiểm status20 cho type6, nên không nên chỉ seed rồi cho generic grant.
- MainTaskProgress activity-special hiện chỉ biết Fortune61001–61009. Seed7500x đơn thuần không làm progress tự cập nhật.

## Năm nhiệm vụ config liên quan

| ID | activeId / taskValue | Nguyên nghĩa | Thưởng |
|---|---|---|---|
|75001|101/1|Đăng nhập mỗi ngày|233×1|
|75002|54/1|灵舟争渡 chiến đấu1 lần|233×1|
|75003|36/80, sub19|Hoạt động ngày đạt80|232×2|
|75004|13/100, sub4|Tiêu100 bánh bao|232×2|
|75005|16/3|Khiêu chiến Võ đạo hội3 lần|232×1|

Tất cả updateCycle1. Không có căn cứ để đổi yêu cầu hoặc thưởng. Cần xác minh mapping nhóm đầy đủ bằng native/catalog thay vì chỉ dải ID.

## Phương án hẹp

1. Adapter52 riêng cho seed/retain runtime task group và daily/reset theo helper game-day đang có; giữ trạng thái nhận nếu cùng kỳ/ngày.
2. Adapter claim52 riêng (group/single) trước generic, validate completed, atomic items/task ledger/save/receipt, không cấp giả.
3. Tái dùng daily counters: items19, itemConsume4, arenaChallengeCount; không lấy lifetime counter làm daily thành tích.
4. Đính chính active54: hook xác thực hiện có trong arena.js3411/3512, DoubleTower4502/4505 gọi SideTask.recordProgress54 chỉ khi `verified.participated`, kèm battleUid. Không dùng OldTrek.
5. Không đưa generic type6 vào broad auto-complete/refactor. Không thao tác DB player để làm QA hoàn thành nhiệm vụ.

## Candidate đã thực hiện

- `services/Activity52TaskService.js`: riêng5 IDs75001–75005, groupmarkedactivityID; reset GMT+7 theo ngày/kỳ; preserve claimed status cũ cùng ngày; login1, items19, itemConsume4/arenaChallengeCount theo dailybaseline. Battle54 chỉ từ verified hook kèmUID, không nhận RPC client khai đã đánh.
- `handlers/playerPayload.js`: seed5 tasks đúng group và retain completed khi compact.
- `services/MainTaskProgressService.js`: refresh trước normalizer, đánh dấu taskdirty khi counter đổi.
- `services/SideTaskProgressService.js`: gọi adapter52 trước nhánh type9; giữ nghiệp vụside task hiện tại.
- `handlers/task.js`: dispatch adapter52 trước generic cho hai handler; root phải ghép exposuregate trước dispatch.
- Claim nhận đúng native `{ids,type}`, thêm requestId/cycleKey/dayKey số YYYYMMDD GMT+7. Chỉ cấp taskstatus20, no missing/unfinished grants; cùng draftitems/taskledger/receipt, existing optinCAS, confirmedsave mới ACK. Replay không delta, requestcũ qua ngày/kỳ bị từ chối để không mark taskngày mới đãclaim.
- Mapping5taskIDs dựa config/reward/UItext đã root chấp thuận; không nói có bảngActivity52TaskConfig.

## Kiểm chứng

39 casesPASS trong `_ai_workbench/tools/test_fulu_candidate_20261007.js`. Có actual playerPayload.normalizeTaskInfo, MainTask.addItemConsume/addArenaChallengeCount, SideTask.recordProgress54, FeatureReceipt, RewardSync. Native TaskModel/FuluPanel trích từclient + guard: claimlogin → item233 tăng1 → native bấmquay → item233 giảm1 → record1 vàanimationrendered. DB vẫn mock trong RAM, không phải QA browser/DB production.

Hashes:

- Activity52TaskService `cc02e326d34037a46f4f2330aaa5cb509d90f629f4b1f21d146e4244d364d5ca`
- task.js `683f699fbbd2742bdf15153dbf5b3c1035815f2d872040bd28a5c4d87df3e689`
- playerPayload.js `fa5a90eed3786c59bbd506e4e27b2f62007e93c14686b1524375055fe68c4620`
- MainTaskProgressService `496fd106b38917198ce1893b20fc5e49b73c4ca0837379657270d60438a7f818`
- SideTaskProgressService `842e0eb2af323e48872a1545a1226e8bc84bfc532ce1787cb4e81b1997ee28f1`

## Hậu QA phaseAB: task DB null và hotfix chờ root triển khai

Root QA đã nhận login233+1, draw233-1/thưởng/score1. Audit DB read-only `fulu/qa/task_storage_audit.json` xác nhận projection đúng: taskInfo.tasks75001–75005 thật sự thiếu, ledgerclaimed75001 còn nguyên; derive/normalize có đầy đủ5 task,75001status30.

Nguyên nhân: WSServer sau handler gọi MainTaskProgress rồi RealmTaskProgress. Realm legacy gọi normalizeTaskInfo(taskInfo,roleInfo) thiếu playerInput. Hook sync52 nhận{} và xóa5task như eventđãđóng, sau đó autosave lưu taskInfo thiếu. Không phải schemaMixed làm mất numeric key, chưa có bằng chứng stale economy overwrite.

Hotfix duy nhất: đầu `Activity52TaskService.sync`, nếu player không có own property `activityInfo`, giữ nguyên taskInfo/tasksMap và không seed/remove. Caller đủ player context vẫn loại task khi eventđóng và reset ngày/kỳ đúng.

- CandidatehelperSHA mới `06f305f2a62ba6feedf136d928a55607b098cb3a8cf2a38b8cb8e482ca42f50f`.
- 41casesPASS, thêm actual RealmTaskProgress và MainTaskProgress theo thứ tự WSServer; relog giữclaimed; fullcontext đóngevent vẫnremove.
- Chạy cùng harness với helper phaseAB cũ tái hiệnFAIL task75001undefined; helperhotfix PASS.
- Không sửa Realm, không deploy, không ghi DB từ lượt audit này.

Claim chống lặp dựa fuluTaskLedger + receipt, nên rawtaskthiếu không cấp lại login. Tuy nhiên cachetask bị xóa là lỗi thật cần hotfix rồi xác minh DBtask và UI sau relog/auto farming. Không coi derivedstate là bằng chứng rawstateđãpersist đúng.

## Hai toast bảo trì sau draw

Static test exact deployed gate với QAidentity: Fuluoperate/task và25shopIDs được phép;21/27/30 bịchặn. Addon toast chỉwrap1700/1000/1801, khôngghi tag/payload nên hai toast chưa đủ kết luận requestnào. Khôngbypassgate. Cầncapture next rejectiontag + eventid/tasktype trước sửa, tránh tự mở unsafeevent vì toast.

## Cổng trước public exposure

1. RootdeployhotfixCAS + readiness, QA native relog và quay/nhận task đãclaim không tăng233lại; DB rawtasks vàledger giữ30.
2. Khi auto farming đang chạy: countertăng hợp lệ, Fulurows không biếnmất, level/EXP và232/233 khôngtụt; đọc snapshot hẹp trước/sau.
3. Negative: thiếu233, chưa xongtask, requesttrùng/lệchcycle/ngày/multiplier/selectedColor phải từchối và khôngđổi economy. Các ca inject chỉ RAM; không phá dữ liệuaccount.
4. Guarantee/maxmulti: boundary79+5=84, nextsingleprize1/reset0, rejectmultiở80+, naturaljackpot khôngreset theo decision; RAM đã PASS. LiveQA chưađạt score80 nên không báo đãkiểm live guarantee. Không setDBscore/đồgiả để nghiệmthu.
5. Xác định scope toast và kết thúc animation ở lỗi/ACKmất; nonce/cycle metadata phải đúng. QA source/client/runtime hashes và receiptreadback đủ trước gắn public nativeQaVersion.
