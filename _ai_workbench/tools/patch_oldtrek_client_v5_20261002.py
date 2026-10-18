from pathlib import Path
p=Path('_ai_workbench/temp/oldtrek_recovery_20261002/candidate/client/lhs-oldtrek-errors-v1.js')
s=p.read_text(encoding='utf8')
def rep(old,new,label,count=1):
 global s
 n=s.count(old)
 if n!=count: raise RuntimeError(f'{label}: {n}')
 s=s.replace(old,new)
rep("api.version === '20261002_v4'","api.version === '20261002_v5'",'version check')
rep("api.version = '20261002_v4';","api.version = '20261002_v5';",'version')
rep("    OLD_TREK_SAVE_UNKNOWN: 'Chưa xác nhận lưu dữ liệu. Hãy đăng nhập lại để đồng bộ.',","    OLD_TREK_SAVE_UNKNOWN: 'Chưa xác nhận lưu dữ liệu. Hãy đăng nhập lại để đồng bộ.',\n    OLD_TREK_OPERATION_FAILED: 'Thao tác hành trình chưa hoàn tất; tiến độ được giữ nguyên.',\n    OLD_TREK_RESYNC_REQUIRED: 'Dữ liệu hành trình vừa thay đổi; đang đồng bộ lại.',",'messages')
rep("      if (!params.requestId) params.requestId = 'ot_' + Date.now() + '_' + (++sequence) + '_' + Math.floor(Math.random() * 1e9);\n      args[1] = params;","      if (!params.requestId) params.requestId = 'ot_' + Date.now() + '_' + (++sequence) + '_' + Math.floor(Math.random() * 1e9);\n      if (model.info && model.info.stateRevision != null && params.revision == null) params.revision = Number(model.info.stateRevision) || 0;\n      args[1] = params;",'request revision')
rep("      if (root.LhsOldTrekMinigames && root.LhsOldTrekMinigames.installed) params.oldTrekPuzzleVersion = '20260921_v1';\n      args[2] = function (payload) {","      if (root.LhsOldTrekMinigames && root.LhsOldTrekMinigames.installed) params.oldTrekPuzzleVersion = '20260921_v1';\n      args[4] = function (error) {\n        error = error || { result: -1, code: 'OLD_TREK_RPC_FAILED' };\n        if (Number(tag) === 7005) model.__lhsOldTrekSettlementPending = true;\n        if ([7000,7001,7002,7005,7008].indexOf(Number(tag)) >= 0) refreshPendingSnapshot(model, params.eventUid);\n        var tips = root.UserTips;\n        if (tips && tips.ins) tips.ins().showTips(messages[error.code] || 'Kết nối hành trình bị gián đoạn; dữ liệu được giữ nguyên.');\n      };\n      args[2] = function (payload) {",'error callback')
rep("          if (Number(tag) === 7009 && root.ViewManager && root.ViewManager.ins && root.OldTrekDestSweepView) {\n            root.ViewManager.ins().close(root.OldTrekDestSweepView);\n          }\n          return;","          if (Number(tag) === 7009 && root.ViewManager && root.ViewManager.ins && root.OldTrekDestSweepView) {\n            root.ViewManager.ins().close(root.OldTrekDestSweepView);\n          }\n          if ((payload.expiredRecovery || payload.recovery && payload.recovery.state === 'EVENT_EXPIRED') && hasCurrentEvent(model)) {\n            resumePendingEvent(model);\n          }\n          return;",'recovery callback')
p.write_text(s,encoding='utf8',newline='')
idx=Path('_ai_workbench/temp/oldtrek_recovery_20261002/candidate/client/index.html')
i=idx.read_text(encoding='utf8')
for old,new in [
 ('lhs-oldtrek-errors-v1.js?v=20261002_oldtrek_guard_v4','lhs-oldtrek-errors-v1.js?v=20261002_oldtrek_guard_v5'),
 ('20261002_gem_quick100_v4','20261002_gem_quick100_v5')]:
 if i.count(old)!=1: raise RuntimeError(f'index {old}: {i.count(old)}')
 i=i.replace(old,new)
idx.write_text(i,encoding='utf8',newline='')
print(p, idx)
