"""Emit guarded apply_patch hunks; no blanket overwrite of local source."""
import difflib
import json
import shutil
import sys
from pathlib import Path

WB=Path(__file__).resolve().parents[1]
ROOT=WB/'temp/fishing_contest_shop_20260906'
BASE=WB/'temp/fishing_full_candidate_20260906'
LOCAL=WB.parent/'linhhoasu/lhs/newServer'
BACKUP=WB/'backups/fishing_contest_shop_20260906/local'
sys.stdout.reconfigure(encoding='utf-8')
patch=['*** Begin Patch']
for rel in json.loads((ROOT/'stage.json').read_text())['files']:
    target=LOCAL/rel
    new=(ROOT/'app'/rel).read_text(encoding='utf-8')
    old_path=BASE/'app'/rel
    if old_path.exists():
        old=target.read_text(encoding='utf-8')
        assert old==old_path.read_text(encoding='utf-8'),'LOCAL_DRIFT_'+rel
        backup=BACKUP/rel;backup.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(target,backup)
        patch.append('*** Update File: '+target.as_posix())
        patch.extend('@@' if line.startswith('@@') else line for line in list(difflib.unified_diff(old.splitlines(),new.splitlines(),n=3,lineterm=''))[2:])
    else:
        assert not target.exists(),'LOCAL_NEW_FILE_CONFLICT_'+rel
        patch.append('*** Add File: '+target.as_posix());patch.extend('+'+line for line in new.splitlines())
patch.append('*** End Patch')
print('\n'.join(patch))
