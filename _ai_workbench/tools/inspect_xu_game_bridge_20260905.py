"""Read-only source inventory for Xu Web -> in-game package purchases."""
import hashlib,json,re,sys
from pathlib import Path
import paramiko
WB=Path(__file__).resolve().parents[1];OUT=WB/'temp/xu_game_bridge_20260905';OUT.mkdir(exist_ok=True)
creds=(WB/'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines()
s=paramiko.SSHClient();s.load_system_host_keys();s.set_missing_host_key_policy(paramiko.RejectPolicy());s.connect(creds[0].strip(),username='root',password=creds[2],look_for_keys=False,allow_agent=False,timeout=20)
sys.stdout.reconfigure(encoding='utf-8')
files={'user_api.php':'/linhhoasu/webgame/gm/api/user_api.php','user.js':'/linhhoasu/webgame/gm/assets/js/user.js','compat.js':'/linhhoasu/lhs/newServer/src/handlers/compat.js'}
try:
 f=s.open_sftp();output=[]
 for name,remote in files.items():
  try:data=f.file(remote).read()
  except OSError:output.append({'file':name,'exists':False});continue
  (OUT/name).write_bytes(data)
  matches=[]
  for number,line in enumerate(data.decode('utf-8','replace').splitlines(),1):
   if re.search(r'1000|1001|recharge|exchange|convert|wallet|xu\b|cash|payId|priceR',line,re.I):
    if re.search(r'password|secret|api_key|\btoken\s*[:=]',line,re.I):continue
    matches.append({'line':number,'text':line[:230]})
  output.append({'file':name,'exists':True,'sha256':hashlib.sha256(data).hexdigest(),'matches':matches[:140]})
 f.close();(OUT/'source_inventory.json').write_text(json.dumps(output,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(output,ensure_ascii=False))
finally:s.close()
