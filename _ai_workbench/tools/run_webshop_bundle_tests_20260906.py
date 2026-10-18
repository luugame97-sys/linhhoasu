import json,sys
from pathlib import Path
import paramiko
from stage_webshop_upgrade_20260906 import WB,ROOT,CAND,run
sys.stdout.reconfigure(encoding='utf-8');stage=json.loads((ROOT/'stage.json').read_text())['stage'];c=(WB/'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines();s=paramiko.SSHClient();s.load_system_host_keys();s.set_missing_host_key_policy(paramiko.RejectPolicy());s.connect(c[0].strip(),username='root',password=c[2],look_for_keys=False,allow_agent=False,timeout=20)
try:
 f=s.open_sftp()
 for rel in['webshop_bundle.php','assets/js/admin.js','assets/js/webshop-admin.js']:f.put(str(CAND/rel),stage+'/gm/'+rel)
 f.put(str(WB/'tools/test_webshop_bundle_20260906.php'),stage+'/tools/test_webshop_bundle.php');f.close()
 bootstrap=(WB/'tools/webshop_schema_probe_20260906.php').read_text(encoding='utf-8').split('$out=array(')[0]
 script=bootstrap+"\n$argv=array('', "+repr(stage+'/gm')+");require "+repr(stage+'/tools/test_webshop_bundle.php')+";"
 data=json.loads(run(s,'php',script));(ROOT/'bundle_tests.json').write_text(json.dumps(data,indent=2)+'\n');print(json.dumps(data))
finally:s.close()
