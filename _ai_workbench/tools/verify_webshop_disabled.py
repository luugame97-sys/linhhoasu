import getpass
import json
import paramiko

HOST='103.116.105.154'; ROOT='/linhhoasu/webgame/gm'
s=paramiko.SSHClient();s.set_missing_host_key_policy(paramiko.AutoAddPolicy());s.connect(HOST,username='root',password=getpass.getpass('VPS password (not logged): '),look_for_keys=False,allow_agent=False,timeout=15)
def run(c,check=True):
 _,o,e=s.exec_command(c);t=o.read().decode('utf8','replace');code=o.channel.recv_exit_status()
 if check and code: raise RuntimeError(e.read().decode('utf8','replace')[-3000:])
 return t
try:
 code = r'''
require "config.php";
$doc=json_decode(file_get_contents("assets/item/webshop_catalog.json"),true);
$map=array(); foreach($doc["items"] as $row){$map[(int)$row["item_id"]]=(string)$row["category"];}
$rows=$conn_web->query("SELECT id,item_id,is_active FROM webshop_items ORDER BY id")->fetchAll(PDO::FETCH_ASSOC);
$counts=array("gem_active"=>0,"rare_active"=>0,"other_active"=>0,"gem_total"=>0,"rare_total"=>0);
foreach($rows as $row){$cat=isset($map[(int)$row["item_id"]])?$map[(int)$row["item_id"]]:"other";if($cat==="gem"){$counts["gem_total"]++;if((int)$row["is_active"]===1)$counts["gem_active"]++;}elseif($cat==="rare"){$counts["rare_total"]++;if((int)$row["is_active"]===1)$counts["rare_active"]++;}elseif((int)$row["is_active"]===1)$counts["other_active"]++;}
$counts["policy"]=array("gem"=>webshop_item_sale_enabled(25011),"rare"=>webshop_item_sale_enabled(90014),"normal"=>webshop_item_sale_enabled(2));
echo json_encode($counts);
'''
 out=run(f"cd {ROOT} && php -r '{code}'")
 data=json.loads(out[out.find('{'):]);print(json.dumps(data,ensure_ascii=False,indent=2))
 if data['gem_active'] or data['rare_active'] or data['gem_total']!=20 or data['rare_total']!=12 or data['policy']!={'gem':False,'rare':False,'normal':True}: raise RuntimeError('readback failed')
 print('PHP_LINT')
 for f in ('config.php','api/user_api.php','admin/admin_api.php','_ai_workbench/tools/sync_webshop_catalog.php'):
  print(run(f'php -l {ROOT}/{f}').strip())
 print('HTTP',run("for u in http://127.0.0.1:88/ http://127.0.0.1:81/web-panel/; do curl -sS -o /dev/null -w '%{http_code} %{url_effective}\n' $u; done",False).strip())
finally:s.close()
