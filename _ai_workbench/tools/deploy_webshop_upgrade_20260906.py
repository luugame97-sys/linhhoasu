"""Deploy whitelist WebGM changes only; no game restarts or catalog sales edits."""
import json,hashlib,shlex,sys,stat
from datetime import datetime,timezone
import paramiko
from stage_webshop_upgrade_20260906 import WB,ROOT,CAND,REMOTE,run
from stage_fashion_fix_20260905 import pm2
FILES=['webshop_bundle.php','api/item_icon.php','assets/images/item-default.svg','assets/item/item_images.json','assets/item/item_icon_map.json','assets/item/hidden_fashion_sets.json','admin/item_catalog.php','assets/js/webshop-admin.js','assets/js/webshop-buyer.js','admin/admin_api.php','api/user_api.php','assets/js/admin.js','assets/js/index.js','admin/index.php','index.php']
def main():
 sys.stdout.reconfigure(encoding='utf-8');assert json.loads((ROOT/'bundle_tests.json').read_text())['result']=='PASS';assert json.loads((ROOT/'ui_contract.json').read_text())['result']=='PASS'
 baseline=json.loads((ROOT/'manifest.json').read_text())['files'];stamp=datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S');backup='/linhhoasu/_ai_workbench/backups/webshop_upgrade_'+stamp
 c=(WB/'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines();s=paramiko.SSHClient();s.load_system_host_keys();s.set_missing_host_key_policy(paramiko.RejectPolicy());s.connect(c[0].strip(),username='root',password=c[2],look_for_keys=False,allow_agent=False,timeout=20)
 result={'backup':backup,'installed':False,'changed':[],'configPatchOnly':True};installed=[]
 try:
  result['beforePm2']=pm2(s)
  for rel in FILES+['config.php']:
   remote=run(s,f'if test -f {REMOTE}/{rel}; then sha256sum {REMOTE}/{rel}; else echo MISSING; fi').split()[0]
   expected=baseline.get(rel,{}).get('sha256')
   if expected:assert remote==expected,'source drift '+rel
   elif remote!='MISSING':
    prior=json.loads((ROOT/'deploy_20260905_172026.json').read_text());assert prior.get('rolledBack')and rel in prior.get('hashes',{})and remote==prior['hashes'][rel],'unexpected support file '+rel
  run(s,f'install -d -m 700 {backup}/before {backup}/next')
  f=s.open_sftp()
  try:
   for rel in FILES+['config.php']:
    parent=rel.rsplit('/',1)[0]if'/'in rel else''
    if parent:run(s,f'install -d -m 700 {backup}/before/{parent} {backup}/next/{parent}')
    if rel in baseline:run(s,f'cp -a {REMOTE}/{rel} {backup}/before/{rel}')
    if rel=='config.php':
     content=f.file(REMOTE+'/config.php').read();needle=b'function webshop_int_value($value, $fallback = 0) {';assert content.count(needle)==1
     content=content.replace(needle,b"require_once __DIR__ . '/webshop_bundle.php';\n"+needle)
     with f.file(backup+'/next/config.php','wb')as target:target.write(content)
     attributes=f.stat(REMOTE+'/config.php');f.chmod(backup+'/next/config.php',stat.S_IMODE(attributes.st_mode));f.chown(backup+'/next/config.php',attributes.st_uid,attributes.st_gid);result['configHash']=hashlib.sha256(content).hexdigest()
    else:f.put(str(CAND/rel),backup+'/next/'+rel);f.chmod(backup+'/next/'+rel,0o644)
  finally:f.close()
  for rel in FILES+['config.php']:
   if rel.endswith('.php'):run(s,f'php -l {backup}/next/{rel}')
   if rel.endswith('.js'):run(s,f'node --check {backup}/next/{rel}')
  # Add helper before config include; include before handlers/pages using it.
  order=FILES[:9]+['config.php']+FILES[9:]
  for rel in order:
   run(s,f'cp -a {backup}/next/{rel} {REMOTE}/{rel}');installed.append(rel)
  result['changed']=installed;result['hashes']={rel:run(s,f'sha256sum {REMOTE}/{rel}').split()[0]for rel in FILES};assert all(result['hashes'][r]==hashlib.sha256((CAND/r).read_bytes()).hexdigest()for r in FILES)
  # Reload scripts through PHP cache automatically; PHP/JS files checked as served.
  result['http']={p:run(s,'curl -s --max-time 10 -o /dev/null -w "%{http_code}" '+shlex.quote('http://127.0.0.1:88/'+p))for p in['login.php','admin/index.php','api/item_icon.php?id=28043','api/item_icon.php?id=11','assets/item/hidden_fashion_sets.json']}
  assert result['http']['login.php']=='200'and result['http']['api/item_icon.php?id=28043']=='200'
  result['icon28043Hash']=run(s,"curl -fsS 'http://127.0.0.1:88/api/item_icon.php?id=28043' | sha256sum").split()[0]
  expected=hashlib.sha256((WB/'temp/component_client_fix_20260905/assets/icon_fashion_2804_d65f786a.png').read_bytes()).hexdigest();assert result['icon28043Hash']==expected,'FPM image mapping/basedir mismatch'
  result['fallbackHash']=run(s,"curl -fsS 'http://127.0.0.1:88/api/item_icon.php?id=11' | sha256sum").split()[0];assert result['fallbackHash']==hashlib.sha256((CAND/'assets/images/item-default.svg').read_bytes()).hexdigest()
  result['afterPm2']=pm2(s);assert result['afterPm2']==result['beforePm2'];result['installed']=True
 except Exception as error:
  result['error']=str(error)
  # Restore existing public files first. New support files can remain unused;
  # do not remove schema or orders, including any pending delivery records.
  for rel in reversed(installed):
   if rel in baseline:run(s,f'cp -a {backup}/before/{rel} {REMOTE}/{rel}')
  result['rolledBack']=bool(installed);raise
 finally:
  result['finishedAt']=datetime.now(timezone.utc).isoformat();(ROOT/('deploy_'+stamp+'.json')).write_text(json.dumps(result,indent=2)+'\n');s.close()
 print(json.dumps({'installed':True,'backup':backup,'files':len(FILES)+1,'http':result['http'],'pm2Unchanged':True,'iconVerified':True,'catalogItemsMutated':False}))
if __name__=='__main__':main()
