from pathlib import Path
import hashlib, json, shutil

ROOT = Path(__file__).resolve().parents[2]
path = ROOT / 'linhhoasu/webgame/game/js/main.min_drop200.js'
raw = path.read_bytes()

old_task = (
    b"refreshTaskList=function(){var t,e=se.getActivityData(),i=e.getTaskConfig(),n=[];"
    b"for(t in i){var a=i[t],s=Y.Config.TaskConfig[a.taskId],o=Y.TaskModel.getActivityTaskDataById(e.id,a.taskId),r=[];"
    b"r.push({id:153,count:a.score}),r.push.apply(r,a.rewards),n.push({id:o.id,textId:s.textId,rewards:r,maxValue:s.taskValue1,status:o.status,progress:o.progress})}"
)
new_task = (
    b"refreshTaskList=function(){var t,e=se.getActivityData(),i=e&&e.getTaskConfig(),n=[];if(!e||!i)return;"
    b"for(t in i){var a=i[t]||{},s=Y.Config.TaskConfig[a.taskId]||{},o=Y.TaskModel.getActivityTaskDataById(e.id,a.taskId)||{id:a.taskId,status:10,progress:0},r=[];"
    b"r.push({id:153,count:Number(a.score)||0}),r.push.apply(r,Array.isArray(a.rewards)?a.rewards:[]),n.push({id:o.id||a.taskId,textId:s.textId||a.taskId,rewards:r,maxValue:Number(s.taskValue1)||0,status:Number(o.status)||10,progress:Number(o.progress)||0})}"
)
old_progress = b"Dxt.setProgressLabel=function(t,e,i,n,a,s){var o;void 0===n&&(n=0),void 0===a&&(a=!1),t&&(o=\"\",s=null==s?\"\":s,"
new_progress = b"Dxt.setProgressLabel=function(t,e,i,n,a,s){var o;e=Number.isFinite(Number(e))?Number(e):0,i=Number.isFinite(Number(i))?Number(i):0,void 0===n&&(n=0),void 0===a&&(a=!1),t&&(o=\"\",s=null==s?\"\":s,"

if raw.count(old_task) != 1:
    raise RuntimeError(f'EXPECTED_TASK_PANEL_MATCH:{raw.count(old_task)}')
if raw.count(old_progress) != 1:
    raise RuntimeError(f'EXPECTED_PROGRESS_MATCH:{raw.count(old_progress)}')

backup = ROOT / '_ai_workbench/backups/newyear_task_panel_pre_20261011'
backup.mkdir(parents=True, exist_ok=False)
shutil.copy2(path, backup / path.name)
patched = raw.replace(old_task, new_task).replace(old_progress, new_progress)
path.write_bytes(patched)

report = {
    'result': 'PATCHED_LOCAL_CANDIDATE',
    'path': str(path),
    'beforeSha256': hashlib.sha256(raw).hexdigest(),
    'afterSha256': hashlib.sha256(patched).hexdigest(),
    'taskPanelMatches': 1,
    'progressGuardMatches': 1,
    'bytes': len(patched),
}
out = ROOT / '_ai_workbench/temp/newyear_task_panel_20261011'
out.mkdir(parents=True, exist_ok=True)
(out / 'patch.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
print(json.dumps(report, ensure_ascii=False, indent=2))
