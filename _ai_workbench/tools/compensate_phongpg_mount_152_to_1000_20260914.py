"""Approved, scoped and idempotent S1 mount compensation for phongpg01051994."""
from __future__ import annotations

import base64
import json
import shlex
from datetime import datetime, timezone
from pathlib import Path

from snapshot_web_multiserver_20260906 import connect, run

WB = Path(__file__).resolve().parents[1]
APP = "/linhhoasu/lhs/newServer"
ACCOUNT_ID = "phongpg01051994"
USER_ID = "u_Wk_1001_d90580_1788129989390"
PLAYER_ID = "p_u_Wk_1001_d90580_1788129989390_1788129989391"
MOUNT_UID = 100001
MOUNT_ID = 22505
SERVER_ID = 1001
MARKER = "mount_152_to_1000_phongpg01051994_s1_v1"

REMOTE_JS = r'''
const mongoose=require('/linhhoasu/lhs/newServer/node_modules/mongoose');
const Player=require('/linhhoasu/lhs/newServer/src/db/models/Player');
const Redis=require('/linhhoasu/lhs/newServer/node_modules/ioredis');
const userId=%s,playerId=%s,accountId=%s,uid=%d,serverId=%d,mountId=%d,marker=%s;
const n=v=>Math.floor(Number(v)||0);
function attrs(){const q=7,lv=1000,st=40,seed=Math.abs(mountId*31+uid*17+q*13+lv*7+st*5),variance=95+(seed%%11),scale=(1+(q-2)*0.42)*(1+(lv-1)*0.08)*(1+st*0.06),out={};for(const [k,b]of [[1,900],[2,120],[3,55],[4,18]])out[k]=Math.max(1,Math.floor(b*scale*variance/100));return out;}
function snap(p,m,ledger){return {userId:p.userId,playerId:p.playerId,accountId:p.accountId,serverId:p.serverId,updatedAt:p.updatedAt,diamond:n(p.currencies?.diamond),gold:n(p.currencies?.gold),silver:n(p.currencies?.silver),item20:n(p.items?.[20]),mount:{uid:n(m?.uid),id:n(m?.id),quality:n(m?.quality),level:n(m?.level),star:n(m?.star),exp:n(m?.exp),attrs:m?.attrs||{}},ledger:ledger||null};}
(async()=>{await mongoose.connect(process.env.MONGO_URI||'mongodb://127.0.0.1:27017/lhs_s1001',{serverSelectionTimeoutMS:7000});const filter={userId,playerId,accountId,serverId};const before=await Player.findOne(filter).lean();if(!before)throw Error('PLAYER_NOT_FOUND');const m=(before.swordInfo?.data||[]).find(x=>n(x.uid)===uid);if(!m)throw Error('MOUNT_NOT_FOUND');if(n(m.id)!==mountId||n(m.quality)!==7||n(m.star)!==40)throw Error('MOUNT_IDENTITY_MISMATCH');const existing=before.swordInfo?.compensationLedger?.[marker];if(existing){if(n(m.level)!==1000)throw Error('MARKER_DRIFT');console.log(JSON.stringify({result:'ALREADY_APPLIED',before:snap(before,m,existing),after:snap(before,m,existing)}));await mongoose.disconnect();return;}if(n(m.level)!==152)throw Error('CAS_EXPECTED_LEVEL_152');const beforeSnap=snap(before,m,null);const redis=new Redis({host:'127.0.0.1',port:6379,connectTimeout:3000});const indexKey='s1001:auth:account:'+accountId.toLowerCase(),tokens=await redis.smembers(indexKey);let revoked=0;for(const token of tokens)revoked+=await redis.del('s1001:auth:session:'+token);await redis.del(indexKey);await redis.quit();const receipt={key:marker,at:new Date().toISOString(),fromLevel:152,toLevel:1000,mountUid:uid,mountId,reason:'approved_player_compensation',item20Delta:0,diamondDelta:0};const set={};set['swordInfo.data.$.level']=1000;set['swordInfo.data.$.attrs']=attrs();set['swordInfo.data.$.exp']=0;set['swordInfo.compensationLedger.'+marker]=receipt;set.updatedAt=new Date();const wr=await Player.collection.updateOne({...filter,'swordInfo.data':{$elemMatch:{uid, id:mountId, quality:7, star:40, level:152}},['swordInfo.compensationLedger.'+marker]:{$exists:false}},{$set:set});if(wr.matchedCount!==1)throw Error('CAS_NOT_APPLIED_OR_ALREADY_CHANGED');const after=await Player.findOne(filter).lean();const out=(after.swordInfo?.data||[]).find(x=>n(x.uid)===uid);const afterSnap=snap(after,out,after.swordInfo?.compensationLedger?.[marker]);if(n(out?.level)!==1000)throw Error('READBACK_LEVEL_MISMATCH');if(afterSnap.item20!==beforeSnap.item20||afterSnap.diamond!==beforeSnap.diamond||afterSnap.gold!==beforeSnap.gold||afterSnap.silver!==beforeSnap.silver)throw Error('ECONOMY_CHANGED');console.log(JSON.stringify({result:'PASS',revokedTokens:revoked,matched:wr.matchedCount,modified:wr.modifiedCount,before:beforeSnap,after:afterSnap}));await mongoose.disconnect();})().catch(async e=>{console.error(e.stack||String(e));try{await mongoose.disconnect()}catch(_){}process.exit(1)});
''' % (json.dumps(USER_ID), json.dumps(PLAYER_ID), json.dumps(ACCOUNT_ID), MOUNT_UID, SERVER_ID, MOUNT_ID, json.dumps(MARKER))


def main() -> None:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup = f"/linhhoasu/_ai_workbench/backups/phongpg_mount_compensation_pre_{stamp}"
    ssh = connect()
    try:
        run(ssh, "mkdir -p -- " + shlex.quote(backup))
        backup_js = "const m=require('mongoose'),P=require('./src/db/models/Player');(async()=>{await m.connect(process.env.MONGO_URI||'mongodb://127.0.0.1:27017/lhs_s1001');const p=await P.findOne({userId:%s,playerId:%s,accountId:%s,serverId:%d}).lean();if(!p)throw Error('PLAYER_NOT_FOUND');require('fs').writeFileSync(%s,JSON.stringify(p,null,2));await m.disconnect()})().catch(e=>{console.error(e);process.exit(1)})" % (json.dumps(USER_ID), json.dumps(PLAYER_ID), json.dumps(ACCOUNT_ID), SERVER_ID, json.dumps(backup + "/player_before.json"))
        run(ssh, "cd " + shlex.quote(APP) + " && node -e " + shlex.quote(backup_js))
        encoded = base64.b64encode(REMOTE_JS.encode()).decode()
        output = run(ssh, "cd " + shlex.quote(APP) + " && node -e \"eval(Buffer.from('" + encoded + "','base64').toString('utf8'))\"")
        result = json.loads(output.strip().splitlines()[-1])
        result.update({"backup": backup, "at": datetime.now(timezone.utc).isoformat(), "scope": "S1/phongpg01051994/Lazada/mount-100001", "playerDataMutation": True, "compensationOnly": True})
        out = WB / "temp/phongpg_mount_compensation_20260914"
        out.mkdir(parents=True, exist_ok=True)
        (out / f"compensation_{stamp}.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(result, ensure_ascii=True, indent=2))
    finally:
        ssh.close()


if __name__ == "__main__":
    main()
