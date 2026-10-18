"""Patch the minified client for visual-only map-pet follow-up attacks.

This changes animation only. It does not alter damage, HP, reward, or the
2001 settlement contract. The patch is anchor-count protected and keeps a
local preimage backup under _ai_workbench/backups.
"""
from __future__ import annotations
import hashlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MAIN = ROOT / "linhhoasu" / "webgame" / "game" / "js" / "main.min_drop100.js"
BACKUP = ROOT / "_ai_workbench" / "backups" / "map_pet_visual_20260930" / "main.min_drop100.js.before"
MARKER = "lhs-map-pet-visual-v1"

HELPER_OLD = "C.beginAutoSellDropSession=function () {"
HELPER_NEW = """C.playMapPetVisual=function(t){var e=Y.RaidMgr.mMapRaid;if(!e||!t)return;var i=e.GetEntity(Y.ActorModel.actorID);if(!i||!i.GetInfo)return;var n=i.GetInfo().followPetHandle;if(!n)return;var a=e.GetEntity(n),s=e.GetEntity(String(t.index));if(!a||!s)return;var o=e.GetEnitytFSM(n),r=e.GetEnitytFSM(String(t.index)),l=dh.CreateRandActionData({idA:n,idB:String(t.index),atk:100,critRatio:30,count:1,lev:t.lv,randSeed:t.seed});l&&(o&&o.ChangeState(Mt.Battle),dh.PlayMoveToAttack(l,function(){o&&o.ChangeState(Mt.Idle),r&&r.ChangeState(Mt.Idle)}))},C.beginAutoSellDropSession=function () {"""

CALL_OLD = "a._openInfo=t,pNe.isOpen=!0,a.SetSelfOpenSpeedUp(n),a.changeState(5),a.boxInfo.summonCount"
CALL_NEW = "a._openInfo=t,pNe.isOpen=!0,a.SetSelfOpenSpeedUp(n),a.changeState(5),a.playMapPetVisual(t),a.boxInfo.summonCount"

def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def main() -> None:
    data = MAIN.read_bytes()
    if MARKER.encode() in data:
        raise SystemExit("ALREADY_PATCHED")
    if data.count(HELPER_OLD.encode()) != 1:
        raise SystemExit("HELPER_ANCHOR_COUNT")
    if data.count(CALL_OLD.encode()) != 1:
        raise SystemExit("CALL_ANCHOR_COUNT")
    BACKUP.parent.mkdir(parents=True, exist_ok=True)
    BACKUP.write_bytes(data)
    patched = data.replace(HELPER_OLD.encode(), HELPER_NEW.encode(), 1)
    patched = patched.replace(CALL_OLD.encode(), CALL_NEW.encode(), 1)
    MAIN.write_bytes(patched)
    print({"before": sha(data), "after": sha(patched), "bytesBefore": len(data), "bytesAfter": len(patched), "backup": str(BACKUP), "marker": MARKER})

if __name__ == "__main__":
    main()
