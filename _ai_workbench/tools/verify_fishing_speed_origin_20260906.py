"""Prove native speed existed in delivered archive and saved CN reference; read-only."""
import hashlib,json,re,sys,zipfile
from pathlib import Path
WB=Path(__file__).resolve().parents[1];ROOT=WB/'temp/huyenvu_daily_fix_20260906'
sources=[]
with zipfile.ZipFile(WB.parent/'server.zip')as z:
 name='linhhoasu/webgame/game/js/main.min_a6195824.js';sources.append(('original-delivered-server.zip:'+name,z.read(name)))
cn=WB/'temp/cn_origin_70000001_20260831/js/main.min_97d2b812.js'
sources.append((str(cn),cn.read_bytes()))
sources.append(('current-production-snapshot',(ROOT/'main.js').read_bytes()))
proof=[]
for name,data in sources:
 text=data.decode('utf-8-sig')
 flag=re.search(r'[\w$]+\.isFishSpeedAdd=function\(\)\{return [\w$]+\.autoConfig\.fishing_isFastMode&&this\.isAutoFish\}',text)
 speed=re.search(r't\.isSpeed&&\(a/=1\.11\).{0,120}t\.isSpeed\?1\.11:1',text)
 assert flag and speed,name
 proof.append({'source':name,'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data),'flagOffset':flag.start(),'flag':flag.group(0),'speedOffset':speed.start(),'speed':speed.group(0)})
result={'nativeSpeedExists':True,'speedFactor':1.11,'inventedByThisFix':False,'proof':proof}
(ROOT/'speed-origin-proof.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'nativeSpeedExists':True,'factor':1.11,'verifiedSources':len(proof),'newSpeedLogic':False}))
