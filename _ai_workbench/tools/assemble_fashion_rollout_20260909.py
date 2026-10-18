"""Assemble a self-contained candidate tree; no production writes."""
import hashlib, json, shutil
from pathlib import Path
WB=Path(__file__).resolve().parents[1];OUT=WB/'temp/fashion_cn_recovery_20260909';CAND=OUT/'rollout-candidate';
def cp(src,rel):
 dest=CAND/rel;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(src,dest);return {'path':str(rel).replace('\\','/'),'bytes':dest.stat().st_size,'sha256':hashlib.sha256(dest.read_bytes()).hexdigest()}
def main():
 if CAND.exists():shutil.rmtree(CAND)
 files=[]
 # Backend source and scoped overlay/config.
 for rel in ['linhhoasu/lhs/newServer/src/services/ConfigService.js','linhhoasu/lhs/newServer/src/services/BattleService.js','linhhoasu/lhs/newServer/src/handlers/fashion.js','linhhoasu/lhs/newServer/src/handlers/official-compat.js','linhhoasu/lhs/newServer/src/services/FashionBoxService.js']:
  files.append(cp(WB.parent/rel,Path(rel)))
 files.append(cp(OUT/'fashion-overlay.json',Path('linhhoasu/lhs/update/resource/assets/fashion_overlay.json')))
 files.append(cp(OUT/'config_fashion_candidate.bin',Path('linhhoasu/lhs/update/resource/assets/excel/config_fashion_20260909.bin')))
 files.append(cp(OUT/'config_fashion_candidate.bin',Path('linhhoasu/webgame/game/update/resource/assets/excel/config_fashion_20260909.bin')))
 files.append(cp(WB.parent/'linhhoasu/lhs/configMap,json',Path('linhhoasu/lhs/configMap,json')))
 # Client entry, manifest and content overlay.
 for src,rel in [(WB.parent/'linhhoasu/webgame/game/index.html','linhhoasu/webgame/game/index.html'),(WB.parent/'linhhoasu/webgame/game/js/lhs-fashion-content-v1.js','linhhoasu/webgame/game/js/lhs-fashion-content-v1.js')]:files.append(cp(src,Path(rel)))
 for src,name in [(OUT/'default.res_main_c669f2c0_fashion_candidate.bin','default.res_main_c669f2c0_fashion_candidate.bin'),(OUT/'default.res_cn_main_f70d4753_fashion_candidate.bin','default.res_cn_main_f70d4753_fashion_candidate.bin')]:files.append(cp(src,Path('linhhoasu/webgame/game/update/resource')/name))
 assets=json.loads((OUT/'assets-download.json').read_text(encoding='utf-8'))
 for row in assets['files']:
  rel=Path('linhhoasu/webgame/game/update/resource')/Path(row['path']).relative_to('raw');files.append(cp(Path(row['storedAt']),rel))
 packs=json.loads((OUT/'packs-download.json').read_text(encoding='utf-8'))
 # Packs download includes the six CN pack files; copy all with their manifest paths.
 for row in packs['files']:
  rel=Path('linhhoasu/webgame/game/update/resource')/Path(row['path']).relative_to('raw');files.append(cp(OUT/row['path'],rel))
 manifest={'result':'ASSEMBLED','files':files,'fileCount':len(files),'candidate':str(CAND)}
 (OUT/'rollout-candidate.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 print(json.dumps({'result':'PASS','candidate':str(CAND),'fileCount':len(files),'bytes':sum(x['bytes'] for x in files)}))
if __name__=='__main__':main()
