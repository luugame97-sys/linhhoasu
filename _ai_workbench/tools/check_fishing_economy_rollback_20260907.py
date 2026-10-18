"""Validate exact rollback, then archive failed attempt before a new staged run."""
import json
from snapshot_web_multiserver_20260906 import connect
from stage_fishing_economy_20260907 import ROOT
from release_huyenvu_daily_20260906 import hashes,pm2,ready
state=json.loads((ROOT/'deploy.json').read_text());assert state['result']=='FAILED'and state['rolledBack']
s=connect()
try:
 assert hashes(s,list(state['baseline']))==state['baseline'],'ROLLBACK_HASH'
 assert ready(s)=={'8080':200,'8083':200}
 current=pm2(s)
 for old in state['beforePm2']:
  actual=next(r for r in current if r['name']==old['name'])
  if old['name']in state['restarted']:assert actual['status']=='online'and actual['restarts']==old['restarts']+2
  else:assert actual==old
 i=1
 while(ROOT/('failed-attempt-'+str(i)+'.json')).exists():i+=1
 (ROOT/'deploy.json').rename(ROOT/('failed-attempt-'+str(i)+'.json'))
 pre=json.loads((ROOT/'preflight.json').read_text());pre['processes']=current;(ROOT/'preflight.json').write_text(json.dumps(pre,indent=2)+'\n')
 print(json.dumps({'rollbackVerified':True,'archivedAttempt':i,'ready':ready(s)}))
finally:s.close()
