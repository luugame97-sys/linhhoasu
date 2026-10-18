"""Apply only daily-claim changes locally; preserve the unrelated legacy save helper."""
import difflib,hashlib,json,shutil,sys
from pathlib import Path
from release_huyenvu_daily_20260906 import WB,ROOT
sys.stdout.reconfigure(encoding='utf-8')
target=WB.parent/'linhhoasu/lhs/newServer/src/handlers/commerce-compat.js'
before=target.read_text(encoding='utf-8');expected='7859f9464e1f3fe5d2a8ed0cf27e3051671854c080a715ec102bd791481dcf5c'
assert hashlib.sha256(target.read_bytes()).hexdigest()==expected,'LOCAL_DRIFT'
after=(ROOT/'app/src/handlers/commerce-compat.js').read_text(encoding='utf-8')
# persistPlayer is used by ads/chain packages, not the new claim transaction.
oldline='const saved = await playerService.savePlayer(session.userId, player);'
prodline='const saved = await playerService.savePlayer(session.userId, player, { returnSaved: false });'
assert before.count(oldline)==1 and after.count(prodline)==1
after=after.replace(prodline,oldline)
backup=WB/'backups/huyenvu_daily_local_20260906';backup.mkdir(parents=True,exist_ok=True);shutil.copy2(target,backup/'commerce-compat.js.before')
patch=['*** Begin Patch','*** Update File: '+target.as_posix()]
patch.extend('@@'if line.startswith('@@')else line for line in list(difflib.unified_diff(before.splitlines(),after.splitlines(),n=3,lineterm=''))[2:])
patch.append('*** End Patch')
(ROOT/'local-sync.json').write_text(json.dumps({'backup':str(backup),'expectedNormalized':hashlib.sha256(after.encode()).hexdigest(),'preservedLocalPersistHelper':True},indent=2)+'\n')
print('\n'.join(patch))
