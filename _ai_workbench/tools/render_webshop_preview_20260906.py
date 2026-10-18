import json,sys
import paramiko
from stage_webshop_upgrade_20260906 import WB,ROOT,CAND,run
c=(WB/'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines();s=paramiko.SSHClient();s.load_system_host_keys();s.set_missing_host_key_policy(paramiko.RejectPolicy());s.connect(c[0].strip(),username='root',password=c[2],look_for_keys=False,allow_agent=False,timeout=20)
try:
 stage=json.loads((ROOT/'stage.json').read_text())['stage'];f=s.open_sftp();f.put(str(CAND/'admin/index.php'),stage+'/gm/admin/index.php');f.put(str(WB/'tools/render_webshop_admin_qa_20260906.php'),stage+'/tools/render_admin.php');f.close();html=run(s,'php '+stage+'/tools/render_admin.php '+stage+'/gm');assert '<!DOCTYPE html>'in html or '<!doctype html>'in html
 (CAND/'admin/preview.html').write_text(html,encoding='utf-8');print('Rendered actual admin page with QA dependencies, no DB')
finally:s.close()
