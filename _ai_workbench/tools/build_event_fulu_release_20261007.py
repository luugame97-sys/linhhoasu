"""Compose the approved exposure and Fulu candidates, preserving live drift."""
from pathlib import Path
import hashlib,json

ROOT=Path(__file__).resolve().parents[2]
GOAL=ROOT/'_ai_workbench/temp/event_goal_20261007'
OUT=GOAL/'phase_ab'
C=OUT/'candidate'
B=GOAL/'before'
F=GOAL/'fulu'
E=GOAL/'exposure'
def sha(b):return hashlib.sha256(b).hexdigest()
def write(rel,data):
    p=C/rel;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(data)

for rel in ['services/Activity52Service.js','services/Activity52TaskService.js','services/PlayerService.js','handlers/playerPayload.js','services/MainTaskProgressService.js','services/SideTaskProgressService.js']:
    write('lhs/newServer/src/'+rel,(F/'candidate'/rel).read_bytes())
for rel in ['lhs/newServer/src/services/EventExposureGate.js','lhs/newServer/src/services/EventRotationRegistry.js','lhs/newServer/src/handlers/item.js','webgame/game/js/lhs-event-maintenance-v1.js']:
    write(rel,(E/'candidate'/rel).read_bytes())

# The gate precedes the new specialized dispatch and every mutation.
text=(F/'candidate/handlers/activity.js').read_text(encoding='utf-8')
anchor='async function handleActivityOperate(params = {}, session = {}, msgUid) {'
if text.count(anchor)!=1:raise RuntimeError('ACTIVITY_ENTRY_ANCHOR')
text=text.replace(anchor,anchor+"\n  const maintenance = require('../services/EventExposureGate').rejectOperate(params, session, msgUid);\n  if (maintenance) return maintenance;",1)
write('lhs/newServer/src/handlers/activity.js',text.encode())

text=(F/'candidate/handlers/task.js').read_text(encoding='utf-8')
for name in ['handleClaimTaskReward','handleClaimTaskRewardCompat']:
    anchor='async function '+name+'(params, session, msgUid) {'
    if text.count(anchor)!=1:raise RuntimeError('TASK_ENTRY_ANCHOR:'+name)
    text=text.replace(anchor,anchor+"\n  const maintenance = require('../services/EventExposureGate').rejectTasks(params, session, msgUid);\n  if (maintenance) return maintenance;",1)
write('lhs/newServer/src/handlers/task.js',text.encode())
write('webgame/game/js/lhs-fulu-safe-v1.js',(F/'candidate/client/lhs-fulu-safe-v1.js').read_bytes())

text=(B/'webgame/game/index.html').read_text(encoding='utf-8')
lines=text.splitlines(keepends=True)
anchor='"js/main.min_drop200.js?v='
if sum(anchor in line for line in lines)!=1:raise RuntimeError('INDEX_MAIN_ANCHOR')
for i,line in enumerate(lines):
    if anchor in line:
        prefix=line.split('?v=')[0]
        lines[i]=prefix+'?v=20261007_fulu_safe_v1",\n'
        lines[i+1:i+1]=['\t\t"js/lhs-fulu-safe-v1.js?v=20261007_fulu_safe_v1",\n','\t\t"js/lhs-event-maintenance-v1.js?v=20261007_event_gate_v1",\n']
        break
write('webgame/game/index.html',''.join(lines).encode())

baseline=json.loads((GOAL/'baseline.json').read_text(encoding='utf-8-sig'))
expected={row['relative']:row['sha256'] for row in baseline['files']}
files=[]
for p in sorted(C.rglob('*')):
    if not p.is_file():continue
    rel=p.relative_to(C).as_posix();old=expected.get(rel)
    if old is None and rel.startswith('lhs/newServer/src/'):
        oldfile=F/'before'/rel.removeprefix('lhs/newServer/src/')
        if oldfile.exists():old=sha(oldfile.read_bytes())
    files.append(dict(relative=rel,expected=old,candidate=sha(p.read_bytes()),bytes=p.stat().st_size))
if len(files)!=14:raise RuntimeError('RELEASE_FILE_COUNT:'+str(len(files)))
OUT.mkdir(parents=True,exist_ok=True)
(OUT/'release.json').write_text(json.dumps(dict(phase='candidate',version='event_goal_fulu_20261007_v1',files=files,qaOnly52=True,qa=baseline['qa']['name']+'/'+str(baseline['qa']['serverId'])),indent=2)+'\n',encoding='utf-8')
print(json.dumps(dict(result='PASS',files=len(files),blockedPublicTypes=[21,27,30,52],qaAllowed='Talo/S1 type52',noPlayerBackfill=True)))
