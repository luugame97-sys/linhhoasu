import difflib,json,sys,shutil,hashlib
from pathlib import Path
WB=Path(__file__).resolve().parents[1];BASE=WB/'temp/fashion_channels_20260905T140803Z/app';REL=WB/'temp/fashion_fix_20260905/app';LOCAL=WB.parent/'linhhoasu/lhs/newServer';BACK=WB/'backups/fashion_fix_local_20260905';BACK.mkdir(exist_ok=True)
files=json.loads((REL.parent/'stage.json').read_text())['files'];lines=['*** Begin Patch']
for relative in files:
 target=LOCAL/relative;candidate=(REL/relative).read_text(encoding='utf-8');before=BASE/relative
 if before.exists():
  assert target.read_bytes()==before.read_bytes(),'local changed '+relative
  backup=BACK/relative;backup.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(target,backup)
  delta=list(difflib.unified_diff(before.read_text(encoding='utf-8').splitlines(),candidate.splitlines(),n=3))
  lines.append('*** Update File: '+target.as_posix());lines.extend('@@'if line.startswith('@@')else line for line in delta[2:])
 else:
  assert not target.exists();lines.append('*** Add File: '+target.as_posix());lines.extend('+'+line for line in candidate.splitlines())
lines.append('*** End Patch');sys.stdout.reconfigure(encoding='utf-8');print('\n'.join(lines))
