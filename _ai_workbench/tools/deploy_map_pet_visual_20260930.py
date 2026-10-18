"""Deploy visual-only map pet animation patch; no gameplay/economy mutation."""
from __future__ import annotations
import hashlib, json, shlex, sys
from datetime import datetime, timezone
from pathlib import Path
sys.dont_write_bytecode = True
WB = Path(__file__).resolve().parents[1]
ROOT = WB.parent
sys.path.insert(0, str(WB / "tools"))
from snapshot_web_multiserver_20260906 import connect, run  # noqa: E402

MAIN = "/linhhoasu/webgame/game/js/main.min_drop100.js"
INDEX = "/linhhoasu/webgame/game/index.html"
LOCAL_MAIN = ROOT / "linhhoasu" / "webgame" / "game" / "js" / "main.min_drop100.js"
EXPECTED_MAIN = "62e6ee653adb92755bebcac771ff5eebd8014ec3c3cf6f8acac982baaaf92750"
EXPECTED_INDEX = "6160bd7ce8a69f1ada690fecb6b620e38f733826d812974c0a0a67a9e050c6b7"
OLD_MAIN = b"C.beginAutoSellDropSession=function () {"
NEW_MAIN = b"C.playMapPetVisual=function(t){var e=Y.RaidMgr.mMapRaid;if(!e||!t)return;var i=e.GetEntity(Y.ActorModel.actorID);if(!i||!i.GetInfo)return;var n=i.GetInfo().followPetHandle;if(!n)return;var a=e.GetEntity(n),s=e.GetEntity(String(t.index));if(!a||!s)return;var o=e.GetEnitytFSM(n),r=e.GetEnitytFSM(String(t.index)),l=dh.CreateRandActionData({idA:n,idB:String(t.index),atk:100,critRatio:30,count:1,lev:t.lv,randSeed:t.seed});l&&(o&&o.ChangeState(Mt.Battle),dh.PlayMoveToAttack(l,function(){o&&o.ChangeState(Mt.Idle),r&&r.ChangeState(Mt.Idle)}))},C.beginAutoSellDropSession=function () {"
OLD_CALL = b"a._openInfo=t,pNe.isOpen=!0,a.SetSelfOpenSpeedUp(n),a.changeState(5),a.boxInfo.summonCount"
NEW_CALL = b"a._openInfo=t,pNe.isOpen=!0,a.SetSelfOpenSpeedUp(n),a.changeState(5),a.playMapPetVisual(t),a.boxInfo.summonCount"
OLD_MARKER = b'"js/main.min_drop100.js?v=20260929_pet_release_v6"'
NEW_MARKER = b'"js/main.min_drop100.js?v=20260930_map_pet_visual_v1"'

def sha(data: bytes) -> str: return hashlib.sha256(data).hexdigest()
def rb(sftp, path):
    try:
        with sftp.open(path, "rb") as h: return h.read()
    except FileNotFoundError: return None
def rsha(sftp, path):
    d = rb(sftp, path); return sha(d) if d is not None else None
def wr(sftp, path, data):
    with sftp.open(path, "wb") as h: h.write(data)
    sftp.chmod(path, 0o644)
