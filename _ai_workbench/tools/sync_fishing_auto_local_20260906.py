"""Generate guarded local apply_patch; retain backups and ignore unrelated files."""
import difflib,hashlib,json,shutil,sys
from pathlib import Path
from release_fishing_auto_20260906 import WB,ROOT,FILES
sys.stdout.reconfigure(encoding='utf-8');base=WB/'temp/fishing_audit_20260906T005207Z';local=WB.parent/'linhhoasu/lhs/newServer';backup=WB/'backups/fishing_auto_local_20260906';patch=['*** Begin Patch'];out={}
for rel in FILES:
 target=local/rel;next_file=ROOT/'app'/rel;after=next_file.read_text(encoding='utf-8');prior=base/'app'/rel
 if prior.exists():
  before=target.read_text(encoding='utf-8');assert before==prior.read_text(encoding='utf-8'),'LOCAL_DRIFT '+rel
  b=backup/rel;b.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(target,b)
  patch.append('*** Update File: '+target.as_posix());patch.extend('@@'if l.startswith('@@')else l for l in list(difflib.unified_diff(before.splitlines(),after.splitlines(),n=3,lineterm=''))[2:])
 else:
  assert not target.exists(),'LOCAL_NEW_FILE_EXISTS '+rel
  patch.append('*** Add File: '+target.as_posix());patch.extend('+'+l for l in after.splitlines())
 out[rel]=hashlib.sha256(next_file.read_bytes()).hexdigest()
patch.append('*** End Patch');(ROOT/'local-sync.json').write_text(json.dumps({'backup':str(backup),'hashes':out},indent=2)+'\n');print('\n'.join(patch))
