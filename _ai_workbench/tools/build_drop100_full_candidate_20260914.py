from pathlib import Path
import hashlib,json,re,shutil
ROOT=Path(__file__).resolve().parents[1]
WORK=ROOT.parent/'linhhoasu/lhs/newServer'
BASE=ROOT/'temp/drop100_release_20260914'
OUT=BASE/'candidate'
SNAP=BASE/'linhhoasu/lhs/newServer'
OUT.mkdir(parents=True,exist_ok=True)
paths=['src/config/dropLevel100.js','src/config/dropLevel46.js','src/services/DropLevel46Service.js']
# These edited modules have been compared against their fresh live snapshots.
for name in paths:
 p=OUT/name;p.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(WORK/name,p)
localBox=(WORK/'src/handlers/box.js').read_bytes().decode('utf8')
start=localBox.index("  const generated = configService.get('DropEquipTemplateConfig')")
end=localBox.index('  const directId =',start)
box=(SNAP/'src/handlers/box.js').read_bytes().decode('utf8')
key='  const directId = 30000 + q * 1000 + 100 + st;'
assert box.count(key)==1
p=OUT/'src/handlers/box.js';p.parent.mkdir(parents=True,exist_ok=True)
p.write_bytes(box.replace(key,localBox[start:end]+key).encode('utf8'));paths.append('src/handlers/box.js')
config=(SNAP/'src/services/ConfigService.js').read_bytes().decode('utf8')
key="  require('../config/dropLevel46').apply(tables);"
assert config.count(key)==1
p=OUT/'src/services/ConfigService.js';p.write_bytes(config.replace(key,"  require('../config/dropLevel100').apply(tables);\n"+key).encode('utf8'))
paths.append('src/services/ConfigService.js')
eco=(BASE/'remote_ecosystem.config.js').read_bytes().decode('utf8')
for sid in [1001,1002,1003]:
 pattern=re.compile(r'(?m)^([ \t]*)SERVER_ID: '+str(sid)+',')
 assert len(pattern.findall(eco))==1
 eco=pattern.sub(lambda m:m.group(0)+'\n'+m.group(1)+"DROP_LEVEL_100_ENABLED: '1',",eco,count=1)
(OUT/'ecosystem.config.js').write_bytes(eco.encode('utf8'));paths.append('ecosystem.config.js')
files=[{'path':name,'sha256':hashlib.sha256((OUT/name).read_bytes()).hexdigest()} for name in paths]
(OUT/'candidate.json').write_text(json.dumps({'version':'drop100_v1','files':files},indent=2),encoding='utf8')
print(json.dumps({'result':'BUILT','count':len(files)}))
