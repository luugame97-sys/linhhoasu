from pathlib import Path
import json, shutil, hashlib

ROOT = Path(__file__).resolve().parents[1]
WORKSPACE = ROOT.parent
SRC = ROOT / 'temp/drop46_release_20260914/linhhoasu/lhs/newServer'
OUT = ROOT / 'temp/drop46_release_20260914/candidate'
OUT.mkdir(parents=True, exist_ok=True)

def copy_patch(name, old, new):
    source = SRC / name
    text = source.read_bytes().decode('utf-8')
    if text.count(old) != 1:
        raise RuntimeError(f'{name}: marker count {text.count(old)}')
    target = OUT / name
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(text.replace(old, new).encode('utf-8'))

copy_patch('src/services/ConfigService.js',
           '  validateGameplayTables(tables);',
           "  // Scoped S1 pilot overlay; inert unless PM2 explicitly enables it.\n  require('../config/dropLevel46').apply(tables);\n  validateGameplayTables(tables);")
compat = (SRC/'src/handlers/compat.js').read_bytes().decode('utf-8')
for tag, name, param in [(2100,'handleBoxUpgrade2100','params'),(2101,'handleBoxUpgradeSkip2101','params'),(2102,'handleBoxUpgradeCheck2102','_params')]:
    old=f'async function {name}({param} = {{}}, session, msgUid) {{'
    assert compat.count(old)==1
    compat=compat.replace(old,old+f"\n  const pilot = require('../services/DropLevel46Service');\n  if (pilot.applies(session)) return pilot.handle({tag}, {param}, session, msgUid);")
(OUT/'src/handlers').mkdir(parents=True,exist_ok=True)
(OUT/'src/handlers/compat.js').write_bytes(compat.encode('utf-8'))
shutil.copy2(WORKSPACE/'linhhoasu/lhs/newServer/src/services/DropLevel46Service.js',OUT/'src/services/DropLevel46Service.js')

(OUT / 'src/config').mkdir(parents=True, exist_ok=True)
shutil.copy2(WORKSPACE / 'linhhoasu/lhs/newServer/src/config/dropLevel46.js', OUT / 'src/config/dropLevel46.js')
eco = (ROOT / 'temp/drop46_release_20260914/remote_ecosystem.config.js').read_text(encoding='utf-8')
old = '        SERVER_ID: 1001,'
if eco.count(old) != 1: raise RuntimeError('ecosystem marker')
eco = eco.replace(old, old + "\n        DROP_LEVEL_46_ENABLED: '1',")
(OUT / 'ecosystem.config.js').write_text(eco, encoding='utf-8')

files = []
for p in [OUT/'src/services/ConfigService.js', OUT/'src/services/DropLevel46Service.js', OUT/'src/handlers/compat.js', OUT/'src/config/dropLevel46.js', OUT/'ecosystem.config.js']:
    b=p.read_bytes(); files.append({'path': str(p.relative_to(OUT)), 'bytes':len(b), 'sha256':hashlib.sha256(b).hexdigest()})
(OUT/'server_candidate.json').write_text(json.dumps({'marker':'20260914_drop46_s1_v1','files':files},indent=2)+'\n',encoding='utf-8')
print(json.dumps({'result':'BUILT','files':files},indent=2))
