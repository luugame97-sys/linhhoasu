"""Generate guarded local followup patch, preserving v2 source and original payload."""
import difflib,hashlib,json,shutil,sys
from pathlib import Path
from release_fishing_complete_20260906 import WB,ROOT,FILES
sys.stdout.reconfigure(encoding='utf-8');prior=json.loads((ROOT/'deploy-v2.json').read_text())['expected'];baseline=json.loads((ROOT/'manifest.json').read_text())['files'];local=WB.parent/'linhhoasu/lhs/newServer';backup=WB/'backups/fishing_complete_followup_local_20260906';patch=['*** Begin Patch'];result={}
for rel in FILES:
 target=local/rel;before=target.read_text(encoding='utf-8');after=(ROOT/'app'/rel).read_text(encoding='utf-8')
 if before==after:continue
 remote='/linhhoasu/lhs/newServer/'+rel;wanted=prior.get(remote,baseline['app/'+rel]['sha256'])
 assert hashlib.sha256(target.read_bytes()).hexdigest()==wanted,'LOCAL_DRIFT '+rel
 saved=backup/rel;saved.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(target,saved)
 patch.append('*** Update File: '+target.as_posix());lines=list(difflib.unified_diff(before.splitlines(),after.splitlines(),n=3,lineterm=''))[2:];patch.extend('@@'if l.startswith('@@')else l for l in lines)
 result[rel]={'before':wanted,'after':hashlib.sha256((ROOT/'app'/rel).read_bytes()).hexdigest()}
patch.append('*** End Patch');(ROOT/'local-followup.json').write_text(json.dumps({'backup':str(backup),'files':result},indent=2)+'\n');print('\n'.join(patch))
