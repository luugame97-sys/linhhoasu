"""Checkpointed, in-process incident execution; retries never restart penalties or recover twice."""
import json,sys
from datetime import datetime,timezone
from pathlib import Path
import paramiko
from release_huyenvu_daily_20260906 import run,hashes,pm2,ready,digest
from release_fishing_recovery_service_20260906 import ROOT,WB,STAGE,api
def write(n,x):(ROOT/n).write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def main():
 sys.stdout.reconfigure(encoding='utf-8');mode=sys.argv[1];assert mode in ['preflight','apply','verify']
 plan=json.loads((ROOT/'plan.json').read_text(encoding='utf-8'));deploy=json.loads((ROOT/'service-deploy.json').read_text(encoding='utf-8'));rows=plan['rows']
 c=(WB/'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines();s=paramiko.SSHClient();s.load_system_host_keys();s.set_missing_host_key_policy(paramiko.RejectPolicy());s.connect(c[0].strip(),username='root',password=c[2],look_for_keys=False,allow_agent=False,timeout=20)
 try:
  assert hashes(s,list(deploy['expected']))==deploy['expected'];assert pm2(s)==deploy['pm2'];assert ready(s)=={'8080':200,'8083':200}
  f=s.open_sftp()
  try:f.put(str(WB/'tools/fishing_web_discipline_atomic_20260906.php'),STAGE+'/tools/fishing_web_discipline_atomic_20260906.php')
  finally:f.close()
  run(s,'php -l '+STAGE+'/tools/fishing_web_discipline_atomic_20260906.php')
  if mode in ['preflight','verify']:
   out=[]
   for row in rows:
    statuses=[api(s,'status',row['accountId'],sid)['result'] for sid in [1001,1002]]
    own=next(x for x in statuses if x['serverId']==row['serverId'])
    if mode=='preflight':assert own['recovery'] is None and own['sufficient'] and not own['ban']['banned']
    else:
     rec=own['recovery'];assert rec and rec['amount']==row['amount'] and rec['before']-rec['after']==row['amount']
     if row['accountId']=='vanduc97':assert all(not x['ban']['banned'] and x['appliedBan'] is None for x in statuses)
     else:assert all(x['appliedBan'] is not None and x['onlineSessions']==0 for x in statuses)
    web=None
    if row['penaltySeconds']:
     web=json.loads(run(s,f'php {STAGE}/tools/fishing_web_discipline_atomic_20260906.php preview {STAGE}/plan.json {row["accountId"]}',timeout=25))
     if mode=='preflight':assert not web['state']['banned']
     else:assert web['ban'] and int(web['ban']['ban_until'])==own['appliedBan']['until'] and web['ban']['ban_code']==plan['code']
    out.append({'accountId':row['accountId'],'game':statuses,'web':web})
   result={'result':'PASS','mode':mode,'time':datetime.now(timezone.utc).isoformat(),'rows':out,'ready':ready(s),'processUnchanged':pm2(s)==deploy['pm2']};write('incident-'+mode+'.json',result)
   print(json.dumps({'result':'PASS','mode':mode,'accounts':len(out),'ready':result['ready']}));return
  assert json.loads((ROOT/'incident-preflight.json').read_text(encoding='utf-8'))['result']=='PASS'
  resultPath=ROOT/'incident-progress.json';report=json.loads(resultPath.read_text(encoding='utf-8')) if resultPath.exists() else {'incident':plan['incident'],'startedAt':datetime.now(timezone.utc).isoformat(),'rows':{}}
  # First recover while users can remain online; each save uses the normal role lock.
  for row in rows:
   account=row['accountId'];entry=report['rows'].setdefault(account,{})
   if not entry.get('recovery'):
    entry['recovery']=api(s,'recover',account,row['serverId']);write('incident-progress.json',report)
   assert entry['recovery']['result']['result']['amount']==row['amount']
   print(json.dumps({'step':'recovered','account':account,'amount':row['amount']}),flush=True)
  # Process each full account immediately; short bans do not wait behind the whole batch.
  for row in rows:
   account=row['accountId'];entry=report['rows'][account]
   if row['penaltySeconds']:
    if not entry.get('ban'):
     entry['ban']=api(s,'ban',account,row['serverId']);write('incident-progress.json',report)
    name=account+'-ban-receipt.json';write(name,entry['ban']);f=s.open_sftp()
    try:f.put(str(ROOT/name),STAGE+'/'+name)
    finally:f.close()
    if not entry.get('web'):
     entry['web']=json.loads(run(s,f'php {STAGE}/tools/fishing_web_discipline_atomic_20260906.php apply {STAGE}/plan.json {account} {STAGE}/{name}',timeout=25));assert entry['web']['result']=='PASS';write('incident-progress.json',report)
    entry['enforce']=[api(s,'enforce',account,sid) for sid in [1001,1002]];write('incident-progress.json',report)
   else:entry['banExempt']=True
   if not entry.get('notice'):entry['notice']=api(s,'notify',account,row['serverId']);write('incident-progress.json',report)
   print(json.dumps({'step':'disciplined_and_notified','account':account,'minutes':row['penaltySeconds']//60}),flush=True)
  report.update(result='APPLIED',finishedAt=datetime.now(timezone.utc).isoformat());write('incident-progress.json',report)
  print(json.dumps({'result':'APPLIED','recovered':sum(r['amount']for r in rows),'banned':sum(r['penaltySeconds']>0 for r in rows),'notices':len(rows)}))
 finally:s.close()
if __name__=='__main__':main()
