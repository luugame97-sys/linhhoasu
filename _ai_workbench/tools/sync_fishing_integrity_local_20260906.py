"""Emit apply_patch for inspected source deltas; backup all local targets first."""
import difflib,hashlib,json,shutil,sys
from pathlib import Path
from release_fishing_integrity_20260906 import WB,ROOT,FILES
sys.stdout.reconfigure(encoding='utf-8')
BASE=WB/'temp/fishing_audit_20260905T232035Z';LOCAL=WB.parent/'linhhoasu/lhs/newServer';backup=WB/'backups/fishing_integrity_local_20260906'
def norm(s):return s.replace('\r\n','\n')
patch=['*** Begin Patch'];manifest={}
for rel in FILES:
 target=LOCAL/rel;next_file=ROOT/'app'/rel;old=norm(target.read_text(encoding='utf-8'))if target.exists()else None
 new=norm(next_file.read_text(encoding='utf-8'))
 if old==new:continue
 if old is not None:
  expected=norm((BASE/'app'/rel).read_text(encoding='utf-8'))
  if rel=='src/handlers/fish.js':expected=expected.replace('await playerService.savePlayer(session.userId, player, { returnSaved: false });\n\n  const response', 'await playerService.savePlayer(session.userId, player, { returnSaved: false });\n  const response')
  if rel=='src/handlers/fish-soul.js':expected=expected.replace('await playerService.savePlayer(session.userId, session.player, { returnSaved: false });','await playerService.savePlayer(session.userId, session.player);')
  assert old==expected,'LOCAL_SOURCE_DRIFT '+rel
  b=backup/rel;b.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(target,b)
  lines=list(difflib.unified_diff(old.splitlines(),new.splitlines(),n=3,lineterm=''))[2:]
  patch.append('*** Update File: '+target.as_posix())
  patch.extend('@@'if line.startswith('@@')else line for line in lines)
 else:
  assert not (BASE/'app'/rel).exists(),'MISSING_LOCAL_SOURCE '+rel
  patch.append('*** Add File: '+target.as_posix());patch.extend('+'+line for line in new.splitlines())
 manifest[rel]={'old':hashlib.sha256(old.encode()).hexdigest()if old is not None else None,'new':hashlib.sha256(new.encode()).hexdigest()}
patch.append('*** End Patch')
backup.mkdir(parents=True,exist_ok=True)
(ROOT/'local-sync.json').write_text(json.dumps({'backup':str(backup),'files':manifest},indent=2)+'\n')
print('\n'.join(patch))
