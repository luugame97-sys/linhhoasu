from __future__ import annotations
import hashlib
from pathlib import Path
from urllib.request import urlopen
ROOT=Path(__file__).resolve().parents[2]
MAIN=ROOT/'linhhoasu/webgame/game/js/main.min_drop100.js'
BACKUP=ROOT/'_ai_workbench/backups/map_pet_visual_20260930/main.min_drop100.js.v1.before'
URL='http://103.116.105.154:81/js/main.min_drop100.js?verify=map_pet_visual_v2_source'
OLD_SHA='041c5f30d3ddfd53ab83ea0e20c386b8db698b45ec7b690193b9cf457131cd59'
OLD=b"C.playMapPetVisual=function(t){var e=Y.RaidMgr.mMapRaid;if(!e||!t)return;var i=e.GetEntity(Y.ActorModel.actorID);if(!i||!i.GetInfo)return;var n=i.GetInfo().followPetHandle;if(!n)return;var a=e.GetEntity(n),s=e.GetEntity(String(t.index));if(!a||!s)return;var o=e.GetEnitytFSM(n),r=e.GetEnitytFSM(String(t.index)),l=dh.CreateRandActionData({idA:n,idB:String(t.index),atk:100,critRatio:30,count:1,lev:t.lv,randSeed:t.seed});l&&(o&&o.ChangeState(Mt.Battle),dh.PlayMoveToAttack(l,function(){o&&o.ChangeState(Mt.Idle),r&&r.ChangeState(Mt.Idle)}))}"
NEW=b"C.playMapPetVisual=function(t){var e=Y.RaidMgr.mMapRaid;if(!e||!t)return;var i=e.GetEntity(Y.ActorModel.actorID);if(!i||!i.GetInfo)return;var n=i.GetInfo().followPetHandle,a=n&&e.GetEntity(n),s=e.GetEntity(String(t.index));if(!a||!s)return;var o=a.m_Model&&a.m_Model.UpdateActionName;if(o){try{o.call(a.m_Model,0,!1,function(){try{o.call(a.m_Model,1,!0)}catch(_){}})}catch(_){try{o.call(a.m_Model,1,!0)}catch(__){}}return}var r=e.GetEnitytFSM(n),l=e.GetEnitytFSM(String(t.index)),h;try{h=dh.CreateRandActionData({idA:n,idB:String(t.index),atk:100,critRatio:30,count:1,lev:t.lv,randSeed:t.seed})}catch(_){h=null}h&&(r&&r.ChangeState(Mt.Battle),dh.PlayMoveToAttack(h,function(){r&&r.ChangeState(Mt.Idle),l&&l.ChangeState(Mt.Idle)}))}"
data=urlopen(URL,timeout=30).read()
if hashlib.sha256(data).hexdigest()!=OLD_SHA: raise SystemExit('PUBLIC_SOURCE_HASH_MISMATCH')
if data.count(OLD)!=1: raise SystemExit('V1_ANCHOR_COUNT')
BACKUP.parent.mkdir(parents=True,exist_ok=True); BACKUP.write_bytes(data)
out=data.replace(OLD,NEW,1); MAIN.write_bytes(out)
print({'before':hashlib.sha256(data).hexdigest(),'after':hashlib.sha256(out).hexdigest(),'bytes':len(out)})
