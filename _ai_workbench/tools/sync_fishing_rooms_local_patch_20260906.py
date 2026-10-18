"""Emit an apply_patch for the exact local server hunks; guard all local preimages."""
import difflib,json,sys
from pathlib import Path
WB=Path(__file__).resolve().parents[1];ROOT=WB/'temp/fishing_rooms_release_20260906';LOCAL=WB.parent/'linhhoasu/lhs/newServer'
FILES=['src/services/FishingRoomService.js','src/handlers/fish.js','src/net/WSServer.js']
before=WB/'temp/fishing_room_audit_20260906T060009Z/app'
sys.stdout.reconfigure(encoding='utf-8');patch=['*** Begin Patch']
for rel in FILES:
 target=LOCAL/rel;new=(ROOT/'app'/rel).read_text(encoding='utf-8')
 if (before/rel).exists():
  old=target.read_text(encoding='utf-8');assert old==(before/rel).read_text(encoding='utf-8'),'LOCAL_DRIFT_'+rel
  patch.append('*** Update File: '+target.as_posix())
  patch.extend('@@'if line.startswith('@@')else line for line in list(difflib.unified_diff(old.splitlines(),new.splitlines(),n=3,lineterm=''))[2:])
 else:
  assert not target.exists();patch.append('*** Add File: '+target.as_posix());patch.extend('+'+line for line in new.splitlines())
patch.append('*** End Patch');print('\n'.join(patch))
