"""Scoped catalog clipboard followup and final read-only inventory/HTTP hashes."""
import json,hashlib,shlex,sys
from datetime import datetime,timezone
import paramiko
from stage_webshop_upgrade_20260906 import WB,ROOT,CAND,REMOTE,run
from stage_fashion_fix_20260905 import pm2
sys.stdout.reconfigure(encoding='utf-8');prior=json.loads((ROOT/'deploy_20260905_172151.json').read_text());c=(WB/'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines();s=paramiko.SSHClient();s.load_system_host_keys();s.set_missing_host_key_policy(paramiko.RejectPolicy());s.connect(c[0].strip(),username='root',password=c[2],look_for_keys=False,allow_agent=False,timeout=20)
out={'generatedAt':datetime.now(timezone.utc).isoformat()}
try:
 rel='admin/item_catalog.php';assert run(s,f'sha256sum {REMOTE}/{rel}').split()[0]==prior['hashes'][rel]
 backup=prior['backup'];run(s,f'cp -a {REMOTE}/{rel} {backup}/catalog.before-http-clipboard.php')
 f=s.open_sftp();f.put(str(CAND/rel),backup+'/catalog.http-clipboard.php');f.chmod(backup+'/catalog.http-clipboard.php',0o644);f.close();run(s,f'php -l {backup}/catalog.http-clipboard.php');run(s,f'cp -a {backup}/catalog.http-clipboard.php {REMOTE}/{rel}')
 out['hashes']={r:run(s,f'sha256sum {REMOTE}/{r}').split()[0]for r in prior['hashes']};assert all(out['hashes'][r]==hashlib.sha256((CAND/r).read_bytes()).hexdigest()for r in out['hashes'])
 out['pm2']=pm2(s);assert out['pm2']==prior['afterPm2'];out['ready']={p:run(s,f'curl -s --max-time 3 -o /dev/null -w "%{{http_code}}" http://127.0.0.1:{p}/ready')for p in[8080,8083]};assert all(v=='200'for v in out['ready'].values())
 out['http']={url:run(s,'curl -s --max-time 10 -o /dev/null -w "%{http_code}" '+shlex.quote(url))for url in ['http://127.0.0.1:88/admin/item_catalog.php','http://127.0.0.1:81/web-panel/api/item_icon.php?id=28043','http://127.0.0.1:88/api/item_icon.php?id=11','http://127.0.0.1:88/api/item_icon.php?id=..%2F..%2Fconfig.php']}
 # New catalog templates are not opened for sale automatically.
 bootstrap=(WB/'tools/webshop_schema_probe_20260906.php').read_text().split('$out=array(')[0]
 query="echo json_encode(array('productCount'=>$pdo->query('SELECT COUNT(*) FROM webshop_items')->fetchColumn(),'bundleCount'=>$pdo->query(\"SELECT COUNT(*) FROM webshop_items WHERE reward_items IS NOT NULL AND reward_items<>''\")->fetchColumn(),'pendingCount'=>$pdo->query(\"SELECT COUNT(*) FROM webshop_orders WHERE status='pending_delivery'\")->fetchColumn()));"
 out['sql']=json.loads(run(s,'php',bootstrap+query));out['passed']=True
finally:(ROOT/'final_verification.json').write_text(json.dumps(out,indent=2)+'\n');s.close()
print(json.dumps({'passed':True,'hashes':len(out['hashes']),'ready':out['ready'],'http':out['http'],'sql':out['sql'],'pm2Unchanged':True}))
