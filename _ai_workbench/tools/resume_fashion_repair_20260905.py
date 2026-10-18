"""Resume only uncommitted subjects from the original approved repair preview."""
import json,sys
from datetime import datetime,timezone
import paramiko
from stage_fashion_fix_20260905 import run,pm2,WB,REL,APP
sys.stdout.reconfigure(encoding='utf-8');stageInfo=json.loads((REL/'stage.json').read_text());stage=stageInfo['stage'];stamp=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S');backup='/linhhoasu/_ai_workbench/backups/fashion_repair_resume_'+stamp
c=(WB/'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines();s=paramiko.SSHClient();s.load_system_host_keys();s.set_missing_host_key_policy(paramiko.RejectPolicy());s.connect(c[0].strip(),username='root',password=c[2],look_for_keys=False,allow_agent=False,timeout=20)
result={'backup':backup,'sourcePreviouslyInstalled':True,'committed':False};stopped=False
env=f'NODE_ENV=test LOG_DIR= LHS_APP_ROOT={stage}/app LHS_CONFIG_PATH={stage}/server.bin CONFIG_BIN_PATH={stage}/server.bin'
def save():(REL/('repair_resume_'+stamp+'.json')).write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
try:
 result['before']=pm2(s)
 for rel,h in stageInfo['candidateHashes'].items():assert run(s,f'sha256sum {APP}/{rel}').split()[0]==h
 sf=s.open_sftp();sf.put(str(WB/'tools/repair_fashion_ownership_20260905.js'),stage+'/tools/repair_fashion_ownership_20260905.js');sf.close();run(s,f'node --check {stage}/tools/repair_fashion_ownership_20260905.js')
 result['preview']=json.loads(run(s,f'{env} node {stage}/tools/repair_fashion_ownership_20260905.js'))
 for db,d in result['preview']['dbs'].items():
  original={r['subject']:r['items'] for r in stageInfo['repairPreview']['dbs'][db]['subjects']}
  assert all(r['subject']in original and r['items']==original[r['subject']] for r in d['subjects']),'new or changed repair subject'
 run(s,f'install -d -m 700 {backup}')
 run(s,'pm2 stop lhs-s1001 lhs-s1002',timeout=45);stopped=True
 assert all(p['status']=='stopped' and not p['pid'] for p in pm2(s) if p['name']in['lhs-s1001','lhs-s1002'])
 result['stoppedPreview']=json.loads(run(s,f'{env} node {stage}/tools/repair_fashion_ownership_20260905.js'))
 for db in result['preview']['dbs']:assert result['preview']['dbs'][db]['subjects']==result['stoppedPreview']['dbs'][db]['subjects']
 save();result['repair']=json.loads(run(s,f'{env} FASHION_REPAIR_MAINTENANCE=stopped-s1001-s1002 FASHION_REPAIR_BACKUP={backup} node {stage}/tools/repair_fashion_ownership_20260905.js --commit'));result['committed']=True;save()
 result['dryRun']=json.loads(run(s,f'{env} node {stage}/tools/repair_fashion_ownership_20260905.js'));assert all(d['eligiblePlayers']==0 for d in result['dryRun']['dbs'].values())
finally:
 if stopped:run(s,'pm2 restart lhs-s1001 lhs-s1002',timeout=45)
 result['after']=pm2(s);save();s.close()
print(json.dumps({'committed':result['committed'],'backup':backup,'dbs':{db:{k:d[k]for k in['eligiblePlayers','activations','updated']}for db,d in result['repair']['dbs'].items()},'remainingEligible':{db:d['eligiblePlayers']for db,d in result['dryRun']['dbs'].items()}}))
