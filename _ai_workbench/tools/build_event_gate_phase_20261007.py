"""Compose maintenance gates from exact live preimages, without gameplay writes."""
from pathlib import Path
import hashlib,json

ROOT=Path(__file__).resolve().parents[2]
GOAL=ROOT/'_ai_workbench/temp/event_goal_20261007'
OUT=GOAL/'phase_a'
B=GOAL/'before'
C=OUT/'candidate'
EX=GOAL/'exposure'
baseline=json.loads((GOAL/'baseline.json').read_text(encoding='utf-8-sig'))
expected={x['relative']:x['sha256'] for x in baseline['files']}
taskbase=json.loads((EX/'task-baseline.json').read_text(encoding='utf-8-sig'))
def sha(b):return hashlib.sha256(b).hexdigest()
def write(rel,data):
    p=C/rel;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(data)

# Public policy stays closed during phase A. The authorized actor is enabled
# only in phase B with the corrected implementation and its passing tests.
gate=(EX/'candidate/lhs/newServer/src/services/EventExposureGate.js').read_text(encoding='utf-8-sig')
needle="return type === 52 && !!player"
if gate.count(needle)!=1:raise RuntimeError('QA_GATE_ANCHOR')
gate=gate.replace(needle,"return false && type === 52 && !!player")
write('lhs/newServer/src/services/EventExposureGate.js',gate.encode())
for rel in ['lhs/newServer/src/services/EventRotationRegistry.js','lhs/newServer/src/handlers/item.js','lhs/newServer/src/handlers/task.js','webgame/game/js/lhs-event-maintenance-v1.js']:
    write(rel,(EX/'candidate'/rel).read_bytes())

rel='lhs/newServer/src/handlers/activity.js'
data=(B/rel).read_bytes();text=data.decode('utf-8')
recipe=json.loads((EX/'activity-anchor.json').read_text(encoding='utf-8-sig'))
if text.count(recipe['anchor'])!=1:raise RuntimeError('ACTIVITY_GATE_ANCHOR')
text=text.replace(recipe['anchor'],recipe['insertBefore']+recipe['anchor'])
write(rel,text.encode())

rel='webgame/game/index.html';text=(B/rel).read_text(encoding='utf-8')
anchor='"js/main.min_drop200.js?v='
if text.count(anchor)!=1:raise RuntimeError('MAIN_REFERENCE_ANCHOR')
lines=text.splitlines(keepends=True)
for i,line in enumerate(lines):
    if anchor in line:
        lines.insert(i+1,'\t\t"js/lhs-event-maintenance-v1.js?v=20261007_event_gate_v1",\n')
        break
write(rel,''.join(lines).encode())

files=[]
for p in C.rglob('*'):
    if not p.is_file():continue
    rel=p.relative_to(C).as_posix()
    prior=expected.get(rel)
    if rel=='lhs/newServer/src/handlers/task.js':
        old=EX/'before/lhs/newServer/src/handlers/task.js'
        if not old.exists():
            alternatives=list((EX/'before').rglob('task.js'))
            if len(alternatives)!=1:raise RuntimeError('TASK_BASELINE_PATH')
            old=alternatives[0]
        prior=sha(old.read_bytes())
        if prior!='bcf687400b012211ca948b9e503687528d7cd9bd48a043cccce0237d449cbb6e':raise RuntimeError('TASK_BASELINE_HASH')
    files.append(dict(relative=rel,expected=prior,candidate=sha(p.read_bytes()),bytes=p.stat().st_size))
if len(files)!=7:raise RuntimeError('PHASE_A_FILE_COUNT')
OUT.mkdir(parents=True,exist_ok=True)
(OUT/'release.json').write_text(json.dumps(dict(phase='candidate',version='event_gate_20261007_v1',files=files,qaOverrideEnabled=False),indent=2)+'\n',encoding='utf-8')
print(json.dumps(dict(result='PASS',files=len(files),blockedTypes=[21,27,30,52],qaOverrideEnabled=False)))
