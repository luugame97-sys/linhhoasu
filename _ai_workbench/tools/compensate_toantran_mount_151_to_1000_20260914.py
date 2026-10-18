"""Scoped, idempotent compensation for toantran912 S2 mount uid 100189."""
from __future__ import annotations

import base64
import json
import shlex
from datetime import datetime, timezone
from pathlib import Path

from snapshot_web_multiserver_20260906 import connect, run

WB = Path(__file__).resolve().parents[1]
APP = "/linhhoasu/lhs/newServer"
USER_ID = "u_Wk_1002_85c314_1788608804297"
ACCOUNT_ID = "toantran912"
PLAYER_ID = "p_u_Wk_1002_85c314_1788608804297_1788608804298"
MOUNT_UID = 100189

REMOTE_JS = r'''
const mongoose=require('/linhhoasu/lhs/newServer/node_modules/mongoose');
const Player=require('/linhhoasu/lhs/newServer/src/db/models/Player');
const Auth=require('/linhhoasu/lhs/newServer/src/services/AuthSessionService');
const userId=%s, playerId=%s, accountId=%s, uid=%d;
function n(v){return Math.floor(Number(v)||0)}
function attrs(){const id=22502,q=7,lv=1000,st=40,seed=Math.abs(id*31+uid*17+q*13+lv*7+st*5),variance=95+(seed%%11),scale=(1+(q-2)*0.42)*(1+(lv-1)*0.08)*(1+st*0.06),out={};for(const [k,b] of [[1,900],[2,120],[3,55],[4,18]])out[k]=Math.max(1,Math.floor(b*scale*variance/100));return out}
(async()=>{
 const uri=process.env.MONGO_URI||'mongodb://127.0.0.1:27017/lhs_s1002';
 await mongoose.connect(uri,{serverSelectionTimeoutMS:7000});
 const before=await Player.findOne({userId,playerId,accountId,serverId:1002}).lean();
 if(!before)throw Error('PLAYER_NOT_FOUND');
 const mount=(before.swordInfo?.data||[]).find(x=>n(x.uid)===uid);
 if(!mount)throw Error('MOUNT_NOT_FOUND');
 const beforeSnapshot={userId:before.userId,playerId:before.playerId,accountId:before.accountId,serverId:before.serverId,updatedAt:before.updatedAt,diamond:n(before.currencies?.diamond),item20:n(before.items?.[20]),mount:{uid:n(mount.uid),id:n(mount.id),quality:n(mount.quality),level:n(mount.level),star:n(mount.star),attrs:mount.attrs||{}},ledger:before.swordInfo?.compensationLedger||null};
 const receipt={key:'mount_151_to_1000_toantran912_s2_v1',at:new Date().toISOString(),fromLevel:151,toLevel:1000,mountUid:uid,reason:'approved_player_compensation',item20Delta:0,diamondDelta:0};
 await Auth.revokeAccount(accountId).catch(()=>0);
 const update={$set:{'swordInfo.data.$.level':1000,'swordInfo.data.$.attrs':attrs(),'swordInfo.data.$.exp':0,'swordInfo.compensationLedger.mount_151_to_1000':receipt,updatedAt:new Date()}};
 const wr=await Player.collection.updateOne({userId,playerId,accountId,serverId:1002,'swordInfo.data':{$elemMatch:{uid,level:151}},'swordInfo.compensationLedger.mount_151_to_1000':{$exists:false}},update);
 if(wr.matchedCount!==1)throw Error('CAS_NOT_APPLIED_OR_ALREADY_COMPENSATED');
 const after=await Player.findOne({userId,playerId,accountId,serverId:1002}).lean();
 const outMount=(after.swordInfo?.data||[]).find(x=>n(x.uid)===uid);
 const afterSnapshot={userId:after.userId,playerId:after.playerId,accountId:after.accountId,serverId:after.serverId,updatedAt:after.updatedAt,diamond:n(after.currencies?.diamond),item20:n(after.items?.[20]),mount:{uid:n(outMount.uid),id:n(outMount.id),quality:n(outMount.quality),level:n(outMount.level),star:n(outMount.star),attrs:outMount.attrs||{}},receipt:after.swordInfo?.compensationLedger?.mount_151_to_1000||null};
 if(afterSnapshot.mount.level!==1000)throw Error('READBACK_LEVEL_MISMATCH');
 if(afterSnapshot.item20!==beforeSnapshot.item20||afterSnapshot.diamond!==beforeSnapshot.diamond)throw Error('ECONOMY_CHANGED');
 console.log(JSON.stringify({result:'PASS',matched:wr.matchedCount,modified:wr.modifiedCount,before:beforeSnapshot,after:afterSnapshot}));
 await mongoose.disconnect();
})().catch(async e=>{console.error(e.stack||String(e));try{await mongoose.disconnect()}catch(_){}process.exit(1)});
''' % (json.dumps(USER_ID), json.dumps(PLAYER_ID), json.dumps(ACCOUNT_ID), MOUNT_UID)

def main() -> None:
    ssh = connect()
    try:
        stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        backup = f"/linhhoasu/_ai_workbench/backups/toantran_mount_compensation_pre_{stamp}"
        run(ssh, f"mkdir -p -- {shlex.quote(backup)}")
        backup_js = "const m=require('mongoose'),P=require('./src/db/models/Player');(async()=>{await m.connect(process.env.MONGO_URI||'mongodb://127.0.0.1:27017/lhs_s1002');const p=await P.findOne({userId:%s,playerId:%s,accountId:%s,serverId:1002}).lean();require('fs').writeFileSync(%s,JSON.stringify(p,null,2));await m.disconnect()})().catch(e=>{console.error(e);process.exit(1)})" % (json.dumps(USER_ID), json.dumps(PLAYER_ID), json.dumps(ACCOUNT_ID), json.dumps(backup + '/player_before.json'))
        run(ssh, f"cd {shlex.quote(APP)} && node -e {shlex.quote(backup_js)}")
        encoded = base64.b64encode(REMOTE_JS.encode()).decode()
        output = run(ssh, f"cd {shlex.quote(APP)} && node -e \"eval(Buffer.from('{encoded}','base64').toString('utf8'))\"")
        result = json.loads(output.strip().splitlines()[-1])
        result.update({"backup": backup, "at": datetime.now(timezone.utc).isoformat(), "timezone": "Asia/Ho_Chi_Minh (UTC+7)", "playerDataMutation": True, "compensationOnly": True})
        out = WB / "temp/toantran_mount_compensation_20260914"
        out.mkdir(parents=True, exist_ok=True)
        (out / f"compensation_{stamp}.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(result, ensure_ascii=True, indent=2))
    finally:
        ssh.close()

if __name__ == "__main__":
    main()
