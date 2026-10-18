"""Mechanical sync of compiled client artifacts; guard exact local baseline."""
import json,hashlib,shutil,sys
from pathlib import Path
WB=Path(__file__).resolve().parents[1];OUT=WB/'temp/component_client_fix_20260905';BASE=WB.parent/'linhhoasu/webgame/game';BACK=WB/'backups/component_client_local_20260905'
m=json.loads((OUT/'manifest.json').read_text());tests=json.loads((OUT/'test_results.json').read_text());files={'main.js':BASE/'js/main.min_a6195824.js','index.html':BASE/'index.html'}
if '--layout-followup' in sys.argv:
 previous=json.loads((OUT/'deploy_20260905_163554.json').read_text());assert previous['installed']
 for key in files:m[key]['sha256']=previous['hashes'][key]
 BACK=WB/'backups/component_client_local_layout_20260905'
BACK.mkdir(exist_ok=True)
for key,target in files.items():
 assert hashlib.sha256(target.read_bytes()).hexdigest()==m[key]['sha256'],'local drift '+key
 assert hashlib.sha256((OUT/key).read_bytes()).hexdigest()==tests['hashes'][key]
 assert not (BACK/key).exists(),'preserve backup'
 shutil.copy2(target,BACK/key)
for key,target in files.items():shutil.copyfile(OUT/key,target)
print(json.dumps({'mechanicalSync':True,'files':list(files),'referenceLhsClientUntouched':True}))
