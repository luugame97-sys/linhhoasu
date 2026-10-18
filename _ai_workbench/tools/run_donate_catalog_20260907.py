"""Bounded owner-approved config change with backup + SQL transaction and receipt."""
import json,sys,shlex
from datetime import datetime,timezone
from snapshot_web_multiserver_20260906 import WB,connect,run
from snapshot_donate_revision_20260907 import ROOT
sys.stdout.reconfigure(encoding='utf-8');mode=sys.argv[1];statefile=ROOT/'catalog-state.json'
state=json.loads(statefile.read_text())if statefile.exists()else{'backup':'/linhhoasu/_ai_workbench/backups/donate_revision_20260907_'+datetime.now(timezone.utc).strftime('%H%M%S')}
ssh=connect()
try:
 backup=state['backup'];run(ssh,'install -d -m 700 '+shlex.quote(backup))
 with ssh.open_sftp()as f:f.put(str(WB/'tools/apply_donate_catalog_20260907.php'),backup+'/catalog.php')
 bootstrap=(WB/'tools/webshop_schema_probe_20260906.php').read_text(encoding='utf-8').split('$out=array(')[0]
 code=bootstrap+'\ndate_default_timezone_set("Asia/Ho_Chi_Minh");$pdo->exec("SET time_zone=\'+07:00\'");$argv=array("",'+json.dumps(mode)+','+json.dumps(backup)+');require '+json.dumps(backup+'/catalog.php')+';'
 result=json.loads(run(ssh,'php',code));(ROOT/('catalog-'+mode+'.json')).write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 state['lastMode']=mode;state['at']=datetime.now(timezone.utc).isoformat();statefile.write_text(json.dumps(state,indent=2)+'\n')
 print(json.dumps({k:v for k,v in result.items()if k!='changes'},ensure_ascii=False))
finally:ssh.close()
