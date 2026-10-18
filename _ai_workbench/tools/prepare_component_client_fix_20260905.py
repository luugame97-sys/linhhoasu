"""Read-only production baseline for native component visibility/icon fix."""
import hashlib,json,sys
from pathlib import Path
import paramiko
from parse_resource_config import parse
WB=Path(__file__).resolve().parents[1];OUT=WB/'temp/component_client_fix_20260905';OUT.mkdir(exist_ok=False)
paths={'main.js':'/linhhoasu/webgame/game/js/main.min_a6195824.js','index.html':'/linhhoasu/webgame/game/index.html','client.bin':'/linhhoasu/webgame/game/update/resource/assets/excel/config_e5ac72c2.bin','gameEui.bin':'/linhhoasu/webgame/game/update/resource/assets/cfg/gameEui_18e11b8e.bin'}
for name in ['default.res_main_c669f2c0.bin','default.res_cn_main_f70d4753.bin','default.res_tw_main_2ff8859f.bin']:paths[name]='/linhhoasu/webgame/game/update/resource/'+name
sys.stdout.reconfigure(encoding='utf-8');c=(WB/'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines();s=paramiko.SSHClient();s.load_system_host_keys();s.set_missing_host_key_policy(paramiko.RejectPolicy());s.connect(c[0].strip(),username='root',password=c[2],look_for_keys=False,allow_agent=False,timeout=20)
try:
 f=s.open_sftp();manifest={}
 for name,remote in paths.items():
  b=f.file(remote).read();(OUT/(name+'.before')).write_bytes(b);manifest[name]={'remote':remote,'sha256':hashlib.sha256(b).hexdigest(),'bytes':len(b)}
 resources=[]
 for name in paths:
  if name.startswith('default.res'):resources.extend(parse(OUT/(name+'.before'))['resources'])
 names={r['name'] for r in resources};names.update(k for r in resources for k in r.get('subkeys',[]))
 relevant=[r for r in resources if r['name'].startswith(('sp_equip_2804','icon_2804','icon_fashion_2804','head_rs_2804'))]
 for r in relevant:
  if r['type']=='image':
   b=f.file('/linhhoasu/webgame/game/update/resource/'+r['url']).read();dest=OUT/'assets'/Path(r['url']).name;dest.parent.mkdir(exist_ok=True);dest.write_bytes(b);r['verifiedBytes']=len(b);r['sha256']=hashlib.sha256(b).hexdigest()
 f.close();(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n');(OUT/'resource_names.json').write_text(json.dumps(sorted(names))+'\n');(OUT/'resources_relevant.json').write_text(json.dumps(relevant,indent=2)+'\n')
 print(json.dumps({'out':str(OUT),'sourceHashes':{n:v['sha256'] for n,v in manifest.items()},'icon28043Exists':'icon_28043'in names,'spine28043Exists':'sp_equip_28043_skel'in names,'parentIconExists':'icon_fashion_2804'in names,'fullSuitModelExists':'sp_equip_28049_skel'in names}))
finally:s.close()
