from __future__ import annotations
import hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
MAIN=ROOT/'linhhoasu/webgame/game/js/main.min_drop100.js'
BACKUP=ROOT/'_ai_workbench/backups/map_pet_visual_20260930/main.min_drop100.js.v1.before'
OLD="C.playMapPetVisual=function(t){var e=Y.RaidMgr.mMapRaid;if(!e||!t)return;var i=e.GetEntity(Y.ActorModel.actorID);if(!i||!i.GetInfo)return;var n=i.GetInfo().followPetHandle;if(!n)return;var a=e.GetEntity(n),s=e.GetEntity(String(t.index));if(!a||!s)return;var o=e.GetEnitytFSM(n),r=e.GetEnitytFSM(String(t.index)),l=dh.CreateRandActionData({idA:n,idB:String(t.index),atk:100,critRatio:30,count:1,lev:t.lv,randSeed:t.seed});l&&(o&&o.ChangeState(Mt.Battle),dh.PlayMoveToAttack(l,function(){o&&o.ChangeState(Mt.Idle),r&&r.ChangeState(Mt.Idle)}))}"
NEW="C.playMapPetVisual=function(t){var e=Y.RaidMgr.mMapRaid;if(!e||!t)return;var i=e.GetEntity(Y.ActorModel.actorID);if(!i||!i.GetInfo)return;var n=i.GetInfo().followPetHandle,a=n&&e.GetEntity(n),s=e.GetEntity(String(t.index));if(!a||!s)return;var o=a.m_Model&&a.m_Model.UpdateActionName;if(o){try{o.call(a.m_Model,0,!1,function(){try{o.call(a.m_Model,1,!0)}catch(_){}})}catch(_){try{o.call(a.m_Model,1,!0)}catch(__){}}return}var r=e.GetEnitytFSM(n),l=e.GetEnitytFSM(String(t.index)),h;try{h=dh.CreateRandActionData({idA:n,idB:String(t.index),atk:100,critRatio:30,count:1,lev:t.lv,randSeed:t.seed})}catch(_){h=null}h&&(r&&r.ChangeState(Mt.Battle),dh.PlayMoveToAttack(h,function(){r&&r.ChangeState(Mt.Idle),l&&l.ChangeState(Mt.Idle)}))}"
data=MAIN.read_text(encoding='utf-8')
if data.count(OLD)!=1: raise SystemExit('V1_HELPER_ANCHOR_COUNT')
BACKUP.parent.mkdir(parents=True,exist_ok=True)
BACKUP.write_text(data,encoding='utf-8')
out=data.replace(OLD,NEW,1)
MAIN.write_text(out,encoding='utf-8')
print({'before':hashlib.sha256(data.encode()).hexdigest(),'after':hashlib.sha256(out.encode()).hexdigest(),'backup':str(BACKUP)})