def main():
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup = f"/linhhoasu/_ai_workbench/backups/map_pet_visual_20260930_{stamp}"
    stage = f"/linhhoasu/_ai_workbench/temp/map_pet_visual_20260930_{stamp}"
    evidence_path = WB / "temp" / "map_pet_visual_20260930" / f"deploy_{stamp}.json"
    evidence_path.parent.mkdir(parents=True, exist_ok=True)
    ssh = connect(); evidence = {"generatedAt": datetime.now(timezone.utc).isoformat(), "status": "PREPARING", "scope": [MAIN, INDEX], "visualOnly": True, "damageChanged": False, "rewardChanged": False, "playerWrites": 0, "dbWrites": 0, "processRestarts": 0, "backup": backup, "stage": stage}
    stages=[]
    try:
        with ssh.open_sftp() as sftp:
            main0, index0 = rb(sftp, MAIN), rb(sftp, INDEX)
            if main0 is None or index0 is None: raise RuntimeError("REMOTE_REQUIRED_FILE_MISSING")
            before={MAIN:sha(main0),INDEX:sha(index0)}
            if before != {MAIN:EXPECTED_MAIN,INDEX:EXPECTED_INDEX}: raise RuntimeError("LIVE_BASELINE_DRIFT:"+json.dumps(before,sort_keys=True))
            if main0.count(OLD_MAIN)!=1 or main0.count(OLD_CALL)!=1: raise RuntimeError("MAIN_ANCHOR_MISMATCH")
            if index0.count(OLD_MARKER)!=1: raise RuntimeError("INDEX_MARKER_MISMATCH")
            main1=main0.replace(OLD_MAIN,NEW_MAIN,1).replace(OLD_CALL,NEW_CALL,1)
            index1=index0.replace(OLD_MARKER,NEW_MARKER,1)
            candidate={MAIN:main1,INDEX:index1}; ch={p:sha(d) for p,d in candidate.items()}
            evidence["beforeHashes"]=before; evidence["candidateHashes"]=ch
            run(ssh,"install -d -m 700 "+shlex.quote(backup)+" "+shlex.quote(stage))
            backups={}
            for n,path in enumerate((MAIN,INDEX),1):
                safe=f"{n:02d}_{path.strip('/').replace('/', '__')}"; bp=backup+'/'+safe+'.before'; sp=stage+'/'+safe+'.candidate'
                run(ssh,"cp -p -- "+shlex.quote(path)+" "+shlex.quote(bp))
                if rsha(sftp,bp)!=before[path]: raise RuntimeError("BACKUP_HASH_MISMATCH:"+path)
                wr(sftp,sp,candidate[path])
                if rsha(sftp,sp)!=ch[path]: raise RuntimeError("STAGE_HASH_MISMATCH:"+path)
                backups[path]=bp; stages.append(sp)
            run(ssh,"node --check < "+shlex.quote(stages[0]))
            for path in (MAIN,INDEX):
                if rsha(sftp,path)!=before[path]: raise RuntimeError("LIVE_CAS_DRIFT:"+path)
            for path,sp in zip((MAIN,INDEX),stages):
                tmp=path+'.map-pet-visual-'+stamp+'.next'; run(ssh,"cp -p -- "+shlex.quote(sp)+" "+shlex.quote(tmp)); run(ssh,"mv -f -- "+shlex.quote(tmp)+" "+shlex.quote(path))
                if rsha(sftp,path)!=ch[path]: raise RuntimeError("INSTALL_HASH_MISMATCH:"+path)
            evidence["afterHashes"]={p:rsha(sftp,p) for p in (MAIN,INDEX)}; evidence["backupFiles"]=backups
        served={}
        for path in (MAIN,INDEX):
            up=path.removeprefix('/linhhoasu/webgame/game'); url='http://127.0.0.1:81'+up+'?verify=map_pet_visual_'+stamp; got=run(ssh,"curl -fsS --max-time 20 "+shlex.quote(url)+" | sha256sum | cut -d' ' -f1").strip(); served[path]={"url":url,"sha256":got,"matches":got==evidence['afterHashes'][path]};
            if got!=evidence['afterHashes'][path]: raise RuntimeError("HTTP_READBACK_HASH_MISMATCH:"+path)
        evidence["served"]=served; evidence["status"]="DEPLOYED"; run(ssh,"rm -f -- "+" ".join(shlex.quote(x) for x in stages)); run(ssh,"rmdir -- "+shlex.quote(stage))
    except Exception: evidence["status"]="FAILED"; raise
    finally: evidence_path.write_text(json.dumps(evidence,ensure_ascii=False,indent=2)+'\n',encoding='utf-8'); ssh.close()
    print(json.dumps(evidence,ensure_ascii=False,indent=2))
if __name__=='__main__': main()
