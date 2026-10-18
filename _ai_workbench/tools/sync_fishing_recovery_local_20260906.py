"""Guarded local sync; emit source hunks for apply_patch, preserve unrelated changes."""
import difflib,json,shutil,sys
from pathlib import Path
WB=Path(__file__).resolve().parents[1];ROOT=WB/'temp/fishing_recovery_20260906';LOCAL=WB.parent/'linhhoasu/lhs/newServer';BACKUP=WB/'backups/fishing_recovery_20260906/local'
sys.stdout.reconfigure(encoding='utf-8')
specs=[('src/net/HTTPServer.js',ROOT/'HTTPServer.before.js'),('src/handlers/account.js',ROOT/'account.before.js'),('src/config/fishingFreeRecovery20260906.json',None),('src/services/FishingFreeRecoveryService.js',None)]
patch=['*** Begin Patch']
for rel,baseline in specs:
 target=LOCAL/rel;new=(ROOT/'app'/rel).read_text(encoding='utf-8')
 if baseline:
  old=target.read_text(encoding='utf-8');assert old==baseline.read_text(encoding='utf-8'),'LOCAL_DRIFT_'+rel
  backup=BACKUP/rel;backup.parent.mkdir(parents=True,exist_ok=True);assert not backup.exists();shutil.copy2(target,backup)
  patch.append('*** Update File: '+target.as_posix());patch.extend('@@'if l.startswith('@@')else l for l in list(difflib.unified_diff(old.splitlines(),new.splitlines(),n=3,lineterm=''))[2:])
 else:
  assert not target.exists(),'LOCAL_NEW_CONFLICT_'+rel;patch.append('*** Add File: '+target.as_posix());patch.extend('+'+line for line in new.splitlines())
# Existing production dependency was absent from the old local source bundle.
dependency='src/services/AccountBanService.js'
if not (LOCAL/dependency).exists():
 patch.append('*** Add File: '+(LOCAL/dependency).as_posix());patch.extend('+'+line for line in (ROOT/'app'/dependency).read_text(encoding='utf-8').splitlines())
patch.append('*** End Patch');print('\n'.join(patch))
