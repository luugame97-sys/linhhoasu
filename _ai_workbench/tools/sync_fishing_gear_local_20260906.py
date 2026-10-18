"""Guarded local source sync using apply_patch output, with file backups."""
import difflib,hashlib,json,shutil,sys
from pathlib import Path
from release_fishing_gear_20260906 import WB,ROOT,FILES
sys.stdout.reconfigure(encoding='utf-8');base=WB/'temp/fishing_audit_20260906T003428Z';local=WB.parent/'linhhoasu/lhs/newServer';backup=WB/'backups/fishing_gear_local_20260906';patch=['*** Begin Patch'];out={}
for rel in FILES:
 target=local/rel;newfile=ROOT/'app'/rel;after=newfile.read_text(encoding='utf-8');oldfile=base/'app'/rel
 if oldfile.exists():
  before=target.read_text(encoding='utf-8');assert before==oldfile.read_text(encoding='utf-8'),'LOCAL_DRIFT '+rel
  dest=backup/rel;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(target,dest)
  patch.append('*** Update File: '+target.as_posix());patch.extend('@@'if line.startswith('@@')else line for line in list(difflib.unified_diff(before.splitlines(),after.splitlines(),n=3,lineterm=''))[2:])
 else:
  assert not target.exists(),'NEW_LOCAL_FILE_EXISTS '+rel
  patch.append('*** Add File: '+target.as_posix());patch.extend('+'+line for line in after.splitlines())
 out[rel]=hashlib.sha256(newfile.read_bytes()).hexdigest()
patch.append('*** End Patch');(ROOT/'local-sync.json').write_text(json.dumps({'backup':str(backup),'hashes':out},indent=2)+'\n');print('\n'.join(patch))
