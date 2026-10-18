"""Build release files from exact live preimages, preserving unrelated changes."""
import hashlib,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'_ai_workbench/temp/pet_grid48_20261005'
BASE=OUT/'baseline'
TARGET=OUT/'candidate'

def main():
    files={}
    for rel in ['lhs/newServer/src/handlers/pet.js','lhs/newServer/src/config/petGrid48.js','webgame/game/js/lhs-pet-grid48-v1.js']:
        files[rel]=(ROOT/'linhhoasu'/rel).read_bytes()
    cfg=(BASE/'lhs/newServer/src/services/ConfigService.js').read_text(encoding='utf-8')
    anchor="  require('../config/gemLevel10Choice').apply(tables);\n"
    assert cfg.count(anchor)==1,'LIVE_CONFIG_ANCHOR'
    cfg=cfg.replace(anchor,anchor+"  require('../config/petGrid48').apply(tables);\n")
    files['lhs/newServer/src/services/ConfigService.js']=cfg.encode('utf-8')
    raw=(BASE/'webgame/game/index.html').read_bytes()
    anchor=b'\t\t"js/lhs-petsoul-fix-v1.js?v=20261002_petsoul_box_star_v2",'
    assert raw.count(anchor)==1,'LIVE_INDEX_ANCHOR'
    raw=raw.replace(anchor,anchor+b'\n\t\t"js/lhs-pet-grid48-v1.js?v=20261005_pet_grid48_v1",')
    files['webgame/game/index.html']=raw
    manifest={}
    for rel,data in files.items():
        p=TARGET/rel;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(data)
        b=BASE/rel
        manifest[rel]={'before':hashlib.sha256(b.read_bytes()).hexdigest() if b.exists() else None,
          'after':hashlib.sha256(data).hexdigest(),'bytes':len(data)}
    (OUT/'candidate_files.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(manifest,indent=2))
if __name__=='__main__':main()
