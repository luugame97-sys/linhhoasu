from pathlib import Path
import hashlib, json, shutil
ROOT=Path(__file__).resolve().parents[2]
path=ROOT/'linhhoasu/webgame/game/index.html'
old='js/main.min_drop200.js?v=20261008_oldtrek_popup_v1'
new='js/main.min_drop200.js?v=20261011_newyear_guard_v1'
data=path.read_bytes(); count=data.count(old.encode())
if count != 1: raise RuntimeError(f'EXPECTED_ONE_INDEX_MARKER:{count}')
backup=ROOT/'_ai_workbench/backups/newyear_index_pre_20261011'; backup.mkdir(parents=True,exist_ok=False); shutil.copy2(path,backup/'index.html')
out=data.replace(old.encode(),new.encode()); path.write_bytes(out)
report={'result':'PATCHED_LOCAL_CANDIDATE','path':str(path),'matches':count,'before':hashlib.sha256(data).hexdigest(),'after':hashlib.sha256(out).hexdigest(),'bytes':len(out)}
dest=ROOT/'_ai_workbench/temp/newyear_client_guard_20261011'; dest.mkdir(parents=True,exist_ok=True); (dest/'index_patch.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8'); print(json.dumps(report,ensure_ascii=False,indent=2))
