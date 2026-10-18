"""Read-only 28350 ownership/mail aggregates; never expose player identities."""
import json
import hashlib
from datetime import datetime, timezone
from snapshot_web_multiserver_20260906 import WB, connect
from release_huyenvu_daily_20260906 import run, hashes, ready

def main():
    ssh = connect()
    try:
        paths = ['linhhoasu/lhs/newServer/src/' + p for p in ['handlers/mail.js','handlers/item.js','handlers/fashion.js','services/FashionBoxService.js','services/RoleAppearanceService.js','services/RewardGrantService.js']]
        paths += ['linhhoasu/webgame/game/' + p for p in ['index.html','js/lhs-fashion-gear-v1.js','js/main.min_a6195824.js']]
        remote = hashes(ssh, ['/' + p for p in paths])
        match = {p: remote['/' + p] == hashlib.sha256((WB.parent / p).read_bytes()).hexdigest() for p in paths}
        code = r"""
const {MongoClient}=require('/linhhoasu/lhs/newServer/node_modules/mongodb');
(async()=>{const client=new MongoClient('mongodb://127.0.0.1:27017',{serverSelectionTimeoutMS:8000});await client.connect();const out=[];
try{for(const sid of [1001,1002]){const db=client.db('lhs_s'+sid),parts=[28351,28352,28353,28359],ids=[28350,...parts],rows=await db.collection('players').find({isBot:{$ne:true},$or:[{'items.28350':{$gt:0}},{'fashionInfo.activateFashion':{$in:parts}},...parts.map(id=>({['fashionInfo.fashions.'+id]:{$gt:0}}))]},{projection:{_id:0,items:1,'fashionInfo.activateFashion':1,'fashionInfo.fashions':1,'fashionInfo.fashion':1,'fashionInfo.curFashion':1},maxTimeMS:10000}).limit(5000).toArray();
const stats={players:rows.length,unopenedBoxes:0,boxOwners:0,boxesWithoutCompleteSet:0,completeSet:0,partialSet:0,equippedFullSet:0,partsStoredAsBagItems:0};
for(const p of rows){const info=p.fashionInfo||{},own=id=>(info.activateFashion||[]).includes(id)||Number(info.fashions?.[id])>0,n=parts.filter(own).length,count=Number(p.items?.[28350])||0;stats.unopenedBoxes+=count;if(count>0)stats.boxOwners++;if(count>0&&n<4)stats.boxesWithoutCompleteSet++;if(n===4)stats.completeSet++;if(n>0&&n<4)stats.partialSet++;if(parts.some(id=>Number(p.items?.[id])>0))stats.partsStoredAsBagItems++;const current=info.curFashion||info.fashion||{};if(current[301]===28351&&current[302]===28352&&current[303]===28353&&current[309]===28359)stats.equippedFullSet++;}
const mails=await db.collection('mails').find({'attachments.id':{$in:ids}},{projection:{_id:0,attachments:1,claimed:1},maxTimeMS:10000}).limit(5000).toArray();const mail={matched:mails.length,claimedBoxes:0,unclaimedBoxes:0,claimedDirectParts:0,unclaimedDirectParts:0};
for(const row of mails)for(const part of (Array.isArray(row.attachments)?row.attachments:[])){const count=Number(part.count)||0;if(Number(part.id)===28350)mail[row.claimed?'claimedBoxes':'unclaimedBoxes']+=count;else if(parts.includes(Number(part.id)))mail[row.claimed?'claimedDirectParts':'unclaimedDirectParts']+=count;}
out.push({sid,stats,mail,capped:rows.length===5000||mails.length===5000});}}finally{await client.close();}console.log(JSON.stringify(out));})().catch(e=>{console.error(e.name);process.exitCode=1;});
"""
        counts = json.loads(run(ssh, 'node -', code))
        result = {'at':datetime.now(timezone.utc).isoformat(),'readOnly':True,'matches':match,'servers':counts,'ready':ready(ssh),'productionWrites':0}
        folder = WB / 'temp/muchen_activation_20260909'
        folder.mkdir(parents=True, exist_ok=True)
        (folder / 'live.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        print(json.dumps(result))
    finally:
        ssh.close()

if __name__ == '__main__':
    main()
