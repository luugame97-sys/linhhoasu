"""Exact QA and one S3 cutoff correction; no reward replay."""
import json, shlex, hashlib
from pathlib import Path
from snapshot_web_multiserver_20260906 import connect, run
WB=Path(__file__).resolve().parents[1]
APP='/linhhoasu/lhs/newServer'
LOCAL=WB/'temp/event_settlement_fix_20260913'
STAGE='/linhhoasu/_ai_workbench/temp/event_settlement_v2_20260913'
REL='src/config/eventRewardSettlement.json'
sha=lambda b:hashlib.sha256(b).hexdigest()
def main():
 s=connect()
 try:
  with s.open_sftp() as f:
   name='test_event_settlement_mongo_20260913.js'
   with f.open(STAGE+'/tools/'+name,'wb') as h:h.write((WB/'tools'/name).read_bytes())
  raw=run(s,'NODE_PATH='+APP+'/node_modules EVENT_TEST_APP='+APP+' EVENT_TEST_LIVE='+APP+' node '+STAGE+'/tools/'+name)
  qa=json.loads(next(x for x in raw.splitlines() if x.startswith('{"result"')))
  assert qa['result']=='PASS' and qa['actualSchemas']
  result={'qa':qa,'readiness':{}}
  candidate=(WB.parent/'linhhoasu/lhs/newServer'/REL).read_bytes()
  with s.open_sftp() as f:
   with f.open(APP+'/'+REL,'rb') as h:before=h.read()
   if sha(before)!=sha(candidate):
    assert sha(before)=='9c3c32a629e8bf3993ed4ab15c61c5fa15dd7678a9759bca0ae330373d771e51'
    old=json.loads(before);new=json.loads(candidate)
    # Exactly the final legacy role seeded while v1 was still running on S3.
    assert old['newYearWindows']['1003']['endTime']==1790414982026
    new['newYearWindows']['1003']['endTime']=1790414982026
    assert old==new
    backup='/linhhoasu/_ai_workbench/backups/event_settlement_fix_v2_20260913_pre/eventRewardSettlement.before_s3_cutoff.json'
    run(s,'test ! -e '+shlex.quote(backup)+' && cp -p '+shlex.quote(APP+'/'+REL)+' '+shlex.quote(backup))
    with f.open(APP+'/'+REL+'.cutoff-stage','wb') as h:h.write(candidate)
    run(s,'mv '+shlex.quote(APP+'/'+REL+'.cutoff-stage')+' '+shlex.quote(APP+'/'+REL))
    result['s3Cutoff']={'from':1790414982026,'to':1790415628301,'sha256':sha(candidate)}
    run(s,'pm2 reload lhs-s1003')
   with f.open(APP+'/'+REL,'rb') as h:assert sha(h.read())==sha(candidate)
  # No sleep/replay if service is not ready: caller can rerun the read-only check.
  for port in [8080,8083,8084]:
   try:result['readiness'][str(port)]=run(s,"curl -fsS --max-time 5 -o /dev/null -w '%{http_code}' http://127.0.0.1:"+str(port)+'/ready').strip()
   except RuntimeError:result['readiness'][str(port)]='starting'
  (LOCAL/'finalize.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
  print(json.dumps(result))
 finally:s.close()
if __name__=='__main__':main()
