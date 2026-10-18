"""Re-read exact in-scope counters without loading/saving a game player session."""
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
import paramiko
from release_huyenvu_daily_20260906 import run, hashes, pm2, ready

WB=Path(__file__).resolve().parents[1]


def main():
    sys.stdout.reconfigure(encoding='utf-8');root=Path(sys.argv[1]).resolve()
    assert root.parent==WB/'temp' and root.name.startswith('fishing_free_claim_audit_')
    old=json.loads((root/'inventory-raw.json').read_text(encoding='utf-8'))
    deployed=json.loads((WB/'temp/fishing_contest_shop_20260906/deploy.json').read_text())
    query=r"""const fs=require('fs'),crypto=require('crypto'),{MongoClient}=require('/linhhoasu/lhs/newServer/node_modules/mongodb');(async()=>{const c=new MongoClient('mongodb://127.0.0.1:27017');await c.connect();const data={};try{for(const sid of [1001,1002]){const rows=await c.db('lhs_s'+sid).collection('players').find({isBot:{$ne:true},$or:[{'shopInfo.buyRecords.11001400':{$gt:0}},{'rechargeInfo.records':{$elemMatch:{id:11001400,count:{$gt:0}}}}]},{projection:{_id:0,userId:1,playerId:1,name:1,'shopInfo.buyRecords.11001400':1,'rechargeInfo.records':1,'rechargeInfo.fishingEventShopClaims.freeDaily':1,'items.4':1}}).maxTimeMS(15000).toArray();data[sid]=rows.map(p=>({userId:p.userId,playerId:p.playerId,name:p.name,shopCount:p.shopInfo?.buyRecords?.[11001400]||0,rechargeCount:Math.max(0,...(p.rechargeInfo?.records||[]).filter(r=>Number(r.id)===11001400).map(r=>Number(r.count)||0)),baozi:p.items?.[4],newDailyLedger:p.rechargeInfo?.fishingEventShopClaims?.freeDaily||null}));}}finally{await c.close();}const template='/linhhoasu/lhs/LHS-file/src/data/player_template.json';data.template={path:template,exists:fs.existsSync(template)};if(data.template.exists){const b=fs.readFileSync(template),p=JSON.parse(b);Object.assign(data.template,{sha256:crypto.createHash('sha256').update(b).digest('hex'),shopCount:p.shopInfo?.buyRecords?.[11001400]||0,rechargeCount:Math.max(0,...(p.rechargeInfo?.records||[]).filter(r=>Number(r.id)===11001400).map(r=>Number(r.count)||0))});}console.log(JSON.stringify(data));})().catch(e=>{console.error(e.message);process.exitCode=1;});"""
    creds=(WB/'VPS103.116.105.154.txt').read_text(encoding='utf-8-sig').splitlines();ssh=paramiko.SSHClient();ssh.load_system_host_keys();ssh.set_missing_host_key_policy(paramiko.RejectPolicy());ssh.connect(creds[0].strip(),username='root',password=creds[2],look_for_keys=False,allow_agent=False,timeout=20)
    try:
        new=json.loads(run(ssh,'node -',query,timeout=30));changes=[]
        for sid,server in old['servers'].items():
            before={p['userId']:p for p in server['profiles']}
            after={p['userId']:p for p in new[sid]}
            for uid in set(before)|set(after):
                a,b=before.get(uid),after.get(uid)
                if not a or not b or a['shopCount']!=b['shopCount'] or max(r['count'] for r in a['rechargeRecords'])!=b['rechargeCount']:changes.append({'server':sid,'userId':uid,'before':a and a['shopCount'],'after':b and b['shopCount']})
        assert hashes(ssh,list(deployed['expected']))==deployed['expected']
        assert pm2(ssh)==old['pm2']
        result={'result':'PASS' if not changes else 'COUNTER_CHANGED','time':datetime.now(timezone.utc).isoformat(),'changes':changes,'data':new,'hashCount':len(deployed['expected']),'processUnchanged':True,'ready':ready(ssh),'productionWrites':0}
        (root/'inventory-verify.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        print(json.dumps({k:v for k,v in result.items() if k!='data'},ensure_ascii=False));print(json.dumps({'template':new['template'],'profiles':{sid:len(new[sid])for sid in ['1001','1002']}}))
    finally:ssh.close()


if __name__=='__main__':main()
