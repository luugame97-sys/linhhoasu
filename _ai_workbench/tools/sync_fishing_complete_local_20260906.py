"""Generate an apply_patch from guarded source baselines and preserve local backups."""
import difflib,hashlib,json,shutil,sys
from pathlib import Path
from release_fishing_complete_20260906 import WB,ROOT,FILES
sys.stdout.reconfigure(encoding='utf-8');baseline=WB/'temp/fishing_audit_20260905T234528Z';local=WB.parent/'linhhoasu/lhs/newServer';backup=WB/'backups/fishing_complete_local_20260906';patch=['*** Begin Patch'];result={}
for rel in FILES:
 target=local/rel;before=target.read_text(encoding='utf-8');expected=(baseline/'app'/rel).read_text(encoding='utf-8');after=(ROOT/'app'/rel).read_text(encoding='utf-8');assert before==expected,'LOCAL_DRIFT '+rel
 saved=backup/rel;saved.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(target,saved)
 patch.append('*** Update File: '+target.as_posix());lines=list(difflib.unified_diff(before.splitlines(),after.splitlines(),n=3,lineterm=''))[2:];patch.extend('@@' if l.startswith('@@')else l for l in lines)
 result[rel]={'before':hashlib.sha256(target.read_bytes()).hexdigest(),'after':hashlib.sha256((ROOT/'app'/rel).read_bytes()).hexdigest()}
patch.append('*** End Patch');(ROOT/'local-sync.json').write_text(json.dumps({'backup':str(backup),'files':result},indent=2)+'\n');print('\n'.join(patch))
