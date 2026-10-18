"""Generate minimal local source deltas while preserving unrelated edits."""
import difflib,shutil,json
from stage_fishing_economy_20260907 import ROOT,BASE,APP,FILES
from snapshot_web_multiserver_20260906 import WB
local=WB.parent/'linhhoasu/lhs/newServer';backup=WB/'backups/fishing_economy_local_20260907';patch=['*** Begin Patch']
for rel in FILES:
 target=local/rel;new=(ROOT/'app'/rel).read_text(encoding='utf-8');b=BASE/'app'/rel
 if b.exists():
  before=target.read_text(encoding='utf-8');baseline=b.read_text(encoding='utf-8')
  oldlines=baseline.splitlines();newlines=new.splitlines();differ=list(difflib.unified_diff(oldlines,newlines,n=3,lineterm=''))[2:]
  # apply_patch anchors only changed regions; backup preserves unrelated local work.
  dest=backup/rel;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(target,dest)
  patch.append('*** Update File: '+target.as_posix());patch.extend('@@'if line.startswith('@@')else line for line in differ)
 else:
  assert not target.exists(),'NEW_FILE_CONFLICT '+rel;patch.append('*** Add File: '+target.as_posix());patch.extend('+'+l for l in new.splitlines())
patch.append('*** End Patch');print('\n'.join(patch))
