"""Generate guarded local source hunks, preserving unrelated local changes."""
import json,sys,difflib,shutil
from pathlib import Path
WB=Path(__file__).resolve().parents[1];ROOT=WB/'temp/fishing_full_candidate_20260906';BASE=WB/'temp/fishing_events_audit_20260906T093353Z';LOCAL=WB.parent/'linhhoasu/lhs/newServer';BACKUP=WB/'backups/fishing_full_release_local_20260906'
sys.stdout.reconfigure(encoding='utf-8');files=json.loads((ROOT/'stage-full.json').read_text())['changedFiles'];patch=['*** Begin Patch']
for rel in files:
 target=LOCAL/rel;new=(ROOT/'app'/rel).read_text(encoding='utf-8');oldPath=BASE/'app'/rel
 if oldPath.exists():
  old=target.read_text(encoding='utf-8');assert old==oldPath.read_text(encoding='utf-8'),'LOCAL_DRIFT_'+rel
  backup=BACKUP/rel;backup.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(target,backup)
  patch.append('*** Update File: '+target.as_posix());patch.extend('@@'if l.startswith('@@')else l for l in list(difflib.unified_diff(old.splitlines(),new.splitlines(),n=3,lineterm=''))[2:])
 else:
  assert not target.exists(),'LOCAL_NEW_FILE_CONFLICT_'+rel;patch.append('*** Add File: '+target.as_posix());patch.extend('+'+l for l in new.splitlines())
patch.append('*** End Patch');print('\n'.join(patch))
