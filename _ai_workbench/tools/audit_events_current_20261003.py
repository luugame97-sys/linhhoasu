"""Fetch bounded, read-only event evidence. No live source/DB edits or gameplay RPC."""
import json
from pathlib import Path
from skin_incident_remote import connect, run

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'_ai_workbench/temp/events_audit_20261003'
OUT.mkdir(parents=True,exist_ok=True)
source=(ROOT/'_ai_workbench/tools/audit_events_current_20261003.js').read_text(encoding='utf-8')
# Async wrapper keeps stdin compatibility on Node 20.
with connect() as client:
    result=json.loads(run(client,'node -','(async()=>{\n'+source+'\n})().catch(e=>{console.error(e.stack);process.exitCode=1});'))
    (OUT/'live.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    for rel,record in result['source'].items():
        if record.get('missing'):
            continue
        dest=OUT/'source'/rel
        dest.parent.mkdir(parents=True,exist_ok=True)
        dest.write_text(record['text'],encoding='utf-8')
    print(json.dumps({'at':result['at'],'nodes':result['nodes'],'logs':result['logs'],
      'db':[{'server':d['server'],'settlements':d['settlements'],'rosters':d.get('rosters'),
             'activityIds':[r['_id'] for r in d['activeActivities']]} for d in result['db']]},ensure_ascii=False,indent=2))
